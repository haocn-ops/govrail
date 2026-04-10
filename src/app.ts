import { buildAgentCard } from "./a2a/agent-card.js";
import {
  handleA2AMessageStream,
  handleA2AMessageSend,
  handleA2ATaskCancel,
  handleA2ATaskGet,
  handleA2AWebhookPush,
} from "./a2a/inbound.js";
import { cancelRun } from "./lib/cancellation.js";
import { expireApproval } from "./lib/approvals.js";
import { listRunAuditEvents, listTenantAuditEvents, recordAuditEvent } from "./lib/audit.js";
import { normalizeAuthRef } from "./lib/auth.js";
import {
  buildBillingProviderRegistry,
  createStripeBillingPortalSession,
  createStripeCheckoutSession,
  getBillingProviderDescriptor,
  resolveWorkspaceCheckoutProvider,
  verifyBillingWebhookSignature,
} from "./lib/billing-providers.js";
import {
  getApproval,
  getArtifact,
  getCoordinatorState,
  getIdempotencyRecord,
  getPolicy,
  getRun,
  getRunGraph,
  getToolProvider,
  listPolicies,
  listRunArtifacts,
  listToolProviders,
  putIdempotencyRecord,
} from "./lib/db.js";
import {
  getApiKeyByKeyHash,
  getApiKeyById,
  getBillingCheckoutSessionById,
  getOrganizationById,
  getOrganizationMembership,
  getPricingPlanById,
  getServiceAccountById,
  getUserByAuthIdentity,
  getUserByEmailNormalized,
  getWorkspaceById,
  getWorkspaceInvitationById,
  getWorkspaceInvitationByTokenHash,
  getWorkspaceByTenantId,
  getWorkspaceDeliveryTrack,
  getWorkspaceEnterpriseFeatureConfig,
  getWorkspaceMembership,
  getWorkspacePlanSubscription,
  getWorkspacePlanSubscriptionByExternalRef,
  listWorkspaceDeliveryTracks,
  listWorkspaceApiKeys,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  listWorkspaceServiceAccounts,
  listWorkspaceUsageSummary,
  listWorkspacesForUser,
  upsertWorkspaceEnterpriseFeatureConfig,
} from "./lib/saas-db.js";
import {
  ApiError,
  buildMeta,
  enforceNorthboundAccess,
  errorResponse,
  getNorthboundApiKeyCredential,
  getRequiredTenantId,
  getSubjectId,
  getSubjectRoles,
  json,
  readJson,
  requireIdempotencyKey,
} from "./lib/http.js";
import { createId, hashPayload, nowIso } from "./lib/ids.js";
import { markQueueMessageProcessed } from "./lib/queue.js";
import { enforceReplayRateLimit, enforceRunCreateRateLimit } from "./lib/rate-limit.js";
import { launchRun } from "./lib/runs.js";
import { handleMcpProxy } from "./mcp/proxy.js";
import type {
  ApiKeyRow,
  ApprovalDecisionRequest,
  ApprovalDecisionSignal,
  ArtifactRow,
  AuditEventEnvelope,
  BillingCheckoutSessionRow,
  ServiceAccountRow,
  PolicyApprovalConfig,
  PolicyConditions,
  PolicyCreateRequest,
  PolicyDecision,
  PolicyRow,
  PolicyStatus,
  PolicyUpdateRequest,
  PricingPlanRow,
  RunRow,
  UserRow,
  WorkspaceAccessRow,
  WorkspaceDeliveryTrackRow,
  WorkspaceInvitationRow,
  WorkspaceMembershipRow,
  WorkspacePlanSubscriptionRow,
  OrganizationRow,
  WorkspaceRow,
  ToolProviderCreateRequest,
  ToolProviderRow,
  ToolProviderStatus,
  ToolProviderType,
  ToolProviderUpdateRequest,
  ReplayRunRequest,
  RunCreateRequest,
} from "./types.js";

const API_BASE = "/api/v1";
const SERVICE_NAME = "govrail-control-plane";
const SERVICE_VERSION = "0.1.0";
const SAAS_PLATFORM_ADMIN_ROLES = ["platform_admin", "platform_owner", "support_admin"] as const;
const WORKSPACE_DELIVERY_TRACK_KEYS = ["verification", "go_live"] as const;
const WORKSPACE_DELIVERY_TRACK_STATUSES = ["pending", "in_progress", "complete"] as const;
const SUPPORTED_WORKSPACE_API_KEY_SCOPES = [
  "runs:write",
  "runs:manage",
  "approvals:write",
  "a2a:write",
  "mcp:call",
] as const;
const WORKSPACE_MEMBER_MANAGER_ROLES: ReadonlyArray<WorkspaceMembershipRow["role"]> = [
  "workspace_owner",
  "workspace_admin",
] as const;
const WORKSPACE_MEMBER_ALLOWED_ROLES: ReadonlyArray<WorkspaceMembershipRow["role"]> = [
  "workspace_owner",
  "workspace_admin",
  "operator",
  "approver",
  "auditor",
  "viewer",
] as const;

const app = {
  async fetch(request, env): Promise<Response> {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      if (error instanceof ApiError) {
        const meta = buildMeta(request);
        return errorResponse(error, meta);
      }

      const meta = buildMeta(request);
      const apiError = new ApiError(500, "internal_error", "Unexpected internal error");
      console.error(
        JSON.stringify({
          level: "error",
          request_id: meta.request_id,
          trace_id: meta.trace_id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return errorResponse(apiError, meta);
    }
  },

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const eventTypes: Record<string, number> = {};
    let processedCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;
    for (const message of batch.messages) {
      const body = isAuditEventEnvelope(message.body) ? message.body : null;
      if (!body) {
        invalidCount += 1;
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "audit_event_queue_invalid_message",
            queue: batch.queue,
            message_id: message.id,
          }),
        );
        message.ack();
        continue;
      }
      try {
        const isFirstDelivery = await markQueueMessageProcessed({
          env,
          queueName: batch.queue,
          envelope: body,
        });
        if (!isFirstDelivery) {
          duplicateCount += 1;
          console.log(
            JSON.stringify({
              level: "info",
              event: "audit_event_queue_duplicate",
              queue: batch.queue,
              message_id: message.id,
              audit_event_id: body.event_id,
              dedupe_key: body.dedupe_key,
            }),
          );
          message.ack();
          continue;
        }

        processedCount += 1;
        eventTypes[body.event_type] = (eventTypes[body.event_type] ?? 0) + 1;
        console.log(
          JSON.stringify({
            level: "info",
            event: "audit_event_queue_message",
            queue: batch.queue,
            message_id: message.id,
            audit_event_id: body.event_id,
            event_type: body.event_type,
            tenant_id: body.tenant_id,
            run_id: body.run_id,
            trace_id: body.trace_id,
            dedupe_key: body.dedupe_key,
          }),
        );
        message.ack();
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            event: "audit_event_queue_process_failed",
            queue: batch.queue,
            message_id: message.id,
            audit_event_id: body.event_id,
            dedupe_key: body.dedupe_key,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        message.retry();
      }
    }
    console.log(
      JSON.stringify({
        level: "info",
        event: "queue_batch_received",
        queue: batch.queue,
        message_count: batch.messages.length,
        processed_count: processedCount,
        duplicate_count: duplicateCount,
        invalid_count: invalidCount,
        event_types: eventTypes,
      }),
    );
  },
} satisfies ExportedHandler<Env>;

export default app;

export async function routeRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/.well-known/agent-card.json") {
    return Response.json(buildAgentCard(url.origin));
  }

  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === `${API_BASE}/health`) {
    return getHealth(request);
  }

  const saasBillingProviderWebhookMatch = url.pathname.match(
    /^\/api\/v1\/saas\/billing\/providers\/([^/:]+):webhook$/,
  );
  if (request.method === "POST" && saasBillingProviderWebhookMatch) {
    return handleSaasBillingProviderWebhook(
      request,
      env,
      saasBillingProviderWebhookMatch[1] ?? "",
    );
  }

  if (url.pathname.startsWith(`${API_BASE}/`)) {
    enforceNorthboundAccess(request, env);
    if (!url.pathname.startsWith(`${API_BASE}/saas/`)) {
      request = await applyNorthboundApiKeyAuthentication(request, env);
      const requiredApiKeyScopes = resolveNorthboundApiKeyRequiredScopes(request.method, url.pathname);
      if (requiredApiKeyScopes) {
        enforceNorthboundApiKeyScope(request, requiredApiKeyScopes);
      }
    }
  }

  if (request.method === "GET" && url.pathname === `${API_BASE}/saas/workspaces`) {
    return listSaasWorkspaces(request, env);
  }

  if (request.method === "GET" && url.pathname === `${API_BASE}/saas/me`) {
    return getSaasMe(request, env);
  }

  if (request.method === "GET" && url.pathname === `${API_BASE}/saas/admin/overview`) {
    return getSaasAdminOverview(request, env);
  }

  if (request.method === "POST" && url.pathname === `${API_BASE}/saas/invitations:accept`) {
    return acceptSaasInvitation(request, env);
  }

  if (request.method === "POST" && url.pathname === `${API_BASE}/saas/workspaces`) {
    return createSaasWorkspace(request, env);
  }

  const saasWorkspaceMatch = url.pathname.match(/^\/api\/v1\/saas\/workspaces\/([^/]+)$/);
  if (request.method === "GET" && saasWorkspaceMatch) {
    return getSaasWorkspaceById(request, env, saasWorkspaceMatch[1] ?? "");
  }

  const saasWorkspaceDeliveryMatch = url.pathname.match(/^\/api\/v1\/saas\/workspaces\/([^/]+)\/delivery$/);
  if (request.method === "GET" && saasWorkspaceDeliveryMatch) {
    return getSaasWorkspaceDelivery(request, env, saasWorkspaceDeliveryMatch[1] ?? "");
  }
  if (request.method === "POST" && saasWorkspaceDeliveryMatch) {
    return saveSaasWorkspaceDelivery(request, env, saasWorkspaceDeliveryMatch[1] ?? "");
  }

  const saasWorkspaceBootstrapMatch = url.pathname.match(/^\/api\/v1\/saas\/workspaces\/([^/]+)\/bootstrap$/);
  if (request.method === "POST" && saasWorkspaceBootstrapMatch) {
    return bootstrapSaasWorkspace(request, env, saasWorkspaceBootstrapMatch[1] ?? "");
  }

  const saasWorkspaceApiKeysMatch = url.pathname.match(/^\/api\/v1\/saas\/workspaces\/([^/]+)\/api-keys$/);
  if (request.method === "GET" && saasWorkspaceApiKeysMatch) {
    return listSaasWorkspaceApiKeys(request, env, saasWorkspaceApiKeysMatch[1] ?? "");
  }
  if (request.method === "POST" && saasWorkspaceApiKeysMatch) {
    return createSaasWorkspaceApiKey(request, env, saasWorkspaceApiKeysMatch[1] ?? "");
  }

  const saasWorkspaceApiKeyRevokeMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/api-keys\/([^/:]+):revoke$/,
  );
  if (request.method === "POST" && saasWorkspaceApiKeyRevokeMatch) {
    return revokeSaasWorkspaceApiKey(
      request,
      env,
      saasWorkspaceApiKeyRevokeMatch[1] ?? "",
      saasWorkspaceApiKeyRevokeMatch[2] ?? "",
    );
  }

  const saasWorkspaceApiKeyRotateMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/api-keys\/([^/:]+):rotate$/,
  );
  if (request.method === "POST" && saasWorkspaceApiKeyRotateMatch) {
    return rotateSaasWorkspaceApiKey(
      request,
      env,
      saasWorkspaceApiKeyRotateMatch[1] ?? "",
      saasWorkspaceApiKeyRotateMatch[2] ?? "",
    );
  }

  const saasWorkspaceServiceAccountsMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/service-accounts$/,
  );
  if (request.method === "GET" && saasWorkspaceServiceAccountsMatch) {
    return listSaasWorkspaceServiceAccounts(request, env, saasWorkspaceServiceAccountsMatch[1] ?? "");
  }
  if (request.method === "POST" && saasWorkspaceServiceAccountsMatch) {
    return createSaasWorkspaceServiceAccount(request, env, saasWorkspaceServiceAccountsMatch[1] ?? "");
  }

  const saasWorkspaceServiceAccountDisableMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/service-accounts\/([^/:]+):disable$/,
  );
  if (request.method === "POST" && saasWorkspaceServiceAccountDisableMatch) {
    return disableSaasWorkspaceServiceAccount(
      request,
      env,
      saasWorkspaceServiceAccountDisableMatch[1] ?? "",
      saasWorkspaceServiceAccountDisableMatch[2] ?? "",
    );
  }

  const saasWorkspaceMembersMatch = url.pathname.match(/^\/api\/v1\/saas\/workspaces\/([^/]+)\/members$/);
  if (request.method === "GET" && saasWorkspaceMembersMatch) {
    return listSaasWorkspaceMembers(request, env, saasWorkspaceMembersMatch[1] ?? "");
  }

  const saasWorkspaceInvitationsMatch = url.pathname.match(/^\/api\/v1\/saas\/workspaces\/([^/]+)\/invitations$/);
  if (request.method === "GET" && saasWorkspaceInvitationsMatch) {
    return listSaasWorkspaceInvitations(request, env, saasWorkspaceInvitationsMatch[1] ?? "");
  }
  if (request.method === "POST" && saasWorkspaceInvitationsMatch) {
    return createSaasWorkspaceInvitation(request, env, saasWorkspaceInvitationsMatch[1] ?? "");
  }

  const saasWorkspaceInvitationRevokeMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/invitations\/([^/:]+):revoke$/,
  );
  if (request.method === "POST" && saasWorkspaceInvitationRevokeMatch) {
    return revokeSaasWorkspaceInvitation(
      request,
      env,
      saasWorkspaceInvitationRevokeMatch[1] ?? "",
      saasWorkspaceInvitationRevokeMatch[2] ?? "",
    );
  }

  const saasWorkspaceBillingCheckoutSessionsMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/billing\/checkout-sessions$/,
  );
  if (request.method === "POST" && saasWorkspaceBillingCheckoutSessionsMatch) {
    return createSaasWorkspaceBillingCheckoutSession(
      request,
      env,
      saasWorkspaceBillingCheckoutSessionsMatch[1] ?? "",
    );
  }

  const saasWorkspaceBillingCheckoutSessionMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/billing\/checkout-sessions\/([^/]+)$/,
  );
  if (request.method === "GET" && saasWorkspaceBillingCheckoutSessionMatch) {
    return getSaasWorkspaceBillingCheckoutSession(
      request,
      env,
      saasWorkspaceBillingCheckoutSessionMatch[1] ?? "",
      saasWorkspaceBillingCheckoutSessionMatch[2] ?? "",
    );
  }

  const saasWorkspaceBillingCheckoutSessionCompleteMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/billing\/checkout-sessions\/([^/:]+):complete$/,
  );
  if (request.method === "POST" && saasWorkspaceBillingCheckoutSessionCompleteMatch) {
    return completeSaasWorkspaceBillingCheckoutSession(
      request,
      env,
      saasWorkspaceBillingCheckoutSessionCompleteMatch[1] ?? "",
      saasWorkspaceBillingCheckoutSessionCompleteMatch[2] ?? "",
    );
  }

  const saasWorkspaceBillingProvidersMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/billing\/providers$/,
  );
  if (request.method === "GET" && saasWorkspaceBillingProvidersMatch) {
    return listSaasWorkspaceBillingProviders(
      request,
      env,
      saasWorkspaceBillingProvidersMatch[1] ?? "",
    );
  }

  const saasWorkspaceBillingPortalSessionsMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/billing\/portal-sessions$/,
  );
  if (request.method === "POST" && saasWorkspaceBillingPortalSessionsMatch) {
    return createSaasWorkspaceBillingPortalSession(
      request,
      env,
      saasWorkspaceBillingPortalSessionsMatch[1] ?? "",
    );
  }

  const saasWorkspaceSsoMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/sso$/,
  );
  if (request.method === "GET" && saasWorkspaceSsoMatch) {
    return getSaasWorkspaceSsoReadiness(
      request,
      env,
      saasWorkspaceSsoMatch[1] ?? "",
    );
  }
  if (request.method === "POST" && saasWorkspaceSsoMatch) {
    return saveSaasWorkspaceSsoConfig(
      request,
      env,
      saasWorkspaceSsoMatch[1] ?? "",
    );
  }

  const saasWorkspaceDedicatedEnvironmentMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/dedicated-environment$/,
  );
  if (request.method === "GET" && saasWorkspaceDedicatedEnvironmentMatch) {
    return getSaasWorkspaceDedicatedEnvironmentReadiness(
      request,
      env,
      saasWorkspaceDedicatedEnvironmentMatch[1] ?? "",
    );
  }
  if (request.method === "POST" && saasWorkspaceDedicatedEnvironmentMatch) {
    return saveSaasWorkspaceDedicatedEnvironmentConfig(
      request,
      env,
      saasWorkspaceDedicatedEnvironmentMatch[1] ?? "",
    );
  }

  const saasWorkspaceAuditEventsExportMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/:]+)\/audit-events:export$/,
  );
  if (request.method === "GET" && saasWorkspaceAuditEventsExportMatch) {
    return exportSaasWorkspaceAuditEvents(
      request,
      env,
      saasWorkspaceAuditEventsExportMatch[1] ?? "",
    );
  }

  const saasWorkspaceBillingSubscriptionCancelMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/billing\/subscription:cancel$/,
  );
  if (request.method === "POST" && saasWorkspaceBillingSubscriptionCancelMatch) {
    return cancelSaasWorkspaceBillingSubscription(
      request,
      env,
      saasWorkspaceBillingSubscriptionCancelMatch[1] ?? "",
    );
  }

  const saasWorkspaceBillingSubscriptionResumeMatch = url.pathname.match(
    /^\/api\/v1\/saas\/workspaces\/([^/]+)\/billing\/subscription:resume$/,
  );
  if (request.method === "POST" && saasWorkspaceBillingSubscriptionResumeMatch) {
    return resumeSaasWorkspaceBillingSubscription(
      request,
      env,
      saasWorkspaceBillingSubscriptionResumeMatch[1] ?? "",
    );
  }

  if (request.method === "POST" && url.pathname === `${API_BASE}/runs`) {
    return createRun(request, env);
  }

  if (request.method === "GET" && url.pathname === `${API_BASE}/policies`) {
    return listPoliciesByTenant(request, env);
  }

  if (request.method === "POST" && url.pathname === `${API_BASE}/policies`) {
    return createPolicy(request, env);
  }

  const policyMatch = url.pathname.match(/^\/api\/v1\/policies\/([^/]+)$/);
  if (request.method === "GET" && policyMatch) {
    return getPolicyById(request, env, policyMatch[1] ?? "");
  }

  if (request.method === "GET" && url.pathname === `${API_BASE}/tool-providers`) {
    return listToolProvidersByTenant(request, env);
  }

  if (request.method === "POST" && url.pathname === `${API_BASE}/tool-providers`) {
    return createToolProvider(request, env);
  }

  const toolProviderDisableMatch = url.pathname.match(/^\/api\/v1\/tool-providers\/([^/:]+):disable$/);
  if (request.method === "POST" && toolProviderDisableMatch) {
    return disableToolProvider(request, env, toolProviderDisableMatch[1] ?? "");
  }

  const toolProviderMatch = url.pathname.match(/^\/api\/v1\/tool-providers\/([^/]+)$/);
  if (request.method === "GET" && toolProviderMatch) {
    return getToolProviderById(request, env, toolProviderMatch[1] ?? "");
  }
  if (request.method === "POST" && toolProviderMatch) {
    return updateToolProvider(request, env, toolProviderMatch[1] ?? "");
  }

  const runMatch = url.pathname.match(/^\/api\/v1\/runs\/([^/]+)$/);
  if (request.method === "GET" && runMatch) {
    return getRunById(request, env, runMatch[1] ?? "");
  }

  const replayMatch = url.pathname.match(/^\/api\/v1\/runs\/([^/]+)\/replay$/);
  if (request.method === "POST" && replayMatch) {
    return replayRun(request, env, replayMatch[1] ?? "");
  }

  const runCancelMatch = url.pathname.match(/^\/api\/v1\/runs\/([^/:]+):cancel$/);
  if (request.method === "POST" && runCancelMatch) {
    return cancelRunById(request, env, runCancelMatch[1] ?? "");
  }

  const graphMatch = url.pathname.match(/^\/api\/v1\/runs\/([^/]+)\/graph$/);
  if (request.method === "GET" && graphMatch) {
    return getRunGraphById(request, env, graphMatch[1] ?? "");
  }

  const eventsMatch = url.pathname.match(/^\/api\/v1\/runs\/([^/]+)\/events$/);
  if (request.method === "GET" && eventsMatch) {
    return getRunEventsById(request, env, eventsMatch[1] ?? "");
  }

  const artifactsMatch = url.pathname.match(/^\/api\/v1\/runs\/([^/]+)\/artifacts$/);
  if (request.method === "GET" && artifactsMatch) {
    return listRunArtifactsById(request, env, artifactsMatch[1] ?? "");
  }

  const artifactMatch = url.pathname.match(/^\/api\/v1\/runs\/([^/]+)\/artifacts\/([^/]+)$/);
  if (request.method === "GET" && artifactMatch) {
    return getRunArtifactById(request, env, artifactMatch[1] ?? "", artifactMatch[2] ?? "");
  }

  const approvalMatch = url.pathname.match(/^\/api\/v1\/approvals\/([^/]+)\/decision$/);
  if (request.method === "POST" && approvalMatch) {
    return decideApproval(request, env, approvalMatch[1] ?? "");
  }

  const policyDisableMatch = url.pathname.match(/^\/api\/v1\/policies\/([^/:]+):disable$/);
  if (request.method === "POST" && policyDisableMatch) {
    return disablePolicy(request, env, policyDisableMatch[1] ?? "");
  }

  if (request.method === "POST" && policyMatch) {
    return updatePolicy(request, env, policyMatch[1] ?? "");
  }

  if (request.method === "POST" && url.pathname === `${API_BASE}/a2a/message:send`) {
    const tenantId = getRequiredTenantId(request);
    const subjectId = getSubjectId(request, env);
    return handleA2AMessageSend(request, env, tenantId, subjectId);
  }

  if (request.method === "GET" && url.pathname === `${API_BASE}/a2a/message:stream`) {
    const tenantId = getRequiredTenantId(request);
    return handleA2AMessageStream(request, env, tenantId);
  }

  if (request.method === "POST" && url.pathname === `${API_BASE}/a2a/webhooks/push`) {
    const tenantId = getRequiredTenantId(request);
    return handleA2AWebhookPush(request, env, tenantId);
  }

  const a2aTaskMatch = url.pathname.match(/^\/api\/v1\/a2a\/tasks\/([^/:]+)$/);
  if (request.method === "GET" && a2aTaskMatch) {
    const tenantId = getRequiredTenantId(request);
    return handleA2ATaskGet(request, env, tenantId, a2aTaskMatch[1] ?? "");
  }

  const a2aTaskCancelMatch = url.pathname.match(/^\/api\/v1\/a2a\/tasks\/([^/:]+):cancel$/);
  if (request.method === "POST" && a2aTaskCancelMatch) {
    const tenantId = getRequiredTenantId(request);
    return handleA2ATaskCancel(request, env, tenantId, a2aTaskCancelMatch[1] ?? "");
  }

  const mcpMatch = url.pathname.match(/^\/api\/v1\/mcp\/([^/]+)$/);
  if ((request.method === "POST" || request.method === "GET") && mcpMatch) {
    return handleMcpProxy(request, env, mcpMatch[1] ?? "");
  }

  throw new ApiError(404, "not_found", "Route does not exist");
}

function getHealth(request: Request): Response {
  if (request.method === "HEAD") {
    return new Response(null, { status: 200 });
  }

  return json(
    {
      ok: true,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      now: nowIso(),
    },
    buildMeta(request),
  );
}

function summarizeDeliveryNotes(notesText: string | null | undefined): string | null {
  const normalized = (notesText ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 137)}...`;
}

function countDeliveryEvidence(evidenceJson: string | null | undefined): number {
  if (!evidenceJson) {
    return 0;
  }

  try {
    const parsed = JSON.parse(evidenceJson) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(Boolean).length;
    }
    if (
      parsed
      && typeof parsed === "object"
      && "items" in parsed
      && Array.isArray((parsed as { items?: unknown }).items)
    ) {
      return ((parsed as { items: unknown[] }).items ?? []).filter(Boolean).length;
    }
  } catch {
    return 0;
  }

  return 0;
}

function inferRecentDeliveryUpdateKind(args: {
  trackKey?: string | null | undefined;
  status?: string | null | undefined;
  evidenceCount: number;
}): "verification" | "go_live" | "verification_completed" | "go_live_completed" | "evidence_only" | null {
  if (args.trackKey !== "verification" && args.trackKey !== "go_live") {
    return null;
  }
  if (args.status === "complete") {
    return args.trackKey === "go_live" ? "go_live_completed" : "verification_completed";
  }
  if (args.evidenceCount > 0) {
    return "evidence_only";
  }
  return args.trackKey;
}

interface SaasWorkspaceCreateRequest {
  workspace_id?: string;
  organization_id?: string;
  slug?: string;
  display_name?: string;
  tenant_id?: string;
  plan_id?: string;
  data_region?: string;
}

interface SaasApiKeyCreateRequest {
  service_account_id?: string | null;
  scope?: string[];
  expires_at?: string | null;
}

interface SaasServiceAccountCreateRequest {
  service_account_id?: string;
  name?: string;
  description?: string | null;
  role?: string;
}

interface SaasWorkspaceInvitationCreateRequest {
  email?: string;
  role?: string;
  expires_at?: string | null;
}

interface SaasInvitationAcceptRequest {
  invite_token?: string;
}

interface SaasBillingCheckoutSessionCreateRequest {
  target_plan_id?: string;
  billing_interval?: string;
}

interface SaasBillingPortalSession {
  billing_provider: string;
  portal_url: string;
  return_url: string | null;
  created_at: string;
}

interface SaasBillingPortalSessionCreateRequest {
  return_url?: string | null;
}

interface SaasWorkspaceDeliveryTrackSectionInput {
  status?: string;
  owner_user_id?: string | null;
  notes?: string | null;
  evidence_links?: Array<{
    label?: string | null;
    url?: string | null;
  }>;
}

interface SaasWorkspaceDeliveryTrackUpdateRequest {
  workspace_id?: string;
  verification?: SaasWorkspaceDeliveryTrackSectionInput;
  go_live?: SaasWorkspaceDeliveryTrackSectionInput;
}

interface SaasWorkspaceSsoConfigRequest {
  workspace_id?: string;
  enabled?: boolean | null;
  provider_type?: string;
  connection_mode?: string;
  issuer_url?: string | null;
  metadata_url?: string | null;
  entrypoint_url?: string | null;
  audience?: string | null;
  domain?: string | null;
  email_domain?: string | null;
  email_domains?: string[] | null;
  client_id?: string | null;
  signing_certificate?: string | null;
  notes?: string | null;
}

interface SaasWorkspaceDedicatedEnvironmentConfigRequest {
  workspace_id?: string;
  enabled?: boolean | null;
  deployment_model?: string;
  target_region?: string | null;
  network_boundary?: string | null;
  compliance_notes?: string | null;
  requester_email?: string | null;
  data_classification?: string | null;
  requested_capacity?: string | null;
  requested_sla?: string | null;
  notes?: string | null;
}

interface SaasWorkspaceSsoReadiness {
  feature: "sso";
  feature_enabled: true;
  enabled: true;
  status: "not_configured" | "configured" | "staged";
  configured: boolean;
  configuration_state: "not_configured" | "configured";
  availability_status: "available";
  delivery_status: "staged" | "ga";
  readiness_version: "2026-04";
  provider_type: "oidc" | "saml" | null;
  connection_mode: "workspace";
  supported_protocols: Array<"oidc" | "saml">;
  configured_at: string | null;
  issuer_url: string | null;
  metadata_url: string | null;
  entrypoint_url: string | null;
  audience: string | null;
  email_domain: string | null;
  email_domains: string[];
  client_id: string | null;
  signing_certificate: string | null;
  notes: string | null;
  next_steps: string[];
  upgrade_href: null;
  plan_code: string;
}

interface SaasWorkspaceDedicatedEnvironmentReadiness {
  feature: "dedicated_environment";
  feature_enabled: true;
  enabled: true;
  status: "not_configured" | "configured" | "staged";
  configured: boolean;
  configuration_state: "not_configured" | "configured";
  availability_status: "available";
  delivery_status: "staged" | "ga";
  readiness_version: "2026-04";
  deployment_model: "single_tenant" | "pooled_with_isolation";
  target_region: string | null;
  configured_at: string | null;
  network_boundary: string | null;
  compliance_notes: string | null;
  requester_email: string | null;
  data_classification: "internal" | "restricted" | "external" | null;
  requested_capacity: string | null;
  requested_sla: string | null;
  notes: string | null;
  isolation_summary: string;
  next_steps: string[];
  upgrade_href: null;
  plan_code: string;
}

interface SaasBillingProviderWebhookRequest {
  event_id?: string;
  event_type?: string;
  data?: {
    workspace_id?: string;
    checkout_session_id?: string | null;
    external_customer_ref?: string | null;
    external_subscription_ref?: string | null;
    status?: string;
    current_period_start?: string | null;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean | null;
  };
}

interface SaasWorkspaceAccessContext {
  user: UserRow;
  workspace: WorkspaceRow;
  membership: WorkspaceMembershipRow;
}

interface SaasAdminAccessContext {
  user: UserRow;
  platform_roles: string[];
}

function hasWorkspaceManagementRole(role: WorkspaceMembershipRow["role"]): boolean {
  return WORKSPACE_MEMBER_MANAGER_ROLES.includes(role);
}

function hasSaasPlatformAdminRole(roles: string[]): boolean {
  return roles.some((role) => SAAS_PLATFORM_ADMIN_ROLES.includes(role as (typeof SAAS_PLATFORM_ADMIN_ROLES)[number]));
}

function requireWorkspaceManagementRole(membership: WorkspaceMembershipRow, actionLabel: string): void {
  if (hasWorkspaceManagementRole(membership.role)) {
    return;
  }

  throw new ApiError(403, "workspace_admin_required", actionLabel, {
    required_roles: [...WORKSPACE_MEMBER_MANAGER_ROLES],
  });
}

async function requireSaasWorkspaceAccess(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<SaasWorkspaceAccessContext> {
  const user = await resolveSaasUser(request, env);
  const workspace = await getWorkspaceById(env, workspaceId);
  if (!workspace) {
    throw new ApiError(404, "workspace_not_found", "Workspace does not exist");
  }
  if (workspace.status !== "active") {
    throw new ApiError(403, "tenant_access_denied", "Workspace is not active", {
      workspace_id: workspace.workspace_id,
      workspace_status: workspace.status,
    });
  }

  const organization = await getOrganizationById(env, workspace.organization_id);
  if (!organization) {
    throw new ApiError(500, "internal_error", "Workspace organization could not be loaded");
  }
  if (organization.status !== "active") {
    throw new ApiError(403, "tenant_access_denied", "Workspace organization is not active", {
      organization_id: organization.organization_id,
      organization_status: organization.status,
    });
  }

  const membership = await getWorkspaceMembership(env, workspaceId, user.user_id);
  if (!membership || membership.status !== "active") {
    throw new ApiError(403, "tenant_access_denied", "Workspace is not accessible by current user");
  }

  const organizationMembership = await getOrganizationMembership(env, workspace.organization_id, user.user_id);
  if (!organizationMembership || organizationMembership.status !== "active") {
    throw new ApiError(403, "tenant_access_denied", "Workspace organization is not accessible by current user", {
      organization_id: workspace.organization_id,
    });
  }

  return {
    user,
    workspace,
    membership,
  };
}

async function requireSaasAdminAccess(request: Request, env: Env): Promise<SaasAdminAccessContext> {
  const user = await resolveSaasUser(request, env);
  const platformRoles = getSubjectRoles(request, env);
  if (!hasSaasPlatformAdminRole(platformRoles)) {
    throw new ApiError(403, "tenant_access_denied", "SaaS admin overview requires a platform admin role", {
      required_roles: [...SAAS_PLATFORM_ADMIN_ROLES],
    });
  }

  return {
    user,
    platform_roles: platformRoles,
  };
}

async function requireSaasWorkspaceAdminAccess(
  request: Request,
  env: Env,
  workspaceId: string,
  actionLabel: string,
): Promise<SaasWorkspaceAccessContext> {
  const access = await requireSaasWorkspaceAccess(request, env, workspaceId);
  requireWorkspaceManagementRole(access.membership, actionLabel);
  return access;
}

async function requireWorkspaceServiceAccount(
  env: Env,
  workspaceId: string,
  serviceAccountId: string,
): Promise<ServiceAccountRow> {
  const serviceAccount = await getServiceAccountById(env, serviceAccountId);
  if (!serviceAccount || serviceAccount.workspace_id !== workspaceId) {
    throw new ApiError(404, "service_account_not_found", "service_account_id does not exist in workspace");
  }

  return serviceAccount;
}

async function requireWorkspaceApiKey(
  env: Env,
  workspaceId: string,
  apiKeyId: string,
): Promise<ApiKeyRow> {
  const apiKey = await getApiKeyById(env, apiKeyId);
  if (!apiKey || apiKey.workspace_id !== workspaceId) {
    throw new ApiError(404, "api_key_not_found", "api_key_id does not exist in workspace");
  }

  return apiKey;
}

async function applyNorthboundApiKeyAuthentication(request: Request, env: Env): Promise<Request> {
  const plaintextApiKey = getNorthboundApiKeyCredential(request);
  if (!plaintextApiKey) {
    return request;
  }

  const keyHash = await sha256Hex(plaintextApiKey);
  const apiKey = await getApiKeyByKeyHash(env, keyHash);
  if (!apiKey) {
    throw new ApiError(401, "unauthorized", "Workspace API key is invalid");
  }

  const timestamp = nowIso();
  if (apiKey.status !== "active" || apiKey.revoked_at) {
    throw new ApiError(401, "unauthorized", "Workspace API key is no longer active");
  }

  if (apiKey.expires_at && apiKey.expires_at <= timestamp) {
    await env.DB.prepare(
      `UPDATE api_keys
          SET status = CASE WHEN status = 'active' THEN 'expired' ELSE status END,
              updated_at = ?1
        WHERE api_key_id = ?2`,
    )
      .bind(timestamp, apiKey.api_key_id)
      .run();
    throw new ApiError(401, "unauthorized", "Workspace API key has expired");
  }

  const workspace = await getWorkspaceById(env, apiKey.workspace_id);
  if (!workspace || workspace.status !== "active" || workspace.tenant_id !== apiKey.tenant_id) {
    throw new ApiError(401, "unauthorized", "Workspace API key is not bound to an active workspace");
  }

  let serviceAccount: ServiceAccountRow | null = null;
  if (apiKey.service_account_id) {
    serviceAccount = await getServiceAccountById(env, apiKey.service_account_id);
    if (
      !serviceAccount ||
      serviceAccount.workspace_id !== workspace.workspace_id ||
      serviceAccount.tenant_id !== workspace.tenant_id ||
      serviceAccount.status !== "active"
    ) {
      throw new ApiError(401, "unauthorized", "Workspace API key is not bound to an active service account");
    }
  }

  await env.DB.prepare(
    `UPDATE api_keys
        SET last_used_at = ?1,
            updated_at = ?1
      WHERE api_key_id = ?2`,
  )
    .bind(timestamp, apiKey.api_key_id)
    .run();

  if (serviceAccount) {
    await env.DB.prepare(
      `UPDATE service_accounts
          SET last_used_at = ?1,
              updated_at = ?1
        WHERE service_account_id = ?2`,
    )
      .bind(timestamp, serviceAccount.service_account_id)
      .run();
  }

  const subjectId = serviceAccount
    ? `service_account:${serviceAccount.service_account_id}`
    : `api_key:${apiKey.api_key_id}`;
  const subjectRoles = serviceAccount?.role ? [serviceAccount.role] : ["workspace_service"];
  const apiKeyScopes = safeParseStringArray(apiKey.scope_json);
  const headers = new Headers(request.headers);
  headers.set("x-tenant-id", workspace.tenant_id);
  headers.set("x-authenticated-subject", subjectId);
  headers.set("x-authenticated-roles", subjectRoles.join(","));
  headers.set("x-authenticated-auth-type", "workspace_api_key");
  headers.set("x-authenticated-api-key-id", apiKey.api_key_id);
  headers.set("x-authenticated-api-scopes", JSON.stringify(apiKeyScopes));
  headers.set("x-workspace-id", workspace.workspace_id);
  headers.set("x-workspace-slug", workspace.slug);
  headers.delete("x-subject-id");
  headers.delete("x-subject-roles");
  headers.delete("x-roles");

  return new Request(request, {
    headers,
  });
}

function getAuthenticatedApiKeyScopes(request: Request): string[] {
  const rawScopes = request.headers.get("x-authenticated-api-scopes");
  if (!rawScopes || rawScopes.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(rawScopes) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value !== "");
  } catch {
    return rawScopes
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value !== "");
  }
}

function resolveNorthboundApiKeyRequiredScopes(method: string, pathname: string): string[] | null {
  if (method === "POST" && pathname === `${API_BASE}/runs`) {
    return ["runs:write"];
  }
  if (method === "POST" && /^\/api\/v1\/runs\/[^/]+\/replay$/.test(pathname)) {
    return ["runs:write"];
  }
  if (method === "POST" && /^\/api\/v1\/runs\/[^/:]+:cancel$/.test(pathname)) {
    return ["runs:manage"];
  }
  if (method === "POST" && /^\/api\/v1\/approvals\/[^/]+\/decision$/.test(pathname)) {
    return ["approvals:write"];
  }
  if (method === "POST" && pathname === `${API_BASE}/a2a/message:send`) {
    return ["a2a:write"];
  }
  if (method === "POST" && /^\/api\/v1\/a2a\/tasks\/[^/:]+:cancel$/.test(pathname)) {
    return ["a2a:write"];
  }
  if (method === "POST" && /^\/api\/v1\/mcp\/[^/]+$/.test(pathname)) {
    return ["mcp:call"];
  }
  return null;
}

function enforceNorthboundApiKeyScope(request: Request, requiredScopes: string[]): void {
  if (request.headers.get("x-authenticated-auth-type") !== "workspace_api_key") {
    return;
  }

  const grantedScopes = getAuthenticatedApiKeyScopes(request);
  if (grantedScopes.length === 0) {
    return;
  }

  const isAllowed = requiredScopes.some((scope) => grantedScopes.includes(scope));
  if (isAllowed) {
    return;
  }

  throw new ApiError(
    403,
    "workspace_api_key_scope_denied",
    "Workspace API key is missing the required runtime scope",
    {
      required_scopes: requiredScopes,
      granted_scopes: grantedScopes,
      api_key_id: request.headers.get("x-authenticated-api-key-id"),
    },
  );
}

async function requireWorkspaceInvitation(
  env: Env,
  workspaceId: string,
  invitationId: string,
): Promise<WorkspaceInvitationRow> {
  const invitation = await getWorkspaceInvitationById(env, invitationId);
  if (!invitation || invitation.workspace_id !== workspaceId) {
    throw new ApiError(404, "invitation_not_found", "invitation_id does not exist in workspace");
  }

  return invitation;
}

async function getSaasMe(request: Request, env: Env): Promise<Response> {
  const user = await resolveSaasUser(request, env);
  const workspaces = await listWorkspacesForUser(env, user.user_id);

  return json(
    {
      user: {
        user_id: user.user_id,
        email: user.email,
        display_name: user.display_name,
        auth_provider: user.auth_provider,
        auth_subject: user.auth_subject,
        status: user.status,
        last_login_at: user.last_login_at,
      },
      workspaces: workspaces.map((workspace) => serializeSaasWorkspaceListItem(workspace)),
    },
    buildMeta(request),
  );
}

async function getSaasAdminOverview(request: Request, env: Env): Promise<Response> {
  const access = await requireSaasAdminAccess(request, env);

  const summary = (await env.DB.prepare(
    `SELECT
        (SELECT COUNT(*) FROM organizations) AS organizations_total,
        (SELECT COUNT(*) FROM workspaces) AS workspaces_total,
        (SELECT COUNT(*) FROM workspaces WHERE status = 'active') AS active_workspaces_total,
        (SELECT COUNT(*) FROM users WHERE status = 'active') AS users_total,
        (
          SELECT COUNT(*)
            FROM workspace_plan_subscriptions s
            INNER JOIN pricing_plans p
               ON p.plan_id = s.plan_id
           WHERE s.status IN ('active', 'trialing', 'past_due')
             AND p.tier = 'paid'
        ) AS paid_subscriptions_total,
        (
          SELECT COUNT(*)
            FROM workspace_plan_subscriptions
           WHERE status = 'past_due'
        ) AS past_due_subscriptions_total`,
  ).first<{
    organizations_total: number;
    workspaces_total: number;
    active_workspaces_total: number;
    users_total: number;
    paid_subscriptions_total: number;
    past_due_subscriptions_total: number;
  }>()) ?? {
    organizations_total: 0,
    workspaces_total: 0,
    active_workspaces_total: 0,
    users_total: 0,
    paid_subscriptions_total: 0,
    past_due_subscriptions_total: 0,
  };

  const featureRollout = (await env.DB.prepare(
    `SELECT
        SUM(CASE WHEN json_extract(p.features_json, '$.audit_export') = 1 THEN 1 ELSE 0 END) AS audit_export_workspaces,
        SUM(CASE WHEN json_extract(p.features_json, '$.sso') = 1 THEN 1 ELSE 0 END) AS sso_workspaces,
        SUM(CASE WHEN json_extract(p.features_json, '$.dedicated_environment') = 1 THEN 1 ELSE 0 END) AS dedicated_environment_workspaces
       FROM workspaces w
       INNER JOIN pricing_plans p
          ON p.plan_id = w.plan_id`,
  ).first<{
    audit_export_workspaces: number | null;
    sso_workspaces: number | null;
    dedicated_environment_workspaces: number | null;
  }>()) ?? {
    audit_export_workspaces: 0,
    sso_workspaces: 0,
    dedicated_environment_workspaces: 0,
  };

  const planDistributionResult = await env.DB.prepare(
    `SELECT p.code, p.display_name, COUNT(*) AS workspaces
       FROM workspaces w
       INNER JOIN pricing_plans p
          ON p.plan_id = w.plan_id
      GROUP BY p.plan_id, p.code, p.display_name
      ORDER BY workspaces DESC, p.display_name ASC`,
  ).run();

  const deliveryOverview = (await env.DB.prepare(
    `SELECT
        COUNT(DISTINCT workspace_id) AS tracked_workspaces_total,
        SUM(CASE WHEN track_key = 'verification' AND status = 'pending' THEN 1 ELSE 0 END) AS verification_pending_total,
        SUM(CASE WHEN track_key = 'verification' AND status = 'in_progress' THEN 1 ELSE 0 END) AS verification_in_progress_total,
        SUM(CASE WHEN track_key = 'verification' AND status = 'complete' THEN 1 ELSE 0 END) AS verification_complete_total,
        SUM(CASE WHEN track_key = 'go_live' AND status = 'pending' THEN 1 ELSE 0 END) AS go_live_pending_total,
        SUM(CASE WHEN track_key = 'go_live' AND status = 'in_progress' THEN 1 ELSE 0 END) AS go_live_in_progress_total,
        SUM(CASE WHEN track_key = 'go_live' AND status = 'complete' THEN 1 ELSE 0 END) AS go_live_complete_total
       FROM workspace_delivery_tracks`,
  ).first<{
    tracked_workspaces_total: number | null;
    verification_pending_total: number | null;
    verification_in_progress_total: number | null;
    verification_complete_total: number | null;
    go_live_pending_total: number | null;
    go_live_in_progress_total: number | null;
    go_live_complete_total: number | null;
  }>()) ?? {
    tracked_workspaces_total: 0,
    verification_pending_total: 0,
    verification_in_progress_total: 0,
    verification_complete_total: 0,
    go_live_pending_total: 0,
    go_live_in_progress_total: 0,
    go_live_complete_total: 0,
  };

  const recentWorkspacesResult = await env.DB.prepare(
    `SELECT w.workspace_id, w.slug, w.display_name, w.status, w.data_region, w.created_at,
            o.display_name AS organization_display_name,
            p.code AS plan_code,
            p.display_name AS plan_display_name
       FROM workspaces w
       INNER JOIN organizations o
          ON o.organization_id = w.organization_id
       INNER JOIN pricing_plans p
          ON p.plan_id = w.plan_id
      ORDER BY w.created_at DESC, w.workspace_id DESC
      LIMIT 5`,
  ).run();

  const recentDeliveryUpdatesResult = await env.DB.prepare(
    `WITH latest_track AS (
        SELECT t.workspace_id, t.track_key, t.status, t.notes_text, t.evidence_json, t.updated_at,
               u.email AS owner_email, u.display_name AS owner_display_name
          FROM workspace_delivery_tracks t
          LEFT JOIN users u
             ON u.user_id = t.owner_user_id
         WHERE t.track_id = (
           SELECT t2.track_id
             FROM workspace_delivery_tracks t2
            WHERE t2.workspace_id = t.workspace_id
            ORDER BY t2.updated_at DESC,
                     CASE t2.track_key
                       WHEN 'go_live' THEN 1
                       WHEN 'verification' THEN 0
                       ELSE 2
                     END DESC,
                     t2.track_id DESC
            LIMIT 1
         )
      ),
      delivery_status AS (
        SELECT w.workspace_id, w.slug, w.display_name, w.organization_id, w.tenant_id,
               o.display_name AS organization_display_name,
               p.code AS plan_code,
               (
                 SELECT r.run_id
                   FROM runs r
                  WHERE r.tenant_id = w.tenant_id
                    AND json_extract(r.context_json, '$.source_app') = 'web_console'
                    AND json_extract(r.context_json, '$.workspace_slug') = w.slug
                    AND (
                      json_extract(r.context_json, '$.onboarding_flow') = 'workspace_first_demo'
                      OR json_extract(r.context_json, '$.conversation_id') = 'onboarding-' || w.slug
                    )
                  ORDER BY r.created_at DESC, r.run_id DESC
                  LIMIT 1
               ) AS latest_demo_run_id,
               COALESCE(MAX(CASE WHEN t.track_key = 'verification' THEN t.status END), 'pending') AS verification_status,
               COALESCE(MAX(CASE WHEN t.track_key = 'go_live' THEN t.status END), 'pending') AS go_live_status
          FROM workspace_delivery_tracks t
          INNER JOIN workspaces w
             ON w.workspace_id = t.workspace_id
          INNER JOIN organizations o
             ON o.organization_id = w.organization_id
          INNER JOIN pricing_plans p
             ON p.plan_id = w.plan_id
         GROUP BY w.workspace_id, w.slug, w.display_name, w.organization_id, w.tenant_id, o.display_name, p.code
      )
      SELECT ds.workspace_id, ds.slug, ds.display_name, ds.organization_id, ds.organization_display_name, ds.plan_code,
             ds.latest_demo_run_id,
             ds.verification_status, ds.go_live_status,
             CASE
               WHEN ds.verification_status != 'complete' THEN 'verification'
               WHEN ds.go_live_status != 'complete' THEN 'go_live'
               ELSE 'verification'
             END AS next_action_surface,
             lt.track_key AS recent_track_key,
             lt.status AS recent_track_status,
             lt.owner_email,
             lt.owner_display_name,
             lt.notes_text,
             lt.evidence_json,
             lt.updated_at AS updated_at
        FROM delivery_status ds
        INNER JOIN latest_track lt
           ON lt.workspace_id = ds.workspace_id
       ORDER BY lt.updated_at DESC, ds.workspace_id DESC
       LIMIT 5`,
  ).run();

  const attentionWorkspacesResult = await env.DB.prepare(
    `WITH delivery_status AS (
        SELECT w.workspace_id, w.slug, w.display_name, w.updated_at AS workspace_updated_at,
               o.organization_id,
               o.display_name AS organization_display_name,
               (
                 SELECT r.run_id
                   FROM runs r
                  WHERE r.tenant_id = w.tenant_id
                    AND json_extract(r.context_json, '$.source_app') = 'web_console'
                    AND json_extract(r.context_json, '$.workspace_slug') = w.slug
                    AND (
                      json_extract(r.context_json, '$.onboarding_flow') = 'workspace_first_demo'
                      OR json_extract(r.context_json, '$.conversation_id') = 'onboarding-' || w.slug
                    )
                  ORDER BY r.created_at DESC, r.run_id DESC
                  LIMIT 1
               ) AS latest_demo_run_id,
               COALESCE(MAX(CASE WHEN t.track_key = 'verification' THEN t.status END), 'pending') AS verification_status,
               COALESCE(MAX(CASE WHEN t.track_key = 'go_live' THEN t.status END), 'pending') AS go_live_status,
               MAX(t.updated_at) AS delivery_updated_at
          FROM workspaces w
          INNER JOIN organizations o
             ON o.organization_id = w.organization_id
          LEFT JOIN workspace_delivery_tracks t
             ON t.workspace_id = w.workspace_id
         GROUP BY w.workspace_id, w.slug, w.display_name, w.updated_at, o.organization_id, o.display_name
      )
      SELECT workspace_id, slug, display_name, organization_id, organization_display_name, latest_demo_run_id, verification_status, go_live_status,
             CASE
               WHEN verification_status != 'complete' THEN 'verification'
               WHEN go_live_status != 'complete' THEN 'go_live'
               ELSE 'verification'
             END AS next_action_surface,
             COALESCE(delivery_updated_at, workspace_updated_at) AS updated_at
        FROM delivery_status
       WHERE verification_status != 'complete' OR go_live_status != 'complete'
       ORDER BY
         CASE
           WHEN verification_status = 'in_progress' OR go_live_status = 'in_progress' THEN 0
           WHEN verification_status = 'pending' OR go_live_status = 'pending' THEN 1
           ELSE 2
         END ASC,
         COALESCE(delivery_updated_at, workspace_updated_at) DESC,
         workspace_id DESC
       LIMIT 8`,
  ).run();

  const attentionSummary = (await env.DB.prepare(
    `WITH delivery_status AS (
        SELECT w.workspace_id,
               COALESCE(MAX(CASE WHEN t.track_key = 'verification' THEN t.status END), 'pending') AS verification_status,
               COALESCE(MAX(CASE WHEN t.track_key = 'go_live' THEN t.status END), 'pending') AS go_live_status
          FROM workspaces w
          LEFT JOIN workspace_delivery_tracks t
             ON t.workspace_id = w.workspace_id
         GROUP BY w.workspace_id
      )
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN verification_status != 'complete' THEN 1 ELSE 0 END) AS verification_total,
        SUM(CASE WHEN go_live_status != 'complete' THEN 1 ELSE 0 END) AS go_live_total,
        SUM(CASE WHEN verification_status = 'in_progress' OR go_live_status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_total,
        SUM(CASE WHEN verification_status = 'pending' OR go_live_status = 'pending' THEN 1 ELSE 0 END) AS pending_total
       FROM delivery_status
      WHERE verification_status != 'complete' OR go_live_status != 'complete'`,
  ).first<{
    total: number | null;
    verification_total: number | null;
    go_live_total: number | null;
    in_progress_total: number | null;
    pending_total: number | null;
  }>()) ?? {
    total: 0,
    verification_total: 0,
    go_live_total: 0,
    in_progress_total: 0,
    pending_total: 0,
  };

  const attentionOrganizationsResult = await env.DB.prepare(
    `WITH delivery_status AS (
        SELECT w.workspace_id, o.organization_id, o.display_name AS organization_display_name,
               w.updated_at AS workspace_updated_at,
               COALESCE(MAX(CASE WHEN t.track_key = 'verification' THEN t.status END), 'pending') AS verification_status,
               COALESCE(MAX(CASE WHEN t.track_key = 'go_live' THEN t.status END), 'pending') AS go_live_status,
               MAX(t.updated_at) AS delivery_updated_at
          FROM workspaces w
          INNER JOIN organizations o
             ON o.organization_id = w.organization_id
          LEFT JOIN workspace_delivery_tracks t
             ON t.workspace_id = w.workspace_id
         GROUP BY w.workspace_id, o.organization_id, o.display_name, w.updated_at
      )
      SELECT organization_id, organization_display_name,
             COUNT(*) AS workspaces_total,
             SUM(CASE WHEN verification_status != 'complete' THEN 1 ELSE 0 END) AS verification_total,
             SUM(CASE WHEN go_live_status != 'complete' THEN 1 ELSE 0 END) AS go_live_total,
             SUM(CASE WHEN verification_status = 'in_progress' OR go_live_status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_total,
             SUM(CASE WHEN verification_status = 'pending' OR go_live_status = 'pending' THEN 1 ELSE 0 END) AS pending_total,
             MAX(COALESCE(delivery_updated_at, workspace_updated_at)) AS latest_update_at
        FROM delivery_status
       WHERE verification_status != 'complete' OR go_live_status != 'complete'
       GROUP BY organization_id, organization_display_name
       ORDER BY in_progress_total DESC, pending_total DESC, latest_update_at DESC, organization_display_name ASC
       LIMIT 6`,
  ).run();

  const week8Readiness = (await env.DB.prepare(
    `WITH workspace_seed AS (
        SELECT workspace_id, tenant_id, slug,
               lower(substr(replace(replace(workspace_id, '-', ''), '_', ''), -8)) AS bootstrap_suffix
          FROM workspaces
      ),
      workspace_readiness AS (
        SELECT ws.workspace_id,
               CASE
                 WHEN EXISTS(
                   SELECT 1
                     FROM tool_providers tp
                    WHERE tp.tenant_id = ws.tenant_id
                      AND tp.tool_provider_id = 'tp_bootstrap_email_' || ws.bootstrap_suffix
                 ) AND EXISTS(
                   SELECT 1
                     FROM tool_providers tp
                    WHERE tp.tenant_id = ws.tenant_id
                      AND tp.tool_provider_id = 'tp_bootstrap_erp_' || ws.bootstrap_suffix
                 ) AND EXISTS(
                   SELECT 1
                     FROM policies p
                    WHERE p.tenant_id = ws.tenant_id
                      AND p.policy_id = 'pol_bootstrap_email_external_' || ws.bootstrap_suffix
                 ) AND EXISTS(
                   SELECT 1
                     FROM policies p
                    WHERE p.tenant_id = ws.tenant_id
                      AND p.policy_id = 'pol_bootstrap_erp_read_' || ws.bootstrap_suffix
                 ) AND EXISTS(
                   SELECT 1
                     FROM policies p
                    WHERE p.tenant_id = ws.tenant_id
                      AND p.policy_id = 'pol_bootstrap_erp_delete_' || ws.bootstrap_suffix
                 )
                 THEN 1 ELSE 0
               END AS baseline_ready,
               CASE
                 WHEN EXISTS(
                   SELECT 1
                     FROM service_accounts sa
                    WHERE sa.workspace_id = ws.workspace_id
                 ) AND EXISTS(
                   SELECT 1
                     FROM api_keys k
                    WHERE k.workspace_id = ws.workspace_id
                 )
                 THEN 1 ELSE 0
               END AS credentials_ready,
               CASE
                 WHEN EXISTS(
                   SELECT 1
                     FROM runs r
                    WHERE r.tenant_id = ws.tenant_id
                      AND json_extract(r.context_json, '$.source_app') = 'web_console'
                      AND json_extract(r.context_json, '$.workspace_slug') = ws.slug
                      AND (
                        json_extract(r.context_json, '$.onboarding_flow') = 'workspace_first_demo'
                        OR json_extract(r.context_json, '$.conversation_id') = 'onboarding-' || ws.slug
                      )
                      AND r.status = 'completed'
                 )
                 THEN 1 ELSE 0
               END AS demo_run_succeeded,
               CASE
                 WHEN EXISTS(
                   SELECT 1
                     FROM workspace_plan_subscriptions s
                    WHERE s.workspace_id = ws.workspace_id
                      AND (
                        s.status IN ('past_due', 'paused', 'cancelled')
                        OR s.cancel_at_period_end = 1
                      )
                 )
                 THEN 1 ELSE 0
               END AS billing_warning
          FROM workspace_seed ws
      )
      SELECT
        COUNT(*) AS total,
        SUM(baseline_ready) AS baseline_ready_total,
        SUM(credentials_ready) AS credentials_ready_total,
        SUM(demo_run_succeeded) AS demo_run_succeeded_total,
        SUM(billing_warning) AS billing_warning_total,
        SUM(
          CASE
            WHEN baseline_ready = 1
              AND credentials_ready = 1
              AND demo_run_succeeded = 1
              AND billing_warning = 0
            THEN 1 ELSE 0
          END
        ) AS mock_go_live_ready_total
       FROM workspace_readiness`,
  ).first<{
    total: number | null;
    baseline_ready_total: number | null;
    credentials_ready_total: number | null;
    demo_run_succeeded_total: number | null;
    billing_warning_total: number | null;
    mock_go_live_ready_total: number | null;
  }>()) ?? {
    total: 0,
    baseline_ready_total: 0,
    credentials_ready_total: 0,
    demo_run_succeeded_total: 0,
    billing_warning_total: 0,
    mock_go_live_ready_total: 0,
  };

  const week8ReadinessWorkspacesResult = await env.DB.prepare(
    `WITH workspace_seed AS (
        SELECT w.workspace_id, w.tenant_id, w.slug, w.display_name, w.updated_at,
               o.organization_id,
               o.display_name AS organization_display_name,
               lower(substr(replace(replace(w.workspace_id, '-', ''), '_', ''), -8)) AS bootstrap_suffix
          FROM workspaces w
          INNER JOIN organizations o
             ON o.organization_id = w.organization_id
      ),
      workspace_readiness AS (
        SELECT ws.workspace_id, ws.slug, ws.display_name, ws.organization_id, ws.organization_display_name, ws.updated_at,
               (
                 SELECT r.run_id
                   FROM runs r
                  WHERE r.tenant_id = ws.tenant_id
                    AND json_extract(r.context_json, '$.source_app') = 'web_console'
                    AND json_extract(r.context_json, '$.workspace_slug') = ws.slug
                    AND (
                      json_extract(r.context_json, '$.onboarding_flow') = 'workspace_first_demo'
                      OR json_extract(r.context_json, '$.conversation_id') = 'onboarding-' || ws.slug
                    )
                  ORDER BY r.created_at DESC, r.run_id DESC
                  LIMIT 1
               ) AS latest_demo_run_id,
               CASE
                 WHEN EXISTS(
                   SELECT 1
                     FROM tool_providers tp
                    WHERE tp.tenant_id = ws.tenant_id
                      AND tp.tool_provider_id = 'tp_bootstrap_email_' || ws.bootstrap_suffix
                 ) AND EXISTS(
                   SELECT 1
                     FROM tool_providers tp
                    WHERE tp.tenant_id = ws.tenant_id
                      AND tp.tool_provider_id = 'tp_bootstrap_erp_' || ws.bootstrap_suffix
                 ) AND EXISTS(
                   SELECT 1
                     FROM policies p
                    WHERE p.tenant_id = ws.tenant_id
                      AND p.policy_id = 'pol_bootstrap_email_external_' || ws.bootstrap_suffix
                 ) AND EXISTS(
                   SELECT 1
                     FROM policies p
                    WHERE p.tenant_id = ws.tenant_id
                      AND p.policy_id = 'pol_bootstrap_erp_read_' || ws.bootstrap_suffix
                 ) AND EXISTS(
                   SELECT 1
                     FROM policies p
                    WHERE p.tenant_id = ws.tenant_id
                      AND p.policy_id = 'pol_bootstrap_erp_delete_' || ws.bootstrap_suffix
                 )
                 THEN 1 ELSE 0
               END AS baseline_ready,
               CASE
                 WHEN EXISTS(
                   SELECT 1
                     FROM service_accounts sa
                    WHERE sa.workspace_id = ws.workspace_id
                 ) AND EXISTS(
                   SELECT 1
                     FROM api_keys k
                    WHERE k.workspace_id = ws.workspace_id
                 )
                 THEN 1 ELSE 0
               END AS credentials_ready,
               CASE
                 WHEN EXISTS(
                   SELECT 1
                     FROM runs r
                    WHERE r.tenant_id = ws.tenant_id
                      AND json_extract(r.context_json, '$.source_app') = 'web_console'
                      AND json_extract(r.context_json, '$.workspace_slug') = ws.slug
                      AND (
                        json_extract(r.context_json, '$.onboarding_flow') = 'workspace_first_demo'
                        OR json_extract(r.context_json, '$.conversation_id') = 'onboarding-' || ws.slug
                      )
                      AND r.status = 'completed'
                 )
                 THEN 1 ELSE 0
               END AS demo_run_succeeded,
               CASE
                 WHEN EXISTS(
                   SELECT 1
                     FROM workspace_plan_subscriptions s
                    WHERE s.workspace_id = ws.workspace_id
                      AND (
                        s.status IN ('past_due', 'paused', 'cancelled')
                        OR s.cancel_at_period_end = 1
                      )
                 )
                 THEN 1 ELSE 0
               END AS billing_warning
          FROM workspace_seed ws
      )
      SELECT workspace_id, slug, display_name, organization_id, organization_display_name, updated_at,
             latest_demo_run_id,
             baseline_ready, credentials_ready, demo_run_succeeded, billing_warning,
             CASE
               WHEN baseline_ready = 1
                 AND credentials_ready = 1
                 AND demo_run_succeeded = 1
                 AND billing_warning = 0
               THEN 1 ELSE 0
             END AS mock_go_live_ready,
             CASE
               WHEN baseline_ready = 0 OR credentials_ready = 0 THEN 'onboarding'
               WHEN demo_run_succeeded = 0 THEN 'verification'
               WHEN billing_warning = 1 THEN 'settings'
               ELSE 'go_live'
             END AS next_action_surface
        FROM workspace_readiness
       ORDER BY
         CASE
           WHEN baseline_ready = 1
             AND credentials_ready = 1
             AND demo_run_succeeded = 1
             AND billing_warning = 0
           THEN 1 ELSE 0
         END ASC,
         billing_warning DESC,
         baseline_ready ASC,
         credentials_ready ASC,
         demo_run_succeeded ASC,
         updated_at DESC,
         workspace_id DESC
       LIMIT 12`,
  ).run();

  return json(
    {
      actor: {
        user_id: access.user.user_id,
        email: access.user.email,
        display_name: access.user.display_name,
        platform_roles: access.platform_roles,
      },
      summary: {
        organizations_total: summary.organizations_total,
        workspaces_total: summary.workspaces_total,
        active_workspaces_total: summary.active_workspaces_total,
        users_total: summary.users_total,
        paid_subscriptions_total: summary.paid_subscriptions_total,
        past_due_subscriptions_total: summary.past_due_subscriptions_total,
      },
      feature_rollout: {
        audit_export_enabled_workspaces: featureRollout.audit_export_workspaces ?? 0,
        sso_enabled_workspaces: featureRollout.sso_workspaces ?? 0,
        dedicated_environment_enabled_workspaces: featureRollout.dedicated_environment_workspaces ?? 0,
      },
      delivery_governance: {
        tracked_workspaces_total: Number(deliveryOverview.tracked_workspaces_total ?? 0),
        untracked_workspaces_total: Math.max(
          0,
          summary.workspaces_total - Number(deliveryOverview.tracked_workspaces_total ?? 0),
        ),
        verification: {
          pending: Number(deliveryOverview.verification_pending_total ?? 0),
          in_progress: Number(deliveryOverview.verification_in_progress_total ?? 0),
          complete: Number(deliveryOverview.verification_complete_total ?? 0),
        },
        go_live: {
          pending: Number(deliveryOverview.go_live_pending_total ?? 0),
          in_progress: Number(deliveryOverview.go_live_in_progress_total ?? 0),
          complete: Number(deliveryOverview.go_live_complete_total ?? 0),
        },
      },
      plan_distribution: (planDistributionResult.results ?? []).map((row) => {
        const record = row as {
          code?: string;
          display_name?: string;
          workspaces?: number;
        };
        return {
          plan_code: record.code ?? "unknown",
          display_name: record.display_name ?? record.code ?? "Unknown",
          workspace_count: Number(record.workspaces ?? 0),
        };
      }),
      recent_workspaces: (recentWorkspacesResult.results ?? []).map((row) => {
        const record = row as {
          workspace_id?: string;
          slug?: string;
          display_name?: string;
          organization_display_name?: string;
          plan_code?: string;
          plan_display_name?: string;
          status?: string;
          data_region?: string;
          created_at?: string;
        };
        return {
          workspace_id: record.workspace_id ?? "",
          slug: record.slug ?? "",
          display_name: record.display_name ?? record.slug ?? "workspace",
          organization_display_name: record.organization_display_name ?? "Unknown organization",
          plan_code: record.plan_code ?? "unknown",
          plan_display_name: record.plan_display_name ?? record.plan_code ?? "Unknown",
          status: record.status ?? "unknown",
          data_region: record.data_region ?? "global",
          created_at: record.created_at ?? nowIso(),
        };
      }),
      recent_delivery_workspaces: (recentDeliveryUpdatesResult.results ?? []).map((row) => {
        const record = row as {
          workspace_id?: string;
          slug?: string;
          display_name?: string;
          organization_id?: string;
          organization_display_name?: string;
          latest_demo_run_id?: string | null;
          verification_status?: string;
          go_live_status?: string;
          next_action_surface?: string;
          recent_track_key?: string;
          recent_track_status?: string;
          owner_display_name?: string | null;
          owner_email?: string | null;
          notes_text?: string | null;
          evidence_json?: string | null;
          updated_at?: string;
        };
        const evidenceCount = countDeliveryEvidence(record.evidence_json);
        return {
          workspace_id: record.workspace_id ?? "",
          slug: record.slug ?? "",
          display_name: record.display_name ?? record.slug ?? "workspace",
          organization_id: record.organization_id ?? "",
          organization_display_name: record.organization_display_name ?? "Unknown organization",
          latest_demo_run_id: record.latest_demo_run_id ?? null,
          verification_status: record.verification_status ?? "pending",
          go_live_status: record.go_live_status ?? "pending",
          next_action_surface:
            record.next_action_surface === "go_live" ? "go_live" : "verification",
          owner_display_name: record.owner_display_name ?? null,
          owner_email: record.owner_email ?? null,
          notes_summary: summarizeDeliveryNotes(record.notes_text),
          evidence_count: evidenceCount,
          recent_track_key:
            record.recent_track_key === "go_live"
              ? "go_live"
              : record.recent_track_key === "verification"
                ? "verification"
                : null,
          recent_update_kind: inferRecentDeliveryUpdateKind({
            trackKey: record.recent_track_key,
            status: record.recent_track_status,
            evidenceCount,
          }),
          updated_at: record.updated_at ?? nowIso(),
        };
      }),
      attention_workspaces: (attentionWorkspacesResult.results ?? []).map((row) => {
        const record = row as {
          workspace_id?: string;
          slug?: string;
          display_name?: string;
          organization_id?: string;
          organization_display_name?: string;
          latest_demo_run_id?: string | null;
          verification_status?: string;
          go_live_status?: string;
          next_action_surface?: string;
          updated_at?: string;
        };
        return {
          workspace_id: record.workspace_id ?? "",
          slug: record.slug ?? "",
          display_name: record.display_name ?? record.slug ?? "workspace",
          organization_id: record.organization_id ?? "",
          organization_display_name: record.organization_display_name ?? "Unknown organization",
          latest_demo_run_id: record.latest_demo_run_id ?? null,
          verification_status: record.verification_status ?? "pending",
          go_live_status: record.go_live_status ?? "pending",
          next_action_surface:
            record.next_action_surface === "go_live" ? "go_live" : "verification",
          updated_at: record.updated_at ?? nowIso(),
        };
      }),
      attention_summary: {
        total: Number(attentionSummary.total ?? 0),
        verification_total: Number(attentionSummary.verification_total ?? 0),
        go_live_total: Number(attentionSummary.go_live_total ?? 0),
        in_progress_total: Number(attentionSummary.in_progress_total ?? 0),
        pending_total: Number(attentionSummary.pending_total ?? 0),
      },
      week8_readiness: {
        total: Number(week8Readiness.total ?? 0),
        baseline_ready_total: Number(week8Readiness.baseline_ready_total ?? 0),
        credentials_ready_total: Number(week8Readiness.credentials_ready_total ?? 0),
        demo_run_succeeded_total: Number(week8Readiness.demo_run_succeeded_total ?? 0),
        billing_warning_total: Number(week8Readiness.billing_warning_total ?? 0),
        mock_go_live_ready_total: Number(week8Readiness.mock_go_live_ready_total ?? 0),
      },
      week8_readiness_workspaces: (week8ReadinessWorkspacesResult.results ?? []).map((row) => {
        const record = row as {
          workspace_id?: string;
          slug?: string;
          display_name?: string;
          organization_id?: string;
          organization_display_name?: string;
          latest_demo_run_id?: string | null;
          baseline_ready?: number | boolean;
          credentials_ready?: number | boolean;
          demo_run_succeeded?: number | boolean;
          billing_warning?: number | boolean;
          mock_go_live_ready?: number | boolean;
          next_action_surface?: string;
          updated_at?: string;
        };
        return {
          workspace_id: record.workspace_id ?? "",
          slug: record.slug ?? "",
          display_name: record.display_name ?? record.slug ?? "workspace",
          organization_id: record.organization_id ?? "",
          organization_display_name: record.organization_display_name ?? "Unknown organization",
          latest_demo_run_id: record.latest_demo_run_id ?? null,
          baseline_ready: Boolean(record.baseline_ready),
          credentials_ready: Boolean(record.credentials_ready),
          demo_run_succeeded: Boolean(record.demo_run_succeeded),
          billing_warning: Boolean(record.billing_warning),
          mock_go_live_ready: Boolean(record.mock_go_live_ready),
          next_action_surface:
            record.next_action_surface === "settings"
              ? "settings"
              : record.next_action_surface === "verification"
                ? "verification"
                : record.next_action_surface === "go_live"
                  ? "go_live"
                  : "onboarding",
          updated_at: record.updated_at ?? nowIso(),
        };
      }),
      attention_organizations: (attentionOrganizationsResult.results ?? []).map((row) => {
        const record = row as {
          organization_id?: string;
          organization_display_name?: string;
          workspaces_total?: number;
          verification_total?: number;
          go_live_total?: number;
          in_progress_total?: number;
          pending_total?: number;
          latest_update_at?: string;
        };
        return {
          organization_id: record.organization_id ?? "",
          organization_display_name: record.organization_display_name ?? "Unknown organization",
          workspaces_total: Number(record.workspaces_total ?? 0),
          verification_total: Number(record.verification_total ?? 0),
          go_live_total: Number(record.go_live_total ?? 0),
          in_progress_total: Number(record.in_progress_total ?? 0),
          pending_total: Number(record.pending_total ?? 0),
          latest_update_at: record.latest_update_at ?? null,
        };
      }),
      updated_at: nowIso(),
    },
    buildMeta(request),
  );
}

async function listSaasWorkspaces(request: Request, env: Env): Promise<Response> {
  const user = await resolveSaasUser(request, env);
  const workspaces = await listWorkspacesForUser(env, user.user_id);

  return json(
    {
      items: workspaces.map((workspace) => serializeSaasWorkspaceListItem(workspace)),
      page_info: {
        next_cursor: null,
      },
    },
    buildMeta(request),
  );
}

async function getSaasWorkspaceById(request: Request, env: Env, workspaceId: string): Promise<Response> {
  const access = await requireSaasWorkspaceAccess(request, env, workspaceId);
  const { workspace, membership } = access;

  const organization = await getOrganizationById(env, workspace.organization_id);
  if (!organization) {
    throw new ApiError(500, "internal_error", "Workspace organization could not be loaded");
  }

  const plan = await getPricingPlanById(env, workspace.plan_id);
  const subscription = await getWorkspacePlanSubscription(env, workspace.workspace_id);
  const members = await listWorkspaceMembers(env, workspace.workspace_id);
  const usage = await getWorkspaceUsageSummary(env, workspace, plan, subscription);

  return json(
    {
      workspace: serializeSaasWorkspaceDetail(workspace, organization, membership),
      plan: plan ? serializePricingPlan(plan) : null,
      subscription: subscription ? serializeWorkspacePlanSubscription(subscription) : null,
      billing_summary: buildWorkspaceBillingSummary(env, plan, subscription),
      billing_providers: buildWorkspaceBillingProviders(subscription, env),
      usage,
      onboarding: await buildWorkspaceOnboardingState(env, workspace),
      members: members.map((member) => ({
        user_id: member.user_id,
        email: member.email,
        display_name: member.display_name,
        role: member.role,
        status: member.status,
        joined_at: member.joined_at,
      })),
    },
    buildMeta(request),
  );
}

async function getSaasWorkspaceDelivery(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAccess(request, env, workspaceId);
  return json(await buildWorkspaceDeliveryResponse(env, access.workspace), buildMeta(request));
}

async function saveSaasWorkspaceDelivery(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can update delivery tracking",
  );
  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<SaasWorkspaceDeliveryTrackUpdateRequest>(request);
  const body = normalizeSaasWorkspaceDeliveryTrackUpdateRequest(rawBody);
  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/delivery`;
  const payloadHash = await hashPayload(body);
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    return json(await buildWorkspaceDeliveryResponse(env, access.workspace), buildMeta(request));
  }

  const updatedAt = nowIso();
  let resourceId = createId("wdt");
  for (const trackKey of WORKSPACE_DELIVERY_TRACK_KEYS) {
    const section = body[trackKey];
    if (section.owner_user_id) {
      const ownerMembership = await getWorkspaceMembership(env, workspaceId, section.owner_user_id);
      if (!ownerMembership || ownerMembership.status !== "active") {
        throw new ApiError(
          400,
          "invalid_request",
          `${trackKey}.owner_user_id must reference an active workspace member`,
          { owner_user_id: section.owner_user_id, track_key: trackKey },
        );
      }
    }

    const existingTrack = await getWorkspaceDeliveryTrack(env, workspaceId, trackKey);
    const nextTrackId = existingTrack?.track_id ?? createId("wdt");
    if (trackKey === "verification") {
      resourceId = nextTrackId;
    }

    if (existingTrack) {
      await env.DB.prepare(
        `UPDATE workspace_delivery_tracks
            SET status = ?1,
                owner_user_id = ?2,
                notes_text = ?3,
                evidence_json = ?4,
                updated_at = ?5
          WHERE workspace_id = ?6 AND track_key = ?7`,
      )
        .bind(
          section.status,
          section.owner_user_id,
          section.notes ?? "",
          JSON.stringify(section.evidence_links),
          updatedAt,
          workspaceId,
          trackKey,
        )
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO workspace_delivery_tracks (
            track_id, workspace_id, organization_id, track_key, status, owner_user_id, notes_text,
            evidence_json, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
      )
        .bind(
          nextTrackId,
          workspaceId,
          access.workspace.organization_id,
          trackKey,
          section.status,
          section.owner_user_id,
          section.notes ?? "",
          JSON.stringify(section.evidence_links),
          updatedAt,
        )
        .run();
    }
  }

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "workspace_delivery_track",
    resourceId,
  });

  return json(await buildWorkspaceDeliveryResponse(env, access.workspace), buildMeta(request));
}

async function createSaasWorkspace(request: Request, env: Env): Promise<Response> {
  const user = await resolveSaasUser(request, env);
  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<SaasWorkspaceCreateRequest>(request);
  const body = normalizeSaasWorkspaceCreateRequest(rawBody);
  const routeKey = "POST:/api/v1/saas/workspaces";
  const payloadHash = await hashPayload(body);
  const existingRecord = await getIdempotencyRecord(env, body.organization_id, routeKey, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingWorkspace = await getWorkspaceById(env, existingRecord.resource_id);
    if (!existingWorkspace) {
      throw new ApiError(404, "workspace_not_found", "Existing idempotent workspace no longer exists");
    }

    const existingOrganization = await getOrganizationById(env, existingWorkspace.organization_id);
    if (!existingOrganization) {
      throw new ApiError(500, "internal_error", "Workspace organization could not be loaded");
    }
    if (existingOrganization.status !== "active" || existingWorkspace.status !== "active") {
      throw new ApiError(403, "tenant_access_denied", "Workspace is not accessible by current user");
    }

    const existingMembership = await getWorkspaceMembership(env, existingWorkspace.workspace_id, user.user_id);
    if (!existingMembership || existingMembership.status !== "active") {
      throw new ApiError(403, "tenant_access_denied", "Workspace is not accessible by current user");
    }

    const existingPlan = await getPricingPlanById(env, existingWorkspace.plan_id);

    return json(
      {
        workspace: serializeSaasWorkspaceDetail(existingWorkspace, existingOrganization, existingMembership),
        plan: existingPlan ? serializePricingPlan(existingPlan) : null,
      },
      buildMeta(request),
    );
  }

  const organization = await getOrganizationById(env, body.organization_id);
  if (!organization) {
    throw new ApiError(404, "organization_not_found", "Organization does not exist");
  }
  if (organization.status !== "active") {
    throw new ApiError(403, "tenant_access_denied", "Only active organizations can create workspaces", {
      organization_id: organization.organization_id,
      organization_status: organization.status,
    });
  }

  const organizationMembership = await getOrganizationMembership(env, body.organization_id, user.user_id);
  if (!organizationMembership || organizationMembership.status !== "active") {
    throw new ApiError(403, "tenant_access_denied", "Only organization members can create workspaces");
  }

  if (organizationMembership.role !== "organization_owner" && organizationMembership.role !== "organization_admin") {
    throw new ApiError(
      403,
      "tenant_access_denied",
      "Only organization owners or admins can create workspaces",
      {
        required_roles: ["organization_owner", "organization_admin"],
      },
    );
  }

  const existingSlug = await env.DB.prepare(
    `SELECT workspace_id
       FROM workspaces
      WHERE organization_id = ?1 AND slug = ?2`,
  )
    .bind(body.organization_id, body.slug)
    .first<{ workspace_id: string }>();
  if (existingSlug) {
    throw new ApiError(409, "workspace_already_exists", "Workspace slug already exists in organization");
  }

  const existingTenant = await getWorkspaceByTenantId(env, body.tenant_id);
  if (existingTenant) {
    throw new ApiError(409, "workspace_tenant_conflict", "tenant_id is already bound to another workspace");
  }

  const plan = await getPricingPlanById(env, body.plan_id);
  if (!plan || plan.status !== "active") {
    throw new ApiError(400, "invalid_request", "plan_id must reference an active pricing plan");
  }

  const timestamp = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO workspaces (
          workspace_id, organization_id, tenant_id, slug, display_name, status, plan_id, data_region,
          created_by_user_id, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?7, ?8, ?9, ?9)`,
    ).bind(
      body.workspace_id,
      body.organization_id,
      body.tenant_id,
      body.slug,
      body.display_name,
      body.plan_id,
      body.data_region,
      user.user_id,
      timestamp,
    ),
    env.DB.prepare(
      `INSERT INTO workspace_memberships (
          workspace_membership_id, workspace_id, user_id, role, status, joined_at, invited_by_user_id, created_at, updated_at
        ) VALUES (?1, ?2, ?3, 'workspace_owner', 'active', ?4, ?3, ?4, ?4)`,
    ).bind(createId("wsm"), body.workspace_id, user.user_id, timestamp),
    env.DB.prepare(
      `INSERT INTO workspace_plan_subscriptions (
          subscription_id, workspace_id, organization_id, plan_id, billing_provider, status,
          current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, 'manual', 'active', ?5, NULL, 0, ?5, ?5)`,
    ).bind(createId("sub"), body.workspace_id, body.organization_id, body.plan_id, timestamp),
  ]);

  await putIdempotencyRecord({
    env,
    tenantId: body.organization_id,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "workspace",
    resourceId: body.workspace_id,
  });

  const createdWorkspace = await getWorkspaceById(env, body.workspace_id);
  if (!createdWorkspace) {
    throw new ApiError(500, "internal_error", "Created workspace could not be loaded");
  }

  const createdMembership = await getWorkspaceMembership(env, createdWorkspace.workspace_id, user.user_id);
  if (!createdMembership) {
    throw new ApiError(500, "internal_error", "Created workspace membership could not be loaded");
  }

  await upsertWorkspaceOnboardingPersistence({
    env,
    workspace: createdWorkspace,
    status: "workspace_created",
    summary: {},
    lastBootstrappedAt: null,
    updatedAt: timestamp,
  });

  return json(
    {
      workspace: serializeSaasWorkspaceDetail(createdWorkspace, organization, createdMembership),
      plan: serializePricingPlan(plan),
    },
    buildMeta(request),
    { status: 201 },
  );
}

async function bootstrapSaasWorkspace(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can bootstrap workspace onboarding",
  );
  const { workspace } = access;

  const idempotencyKey = requireIdempotencyKey(request);
  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/bootstrap`;
  const payloadHash = await hashPayload({ action: "bootstrap_workspace" });
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    return json(await buildWorkspaceBootstrapResponse(env, workspace), buildMeta(request));
  }

  const seed = buildWorkspaceBootstrapSeed(workspace);
  const statements = [];
  let createdProviders = 0;
  let existingProviders = 0;
  let createdPolicies = 0;
  let existingPolicies = 0;
  const timestamp = nowIso();
  const plan = await getPricingPlanById(env, workspace.plan_id);
  const subscription = await getWorkspacePlanSubscription(env, workspace.workspace_id);
  const usage = await getWorkspaceUsageSummary(env, workspace, plan, subscription);
  const providerLimit = plan ? getPlanLimitNumber(plan, "tool_providers") : null;

  for (const provider of seed.providers) {
    const existing = await getToolProvider(env, workspace.tenant_id, provider.tool_provider_id);
    if (existing) {
      existingProviders += 1;
      continue;
    }

    if (providerLimit !== null && usage.metrics.active_tool_providers.used + createdProviders + 1 > providerLimit) {
      if (!plan) {
        throw new ApiError(429, "plan_limit_exceeded", "Workspace bootstrap would exceed the active tool provider limit", {
          scope: "active_tool_providers",
          workspace_id: workspace.workspace_id,
        });
      }
      throw new ApiError(
        429,
        "plan_limit_exceeded",
        "Workspace bootstrap would exceed the active tool provider limit",
        buildWorkspacePlanLimitErrorDetails({
          workspace,
          plan,
          scope: "active_tool_providers",
          used: usage.metrics.active_tool_providers.used,
          limit: providerLimit,
          periodStart: usage.period_start,
          periodEnd: usage.period_end,
          extra: {
            providers_required: createdProviders + 1,
          },
        }),
      );
    }

    statements.push(
      env.DB.prepare(
        `INSERT INTO tool_providers (
            tool_provider_id, tenant_id, name, provider_type, endpoint_url, auth_ref,
            visibility_policy_ref, execution_policy_ref, status, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, NULL, 'active', ?6, ?6)`,
      ).bind(
        provider.tool_provider_id,
        workspace.tenant_id,
        provider.name,
        provider.provider_type,
        provider.endpoint_url,
        timestamp,
      ),
    );
    createdProviders += 1;
  }

  for (const policy of seed.policies) {
    const existing = await getPolicy(env, workspace.tenant_id, policy.policy_id);
    if (existing) {
      existingPolicies += 1;
      continue;
    }

    const approverRoles = policy.approval_config.approver_roles ?? [];
    statements.push(
      env.DB.prepare(
        `INSERT INTO policies (
            policy_id, tenant_id, channel, tool_provider_id, tool_name, decision, approver_roles_json,
            priority, status, conditions_json, approval_config_json, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', ?9, ?10, ?11, ?11)`,
      ).bind(
        policy.policy_id,
        workspace.tenant_id,
        policy.channel,
        policy.scope.tool_provider_id,
        policy.scope.tool_name,
        policy.decision,
        JSON.stringify(approverRoles),
        policy.priority,
        JSON.stringify(policy.conditions),
        JSON.stringify(policy.approval_config),
        timestamp,
      ),
    );
    createdPolicies += 1;
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "workspace_bootstrap",
    resourceId: workspaceId,
  });

  const response = await buildWorkspaceBootstrapResponse(env, workspace);
  const persistedBootstrapSummary = {
    ...response.summary,
    providers_created: createdProviders,
    providers_existing: existingProviders,
    policies_created: createdPolicies,
    policies_existing: existingPolicies,
  };
  await upsertWorkspaceOnboardingPersistence({
    env,
    workspace,
    status: "baseline_ready",
    summary: persistedBootstrapSummary,
    lastBootstrappedAt: timestamp,
    updatedAt: timestamp,
  });
  return json(
    {
      ...response,
      summary: {
        ...persistedBootstrapSummary,
      },
    },
    buildMeta(request),
    { status: 201 },
  );
}

async function listSaasWorkspaceApiKeys(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can view API keys",
  );

  const apiKeys = await listWorkspaceApiKeys(env, workspaceId);
  return json(
    {
      items: apiKeys.map((apiKey) => serializeSaasApiKey(apiKey)),
      page_info: {
        next_cursor: null,
      },
    },
    buildMeta(request),
  );
}

async function listSaasWorkspaceMembers(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  await requireSaasWorkspaceAccess(request, env, workspaceId);

  const members = await listWorkspaceMembers(env, workspaceId);
  return json(
    {
      items: members.map((member) => ({
        workspace_membership_id: member.workspace_membership_id,
        workspace_id: member.workspace_id,
        user_id: member.user_id,
        role: member.role,
        status: member.status,
        joined_at: member.joined_at,
        invited_by_user_id: member.invited_by_user_id,
        email: member.email,
        email_normalized: member.email_normalized,
        display_name: member.display_name,
        created_at: member.created_at,
        updated_at: member.updated_at,
      })),
      page_info: {
        next_cursor: null,
      },
    },
    buildMeta(request),
  );
}

async function listSaasWorkspaceServiceAccounts(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can view service accounts",
  );
  const serviceAccounts = await listWorkspaceServiceAccounts(env, workspaceId);

  return json(
    {
      items: serviceAccounts.map((serviceAccount) => serializeSaasServiceAccount(serviceAccount)),
      page_info: {
        next_cursor: null,
      },
    },
    buildMeta(request),
  );
}

async function createSaasWorkspaceServiceAccount(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can create service accounts",
  );
  const { user, workspace } = access;
  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<SaasServiceAccountCreateRequest>(request);
  const body = normalizeSaasServiceAccountCreateRequest(rawBody);
  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/service-accounts`;
  const payloadHash = await hashPayload(body);
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingServiceAccount = await getServiceAccountById(env, existingRecord.resource_id);
    if (!existingServiceAccount || existingServiceAccount.workspace_id !== workspaceId) {
      throw new ApiError(404, "service_account_not_found", "Existing idempotent service account no longer exists");
    }

    return json(
      {
        service_account: serializeSaasServiceAccount(existingServiceAccount),
      },
      buildMeta(request),
    );
  }

  const existingName = await env.DB.prepare(
    `SELECT service_account_id
       FROM service_accounts
      WHERE workspace_id = ?1 AND name = ?2`,
  )
    .bind(workspaceId, body.name)
    .first<{ service_account_id: string }>();
  if (existingName) {
    throw new ApiError(409, "service_account_already_exists", "Service account name already exists in workspace");
  }

  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO service_accounts (
        service_account_id, workspace_id, tenant_id, name, description, role, status,
        created_by_user_id, last_used_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7, NULL, ?8, ?8)`,
  )
    .bind(
      body.service_account_id,
      workspaceId,
      workspace.tenant_id,
      body.name,
      body.description,
      body.role,
      user.user_id,
      now,
    )
    .run();

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "service_account",
    resourceId: body.service_account_id,
  });

  const createdServiceAccount = await getServiceAccountById(env, body.service_account_id);
  if (!createdServiceAccount) {
    throw new ApiError(500, "internal_error", "Created service account could not be loaded");
  }

  return json(
    {
      service_account: serializeSaasServiceAccount(createdServiceAccount),
    },
    buildMeta(request),
    { status: 201 },
  );
}

async function disableSaasWorkspaceServiceAccount(
  request: Request,
  env: Env,
  workspaceId: string,
  serviceAccountId: string,
): Promise<Response> {
  await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can disable service accounts",
  );

  const idempotencyKey = requireIdempotencyKey(request);
  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/service-accounts/${serviceAccountId}:disable`;
  const payloadHash = await hashPayload({ action: "disable_service_account" });
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingServiceAccount = await requireWorkspaceServiceAccount(env, workspaceId, serviceAccountId);
    return json(serializeSaasServiceAccount(existingServiceAccount), buildMeta(request));
  }

  const serviceAccount = await requireWorkspaceServiceAccount(env, workspaceId, serviceAccountId);
  if (serviceAccount.status !== "disabled") {
    await env.DB.prepare(
      `UPDATE service_accounts
          SET status = 'disabled', updated_at = ?1
        WHERE workspace_id = ?2 AND service_account_id = ?3`,
    )
      .bind(nowIso(), workspaceId, serviceAccountId)
      .run();
  }

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "service_account",
    resourceId: serviceAccountId,
  });

  const updatedServiceAccount = await requireWorkspaceServiceAccount(env, workspaceId, serviceAccountId);
  return json(serializeSaasServiceAccount(updatedServiceAccount), buildMeta(request));
}

async function listSaasWorkspaceInvitations(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can view invitations",
  );
  const invitations = await listWorkspaceInvitations(env, workspaceId);

  return json(
    {
      items: invitations.map((invitation) => serializeSaasWorkspaceInvitation(invitation)),
      page_info: {
        next_cursor: null,
      },
    },
    buildMeta(request),
  );
}

async function createSaasWorkspaceInvitation(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can invite members",
  );
  const { user, workspace } = access;
  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<SaasWorkspaceInvitationCreateRequest>(request);
  const body = normalizeSaasWorkspaceInvitationCreateRequest(rawBody);
  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/invitations`;
  const payloadHash = await hashPayload(body);
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingInvitation = await getWorkspaceInvitationById(env, existingRecord.resource_id);
    if (!existingInvitation || existingInvitation.workspace_id !== workspaceId) {
      throw new ApiError(404, "invitation_not_found", "Existing idempotent invitation no longer exists");
    }

    return json(
      {
        invitation: serializeSaasWorkspaceInvitation(existingInvitation),
        invite_token: null,
      },
      buildMeta(request),
    );
  }

  const existingUser = await getUserByEmailNormalized(env, body.email_normalized);
  if (existingUser) {
    const existingMembership = await getWorkspaceMembership(env, workspaceId, existingUser.user_id);
    if (existingMembership && (existingMembership.status === "active" || existingMembership.status === "invited")) {
      throw new ApiError(409, "member_already_exists", "A workspace membership already exists for this email");
    }
  }

  const existingPendingInvitation = await env.DB.prepare(
    `SELECT invitation_id
       FROM workspace_invitations
      WHERE workspace_id = ?1
        AND email_normalized = ?2
        AND status = 'pending'`,
  )
    .bind(workspaceId, body.email_normalized)
    .first<{ invitation_id: string }>();
  if (existingPendingInvitation) {
    throw new ApiError(409, "invitation_already_exists", "A pending invitation already exists for this email");
  }

  await enforceWorkspaceMemberSeatLimit({
    env,
    workspace,
    additionalReservations: 1,
    errorCode: "invitation_limit_reached",
    errorMessage: "Invitation limit reached",
  });

  const invitationMaterial = await generateSaasInvitationMaterial();
  const invitationId = createId("inv");
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO workspace_invitations (
        invitation_id, organization_id, workspace_id, email_normalized, role, token_hash, status,
        invited_by_user_id, expires_at, accepted_by_user_id, accepted_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8, NULL, NULL, ?9, ?9)`,
  )
    .bind(
      invitationId,
      workspace.organization_id,
      workspaceId,
      body.email_normalized,
      body.role,
      invitationMaterial.token_hash,
      user.user_id,
      body.expires_at,
      now,
    )
    .run();

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "workspace_invitation",
    resourceId: invitationId,
  });

  const createdInvitation = await getWorkspaceInvitationById(env, invitationId);
  if (!createdInvitation) {
    throw new ApiError(500, "internal_error", "Created invitation could not be loaded");
  }

  return json(
    {
      invitation: serializeSaasWorkspaceInvitation(createdInvitation),
      invite_token: invitationMaterial.plaintext_token,
    },
    buildMeta(request),
    { status: 201 },
  );
}

async function revokeSaasWorkspaceInvitation(
  request: Request,
  env: Env,
  workspaceId: string,
  invitationId: string,
): Promise<Response> {
  await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can revoke invitations",
  );

  const idempotencyKey = requireIdempotencyKey(request);
  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/invitations/${invitationId}:revoke`;
  const payloadHash = await hashPayload({ action: "revoke_workspace_invitation" });
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingInvitation = await requireWorkspaceInvitation(env, workspaceId, invitationId);
    return json(serializeSaasWorkspaceInvitation(existingInvitation), buildMeta(request));
  }

  const invitation = await requireWorkspaceInvitation(env, workspaceId, invitationId);
  if (invitation.status !== "pending") {
    throw new ApiError(409, "invalid_state_transition", "Only pending invitations can be revoked", {
      invitation_status: invitation.status,
    });
  }

  const now = nowIso();
  const nextStatus = invitation.expires_at <= now ? "expired" : "revoked";
  await env.DB.prepare(
    `UPDATE workspace_invitations
        SET status = ?1,
            updated_at = ?2
      WHERE invitation_id = ?3`,
  )
    .bind(nextStatus, now, invitationId)
    .run();

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "workspace_invitation",
    resourceId: invitationId,
  });

  const updatedInvitation = await requireWorkspaceInvitation(env, workspaceId, invitationId);
  return json(serializeSaasWorkspaceInvitation(updatedInvitation), buildMeta(request));
}

async function acceptSaasInvitation(request: Request, env: Env): Promise<Response> {
  const user = await resolveSaasUser(request, env);
  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<SaasInvitationAcceptRequest>(request);
  const body = normalizeSaasInvitationAcceptRequest(rawBody);
  const tokenHash = await sha256Hex(body.invite_token);
  const invitation = await getWorkspaceInvitationByTokenHash(env, tokenHash);
  if (!invitation || !invitation.workspace_id) {
    throw new ApiError(404, "invitation_not_found", "Invitation does not exist");
  }

  const workspace = await getWorkspaceById(env, invitation.workspace_id);
  if (!workspace) {
    throw new ApiError(404, "workspace_not_found", "Workspace does not exist");
  }

  const organization = await getOrganizationById(env, invitation.organization_id);
  if (!organization) {
    throw new ApiError(404, "organization_not_found", "Organization does not exist");
  }
  if (organization.status !== "active") {
    throw new ApiError(409, "invalid_state_transition", "Invitation organization is not active", {
      organization_id: organization.organization_id,
      organization_status: organization.status,
    });
  }
  if (workspace.status !== "active") {
    throw new ApiError(409, "invalid_state_transition", "Invitation workspace is not active", {
      workspace_id: workspace.workspace_id,
      workspace_status: workspace.status,
    });
  }

  if (user.email_normalized !== invitation.email_normalized) {
    throw new ApiError(403, "tenant_access_denied", "Invitation email does not match current user", {
      invitation_email: invitation.email_normalized,
      user_email: user.email_normalized,
    });
  }

  const now = nowIso();
  if (invitation.status === "pending" && invitation.expires_at <= now) {
    await env.DB.prepare(
      `UPDATE workspace_invitations
          SET status = 'expired',
              updated_at = ?1
        WHERE invitation_id = ?2`,
    )
      .bind(now, invitation.invitation_id)
      .run();
    throw new ApiError(409, "invalid_state_transition", "Invitation has expired");
  }

  if (invitation.status === "accepted") {
    if (invitation.accepted_by_user_id !== user.user_id) {
      throw new ApiError(409, "invalid_state_transition", "Invitation has already been accepted by another user");
    }

    const acceptedMembership = await getWorkspaceMembership(env, workspace.workspace_id, user.user_id);
    if (!acceptedMembership || acceptedMembership.status !== "active") {
      throw new ApiError(500, "internal_error", "Accepted invitation membership could not be loaded");
    }
    return json(
      {
        invitation: serializeSaasWorkspaceInvitation(invitation),
        workspace: serializeAcceptedInvitationWorkspace(workspace, organization),
        membership: serializeAcceptedInvitationMembership(acceptedMembership),
      },
      buildMeta(request),
    );
  }

  if (invitation.status === "revoked" || invitation.status === "expired") {
    throw new ApiError(409, "invalid_state_transition", "Invitation can no longer be accepted", {
      invitation_status: invitation.status,
    });
  }

  const routeKey = "POST:/api/v1/saas/invitations:accept";
  const payloadHash = await hashPayload(body);
  const existingRecord = await getIdempotencyRecord(env, invitation.organization_id, routeKey, idempotencyKey);
  if (existingRecord && existingRecord.payload_hash !== payloadHash) {
    throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
  }

  const organizationMembership = await getOrganizationMembership(env, invitation.organization_id, user.user_id);
  const workspaceMembership = await getWorkspaceMembership(env, workspace.workspace_id, user.user_id);
  if (organizationMembership?.status === "disabled") {
    throw new ApiError(409, "invalid_state_transition", "Organization membership is disabled", {
      organization_id: invitation.organization_id,
      user_id: user.user_id,
    });
  }
  if (workspaceMembership?.status === "disabled") {
    throw new ApiError(409, "invalid_state_transition", "Workspace membership is disabled", {
      workspace_id: workspace.workspace_id,
      user_id: user.user_id,
    });
  }
  await enforceWorkspaceMemberSeatLimit({
    env,
    workspace,
    additionalReservations: 0,
    errorCode: "plan_limit_exceeded",
    errorMessage: "Workspace has reached the member seat limit",
  });

  const statements = [];
  if (!organizationMembership) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO organization_memberships (
            membership_id, organization_id, user_id, role, status, joined_at, invited_by_user_id, created_at, updated_at
          ) VALUES (?1, ?2, ?3, 'member', 'active', ?4, ?5, ?4, ?4)`,
      ).bind(createId("orgm"), invitation.organization_id, user.user_id, now, invitation.invited_by_user_id),
    );
  } else if (organizationMembership.status !== "active") {
    statements.push(
      env.DB.prepare(
        `UPDATE organization_memberships
            SET status = 'active',
                joined_at = COALESCE(joined_at, ?1),
                updated_at = ?1
          WHERE organization_id = ?2 AND user_id = ?3`,
      ).bind(now, invitation.organization_id, user.user_id),
    );
  }

  if (!workspaceMembership) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO workspace_memberships (
            workspace_membership_id, workspace_id, user_id, role, status, joined_at, invited_by_user_id, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6, ?5, ?5)`,
      ).bind(
        createId("wsm"),
        workspace.workspace_id,
        user.user_id,
        invitation.role,
        now,
        invitation.invited_by_user_id,
      ),
    );
  } else if (workspaceMembership.status !== "active") {
    statements.push(
      env.DB.prepare(
        `UPDATE workspace_memberships
            SET role = ?1,
                status = 'active',
                joined_at = COALESCE(joined_at, ?2),
                updated_at = ?2
          WHERE workspace_id = ?3 AND user_id = ?4`,
      ).bind(invitation.role, now, workspace.workspace_id, user.user_id),
    );
  }

  statements.push(
    env.DB.prepare(
      `UPDATE workspace_invitations
          SET status = 'accepted',
              accepted_by_user_id = ?1,
              accepted_at = ?2,
              updated_at = ?2
        WHERE invitation_id = ?3
          AND status = 'pending'`,
    ).bind(user.user_id, now, invitation.invitation_id),
  );

  const batchResult = await env.DB.batch(statements);
  const acceptanceMeta = batchResult.at(-1)?.meta as { changes?: number } | undefined;
  if (acceptanceMeta?.changes !== undefined && acceptanceMeta.changes === 0) {
    throw new ApiError(409, "invalid_state_transition", "Invitation is no longer pending");
  }

  await putIdempotencyRecord({
    env,
    tenantId: invitation.organization_id,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "workspace_invitation",
    resourceId: invitation.invitation_id,
  });

  const acceptedInvitation = await getWorkspaceInvitationById(env, invitation.invitation_id);
  const acceptedMembership = await getWorkspaceMembership(env, workspace.workspace_id, user.user_id);
  if (!acceptedInvitation || !acceptedMembership) {
    throw new ApiError(500, "internal_error", "Accepted invitation state could not be loaded");
  }

  return json(
    {
      invitation: serializeSaasWorkspaceInvitation(acceptedInvitation),
      workspace: serializeAcceptedInvitationWorkspace(workspace, organization),
      membership: serializeAcceptedInvitationMembership(acceptedMembership),
    },
    buildMeta(request),
    { status: 201 },
  );
}

async function requireWorkspaceBillingCheckoutSession(
  env: Env,
  workspaceId: string,
  checkoutSessionId: string,
): Promise<BillingCheckoutSessionRow> {
  const session = await getBillingCheckoutSessionById(env, checkoutSessionId);
  if (!session || session.workspace_id !== workspaceId) {
    throw new ApiError(404, "billing_checkout_session_not_found", "Checkout session does not exist in workspace");
  }

  return session;
}

async function refreshBillingCheckoutSessionIfExpired(
  env: Env,
  session: BillingCheckoutSessionRow,
): Promise<BillingCheckoutSessionRow> {
  if (session.status !== "open" || session.expires_at > nowIso()) {
    return session;
  }

  await env.DB.prepare(
    `UPDATE billing_checkout_sessions
        SET status = 'expired',
            updated_at = ?1
      WHERE checkout_session_id = ?2`,
  )
    .bind(nowIso(), session.checkout_session_id)
    .run();

  return (
    (await getBillingCheckoutSessionById(env, session.checkout_session_id)) ??
    ({
      ...session,
      status: "expired",
    } satisfies BillingCheckoutSessionRow)
  );
}

function addBillingInterval(startedAt: string, billingInterval: BillingCheckoutSessionRow["billing_interval"]): string {
  const next = new Date(startedAt);
  if (billingInterval === "yearly") {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next.toISOString();
}

function buildBillingCheckoutSessionResponse(
  session: BillingCheckoutSessionRow,
  currentPlan: PricingPlanRow | null,
  targetPlan: PricingPlanRow | null,
  options?: {
    checkoutUrlOverride?: string | null;
    reviewUrlOverride?: string | null;
  },
): {
  checkout_session: ReturnType<typeof serializeBillingCheckoutSessionSummary>;
  current_plan: ReturnType<typeof serializePricingPlan> | null;
  target_plan: ReturnType<typeof serializePricingPlan> | null;
} {
  return {
    checkout_session: serializeBillingCheckoutSessionSummary(session, targetPlan, options),
    current_plan: currentPlan ? serializePricingPlan(currentPlan) : null,
    target_plan: targetPlan ? serializePricingPlan(targetPlan) : null,
  };
}

function buildWorkspaceBillingSubscriptionResponse(
  env: Env,
  plan: PricingPlanRow | null,
  subscription: WorkspacePlanSubscriptionRow,
): {
  plan: ReturnType<typeof serializePricingPlan> | null;
  subscription: ReturnType<typeof serializeWorkspacePlanSubscription>;
  billing_summary: ReturnType<typeof buildWorkspaceBillingSummary>;
  billing_providers: ReturnType<typeof buildWorkspaceBillingProviders>;
} {
  return {
    plan: plan ? serializePricingPlan(plan) : null,
    subscription: serializeWorkspacePlanSubscription(subscription),
    billing_summary: buildWorkspaceBillingSummary(env, plan, subscription),
    billing_providers: buildWorkspaceBillingProviders(subscription, env),
  };
}

async function applyWorkspaceCheckoutSessionCompletion(args: {
  env: Env;
  workspace: WorkspaceRow;
  session: BillingCheckoutSessionRow;
  targetPlan: PricingPlanRow;
  completedAt: string;
  externalCustomerRef?: string | null;
  externalSubscriptionRef?: string | null;
}): Promise<{
  session: BillingCheckoutSessionRow;
  subscription: WorkspacePlanSubscriptionRow | null;
}> {
  const nextPeriodEnd = addBillingInterval(args.completedAt, args.session.billing_interval);
  const existingSubscription = await getWorkspacePlanSubscription(args.env, args.workspace.workspace_id);

  const statements = [
    args.env.DB.prepare(
      `UPDATE workspaces
          SET plan_id = ?1,
              updated_at = ?2
        WHERE workspace_id = ?3`,
    ).bind(args.targetPlan.plan_id, args.completedAt, args.workspace.workspace_id),
    args.env.DB.prepare(
      `UPDATE billing_checkout_sessions
          SET status = 'completed',
              completed_at = ?1,
              updated_at = ?1
        WHERE checkout_session_id = ?2`,
    ).bind(args.completedAt, args.session.checkout_session_id),
  ];

  const externalCustomerRef =
    args.externalCustomerRef?.trim() || `org:${args.workspace.organization_id}`;
  const externalSubscriptionRef =
    args.externalSubscriptionRef?.trim() || args.session.checkout_session_id;

  if (existingSubscription) {
    statements.push(
      args.env.DB.prepare(
        `UPDATE workspace_plan_subscriptions
            SET plan_id = ?1,
                billing_provider = ?2,
                external_customer_ref = COALESCE(external_customer_ref, ?3),
                external_subscription_ref = ?4,
                status = 'active',
                current_period_start = ?5,
                current_period_end = ?6,
                cancel_at_period_end = 0,
                updated_at = ?5
          WHERE workspace_id = ?7`,
      ).bind(
        args.targetPlan.plan_id,
        args.session.billing_provider,
        externalCustomerRef,
        externalSubscriptionRef,
        args.completedAt,
        nextPeriodEnd,
        args.workspace.workspace_id,
      ),
    );
  } else {
    statements.push(
      args.env.DB.prepare(
        `INSERT INTO workspace_plan_subscriptions (
            subscription_id, workspace_id, organization_id, plan_id, billing_provider,
            external_customer_ref, external_subscription_ref, status, current_period_start,
            current_period_end, cancel_at_period_end, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?8, ?9, 0, ?8, ?8)`,
      ).bind(
        createId("sub"),
        args.workspace.workspace_id,
        args.workspace.organization_id,
        args.targetPlan.plan_id,
        args.session.billing_provider,
        externalCustomerRef,
        externalSubscriptionRef,
        args.completedAt,
        nextPeriodEnd,
      ),
    );
  }

  await args.env.DB.batch(statements);

  return {
    session: await requireWorkspaceBillingCheckoutSession(args.env, args.workspace.workspace_id, args.session.checkout_session_id),
    subscription: await getWorkspacePlanSubscription(args.env, args.workspace.workspace_id),
  };
}

async function listSaasWorkspaceBillingProviders(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  await requireSaasWorkspaceAccess(request, env, workspaceId);
  const subscription = await getWorkspacePlanSubscription(env, workspaceId);
  return json(buildWorkspaceBillingProviders(subscription, env), buildMeta(request));
}

function buildEnterpriseFeatureErrorDetails(args: {
  feature: "sso" | "dedicated_environment" | "audit_export";
  workspaceId: string;
  planCode?: string | null;
}): {
  feature: "sso" | "dedicated_environment" | "audit_export";
  workspace_id: string;
  plan_code: string | null;
  upgrade_href: string;
} {
  return {
    feature: args.feature,
    workspace_id: args.workspaceId,
    plan_code: args.planCode ?? null,
    upgrade_href: "/settings?intent=upgrade",
  };
}

async function deriveEnterpriseDeliveryReadiness(
  env: Env,
  workspaceId: string,
): Promise<{
  deliveryStatus: "staged" | "ga";
  verificationStatus: WorkspaceDeliveryTrackRow["status"];
  goLiveStatus: WorkspaceDeliveryTrackRow["status"];
}> {
  const tracks = await listWorkspaceDeliveryTracks(env, workspaceId);
  const trackMap = new Map(tracks.map((track) => [track.track_key, track]));
  const verificationStatus = trackMap.get("verification")?.status ?? "pending";
  const goLiveStatus = trackMap.get("go_live")?.status ?? "pending";
  const deliveryStatus: "staged" | "ga" =
    verificationStatus === "complete" && goLiveStatus === "complete" ? "ga" : "staged";

  return {
    deliveryStatus,
    verificationStatus,
    goLiveStatus,
  };
}

async function requireWorkspaceEnterpriseFeaturePlan(
  env: Env,
  workspace: WorkspaceRow,
  feature: "sso" | "dedicated_environment",
): Promise<PricingPlanRow> {
  const plan = await getPricingPlanById(env, workspace.plan_id);
  if (!plan || plan.status !== "active") {
    if (feature === "sso") {
      throw new ApiError(409, "workspace_plan_unavailable", "Workspace plan is not available for SSO", {
        ...buildEnterpriseFeatureErrorDetails({
          feature,
          workspaceId: workspace.workspace_id,
          planCode: plan?.code ?? null,
        }),
      });
    }

    throw new ApiError(
      409,
      "workspace_plan_unavailable",
      "Workspace plan is not available for dedicated environment readiness",
      {
        ...buildEnterpriseFeatureErrorDetails({
          feature,
          workspaceId: workspace.workspace_id,
          planCode: plan?.code ?? null,
        }),
      },
    );
  }

  if (!isWorkspacePlanFeatureEnabled(plan, feature)) {
    if (feature === "sso") {
      throw new ApiError(
        409,
        "workspace_feature_unavailable",
        "Single sign-on is not available on the current workspace plan",
        buildEnterpriseFeatureErrorDetails({
          feature,
          workspaceId: workspace.workspace_id,
          planCode: plan.code,
        }),
      );
    }

    throw new ApiError(
      409,
      "workspace_feature_unavailable",
      "Dedicated environment delivery is not available on the current workspace plan",
      buildEnterpriseFeatureErrorDetails({
        feature,
        workspaceId: workspace.workspace_id,
        planCode: plan.code,
      }),
    );
  }

  return plan;
}

function describeDeliveryTrackStatus(status: WorkspaceDeliveryTrackRow["status"]): string {
  switch (status) {
    case "complete":
      return "complete";
    case "in_progress":
      return "in progress";
    default:
      return "pending";
  }
}

function describeEnterpriseReadinessSummary(readiness: {
  verificationStatus: WorkspaceDeliveryTrackRow["status"];
  goLiveStatus: WorkspaceDeliveryTrackRow["status"];
}): string {
  return `Delivery tracks: verification ${describeDeliveryTrackStatus(readiness.verificationStatus)}, go-live ${describeDeliveryTrackStatus(readiness.goLiveStatus)}.`;
}

function buildVerificationTrackAction(status: WorkspaceDeliveryTrackRow["status"]): string {
  if (status === "pending") {
    return "Start the verification track and attach baseline evidence from onboarding runs.";
  }
  if (status === "in_progress") {
    return "Continue verification execution, update evidence links, and close open checks.";
  }
  return "Keep verification evidence current for ongoing compliance checks.";
}

function buildGoLiveTrackAction(status: WorkspaceDeliveryTrackRow["status"]): string {
  if (status === "pending") {
    return "Start go-live rehearsal planning and define rollback ownership before cutover.";
  }
  if (status === "in_progress") {
    return "Continue go-live rehearsal and resolve remaining cutover blockers.";
  }
  return "Maintain go-live evidence and post-cutover operational checkpoints.";
}

function normalizeOptionalRequestString(
  value: string | null | undefined,
  fieldName: string,
  maxLength = 4000,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a string when provided`);
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

function normalizeOptionalRequestHttpUrl(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  const normalized = normalizeOptionalRequestString(value, fieldName, 2000);
  if (!normalized) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a valid absolute URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ApiError(400, "invalid_request", `${fieldName} must use http or https`);
  }
  return parsed.toString();
}

function normalizeOptionalEmailDomain(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  const normalized = normalizeOptionalRequestString(value, fieldName, 255)?.toLowerCase() ?? null;
  if (!normalized) {
    return null;
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a valid domain`);
  }
  return normalized;
}

function normalizeOptionalRequestEmail(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  const normalized = normalizeOptionalRequestString(value, fieldName, 320);
  if (!normalized) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(normalized)) {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a valid email address`);
  }
  return normalized.toLowerCase();
}

type DedicatedEnvironmentDataClassification = "internal" | "restricted" | "external";

function normalizeOptionalDedicatedEnvironmentDataClassification(
  value: string | null | undefined,
  fieldName: string,
): DedicatedEnvironmentDataClassification | null {
  const normalized = normalizeOptionalRequestString(value, fieldName, 40)?.toLowerCase() ?? null;
  if (!normalized) {
    return null;
  }
  if (normalized === "internal" || normalized === "restricted" || normalized === "external") {
    return normalized;
  }
  throw new ApiError(400, "invalid_request", `${fieldName} must be one of: internal, restricted, external`);
}

function normalizeOptionalEmailDomainList(
  value: string[] | null | undefined,
  fieldName: string,
): string[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ApiError(400, "invalid_request", `${fieldName} must be an array when provided`);
  }

  const domains: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const domain = normalizeOptionalEmailDomain(value[index], `${fieldName}[${index}]`);
    if (!domain || seen.has(domain)) {
      continue;
    }
    seen.add(domain);
    domains.push(domain);
  }
  return domains;
}

function appendUniqueDomain(target: string[], domain: string | null): void {
  if (!domain || target.includes(domain)) {
    return;
  }
  target.push(domain);
}

function parseStoredEmailDomain(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "" || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function parseStoredEmailDomainList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const domains: string[] = [];
  for (const item of value) {
    appendUniqueDomain(domains, parseStoredEmailDomain(item));
  }
  return domains;
}

function assertOptionalWorkspaceBodyIdMatches(
  value: string | undefined,
  workspaceId: string,
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, "invalid_request", "workspace_id must be a non-empty string when provided");
  }
  if (value.trim() !== workspaceId) {
    throw new ApiError(400, "invalid_request", "workspace_id must match the route workspace id", {
      workspace_id: value.trim(),
      route_workspace_id: workspaceId,
    });
  }
}

function normalizeSaasWorkspaceSsoConfigRequest(
  body: SaasWorkspaceSsoConfigRequest,
): {
  workspace_id?: string;
  provider_type: "oidc" | "saml";
  issuer_url: string | null;
  metadata_url: string | null;
  entrypoint_url: string | null;
  audience: string | null;
  email_domain: string | null;
  email_domains: string[];
  client_id: string | null;
  signing_certificate: string | null;
  notes: string | null;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "request body must be an object");
  }

  const providerType = typeof body.provider_type === "string" ? body.provider_type.trim().toLowerCase() : "";
  if (providerType !== "oidc" && providerType !== "saml") {
    throw new ApiError(400, "invalid_request", "provider_type must be one of: oidc, saml");
  }
  if (body.enabled === false) {
    throw new ApiError(
      400,
      "invalid_request",
      "enabled must not be false for controlled workspace SSO live writes",
    );
  }
  if (body.connection_mode !== undefined) {
    const connectionMode = body.connection_mode.trim().toLowerCase();
    if (connectionMode !== "workspace") {
      throw new ApiError(
        400,
        "invalid_request",
        "connection_mode must be workspace for controlled workspace SSO live writes",
      );
    }
  }

  const issuerUrl = normalizeOptionalRequestHttpUrl(body.issuer_url, "issuer_url");
  const metadataUrl = normalizeOptionalRequestHttpUrl(body.metadata_url, "metadata_url");
  const entrypointUrl = normalizeOptionalRequestHttpUrl(body.entrypoint_url, "entrypoint_url");
  const audience = normalizeOptionalRequestString(body.audience, "audience", 500);
  const clientId = normalizeOptionalRequestString(body.client_id, "client_id", 500);
  const signingCertificate = normalizeOptionalRequestString(body.signing_certificate, "signing_certificate", 8000);
  const legacyDomain = normalizeOptionalEmailDomain(body.domain, "domain");
  const primaryEmailDomain = normalizeOptionalEmailDomain(body.email_domain, "email_domain");
  const domainList = normalizeOptionalEmailDomainList(body.email_domains, "email_domains");
  const emailDomains: string[] = [];
  appendUniqueDomain(emailDomains, primaryEmailDomain);
  appendUniqueDomain(emailDomains, legacyDomain);
  for (const domain of domainList) {
    appendUniqueDomain(emailDomains, domain);
  }
  const emailDomain = emailDomains[0] ?? null;
  const notes = normalizeOptionalRequestString(body.notes, "notes");
  if (!issuerUrl && !metadataUrl && emailDomains.length === 0) {
    throw new ApiError(
      400,
      "invalid_request",
      "At least one of issuer_url, metadata_url, email_domain, or email_domains must be provided",
    );
  }

  return {
    ...(body.workspace_id !== undefined ? { workspace_id: body.workspace_id } : {}),
    provider_type: providerType,
    issuer_url: issuerUrl,
    metadata_url: metadataUrl,
    entrypoint_url: entrypointUrl,
    audience,
    email_domain: emailDomain,
    email_domains: emailDomains,
    client_id: clientId,
    signing_certificate: signingCertificate,
    notes,
  };
}

function normalizeSaasWorkspaceDedicatedEnvironmentConfigRequest(
  body: SaasWorkspaceDedicatedEnvironmentConfigRequest,
): {
  workspace_id?: string;
  deployment_model: "single_tenant" | "pooled_with_isolation";
  target_region: string;
  network_boundary: string | null;
  compliance_notes: string | null;
  requester_email: string | null;
  data_classification: DedicatedEnvironmentDataClassification | null;
  requested_capacity: string | null;
  requested_sla: string | null;
  notes: string | null;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "request body must be an object");
  }

  const deploymentModel =
    typeof body.deployment_model === "string" ? body.deployment_model.trim().toLowerCase() : "single_tenant";
  if (deploymentModel !== "single_tenant" && deploymentModel !== "pooled_with_isolation") {
    throw new ApiError(
      400,
      "invalid_request",
      "deployment_model must be one of: single_tenant, pooled_with_isolation",
    );
  }
  if (body.enabled === false) {
    throw new ApiError(
      400,
      "invalid_request",
      "enabled must not be false for controlled dedicated environment live writes",
    );
  }

  const targetRegion = normalizeOptionalRequestString(body.target_region, "target_region", 120);
  if (!targetRegion) {
    throw new ApiError(
      400,
      "invalid_request",
      "target_region is required for controlled dedicated environment live writes",
    );
  }
  const requesterEmail = normalizeOptionalRequestEmail(body.requester_email, "requester_email");
  if (!requesterEmail) {
    throw new ApiError(
      400,
      "invalid_request",
      "requester_email is required for controlled dedicated environment live writes",
    );
  }

  return {
    ...(body.workspace_id !== undefined ? { workspace_id: body.workspace_id } : {}),
    deployment_model: deploymentModel,
    target_region: targetRegion,
    network_boundary: normalizeOptionalRequestString(body.network_boundary, "network_boundary", 500),
    compliance_notes: normalizeOptionalRequestString(body.compliance_notes, "compliance_notes", 4000),
    requester_email: requesterEmail,
    data_classification: normalizeOptionalDedicatedEnvironmentDataClassification(
      body.data_classification,
      "data_classification",
    ),
    requested_capacity: normalizeOptionalRequestString(body.requested_capacity, "requested_capacity", 500),
    requested_sla: normalizeOptionalRequestString(body.requested_sla, "requested_sla", 255),
    notes: normalizeOptionalRequestString(body.notes, "notes", 4000),
  };
}

function parseWorkspaceSsoFeatureConfig(configJson: string | null): {
  provider_type: "oidc" | "saml" | null;
  issuer_url: string | null;
  metadata_url: string | null;
  entrypoint_url: string | null;
  audience: string | null;
  email_domain: string | null;
  email_domains: string[];
  client_id: string | null;
  signing_certificate: string | null;
  notes: string | null;
} {
  const parsed = configJson ? safeParseJsonObject(configJson) : {};
  const providerType =
    parsed.provider_type === "oidc" || parsed.provider_type === "saml"
      ? parsed.provider_type
      : null;
  const emailDomains = parseStoredEmailDomainList(parsed.email_domains);
  appendUniqueDomain(emailDomains, parseStoredEmailDomain(parsed.email_domain));
  appendUniqueDomain(emailDomains, parseStoredEmailDomain(parsed.domain));

  return {
    provider_type: providerType,
    issuer_url: typeof parsed.issuer_url === "string" && parsed.issuer_url.trim() !== "" ? parsed.issuer_url : null,
    metadata_url:
      typeof parsed.metadata_url === "string" && parsed.metadata_url.trim() !== "" ? parsed.metadata_url : null,
    entrypoint_url:
      typeof parsed.entrypoint_url === "string" && parsed.entrypoint_url.trim() !== "" ? parsed.entrypoint_url : null,
    audience: typeof parsed.audience === "string" && parsed.audience.trim() !== "" ? parsed.audience : null,
    email_domain: emailDomains[0] ?? null,
    email_domains: emailDomains,
    client_id: typeof parsed.client_id === "string" && parsed.client_id.trim() !== "" ? parsed.client_id : null,
    signing_certificate:
      typeof parsed.signing_certificate === "string" && parsed.signing_certificate.trim() !== ""
        ? parsed.signing_certificate
        : null,
    notes: typeof parsed.notes === "string" && parsed.notes.trim() !== "" ? parsed.notes : null,
  };
}

function parseWorkspaceDedicatedEnvironmentFeatureConfig(configJson: string | null): {
  deployment_model: "single_tenant" | "pooled_with_isolation" | null;
  target_region: string | null;
  network_boundary: string | null;
  compliance_notes: string | null;
  requester_email: string | null;
  data_classification: DedicatedEnvironmentDataClassification | null;
  requested_capacity: string | null;
  requested_sla: string | null;
  notes: string | null;
} {
  const parsed = configJson ? safeParseJsonObject(configJson) : {};
  const deploymentModel =
    parsed.deployment_model === "single_tenant" || parsed.deployment_model === "pooled_with_isolation"
      ? parsed.deployment_model
      : null;

  return {
    deployment_model: deploymentModel,
    target_region:
      typeof parsed.target_region === "string" && parsed.target_region.trim() !== "" ? parsed.target_region : null,
    network_boundary:
      typeof parsed.network_boundary === "string" && parsed.network_boundary.trim() !== ""
        ? parsed.network_boundary
        : null,
    compliance_notes:
      typeof parsed.compliance_notes === "string" && parsed.compliance_notes.trim() !== ""
        ? parsed.compliance_notes
        : null,
    requester_email:
      typeof parsed.requester_email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(parsed.requester_email.trim())
        ? parsed.requester_email.trim().toLowerCase()
        : null,
    data_classification:
      parsed.data_classification === "internal" ||
      parsed.data_classification === "restricted" ||
      parsed.data_classification === "external"
        ? parsed.data_classification
        : null,
    requested_capacity:
      typeof parsed.requested_capacity === "string" && parsed.requested_capacity.trim() !== ""
        ? parsed.requested_capacity
        : null,
    requested_sla:
      typeof parsed.requested_sla === "string" && parsed.requested_sla.trim() !== ""
        ? parsed.requested_sla
        : null,
    notes: typeof parsed.notes === "string" && parsed.notes.trim() !== "" ? parsed.notes : null,
  };
}

function formatSsoProviderType(providerType: "oidc" | "saml" | null): string {
  if (providerType === "oidc") {
    return "OIDC";
  }
  if (providerType === "saml") {
    return "SAML";
  }
  return "SSO";
}

async function buildSaasWorkspaceSsoReadiness(
  env: Env,
  workspace: WorkspaceRow,
  plan: PricingPlanRow,
): Promise<SaasWorkspaceSsoReadiness> {
  const deliveryReadiness = await deriveEnterpriseDeliveryReadiness(env, workspace.workspace_id);
  const readinessSummary = describeEnterpriseReadinessSummary(deliveryReadiness);
  const config = await getWorkspaceEnterpriseFeatureConfig(env, workspace.workspace_id, "sso");
  const parsedConfig = parseWorkspaceSsoFeatureConfig(config?.config_json ?? null);
  const configured = Boolean(config);
  const providerLabel = formatSsoProviderType(parsedConfig.provider_type);

  const nextSteps = !configured
    ? [
        `${readinessSummary} No ${providerLabel} workspace configuration has been saved yet.`,
        "Submit provider_type and identity-provider metadata to persist workspace SSO configuration.",
        deliveryReadiness.verificationStatus !== "complete"
          ? buildVerificationTrackAction(deliveryReadiness.verificationStatus)
          : buildGoLiveTrackAction(deliveryReadiness.goLiveStatus),
      ]
    : deliveryReadiness.deliveryStatus === "ga"
      ? [
          `${readinessSummary} ${providerLabel} configuration is saved and delivery is ready for controlled rollout.`,
          "Finalize IdP metadata and workspace domain mapping, then enable enforcement for a limited cohort.",
          "Keep redirect URLs, certificates, and sign-in monitoring in the operational rotation checklist.",
        ]
      : deliveryReadiness.verificationStatus !== "complete"
        ? [
            `${readinessSummary} ${providerLabel} configuration is saved, but SSO remains staged until verification is complete.`,
            buildVerificationTrackAction(deliveryReadiness.verificationStatus),
            "Validate issuer metadata, redirect URLs, and domain mapping in parallel to reduce rollout lead time.",
          ]
        : [
            `${readinessSummary} ${providerLabel} configuration is saved; go-live completion is the remaining blocker.`,
            buildGoLiveTrackAction(deliveryReadiness.goLiveStatus),
            "Draft enforcement rollout guardrails and sign-in monitoring before enabling workspace-wide policy.",
          ];

  return {
    feature: "sso",
    feature_enabled: true,
    enabled: true,
    status: configured ? "configured" : "not_configured",
    configured,
    configuration_state: configured ? "configured" : "not_configured",
    availability_status: "available",
    delivery_status: deliveryReadiness.deliveryStatus,
    readiness_version: "2026-04",
    provider_type: parsedConfig.provider_type,
    connection_mode: "workspace",
    supported_protocols: ["oidc", "saml"],
    configured_at: config?.configured_at ?? null,
    issuer_url: parsedConfig.issuer_url,
    metadata_url: parsedConfig.metadata_url,
    entrypoint_url: parsedConfig.entrypoint_url,
    audience: parsedConfig.audience,
    email_domain: parsedConfig.email_domain,
    email_domains: parsedConfig.email_domains,
    client_id: parsedConfig.client_id,
    signing_certificate: parsedConfig.signing_certificate,
    notes: parsedConfig.notes,
    next_steps: nextSteps,
    upgrade_href: null,
    plan_code: plan.code,
  };
}

async function buildSaasWorkspaceDedicatedEnvironmentReadiness(
  env: Env,
  workspace: WorkspaceRow,
  plan: PricingPlanRow,
): Promise<SaasWorkspaceDedicatedEnvironmentReadiness> {
  const deliveryReadiness = await deriveEnterpriseDeliveryReadiness(env, workspace.workspace_id);
  const readinessSummary = describeEnterpriseReadinessSummary(deliveryReadiness);
  const config = await getWorkspaceEnterpriseFeatureConfig(env, workspace.workspace_id, "dedicated_environment");
  const parsedConfig = parseWorkspaceDedicatedEnvironmentFeatureConfig(config?.config_json ?? null);
  const configured = Boolean(config);
  const targetRegion = parsedConfig.target_region ?? workspace.data_region;
  const deploymentModel = parsedConfig.deployment_model ?? "single_tenant";

  const isolationSummary = !configured
    ? `${readinessSummary} No dedicated environment configuration has been saved yet for this workspace.`
    : deliveryReadiness.deliveryStatus === "ga"
      ? `${readinessSummary} Dedicated deployment is configured for ${targetRegion} and ready for rollout.`
      : `${readinessSummary} Dedicated deployment is configured for ${targetRegion}, but rollout remains staged until delivery tracks close.`;

  const nextSteps = !configured
    ? [
        `${readinessSummary} Dedicated environment configuration is still missing.`,
        "Submit deployment model, target region, and any networking/compliance requirements for persistence.",
        deliveryReadiness.verificationStatus !== "complete"
          ? buildVerificationTrackAction(deliveryReadiness.verificationStatus)
          : buildGoLiveTrackAction(deliveryReadiness.goLiveStatus),
      ]
    : deliveryReadiness.deliveryStatus === "ga"
      ? [
          "Finalize region, networking, and compliance controls for production cutover.",
          "Execute tenant isolation validation and support handoff checklist.",
          "Maintain evidence updates for verification and go-live governance.",
        ]
      : deliveryReadiness.verificationStatus !== "complete"
        ? [
            `${readinessSummary} Dedicated environment configuration is saved, but verification remains open.`,
            buildVerificationTrackAction(deliveryReadiness.verificationStatus),
            `Confirm region (${targetRegion}) and networking prerequisites while verification closes.`,
          ]
        : [
            `${readinessSummary} Dedicated environment configuration is saved; go-live completion is the remaining blocker.`,
            buildGoLiveTrackAction(deliveryReadiness.goLiveStatus),
            "Prepare tenant-isolation validation steps and support runbook before scheduling cutover.",
          ];

  return {
    feature: "dedicated_environment",
    feature_enabled: true,
    enabled: true,
    status: configured ? "configured" : "not_configured",
    configured,
    configuration_state: configured ? "configured" : "not_configured",
    availability_status: "available",
    delivery_status: deliveryReadiness.deliveryStatus,
    readiness_version: "2026-04",
    deployment_model: deploymentModel,
    target_region: targetRegion,
    configured_at: config?.configured_at ?? null,
    network_boundary: parsedConfig.network_boundary,
    compliance_notes: parsedConfig.compliance_notes,
    requester_email: parsedConfig.requester_email,
    data_classification: parsedConfig.data_classification,
    requested_capacity: parsedConfig.requested_capacity,
    requested_sla: parsedConfig.requested_sla,
    notes: parsedConfig.notes,
    isolation_summary: isolationSummary,
    next_steps: nextSteps,
    upgrade_href: null,
    plan_code: plan.code,
  };
}

async function getSaasWorkspaceSsoReadiness(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAccess(request, env, workspaceId);
  const { workspace } = access;
  const plan = await requireWorkspaceEnterpriseFeaturePlan(env, workspace, "sso");
  return json(await buildSaasWorkspaceSsoReadiness(env, workspace, plan), buildMeta(request));
}

async function getSaasWorkspaceDedicatedEnvironmentReadiness(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAccess(request, env, workspaceId);
  const { workspace } = access;
  const plan = await requireWorkspaceEnterpriseFeaturePlan(env, workspace, "dedicated_environment");
  return json(await buildSaasWorkspaceDedicatedEnvironmentReadiness(env, workspace, plan), buildMeta(request));
}

async function saveSaasWorkspaceSsoConfig(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can configure workspace SSO",
  );
  const { workspace, user } = access;
  const plan = await requireWorkspaceEnterpriseFeaturePlan(env, workspace, "sso");
  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<SaasWorkspaceSsoConfigRequest>(request);
  const body = normalizeSaasWorkspaceSsoConfigRequest(rawBody);
  assertOptionalWorkspaceBodyIdMatches(body.workspace_id, workspaceId);

  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/sso`;
  const payloadHash = await hashPayload(body);
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }
    return json(await buildSaasWorkspaceSsoReadiness(env, workspace, plan), buildMeta(request));
  }

  const existingConfig = await getWorkspaceEnterpriseFeatureConfig(env, workspaceId, "sso");
  const configId = existingConfig?.config_id ?? createId("wec");
  const configuredAt = nowIso();
  await upsertWorkspaceEnterpriseFeatureConfig(env, {
    configId,
    workspaceId,
    organizationId: workspace.organization_id,
    featureKey: "sso",
    status: "configured",
    configJson: JSON.stringify(body),
    configuredByUserId: user.user_id,
    configuredAt,
    createdAt: existingConfig?.created_at ?? configuredAt,
    updatedAt: configuredAt,
  });

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "workspace_enterprise_feature_config",
    resourceId: configId,
  });

  return json(
    await buildSaasWorkspaceSsoReadiness(env, workspace, plan),
    buildMeta(request),
    { status: existingConfig ? 200 : 201 },
  );
}

async function saveSaasWorkspaceDedicatedEnvironmentConfig(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can configure dedicated environment delivery",
  );
  const { workspace, user } = access;
  const plan = await requireWorkspaceEnterpriseFeaturePlan(env, workspace, "dedicated_environment");
  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<SaasWorkspaceDedicatedEnvironmentConfigRequest>(request);
  const body = normalizeSaasWorkspaceDedicatedEnvironmentConfigRequest(rawBody);
  assertOptionalWorkspaceBodyIdMatches(body.workspace_id, workspaceId);

  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/dedicated-environment`;
  const payloadHash = await hashPayload(body);
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }
    return json(
      await buildSaasWorkspaceDedicatedEnvironmentReadiness(env, workspace, plan),
      buildMeta(request),
    );
  }

  const existingConfig = await getWorkspaceEnterpriseFeatureConfig(env, workspaceId, "dedicated_environment");
  const configId = existingConfig?.config_id ?? createId("wec");
  const configuredAt = nowIso();
  await upsertWorkspaceEnterpriseFeatureConfig(env, {
    configId,
    workspaceId,
    organizationId: workspace.organization_id,
    featureKey: "dedicated_environment",
    status: "configured",
    configJson: JSON.stringify(body),
    configuredByUserId: user.user_id,
    configuredAt,
    createdAt: existingConfig?.created_at ?? configuredAt,
    updatedAt: configuredAt,
  });

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "workspace_enterprise_feature_config",
    resourceId: configId,
  });

  return json(
    await buildSaasWorkspaceDedicatedEnvironmentReadiness(env, workspace, plan),
    buildMeta(request),
    { status: existingConfig ? 200 : 201 },
  );
}

async function exportSaasWorkspaceAuditEvents(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAccess(request, env, workspaceId);
  const { workspace } = access;
  const plan = await getPricingPlanById(env, workspace.plan_id);
  if (!plan || plan.status !== "active") {
    throw new ApiError(409, "workspace_plan_unavailable", "Workspace plan is not available for audit export", {
      ...buildEnterpriseFeatureErrorDetails({
        feature: "audit_export",
        workspaceId: workspace.workspace_id,
        planCode: plan?.code ?? null,
      }),
    });
  }
  if (!isWorkspacePlanFeatureEnabled(plan, "audit_export")) {
    throw new ApiError(
      409,
      "workspace_feature_unavailable",
      "Audit export is not available on the current workspace plan",
      buildEnterpriseFeatureErrorDetails({
        feature: "audit_export",
        workspaceId: workspace.workspace_id,
        planCode: plan.code,
      }),
    );
  }

  const exportQuery = normalizeWorkspaceAuditExportQuery(request);
  const events = (await listTenantAuditEvents(env, workspace.tenant_id)).filter((event) => {
    if (exportQuery.from && event.created_at < exportQuery.from) {
      return false;
    }
    if (exportQuery.to && event.created_at > exportQuery.to) {
      return false;
    }
    return true;
  });
  const serializedEvents = events.map((event) => serializeAuditEvent(event));
  const exportBody =
    exportQuery.format === "json"
      ? JSON.stringify(
          {
            workspace_id: workspace.workspace_id,
            tenant_id: workspace.tenant_id,
            exported_at: nowIso(),
            items: serializedEvents,
          },
          null,
          2,
        )
      : serializedEvents.map((event) => JSON.stringify(event)).join("\n") + (serializedEvents.length > 0 ? "\n" : "");
  const filename = buildWorkspaceAuditExportFilename(workspace.slug, exportQuery.format);
  const contentType =
    exportQuery.format === "json"
      ? "application/json; charset=utf-8"
      : "application/x-ndjson; charset=utf-8";

  return new Response(exportBody, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-govrail-export-format": exportQuery.format,
    },
  });
}

async function createSaasWorkspaceBillingPortalSession(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can open provider billing portal sessions",
  );
  const { workspace } = access;
  const rawBody = await readJson<SaasBillingPortalSessionCreateRequest>(request);
  const body = normalizeSaasBillingPortalSessionCreateRequest(rawBody);

  const currentPlan = await getPricingPlanById(env, workspace.plan_id);
  const currentSubscription = await getWorkspacePlanSubscription(env, workspaceId);
  if (!currentPlan || currentPlan.status !== "active") {
    throw new ApiError(409, "billing_subscription_plan_unavailable", "Workspace plan is not available for billing changes");
  }
  if (!currentSubscription) {
    throw new ApiError(409, "billing_subscription_missing", "Workspace does not have an active subscription to manage");
  }
  if (currentPlan.tier !== "paid" || currentPlan.code === "free") {
    throw new ApiError(409, "billing_subscription_not_paid", "Free workspaces do not have a paid subscription to manage");
  }

  const providerConfig = getBillingProviderDescriptor(currentSubscription.billing_provider, currentSubscription.billing_provider, {
    stripeCheckoutEnabled: isStripeCheckoutEnabled(env),
  });
  if (!providerConfig?.supports_customer_portal) {
    throw new ApiError(
      409,
      "billing_provider_portal_unavailable",
      "The current billing provider does not offer a self-serve customer portal",
      { billing_provider: currentSubscription.billing_provider },
    );
  }

  if (currentSubscription.billing_provider !== "stripe") {
    throw new ApiError(
      409,
      "billing_provider_portal_unimplemented",
      "Customer portal creation is not implemented for this billing provider",
      { billing_provider: currentSubscription.billing_provider },
    );
  }

  const returnIntent = currentSubscription.status === "past_due" ? "resolve-billing" : "manage-plan";
  const returnUrl = resolveStripeCustomerPortalReturnUrl(request, env, body.return_url, returnIntent);
  const portalSession = await createStripeBillingPortalSession({
    stripeSecretKey: getOptionalEnvString(env, "STRIPE_SECRET_KEY") ?? "",
    customerRef: currentSubscription.external_customer_ref ?? "",
    returnUrl,
    portalSessionId: createId("bps"),
  });

  return json(
    {
      billing_provider: portalSession.provider,
      portal_url: portalSession.portalUrl,
      return_url: returnUrl,
    },
    buildMeta(request),
    { status: 201 },
  );
}

async function handleSaasBillingProviderWebhook(
  request: Request,
  env: Env,
  providerCode: string,
): Promise<Response> {
  const provider = providerCode.trim().toLowerCase();
  const providerConfig = getBillingProviderDescriptor(provider);
  if (!providerConfig || !providerConfig.supports_webhooks) {
    throw new ApiError(404, "billing_provider_not_supported", "Billing provider webhook is not enabled", {
      provider,
    });
  }

  const rawBody = await request.text();
  const verification = await verifyBillingWebhookSignature({
    providerCode: provider,
    headers: request.headers,
    rawBody,
    stripeWebhookSecret: getOptionalEnvString(env, "STRIPE_WEBHOOK_SECRET"),
  });

  let parsedBody: SaasBillingProviderWebhookRequest;
  try {
    parsedBody = normalizeIncomingBillingWebhookRequest(provider, JSON.parse(rawBody));
  } catch {
    throw new ApiError(400, "invalid_request", "Webhook body must be valid JSON");
  }

  const body = normalizeSaasBillingProviderWebhookRequest(parsedBody);

  if (body.event_type === "checkout.session.completed") {
    if (!body.data.checkout_session_id) {
      throw new ApiError(
        400,
        "invalid_request",
        "checkout.session.completed webhook must include data.checkout_session_id",
      );
    }

    const checkoutSession = await requireWorkspaceBillingCheckoutSession(
      env,
      body.data.workspace_id ?? "",
      body.data.checkout_session_id,
    ).catch(async () => {
      const session = await getBillingCheckoutSessionById(env, body.data.checkout_session_id as string);
      if (!session) {
        throw new ApiError(404, "billing_checkout_session_not_found", "Checkout session does not exist");
      }
      return session;
    });

    const workspace = await getWorkspaceById(env, checkoutSession.workspace_id);
    if (!workspace) {
      throw new ApiError(404, "workspace_not_found", "Webhook matched a checkout session for a missing workspace");
    }

    const currentPlan = await getPricingPlanById(env, checkoutSession.current_plan_id);
    const targetPlan = await getPricingPlanById(env, checkoutSession.target_plan_id);
    if (!targetPlan || targetPlan.status !== "active") {
      throw new ApiError(409, "billing_checkout_invalid_target", "Target plan is no longer available");
    }

    const completedAt = nowIso();
    const result =
      checkoutSession.status === "completed"
        ? {
            session: checkoutSession,
            subscription: await getWorkspacePlanSubscription(env, workspace.workspace_id),
          }
        : await applyWorkspaceCheckoutSessionCompletion({
            env,
            workspace,
            session: checkoutSession,
            targetPlan,
            completedAt,
            externalCustomerRef: body.data.external_customer_ref,
            externalSubscriptionRef: body.data.external_subscription_ref,
          });

    return json(
      {
        accepted: true,
        provider,
        verification_mode: verification.verification_mode,
        event_id: body.event_id,
        event_type: body.event_type,
        workspace_id: workspace.workspace_id,
        checkout_session: serializeBillingCheckoutSessionSummary(result.session, targetPlan),
        current_plan: currentPlan ? serializePricingPlan(currentPlan) : null,
        target_plan: serializePricingPlan(targetPlan),
        subscription: result.subscription ? serializeWorkspacePlanSubscription(result.subscription) : null,
        billing_summary: buildWorkspaceBillingSummary(env, targetPlan, result.subscription),
        billing_providers: buildWorkspaceBillingProviders(result.subscription, env),
      },
      buildMeta(request),
    );
  }

  const currentSubscription =
    (body.data.workspace_id
      ? await getWorkspacePlanSubscription(env, body.data.workspace_id)
      : await getWorkspacePlanSubscriptionByExternalRef(env, {
          billingProvider: provider,
          externalSubscriptionRef: body.data.external_subscription_ref,
          externalCustomerRef: body.data.external_customer_ref,
        })) ?? null;
  if (!currentSubscription) {
    throw new ApiError(404, "billing_subscription_missing", "Webhook could not resolve a matching subscription", {
      provider,
      workspace_id: body.data.workspace_id,
      external_customer_ref: body.data.external_customer_ref,
      external_subscription_ref: body.data.external_subscription_ref,
    });
  }

  const workspace = await getWorkspaceById(env, currentSubscription.workspace_id);
  if (!workspace) {
    throw new ApiError(404, "workspace_not_found", "Webhook matched a subscription for a missing workspace");
  }

  const nextStatus =
    body.event_type === "subscription.cancelled"
      ? "cancelled"
      : body.event_type === "subscription.resumed"
        ? "active"
        : (body.data.status ?? currentSubscription.status);
  const nextCancelAtPeriodEnd =
    body.event_type === "subscription.cancelled"
      ? false
      : body.event_type === "subscription.resumed"
        ? false
        : (body.data.cancel_at_period_end ?? currentSubscription.cancel_at_period_end === 1);
  const nextCurrentPeriodStart = body.data.current_period_start ?? currentSubscription.current_period_start;
  const nextCurrentPeriodEnd =
    body.data.current_period_end ??
    (body.event_type === "subscription.cancelled"
      ? (currentSubscription.current_period_end ?? nowIso())
      : currentSubscription.current_period_end);
  const updatedAt = nowIso();

  await env.DB.prepare(
    `UPDATE workspace_plan_subscriptions
        SET billing_provider = ?1,
            external_customer_ref = COALESCE(?2, external_customer_ref),
            external_subscription_ref = COALESCE(?3, external_subscription_ref),
            status = ?4,
            current_period_start = ?5,
            current_period_end = ?6,
            cancel_at_period_end = ?7,
            updated_at = ?8
      WHERE subscription_id = ?9`,
  )
    .bind(
      provider,
      body.data.external_customer_ref,
      body.data.external_subscription_ref,
      nextStatus,
      nextCurrentPeriodStart,
      nextCurrentPeriodEnd,
      nextCancelAtPeriodEnd ? 1 : 0,
      updatedAt,
      currentSubscription.subscription_id,
    )
    .run();

  const updatedSubscription = await getWorkspacePlanSubscription(env, workspace.workspace_id);
  if (!updatedSubscription) {
    throw new ApiError(500, "internal_error", "Updated subscription could not be reloaded after webhook processing");
  }

  const plan = await getPricingPlanById(env, workspace.plan_id);
  return json(
    {
      accepted: true,
      provider,
      verification_mode: verification.verification_mode,
      event_id: body.event_id,
      event_type: body.event_type,
      workspace_id: workspace.workspace_id,
      subscription: serializeWorkspacePlanSubscription(updatedSubscription),
      billing_summary: buildWorkspaceBillingSummary(env, plan, updatedSubscription),
      billing_providers: buildWorkspaceBillingProviders(updatedSubscription, env),
    },
    buildMeta(request),
  );
}

async function createSaasWorkspaceBillingCheckoutSession(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can start checkout sessions",
  );
  const { user, workspace, membership } = access;
  void membership;

  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<SaasBillingCheckoutSessionCreateRequest>(request);
  const body = normalizeSaasBillingCheckoutSessionCreateRequest(rawBody);
  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/billing/checkout-sessions`;
  const payloadHash = await hashPayload(body);
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingSession = await refreshBillingCheckoutSessionIfExpired(
      env,
      await requireWorkspaceBillingCheckoutSession(env, workspaceId, existingRecord.resource_id),
    );
    const currentPlan = await getPricingPlanById(env, existingSession.current_plan_id);
    const targetPlan = await getPricingPlanById(env, existingSession.target_plan_id);
    let checkoutResponseOptions:
      | {
          checkoutUrlOverride?: string | null;
          reviewUrlOverride?: string | null;
        }
      | undefined;
    if (
      existingSession.billing_provider === "stripe" &&
      existingSession.status === "open" &&
      targetPlan &&
      isStripeCheckoutEnabled(env)
    ) {
      const reviewUrl = buildAbsoluteBillingReviewUrl(request, env, existingSession.checkout_session_id);
      const stripeCheckout = await createStripeCheckoutSession({
        stripeSecretKey: getOptionalEnvString(env, "STRIPE_SECRET_KEY") ?? "",
        stripePriceIdMonthly: getOptionalEnvString(env, "STRIPE_PRICE_ID_PRO_MONTHLY"),
        stripePriceIdYearly: getOptionalEnvString(env, "STRIPE_PRICE_ID_PRO_YEARLY"),
        workspace,
        user,
        targetPlan,
        billingInterval: existingSession.billing_interval,
        checkoutSessionId: existingSession.checkout_session_id,
        successUrl: reviewUrl,
        cancelUrl: reviewUrl,
      });
      checkoutResponseOptions = {
        checkoutUrlOverride: stripeCheckout.checkoutUrl,
        reviewUrlOverride: reviewUrl,
      };
    }
    return json(
      buildBillingCheckoutSessionResponse(
        existingSession,
        currentPlan,
        targetPlan,
        checkoutResponseOptions,
      ),
      buildMeta(request),
    );
  }

  const currentPlan = await getPricingPlanById(env, workspace.plan_id);
  if (!currentPlan || currentPlan.status !== "active") {
    throw new ApiError(400, "invalid_request", "Current workspace plan is not active");
  }

  const targetPlan = await getPricingPlanById(env, body.target_plan_id);
  if (!targetPlan || targetPlan.status !== "active") {
    throw new ApiError(400, "invalid_request", "target_plan_id must reference an active pricing plan");
  }

  const currentSubscription = await getWorkspacePlanSubscription(env, workspaceId);
  const isRenewingSamePlan =
    targetPlan.plan_id === currentPlan.plan_id &&
    (currentSubscription?.status === "cancelled" ||
      currentSubscription?.status === "paused" ||
      currentSubscription?.cancel_at_period_end === 1);

  if (targetPlan.plan_id === currentPlan.plan_id && !isRenewingSamePlan) {
    throw new ApiError(409, "billing_checkout_invalid_target", "Workspace is already on the requested plan");
  }

  if (targetPlan.tier !== "paid" || targetPlan.code !== "pro") {
    throw new ApiError(
      409,
      "billing_checkout_unsupported_target",
      "Only the Pro plan is currently enabled for self-serve checkout",
      { target_plan_id: targetPlan.plan_id, target_plan_code: targetPlan.code },
    );
  }

  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const checkoutSessionId = createId("chk");
  const stripeCheckoutEnabled = isStripeCheckoutEnabled(env);
  const configuredSelfServeProvider = getOptionalEnvString(env, "BILLING_SELF_SERVE_PROVIDER");
  const allowMockCheckout = configuredSelfServeProvider?.toLowerCase() === "mock_checkout";
  const checkoutProvider = resolveWorkspaceCheckoutProvider({
    preferredProviderCode: configuredSelfServeProvider ?? currentSubscription?.billing_provider ?? null,
    stripeCheckoutEnabled,
    allowMockCheckout,
  });
  if (!checkoutProvider) {
    throw new ApiError(
      409,
      "billing_self_serve_not_configured",
      "No production self-serve billing provider is configured for this workspace",
      {
        target_plan_id: targetPlan.plan_id,
        target_plan_code: targetPlan.code,
        stripe_checkout_enabled: stripeCheckoutEnabled,
      },
    );
  }
  await env.DB.prepare(
    `INSERT INTO billing_checkout_sessions (
        checkout_session_id, workspace_id, organization_id, current_plan_id, target_plan_id,
        billing_interval, billing_provider, status, expires_at, completed_at,
        created_by_user_id, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8, NULL, ?9, ?10, ?10)`,
  )
    .bind(
      checkoutSessionId,
      workspaceId,
      workspace.organization_id,
      currentPlan.plan_id,
      targetPlan.plan_id,
      body.billing_interval,
      checkoutProvider.code,
      expiresAt,
      user.user_id,
      createdAt,
    )
    .run();

  let checkoutResponseOptions:
    | {
        checkoutUrlOverride?: string | null;
        reviewUrlOverride?: string | null;
      }
    | undefined;
  if (checkoutProvider.code === "stripe") {
    const reviewUrl = buildAbsoluteBillingReviewUrl(request, env, checkoutSessionId);
    try {
      const stripeCheckout = await createStripeCheckoutSession({
        stripeSecretKey: getOptionalEnvString(env, "STRIPE_SECRET_KEY") ?? "",
        stripePriceIdMonthly: getOptionalEnvString(env, "STRIPE_PRICE_ID_PRO_MONTHLY"),
        stripePriceIdYearly: getOptionalEnvString(env, "STRIPE_PRICE_ID_PRO_YEARLY"),
        workspace,
        user,
        targetPlan,
        billingInterval: body.billing_interval,
        checkoutSessionId,
        successUrl: reviewUrl,
        cancelUrl: reviewUrl,
      });
      checkoutResponseOptions = {
        checkoutUrlOverride: stripeCheckout.checkoutUrl,
        reviewUrlOverride: reviewUrl,
      };
    } catch (error) {
      await env.DB.prepare(
        `UPDATE billing_checkout_sessions
            SET status = 'cancelled',
                updated_at = ?1
          WHERE checkout_session_id = ?2`,
      )
        .bind(nowIso(), checkoutSessionId)
        .run();
      throw error;
    }
  }

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "billing_checkout_session",
    resourceId: checkoutSessionId,
  });

  const createdSession = await requireWorkspaceBillingCheckoutSession(env, workspaceId, checkoutSessionId);
  return json(
    buildBillingCheckoutSessionResponse(createdSession, currentPlan, targetPlan, checkoutResponseOptions),
    buildMeta(request),
    { status: 201 },
  );
}

async function getSaasWorkspaceBillingCheckoutSession(
  request: Request,
  env: Env,
  workspaceId: string,
  checkoutSessionId: string,
): Promise<Response> {
  await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can view checkout sessions",
  );

  const session = await refreshBillingCheckoutSessionIfExpired(
    env,
    await requireWorkspaceBillingCheckoutSession(env, workspaceId, checkoutSessionId),
  );
  const currentPlan = await getPricingPlanById(env, session.current_plan_id);
  const targetPlan = await getPricingPlanById(env, session.target_plan_id);
  return json(buildBillingCheckoutSessionResponse(session, currentPlan, targetPlan), buildMeta(request));
}

async function completeSaasWorkspaceBillingCheckoutSession(
  request: Request,
  env: Env,
  workspaceId: string,
  checkoutSessionId: string,
): Promise<Response> {
  await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can complete checkout sessions",
  );

  const idempotencyKey = requireIdempotencyKey(request);
  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/billing/checkout-sessions/${checkoutSessionId}:complete`;
  const payloadHash = await hashPayload({ action: "complete_billing_checkout_session" });
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord && existingRecord.payload_hash !== payloadHash) {
    throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
  }

  const session = await refreshBillingCheckoutSessionIfExpired(
    env,
    await requireWorkspaceBillingCheckoutSession(env, workspaceId, checkoutSessionId),
  );
  const workspace = await getWorkspaceById(env, workspaceId);
  if (!workspace) {
    throw new ApiError(404, "workspace_not_found", "Workspace does not exist");
  }

  const targetPlan = await getPricingPlanById(env, session.target_plan_id);
  const currentPlan = await getPricingPlanById(env, session.current_plan_id);
  if (!targetPlan || targetPlan.status !== "active") {
    throw new ApiError(409, "billing_checkout_invalid_target", "Target plan is no longer available");
  }

  if (session.billing_provider !== "mock_checkout") {
    throw new ApiError(
      409,
      "billing_checkout_completion_deferred",
      "This checkout session must be finalized by its billing provider webhook flow",
      { billing_provider: session.billing_provider },
    );
  }

  if (session.status === "expired" || session.status === "cancelled") {
    throw new ApiError(409, "invalid_state_transition", "Checkout session can no longer be completed", {
      checkout_session_status: session.status,
    });
  }

  if (session.status === "completed") {
    const existingSubscription = await getWorkspacePlanSubscription(env, workspaceId);
    await putIdempotencyRecord({
      env,
      tenantId: workspaceId,
      routeKey,
      idempotencyKey,
      payloadHash,
      resourceType: "billing_checkout_session",
      resourceId: checkoutSessionId,
    });

    return json(
      {
        ...buildBillingCheckoutSessionResponse(session, currentPlan, targetPlan),
        subscription: existingSubscription ? serializeWorkspacePlanSubscription(existingSubscription) : null,
        billing_summary: buildWorkspaceBillingSummary(env, targetPlan, existingSubscription),
        billing_providers: buildWorkspaceBillingProviders(existingSubscription, env),
      },
      buildMeta(request),
    );
  }

  const completedAt = nowIso();
  const completion = await applyWorkspaceCheckoutSessionCompletion({
    env,
    workspace,
    session,
    targetPlan,
    completedAt,
  });

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "billing_checkout_session",
    resourceId: checkoutSessionId,
  });

  return json(
    {
      ...buildBillingCheckoutSessionResponse(completion.session, currentPlan, targetPlan),
      subscription: completion.subscription ? serializeWorkspacePlanSubscription(completion.subscription) : null,
      billing_summary: buildWorkspaceBillingSummary(env, targetPlan, completion.subscription),
      billing_providers: buildWorkspaceBillingProviders(completion.subscription, env),
    },
    buildMeta(request),
  );
}

async function cancelSaasWorkspaceBillingSubscription(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can schedule subscription cancellation",
  );
  const { workspace, membership } = access;
  void membership;

  const idempotencyKey = requireIdempotencyKey(request);
  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/billing/subscription:cancel`;
  const payloadHash = await hashPayload({ action: "schedule_workspace_subscription_cancel" });
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord && existingRecord.payload_hash !== payloadHash) {
    throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
  }

  const currentPlan = await getPricingPlanById(env, workspace.plan_id);
  const currentSubscription = await getWorkspacePlanSubscription(env, workspaceId);
  if (!currentPlan || currentPlan.status !== "active") {
    throw new ApiError(409, "billing_subscription_plan_unavailable", "Workspace plan is not available for billing changes");
  }
  if (!currentSubscription) {
    throw new ApiError(409, "billing_subscription_missing", "Workspace does not have an active subscription to cancel");
  }
  if (currentPlan.tier !== "paid" || currentPlan.code === "free") {
    throw new ApiError(409, "billing_subscription_not_paid", "Free workspaces do not have a paid subscription to cancel");
  }
  const providerConfig = getBillingProviderDescriptor(
    currentSubscription.billing_provider,
    currentSubscription.billing_provider,
    {
      stripeCheckoutEnabled: isStripeCheckoutEnabled(env),
    },
  );
  if (providerConfig?.supports_customer_portal) {
    throw new ApiError(
      409,
      "billing_subscription_managed_by_provider",
      "This subscription is managed by the billing provider portal. Open the billing portal to change cancellation settings.",
      {
        billing_provider: currentSubscription.billing_provider,
        manage_plan_href: "/settings?intent=manage-plan",
      },
    );
  }
  if (currentSubscription.status === "cancelled" || currentSubscription.status === "paused") {
    throw new ApiError(409, "billing_subscription_not_cancellable", "This subscription cannot be scheduled for cancellation");
  }

  if (currentSubscription.cancel_at_period_end === 1) {
    await putIdempotencyRecord({
      env,
      tenantId: workspaceId,
      routeKey,
      idempotencyKey,
      payloadHash,
      resourceType: "workspace_plan_subscription",
      resourceId: currentSubscription.subscription_id,
    });

    return json(
      buildWorkspaceBillingSubscriptionResponse(env, currentPlan, currentSubscription),
      buildMeta(request),
    );
  }

  const updatedAt = nowIso();
  await env.DB.prepare(
    `UPDATE workspace_plan_subscriptions
        SET cancel_at_period_end = 1,
            updated_at = ?1
      WHERE subscription_id = ?2`,
  )
    .bind(updatedAt, currentSubscription.subscription_id)
    .run();

  const updatedSubscription = await getWorkspacePlanSubscription(env, workspaceId);
  if (!updatedSubscription) {
    throw new ApiError(500, "billing_subscription_missing", "Subscription could not be loaded after cancellation update");
  }

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "workspace_plan_subscription",
    resourceId: updatedSubscription.subscription_id,
  });

  return json(
    buildWorkspaceBillingSubscriptionResponse(env, currentPlan, updatedSubscription),
    buildMeta(request),
  );
}

async function resumeSaasWorkspaceBillingSubscription(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can resume subscription renewal",
  );
  const { workspace, membership } = access;
  void membership;

  const idempotencyKey = requireIdempotencyKey(request);
  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/billing/subscription:resume`;
  const payloadHash = await hashPayload({ action: "resume_workspace_subscription_renewal" });
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord && existingRecord.payload_hash !== payloadHash) {
    throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
  }

  const currentPlan = await getPricingPlanById(env, workspace.plan_id);
  const currentSubscription = await getWorkspacePlanSubscription(env, workspaceId);
  if (!currentPlan || currentPlan.status !== "active") {
    throw new ApiError(409, "billing_subscription_plan_unavailable", "Workspace plan is not available for billing changes");
  }
  if (!currentSubscription) {
    throw new ApiError(409, "billing_subscription_missing", "Workspace does not have a subscription to resume");
  }
  const providerConfig = getBillingProviderDescriptor(
    currentSubscription.billing_provider,
    currentSubscription.billing_provider,
    {
      stripeCheckoutEnabled: isStripeCheckoutEnabled(env),
    },
  );
  if (providerConfig?.supports_customer_portal) {
    throw new ApiError(
      409,
      "billing_subscription_managed_by_provider",
      "This subscription is managed by the billing provider portal. Open the billing portal to change renewal settings.",
      {
        billing_provider: currentSubscription.billing_provider,
        manage_plan_href: "/settings?intent=manage-plan",
      },
    );
  }
  if (currentSubscription.status === "cancelled" || currentSubscription.status === "paused") {
    throw new ApiError(
      409,
      "billing_subscription_not_resumable",
      "This subscription must be replaced through checkout before it can become active again",
    );
  }

  if (currentSubscription.cancel_at_period_end !== 1) {
    await putIdempotencyRecord({
      env,
      tenantId: workspaceId,
      routeKey,
      idempotencyKey,
      payloadHash,
      resourceType: "workspace_plan_subscription",
      resourceId: currentSubscription.subscription_id,
    });

    return json(
      buildWorkspaceBillingSubscriptionResponse(env, currentPlan, currentSubscription),
      buildMeta(request),
    );
  }

  const updatedAt = nowIso();
  await env.DB.prepare(
    `UPDATE workspace_plan_subscriptions
        SET cancel_at_period_end = 0,
            updated_at = ?1
      WHERE subscription_id = ?2`,
  )
    .bind(updatedAt, currentSubscription.subscription_id)
    .run();

  const updatedSubscription = await getWorkspacePlanSubscription(env, workspaceId);
  if (!updatedSubscription) {
    throw new ApiError(500, "billing_subscription_missing", "Subscription could not be loaded after resume update");
  }

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "workspace_plan_subscription",
    resourceId: updatedSubscription.subscription_id,
  });

  return json(
    buildWorkspaceBillingSubscriptionResponse(env, currentPlan, updatedSubscription),
    buildMeta(request),
  );
}

async function createSaasWorkspaceApiKey(
  request: Request,
  env: Env,
  workspaceId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can create API keys",
  );
  const { user, workspace } = access;

  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<SaasApiKeyCreateRequest>(request);
  const body = normalizeSaasApiKeyCreateRequest(rawBody);
  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/api-keys`;
  const payloadHash = await hashPayload(body);
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }
    const existingApiKey = await getApiKeyById(env, existingRecord.resource_id);
    if (!existingApiKey || existingApiKey.workspace_id !== workspaceId) {
      throw new ApiError(404, "api_key_not_found", "Existing idempotent API key no longer exists");
    }
    return json(
      {
        api_key: serializeSaasApiKey(existingApiKey),
        secret_key: null,
      },
      buildMeta(request),
    );
  }

  if (body.service_account_id) {
    const serviceAccount = await requireWorkspaceServiceAccount(env, workspaceId, body.service_account_id);
    if (serviceAccount.status !== "active") {
      throw new ApiError(409, "invalid_state_transition", "service account is not active");
    }
  }

  const generated = await generateSaasApiKeyMaterial();
  const now = nowIso();
  const apiKeyId = createId("key");
  await env.DB.prepare(
    `INSERT INTO api_keys (
        api_key_id, workspace_id, tenant_id, service_account_id, key_prefix, key_hash, scope_json, status,
        created_by_user_id, last_used_at, expires_at, revoked_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?8, NULL, ?9, NULL, ?10, ?10)`,
  )
    .bind(
      apiKeyId,
      workspaceId,
      workspace.tenant_id,
      body.service_account_id,
      generated.key_prefix,
      generated.key_hash,
      JSON.stringify(body.scope),
      user.user_id,
      body.expires_at,
      now,
    )
    .run();

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "api_key",
    resourceId: apiKeyId,
  });

  const createdApiKey = await getApiKeyById(env, apiKeyId);
  if (!createdApiKey) {
    throw new ApiError(500, "internal_error", "Created API key could not be loaded");
  }

  return json(
    {
      api_key: serializeSaasApiKey(createdApiKey),
      // Secret is only returned once at creation time.
      secret_key: generated.plaintext_key,
    },
    buildMeta(request),
    { status: 201 },
  );
}

async function revokeSaasWorkspaceApiKey(
  request: Request,
  env: Env,
  workspaceId: string,
  apiKeyId: string,
): Promise<Response> {
  await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can revoke API keys",
  );

  const idempotencyKey = requireIdempotencyKey(request);
  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/api-keys/${apiKeyId}:revoke`;
  const payloadHash = await hashPayload({ action: "revoke_api_key" });
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingApiKey = await requireWorkspaceApiKey(env, workspaceId, apiKeyId);
    return json(serializeSaasApiKey(existingApiKey), buildMeta(request));
  }

  const apiKey = await requireWorkspaceApiKey(env, workspaceId, apiKeyId);
  if (apiKey.status !== "revoked") {
    await env.DB.prepare(
      `UPDATE api_keys
          SET status = 'revoked',
              revoked_at = COALESCE(revoked_at, ?1),
              updated_at = ?1
        WHERE workspace_id = ?2 AND api_key_id = ?3`,
    )
      .bind(nowIso(), workspaceId, apiKeyId)
      .run();
  }

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "api_key",
    resourceId: apiKeyId,
  });

  const updatedApiKey = await requireWorkspaceApiKey(env, workspaceId, apiKeyId);
  return json(serializeSaasApiKey(updatedApiKey), buildMeta(request));
}

async function rotateSaasWorkspaceApiKey(
  request: Request,
  env: Env,
  workspaceId: string,
  apiKeyId: string,
): Promise<Response> {
  const access = await requireSaasWorkspaceAdminAccess(
    request,
    env,
    workspaceId,
    "Only workspace owners or admins can rotate API keys",
  );
  const { user } = access;

  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<SaasApiKeyCreateRequest>(request);
  const body = normalizeSaasApiKeyCreateRequest(rawBody);
  const routeKey = `POST:/api/v1/saas/workspaces/${workspaceId}/api-keys/${apiKeyId}:rotate`;
  const payloadHash = await hashPayload(body);
  const existingRecord = await getIdempotencyRecord(env, workspaceId, routeKey, idempotencyKey);
  if (existingRecord) {
    if (existingRecord.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingApiKey = await requireWorkspaceApiKey(env, workspaceId, existingRecord.resource_id);

    return json(
      {
        previous_api_key: serializeSaasApiKey(await requireWorkspaceApiKey(env, workspaceId, apiKeyId)),
        api_key: serializeSaasApiKey(existingApiKey),
        secret_key: null,
        rotated_from_api_key_id: apiKeyId,
      },
      buildMeta(request),
    );
  }

  const previousApiKey = await requireWorkspaceApiKey(env, workspaceId, apiKeyId);
  if (previousApiKey.status !== "active") {
    throw new ApiError(409, "invalid_state_transition", "Only active API keys can be rotated");
  }

  const nextServiceAccountId =
    rawBody.service_account_id === undefined ? previousApiKey.service_account_id : body.service_account_id;
  const nextScope = rawBody.scope === undefined ? safeParseStringArray(previousApiKey.scope_json) : body.scope;
  const nextExpiresAt = rawBody.expires_at === undefined ? previousApiKey.expires_at : body.expires_at;

  if (nextServiceAccountId) {
    const serviceAccount = await requireWorkspaceServiceAccount(env, workspaceId, nextServiceAccountId);
    if (serviceAccount.status !== "active") {
      throw new ApiError(409, "invalid_state_transition", "service account is not active");
    }
  }

  const generated = await generateSaasApiKeyMaterial();
  const now = nowIso();
  const rotatedApiKeyId = createId("key");
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO api_keys (
          api_key_id, workspace_id, tenant_id, service_account_id, key_prefix, key_hash, scope_json, status,
          created_by_user_id, last_used_at, expires_at, revoked_at, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?8, NULL, ?9, NULL, ?10, ?10)`,
    ).bind(
      rotatedApiKeyId,
      workspaceId,
      previousApiKey.tenant_id,
      nextServiceAccountId,
      generated.key_prefix,
      generated.key_hash,
      JSON.stringify(nextScope),
      user.user_id,
      nextExpiresAt,
      now,
    ),
    env.DB.prepare(
      `UPDATE api_keys
          SET status = 'revoked',
              revoked_at = COALESCE(revoked_at, ?1),
              updated_at = ?1
        WHERE workspace_id = ?2 AND api_key_id = ?3`,
    ).bind(now, workspaceId, apiKeyId),
  ]);

  await putIdempotencyRecord({
    env,
    tenantId: workspaceId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "api_key",
    resourceId: rotatedApiKeyId,
  });

  const rotatedApiKey = await requireWorkspaceApiKey(env, workspaceId, rotatedApiKeyId);
  return json(
    {
      previous_api_key: serializeSaasApiKey(await requireWorkspaceApiKey(env, workspaceId, apiKeyId)),
      api_key: serializeSaasApiKey(rotatedApiKey),
      secret_key: generated.plaintext_key,
      rotated_from_api_key_id: apiKeyId,
    },
    buildMeta(request),
    { status: 201 },
  );
}

async function resolveSaasUser(request: Request, env: Env): Promise<UserRow> {
  const trustedSubjectId =
    request.headers.get("cf-access-authenticated-user-email") ??
    request.headers.get("x-authenticated-subject");
  if (!trustedSubjectId || trustedSubjectId.trim() === "") {
    if (request.headers.has("x-subject-id")) {
      throw new ApiError(
        401,
        "unauthorized",
        "SaaS workspace routes require a trusted authenticated subject header",
      );
    }
    throw new ApiError(401, "unauthorized", "SaaS workspace routes require an authenticated subject");
  }

  const subjectId = trustedSubjectId.trim();
  if (subjectId === "" || subjectId === "anonymous") {
    throw new ApiError(401, "unauthorized", "SaaS workspace routes require an authenticated subject");
  }

  const authProvider = env.NORTHBOUND_AUTH_MODE === "trusted_edge" ? "trusted_edge" : "header_subject";
  const normalizedSubject = subjectId.toLowerCase();

  const user =
    (await getUserByAuthIdentity(env, authProvider, subjectId)) ??
    (await getUserByAuthIdentity(env, authProvider, normalizedSubject));

  if (!user) {
    throw new ApiError(403, "tenant_access_denied", "Current subject is not mapped to a SaaS user", {
      subject_id: subjectId,
      auth_provider: authProvider,
    });
  }

  if (user.status !== "active") {
    throw new ApiError(403, "tenant_access_denied", "Current SaaS user is not active");
  }

  return user;
}

function normalizeSaasWorkspaceCreateRequest(body: SaasWorkspaceCreateRequest): Required<SaasWorkspaceCreateRequest> {
  const organizationId = normalizeRequiredSaasId(body.organization_id, "organization_id");
  const workspaceId = normalizeOptionalGeneratedId(body.workspace_id, "workspace");
  const slug = normalizeWorkspaceSlug(body.slug);
  const tenantId = normalizeRequiredSaasId(body.tenant_id, "tenant_id");
  const displayName = normalizeRequiredDisplayName(body.display_name, "display_name");
  const planId = normalizeOptionalLiteralValue(body.plan_id, "plan_free");
  const dataRegion = normalizeOptionalLiteralValue(body.data_region, "global");

  return {
    workspace_id: workspaceId,
    organization_id: organizationId,
    slug,
    display_name: displayName,
    tenant_id: tenantId,
    plan_id: planId,
    data_region: dataRegion,
  };
}

function normalizeRequiredSaasId(value: string | undefined, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function normalizeOptionalLiteralValue(value: string | undefined, fallbackValue: string): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  return fallbackValue;
}

function getOptionalEnvString(env: Env, key: string): string | null {
  const value = (env as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function isStripeCheckoutEnabled(env: Env): boolean {
  return getOptionalEnvString(env, "STRIPE_SECRET_KEY") !== null;
}

function buildAbsoluteWorkspaceSettingsIntentUrl(
  request: Request,
  env: Env,
  intent: "upgrade" | "manage-plan" | "resolve-billing",
  checkoutSessionId?: string,
): string {
  const configuredBaseUrl = getOptionalEnvString(env, "BILLING_RETURN_BASE_URL");
  const baseUrl = configuredBaseUrl ?? new URL(request.url).origin;
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const url = new URL(`${normalizedBaseUrl}/settings`);
  url.searchParams.set("intent", intent);
  if (checkoutSessionId) {
    url.searchParams.set("checkout_session_id", checkoutSessionId);
  }
  return url.toString();
}

function buildAbsoluteBillingReviewUrl(request: Request, env: Env, checkoutSessionId: string): string {
  return buildAbsoluteWorkspaceSettingsIntentUrl(request, env, "upgrade", checkoutSessionId);
}

function buildAbsoluteBillingManagementUrl(
  request: Request,
  env: Env,
  intent: "manage-plan" | "resolve-billing" = "manage-plan",
): string {
  return buildAbsoluteWorkspaceSettingsIntentUrl(request, env, intent);
}

function normalizeAbsoluteHttpUrl(value: string, fieldName: string): string {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new ApiError(503, "billing_provider_misconfigured", `${fieldName} must be a valid absolute URL`);
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new ApiError(503, "billing_provider_misconfigured", `${fieldName} must use http or https`);
  }

  return parsedUrl.toString();
}

function resolveStripeCustomerPortalReturnUrl(
  request: Request,
  env: Env,
  explicitReturnUrl: string | null,
  intent: "manage-plan" | "resolve-billing",
): string {
  if (explicitReturnUrl) {
    return explicitReturnUrl;
  }

  const configuredPortalReturnUrl = getOptionalEnvString(env, "STRIPE_CUSTOMER_PORTAL_RETURN_URL");
  if (configuredPortalReturnUrl) {
    return normalizeAbsoluteHttpUrl(configuredPortalReturnUrl, "STRIPE_CUSTOMER_PORTAL_RETURN_URL");
  }

  return buildAbsoluteBillingManagementUrl(request, env, intent);
}

function normalizeOptionalGeneratedId(value: string | undefined, prefix: string): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  return createId(prefix);
}

function normalizeRequiredDisplayName(value: string | undefined, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function normalizeWorkspaceSlug(value: string | undefined): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, "invalid_request", "slug must be a non-empty string");
  }

  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ApiError(
      400,
      "invalid_request",
      "slug must contain only lowercase letters, numbers, and hyphens",
    );
  }

  return slug;
}

function normalizeSaasWorkspaceDeliveryTrackUpdateRequest(
  body: SaasWorkspaceDeliveryTrackUpdateRequest,
): {
  verification: {
    status: WorkspaceDeliveryTrackRow["status"];
    owner_user_id: string | null;
    notes: string | null;
    evidence_links: Array<{ label: string; url: string }>;
  };
  go_live: {
    status: WorkspaceDeliveryTrackRow["status"];
    owner_user_id: string | null;
    notes: string | null;
    evidence_links: Array<{ label: string; url: string }>;
  };
} {
  return {
    verification: normalizeSaasWorkspaceDeliveryTrackSectionInput(body.verification, "verification"),
    go_live: normalizeSaasWorkspaceDeliveryTrackSectionInput(body.go_live, "go_live"),
  };
}

function normalizeSaasWorkspaceDeliveryTrackSectionInput(
  section: SaasWorkspaceDeliveryTrackSectionInput | undefined,
  sectionKey: WorkspaceDeliveryTrackRow["track_key"],
): {
  status: WorkspaceDeliveryTrackRow["status"];
  owner_user_id: string | null;
  notes: string | null;
  evidence_links: Array<{ label: string; url: string }>;
} {
  if (!section || typeof section !== "object") {
    throw new ApiError(400, "invalid_request", `${sectionKey} must be provided`);
  }

  const status = typeof section.status === "string" ? section.status.trim() : "";
  if (
    !WORKSPACE_DELIVERY_TRACK_STATUSES.includes(
      status as (typeof WORKSPACE_DELIVERY_TRACK_STATUSES)[number],
    )
  ) {
    throw new ApiError(
      400,
      "invalid_request",
      `${sectionKey}.status must be one of: ${WORKSPACE_DELIVERY_TRACK_STATUSES.join(", ")}`,
    );
  }

  let ownerUserId: string | null = null;
  if (section.owner_user_id === null || section.owner_user_id === undefined) {
    ownerUserId = null;
  } else if (typeof section.owner_user_id === "string") {
    ownerUserId = section.owner_user_id.trim() || null;
  } else {
    throw new ApiError(400, "invalid_request", `${sectionKey}.owner_user_id must be a string or null`);
  }

  let notes: string | null = null;
  if (section.notes === null || section.notes === undefined) {
    notes = null;
  } else if (typeof section.notes === "string") {
    const trimmed = section.notes.trim().slice(0, 4000);
    notes = trimmed.length > 0 ? trimmed : null;
  } else {
    throw new ApiError(400, "invalid_request", `${sectionKey}.notes must be a string or null`);
  }

  if (!Array.isArray(section.evidence_links)) {
    throw new ApiError(400, "invalid_request", `${sectionKey}.evidence_links must be an array`);
  }

  const evidenceLinks = section.evidence_links
    .map((link) => ({
      label: typeof link?.label === "string" ? link.label.trim() : "",
      url: typeof link?.url === "string" ? link.url.trim() : "",
    }))
    .filter((link) => link.label.length > 0 && link.url.length > 0)
    .slice(0, 20);

  return {
    status: status as WorkspaceDeliveryTrackRow["status"],
    owner_user_id: ownerUserId,
    notes,
    evidence_links: evidenceLinks,
  };
}

function normalizeSaasApiKeyCreateRequest(body: SaasApiKeyCreateRequest): {
  service_account_id: string | null;
  scope: string[];
  expires_at: string | null;
} {
  let serviceAccountId: string | null = null;
  if (body.service_account_id !== undefined && body.service_account_id !== null) {
    if (typeof body.service_account_id !== "string") {
      throw new ApiError(400, "invalid_request", "service_account_id must be a string when provided");
    }
    serviceAccountId = body.service_account_id.trim() === "" ? null : body.service_account_id.trim();
  }

  let scope: string[] = [];
  if (body.scope !== undefined) {
    if (!Array.isArray(body.scope) || !body.scope.every((item) => typeof item === "string" && item.trim() !== "")) {
      throw new ApiError(400, "invalid_request", "scope must be an array of non-empty strings");
    }
    scope = [...new Set(body.scope.map((item) => item.trim()))];
    const invalidScope = scope.find(
      (value) => !SUPPORTED_WORKSPACE_API_KEY_SCOPES.includes(value as (typeof SUPPORTED_WORKSPACE_API_KEY_SCOPES)[number]),
    );
    if (invalidScope) {
      throw new ApiError(400, "invalid_request", "scope contains an unsupported workspace API key permission", {
        scope: invalidScope,
        allowed_scopes: [...SUPPORTED_WORKSPACE_API_KEY_SCOPES],
      });
    }
  }

  let expiresAt: string | null = null;
  if (body.expires_at !== undefined && body.expires_at !== null && body.expires_at.trim() !== "") {
    const parsed = Date.parse(body.expires_at);
    if (Number.isNaN(parsed)) {
      throw new ApiError(400, "invalid_request", "expires_at must be a valid RFC3339 datetime");
    }
    expiresAt = new Date(parsed).toISOString();
  }

  return {
    service_account_id: serviceAccountId,
    scope,
    expires_at: expiresAt,
  };
}

function normalizeSaasServiceAccountCreateRequest(body: SaasServiceAccountCreateRequest): {
  service_account_id: string;
  name: string;
  description: string | null;
  role: string;
} {
  const serviceAccountId = normalizeOptionalGeneratedId(body.service_account_id, "svc");
  const name = normalizeRequiredDisplayName(body.name, "name");
  const description = normalizeOptionalNullableString(body.description, "description");
  const role = normalizeOptionalRoleValue(body.role, "workspace_service", "role");

  return {
    service_account_id: serviceAccountId,
    name,
    description,
    role,
  };
}

function normalizeSaasWorkspaceInvitationCreateRequest(body: SaasWorkspaceInvitationCreateRequest): {
  email_normalized: string;
  role: WorkspaceMembershipRow["role"];
  expires_at: string;
} {
  const emailNormalized = normalizeRequiredEmail(body.email, "email");
  const role = normalizeWorkspaceMembershipRole(body.role);
  const expiresAt = normalizeFutureDateTime(body.expires_at, 7);

  return {
    email_normalized: emailNormalized,
    role,
    expires_at: expiresAt,
  };
}

function normalizeSaasInvitationAcceptRequest(body: SaasInvitationAcceptRequest): {
  invite_token: string;
} {
  if (typeof body.invite_token !== "string" || body.invite_token.trim() === "") {
    throw new ApiError(400, "invalid_request", "invite_token must be a non-empty string");
  }

  return {
    invite_token: body.invite_token.trim(),
  };
}

function normalizeSaasBillingCheckoutSessionCreateRequest(body: SaasBillingCheckoutSessionCreateRequest): {
  target_plan_id: string;
  billing_interval: BillingCheckoutSessionRow["billing_interval"];
} {
  const targetPlanId = normalizeOptionalLiteralValue(body.target_plan_id, "plan_pro");
  const billingInterval = normalizeOptionalLiteralValue(body.billing_interval, "monthly");

  if (billingInterval !== "monthly" && billingInterval !== "yearly") {
    throw new ApiError(400, "invalid_request", "billing_interval must be monthly or yearly");
  }

  return {
    target_plan_id: targetPlanId,
    billing_interval: billingInterval as BillingCheckoutSessionRow["billing_interval"],
  };
}

function normalizeSaasBillingPortalSessionCreateRequest(body: SaasBillingPortalSessionCreateRequest): {
  return_url: string | null;
} {
  if (body.return_url === undefined || body.return_url === null || body.return_url.trim() === "") {
    return {
      return_url: null,
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.return_url);
  } catch {
    throw new ApiError(400, "invalid_request", "return_url must be a valid absolute URL when provided");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new ApiError(400, "invalid_request", "return_url must use http or https when provided");
  }

  return {
    return_url: parsedUrl.toString(),
  };
}

function normalizeWorkspaceAuditExportQuery(request: Request): {
  format: "json" | "jsonl";
  from: string | null;
  to: string | null;
} {
  const url = new URL(request.url);
  const formatCandidate = url.searchParams.get("format")?.trim().toLowerCase();
  const format =
    formatCandidate === undefined || formatCandidate === null || formatCandidate === "" || formatCandidate === "jsonl"
      ? "jsonl"
      : formatCandidate === "json"
        ? "json"
        : null;
  if (!format) {
    throw new ApiError(400, "invalid_request", "format must be json or jsonl when provided");
  }

  const normalizeTimestamp = (value: string | null, fieldName: string): string | null => {
    if (!value || value.trim() === "") {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new ApiError(400, "invalid_request", `${fieldName} must be a valid ISO timestamp when provided`);
    }
    return parsed.toISOString();
  };

  const from = normalizeTimestamp(url.searchParams.get("from"), "from");
  const to = normalizeTimestamp(url.searchParams.get("to"), "to");
  if (from && to && from > to) {
    throw new ApiError(400, "invalid_request", "from must be earlier than or equal to to");
  }

  return {
    format,
    from,
    to,
  };
}

function normalizeSaasBillingProviderWebhookRequest(body: SaasBillingProviderWebhookRequest): {
  event_id: string;
  event_type: "subscription.updated" | "subscription.cancelled" | "subscription.resumed" | "checkout.session.completed";
  data: {
    workspace_id: string | null;
    checkout_session_id: string | null;
    external_customer_ref: string | null;
    external_subscription_ref: string | null;
    status: WorkspacePlanSubscriptionRow["status"] | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean | null;
  };
} {
  const eventType = normalizeOptionalLiteralValue(body.event_type, "subscription.updated");
  if (
    eventType !== "subscription.updated" &&
    eventType !== "subscription.cancelled" &&
    eventType !== "subscription.resumed" &&
    eventType !== "checkout.session.completed"
  ) {
    throw new ApiError(
      400,
      "invalid_request",
      "event_type must be subscription.updated, subscription.cancelled, subscription.resumed, or checkout.session.completed",
    );
  }

  const data = body.data;
  if (!data || typeof data !== "object") {
    throw new ApiError(400, "invalid_request", "data must be an object");
  }

  const status =
    data.status === undefined || data.status === null ? null : normalizeOptionalLiteralValue(data.status, "");
  if (
    status !== null &&
    status !== "active" &&
    status !== "trialing" &&
    status !== "past_due" &&
    status !== "cancelled" &&
    status !== "paused"
  ) {
    throw new ApiError(
      400,
      "invalid_request",
      "data.status must be active, trialing, past_due, cancelled, or paused when provided",
    );
  }

  const cancelAtPeriodEnd = data.cancel_at_period_end;
  if (
    cancelAtPeriodEnd !== undefined &&
    cancelAtPeriodEnd !== null &&
    typeof cancelAtPeriodEnd !== "boolean"
  ) {
    throw new ApiError(400, "invalid_request", "data.cancel_at_period_end must be boolean when provided");
  }

  const checkoutSessionId = normalizeOptionalNullableString(data.checkout_session_id, "data.checkout_session_id");
  const workspaceId = normalizeOptionalNullableString(data.workspace_id, "data.workspace_id");
  const externalCustomerRef = normalizeOptionalNullableString(
    data.external_customer_ref,
    "data.external_customer_ref",
  );
  const externalSubscriptionRef = normalizeOptionalNullableString(
    data.external_subscription_ref,
    "data.external_subscription_ref",
  );
  if (!workspaceId && !checkoutSessionId && !externalCustomerRef && !externalSubscriptionRef) {
    throw new ApiError(
      400,
      "invalid_request",
      "Webhook data must include checkout_session_id, workspace_id, external_customer_ref, or external_subscription_ref",
    );
  }

  return {
    event_id: normalizeOptionalLiteralValue(body.event_id, createId("evt")),
    event_type: eventType as
      | "subscription.updated"
      | "subscription.cancelled"
      | "subscription.resumed"
      | "checkout.session.completed",
    data: {
      workspace_id: workspaceId,
      checkout_session_id: checkoutSessionId,
      external_customer_ref: externalCustomerRef,
      external_subscription_ref: externalSubscriptionRef,
      status: status as WorkspacePlanSubscriptionRow["status"] | null,
      current_period_start: normalizeOptionalNullableString(data.current_period_start, "data.current_period_start"),
      current_period_end: normalizeOptionalNullableString(data.current_period_end, "data.current_period_end"),
      cancel_at_period_end: cancelAtPeriodEnd ?? null,
    },
  };
}

function normalizeIncomingBillingWebhookRequest(
  providerCode: string,
  body: unknown,
): SaasBillingProviderWebhookRequest {
  if (providerCode !== "stripe" || typeof body !== "object" || body === null) {
    return body as SaasBillingProviderWebhookRequest;
  }

  const event = body as {
    id?: unknown;
    type?: unknown;
    data?: {
      object?: Record<string, unknown>;
    };
  };
  const eventType = typeof event.type === "string" ? event.type : "";
  const payload = event.data?.object;
  if (!payload || typeof payload !== "object") {
    return body as SaasBillingProviderWebhookRequest;
  }

  if (eventType === "checkout.session.completed") {
    const metadata =
      typeof payload.metadata === "object" && payload.metadata !== null
        ? (payload.metadata as Record<string, unknown>)
        : {};
    const workspaceId =
      typeof metadata.workspace_id === "string"
        ? metadata.workspace_id
        : typeof payload.client_reference_id === "string"
          ? payload.client_reference_id
          : null;
    const checkoutSessionId = typeof metadata.checkout_session_id === "string" ? metadata.checkout_session_id : null;
    const externalCustomerRef = typeof payload.customer === "string" ? payload.customer : null;
    const externalSubscriptionRef = typeof payload.subscription === "string" ? payload.subscription : null;
    return {
      ...(typeof event.id === "string" ? { event_id: event.id } : {}),
      event_type: "checkout.session.completed",
      data: {
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
        ...(checkoutSessionId ? { checkout_session_id: checkoutSessionId } : {}),
        ...(externalCustomerRef ? { external_customer_ref: externalCustomerRef } : {}),
        ...(externalSubscriptionRef ? { external_subscription_ref: externalSubscriptionRef } : {}),
        status: "active",
        cancel_at_period_end: false,
      },
    };
  }

  if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
    const metadata =
      typeof payload.metadata === "object" && payload.metadata !== null
        ? (payload.metadata as Record<string, unknown>)
        : {};
    const currentPeriodStart =
      typeof payload.current_period_start === "number"
        ? new Date(payload.current_period_start * 1000).toISOString()
        : null;
    const currentPeriodEnd =
      typeof payload.current_period_end === "number"
        ? new Date(payload.current_period_end * 1000).toISOString()
        : null;
    const workspaceId = typeof metadata.workspace_id === "string" ? metadata.workspace_id : null;
    const externalCustomerRef = typeof payload.customer === "string" ? payload.customer : null;
    const externalSubscriptionRef = typeof payload.id === "string" ? payload.id : null;
    const status =
      typeof payload.status === "string"
        ? payload.status
        : eventType === "customer.subscription.deleted"
          ? "cancelled"
          : null;
    const cancelAtPeriodEnd =
      typeof payload.cancel_at_period_end === "boolean" ? payload.cancel_at_period_end : null;
    return {
      ...(typeof event.id === "string" ? { event_id: event.id } : {}),
      event_type: eventType === "customer.subscription.deleted" ? "subscription.cancelled" : "subscription.updated",
      data: {
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
        ...(externalCustomerRef ? { external_customer_ref: externalCustomerRef } : {}),
        ...(externalSubscriptionRef ? { external_subscription_ref: externalSubscriptionRef } : {}),
        ...(status ? { status } : {}),
        ...(currentPeriodStart ? { current_period_start: currentPeriodStart } : {}),
        ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
        ...(cancelAtPeriodEnd !== null ? { cancel_at_period_end: cancelAtPeriodEnd } : {}),
      },
    };
  }

  return body as SaasBillingProviderWebhookRequest;
}

function normalizeOptionalNullableString(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a string when provided`);
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeOptionalRoleValue(value: string | undefined, fallbackValue: string, fieldName: string): string {
  if (value === undefined) {
    return fallbackValue;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a non-empty string when provided`);
  }

  return value.trim();
}

function normalizeRequiredEmail(value: string | undefined, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a non-empty string`);
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized.includes("@")) {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a valid email address`);
  }

  return normalized;
}

function normalizeWorkspaceMembershipRole(value: string | undefined): WorkspaceMembershipRow["role"] {
  const role = normalizeOptionalRoleValue(value, "viewer", "role") as WorkspaceMembershipRow["role"];
  if (!WORKSPACE_MEMBER_ALLOWED_ROLES.includes(role)) {
    throw new ApiError(400, "invalid_request", "role must be a supported workspace role", {
      allowed_roles: [...WORKSPACE_MEMBER_ALLOWED_ROLES],
    });
  }

  return role;
}

function normalizeFutureDateTime(value: string | null | undefined, defaultDaysFromNow: number): string {
  if (value === undefined || value === null || value.trim() === "") {
    return new Date(Date.now() + defaultDaysFromNow * 24 * 60 * 60 * 1000).toISOString();
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new ApiError(400, "invalid_request", "expires_at must be a valid RFC3339 datetime");
  }
  if (parsed <= Date.now()) {
    throw new ApiError(400, "invalid_request", "expires_at must be in the future");
  }

  return new Date(parsed).toISOString();
}

async function generateSaasApiKeyMaterial(): Promise<{
  plaintext_key: string;
  key_prefix: string;
  key_hash: string;
}> {
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const randomPart = [...randomBytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  const plaintextKey = `grk_${createId("live")}_${randomPart}`;
  return {
    plaintext_key: plaintextKey,
    key_prefix: plaintextKey.slice(0, 20),
    key_hash: await sha256Hex(plaintextKey),
  };
}

async function generateSaasInvitationMaterial(): Promise<{
  plaintext_token: string;
  token_hash: string;
}> {
  const randomBytes = new Uint8Array(18);
  crypto.getRandomValues(randomBytes);
  const randomPart = [...randomBytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  const plaintextToken = `gri_${createId("invite")}_${randomPart}`;
  return {
    plaintext_token: plaintextToken,
    token_hash: await sha256Hex(plaintextToken),
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function serializeSaasWorkspaceListItem(workspace: WorkspaceAccessRow): {
  workspace_id: string;
  organization_id: string;
  organization_slug: string;
  organization_display_name: string;
  tenant_id: string;
  slug: string;
  display_name: string;
  status: string;
  plan_id: string;
  data_region: string;
  membership_role: string;
  created_at: string;
  updated_at: string;
} {
  return {
    workspace_id: workspace.workspace_id,
    organization_id: workspace.organization_id,
    organization_slug: workspace.organization_slug,
    organization_display_name: workspace.organization_display_name,
    tenant_id: workspace.tenant_id,
    slug: workspace.slug,
    display_name: workspace.display_name,
    status: workspace.status,
    plan_id: workspace.plan_id,
    data_region: workspace.data_region,
    membership_role: workspace.membership_role,
    created_at: workspace.created_at,
    updated_at: workspace.updated_at,
  };
}

function serializeSaasWorkspaceDetail(
  workspace: WorkspaceRow,
  organization: OrganizationRow,
  membership: WorkspaceMembershipRow,
): {
  workspace_id: string;
  organization: {
    organization_id: string;
    slug: string;
    display_name: string;
    status: string;
  };
  tenant_id: string;
  slug: string;
  display_name: string;
  status: string;
  plan_id: string;
  data_region: string;
  membership: {
    role: string;
    status: string;
    joined_at: string | null;
  };
  created_at: string;
  updated_at: string;
} {
  return {
    workspace_id: workspace.workspace_id,
    organization: {
      organization_id: workspace.organization_id,
      slug: organization.slug,
      display_name: organization.display_name,
      status: organization.status,
    },
    tenant_id: workspace.tenant_id,
    slug: workspace.slug,
    display_name: workspace.display_name,
    status: workspace.status,
    plan_id: workspace.plan_id,
    data_region: workspace.data_region,
    membership: {
      role: membership.role,
      status: membership.status,
      joined_at: membership.joined_at,
    },
    created_at: workspace.created_at,
    updated_at: workspace.updated_at,
  };
}

function serializeSaasApiKey(apiKey: {
  api_key_id: string;
  workspace_id: string;
  tenant_id: string;
  service_account_id: string | null;
  key_prefix: string;
  scope_json: string;
  status: string;
  created_by_user_id: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  service_account_name?: string | null;
}): {
  api_key_id: string;
  workspace_id: string;
  tenant_id: string;
  service_account_id: string | null;
  service_account_name: string | null;
  key_prefix: string;
  scope: string[];
  status: string;
  created_by_user_id: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
} {
  return {
    api_key_id: apiKey.api_key_id,
    workspace_id: apiKey.workspace_id,
    tenant_id: apiKey.tenant_id,
    service_account_id: apiKey.service_account_id,
    service_account_name: apiKey.service_account_name ?? null,
    key_prefix: apiKey.key_prefix,
    scope: safeParseStringArray(apiKey.scope_json),
    status: apiKey.status,
    created_by_user_id: apiKey.created_by_user_id,
    last_used_at: apiKey.last_used_at,
    expires_at: apiKey.expires_at,
    revoked_at: apiKey.revoked_at,
    created_at: apiKey.created_at,
    updated_at: apiKey.updated_at,
  };
}

async function buildWorkspaceDeliveryResponse(
  env: Env,
  workspace: WorkspaceRow,
): Promise<{
  workspace_id: string;
  verification: ReturnType<typeof serializeWorkspaceDeliveryTrack>;
  go_live: ReturnType<typeof serializeWorkspaceDeliveryTrack>;
}> {
  const tracks = await listWorkspaceDeliveryTracks(env, workspace.workspace_id);
  const trackMap = new Map(tracks.map((track) => [track.track_key, track]));

  return {
    workspace_id: workspace.workspace_id,
    verification: serializeWorkspaceDeliveryTrack(trackMap.get("verification") ?? null),
    go_live: serializeWorkspaceDeliveryTrack(trackMap.get("go_live") ?? null),
  };
}

function serializeWorkspaceDeliveryTrack(
  track:
    | {
        track_id: string;
        workspace_id: string;
        organization_id: string;
        track_key: WorkspaceDeliveryTrackRow["track_key"];
        status: WorkspaceDeliveryTrackRow["status"];
        owner_user_id: string | null;
        notes_text: string;
        evidence_json: string;
        updated_at: string;
      }
    | null,
): {
  status: WorkspaceDeliveryTrackRow["status"];
  owner_user_id: string | null;
  notes: string | null;
  evidence_links: Array<{ label: string; url: string }>;
  updated_at: string;
} {
  if (!track) {
    return {
      status: "pending",
      owner_user_id: null,
      notes: null,
      evidence_links: [],
      updated_at: "",
    };
  }

  return {
    status: track.status,
    owner_user_id: track.owner_user_id,
    notes: track.notes_text.length > 0 ? track.notes_text : null,
    evidence_links: safeParseDeliveryEvidenceLinks(track.evidence_json),
    updated_at: track.updated_at,
  };
}

function serializeSaasServiceAccount(serviceAccount: ServiceAccountRow): {
  service_account_id: string;
  workspace_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  role: string;
  status: string;
  created_by_user_id: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
} {
  return {
    service_account_id: serviceAccount.service_account_id,
    workspace_id: serviceAccount.workspace_id,
    tenant_id: serviceAccount.tenant_id,
    name: serviceAccount.name,
    description: serviceAccount.description,
    role: serviceAccount.role,
    status: serviceAccount.status,
    created_by_user_id: serviceAccount.created_by_user_id,
    last_used_at: serviceAccount.last_used_at,
    created_at: serviceAccount.created_at,
    updated_at: serviceAccount.updated_at,
  };
}

function serializeSaasWorkspaceInvitation(invitation: {
  invitation_id: string;
  organization_id: string;
  workspace_id: string | null;
  email_normalized: string;
  role: string;
  status: string;
  invited_by_user_id: string | null;
  expires_at: string;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  invited_by_email?: string | null;
  invited_by_display_name?: string | null;
}): {
  invitation_id: string;
  organization_id: string;
  workspace_id: string | null;
  email: string;
  role: string;
  status: string;
  invited_by_user_id: string | null;
  invited_by_email: string | null;
  invited_by_display_name: string | null;
  expires_at: string;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
} {
  return {
    invitation_id: invitation.invitation_id,
    organization_id: invitation.organization_id,
    workspace_id: invitation.workspace_id,
    email: invitation.email_normalized,
    role: invitation.role,
    status: invitation.status,
    invited_by_user_id: invitation.invited_by_user_id,
    invited_by_email: invitation.invited_by_email ?? null,
    invited_by_display_name: invitation.invited_by_display_name ?? null,
    expires_at: invitation.expires_at,
    accepted_by_user_id: invitation.accepted_by_user_id,
    accepted_at: invitation.accepted_at,
    created_at: invitation.created_at,
    updated_at: invitation.updated_at,
  };
}

function serializeAcceptedInvitationWorkspace(
  workspace: WorkspaceRow,
  organization: OrganizationRow,
): {
  workspace_id: string;
  organization_id: string;
  organization_slug: string;
  organization_display_name: string;
  slug: string;
  display_name: string;
} {
  return {
    workspace_id: workspace.workspace_id,
    organization_id: workspace.organization_id,
    organization_slug: organization.slug,
    organization_display_name: organization.display_name,
    slug: workspace.slug,
    display_name: workspace.display_name,
  };
}

function serializeAcceptedInvitationMembership(membership: WorkspaceMembershipRow): {
  role: string;
  status: string;
  joined_at: string | null;
} {
  return {
    role: membership.role,
    status: membership.status,
    joined_at: membership.joined_at,
  };
}

function buildWorkspaceBootstrapSeed(workspace: WorkspaceRow): {
  providers: Array<{
    tool_provider_id: string;
    name: string;
    provider_type: ToolProviderType;
    endpoint_url: string;
  }>;
  policies: Array<{
    policy_id: string;
    channel: string;
    scope: {
      tool_provider_id: string;
      tool_name: string;
    };
    decision: PolicyDecision;
    priority: number;
    conditions: PolicyConditions;
    approval_config: PolicyApprovalConfig;
  }>;
} {
  const suffix = workspace.workspace_id.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(-8) || "default";
  const emailProviderId = `tp_bootstrap_email_${suffix}`;
  const erpProviderId = `tp_bootstrap_erp_${suffix}`;

  return {
    providers: [
      {
        tool_provider_id: emailProviderId,
        name: "Bootstrap Email Gateway",
        provider_type: "mcp_server",
        endpoint_url: "mock://email",
      },
      {
        tool_provider_id: erpProviderId,
        name: "Bootstrap ERP Reader",
        provider_type: "mcp_server",
        endpoint_url: "mock://erp",
      },
    ],
    policies: [
      {
        policy_id: `pol_bootstrap_email_external_${suffix}`,
        channel: "mcp_tool_call",
        scope: {
          tool_provider_id: emailProviderId,
          tool_name: "send_email",
        },
        decision: "approval_required",
        priority: 100,
        conditions: {
          target_classification: "external",
          risk_level: "high",
        },
        approval_config: {
          approver_roles: ["approver"],
          timeout_seconds: 86400,
        },
      },
      {
        policy_id: `pol_bootstrap_erp_read_${suffix}`,
        channel: "mcp_tool_call",
        scope: {
          tool_provider_id: erpProviderId,
          tool_name: "read_erp",
        },
        decision: "approval_required",
        priority: 90,
        conditions: {
          risk_level: "low",
        },
        approval_config: {
          approver_roles: ["approver"],
          timeout_seconds: 43200,
        },
      },
      {
        policy_id: `pol_bootstrap_erp_delete_${suffix}`,
        channel: "mcp_tool_call",
        scope: {
          tool_provider_id: erpProviderId,
          tool_name: "delete_record",
        },
        decision: "deny",
        priority: 100,
        conditions: {},
        approval_config: {},
      },
    ],
  };
}

async function buildWorkspaceBootstrapResponse(
  env: Env,
  workspace: WorkspaceRow,
): Promise<{
  workspace: {
    workspace_id: string;
    organization_id: string;
    tenant_id: string;
    slug: string;
    display_name: string;
  };
  summary: {
    providers_total: number;
    policies_total: number;
    providers_created: number;
    providers_existing: number;
    policies_created: number;
    policies_existing: number;
  };
  providers: Array<ReturnType<typeof serializeToolProvider>>;
  policies: Array<ReturnType<typeof serializePolicy>>;
  next_actions: string[];
}> {
  const seed = buildWorkspaceBootstrapSeed(workspace);
  const providers = (
    await Promise.all(seed.providers.map((provider) => getToolProvider(env, workspace.tenant_id, provider.tool_provider_id)))
  ).filter((provider): provider is ToolProviderRow => provider !== null);
  const policies = (
    await Promise.all(seed.policies.map((policy) => getPolicy(env, workspace.tenant_id, policy.policy_id)))
  ).filter((policy): policy is PolicyRow => policy !== null);

  return {
    workspace: {
      workspace_id: workspace.workspace_id,
      organization_id: workspace.organization_id,
      tenant_id: workspace.tenant_id,
      slug: workspace.slug,
      display_name: workspace.display_name,
    },
    summary: {
      providers_total: providers.length,
      policies_total: policies.length,
      providers_created: 0,
      providers_existing: providers.length,
      policies_created: 0,
      policies_existing: policies.length,
    },
    providers: providers.map((provider) => serializeToolProvider(provider)),
    policies: policies.map((policy) => serializePolicy(policy)),
    next_actions: [
      "Create a service account for the first workload",
      "Issue an API key and store the one-time secret",
      "Open Playground or Runs to execute the first demo flow",
    ],
  };
}

async function getWorkspaceOnboardingPersistence(
  env: Env,
  workspaceId: string,
): Promise<{
  state_id: string;
  workspace_id: string;
  organization_id: string;
  status: string;
  summary_json: string;
  last_bootstrapped_at: string | null;
  created_at: string;
  updated_at: string;
} | null> {
  return env.DB.prepare(
    `SELECT state_id, workspace_id, organization_id, status, summary_json, last_bootstrapped_at, created_at, updated_at
       FROM workspace_onboarding_states
      WHERE workspace_id = ?1`,
  )
    .bind(workspaceId)
    .first<{
      state_id: string;
      workspace_id: string;
      organization_id: string;
      status: string;
      summary_json: string;
      last_bootstrapped_at: string | null;
      created_at: string;
      updated_at: string;
    }>();
}

async function upsertWorkspaceOnboardingPersistence(args: {
  env: Env;
  workspace: WorkspaceRow;
  status: string;
  summary: Record<string, unknown>;
  lastBootstrappedAt?: string | null;
  updatedAt?: string;
}): Promise<void> {
  const timestamp = args.updatedAt ?? nowIso();
  await args.env.DB.prepare(
    `INSERT INTO workspace_onboarding_states (
        state_id, workspace_id, organization_id, status, summary_json, last_bootstrapped_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
      ON CONFLICT(workspace_id) DO UPDATE SET
        organization_id = excluded.organization_id,
        status = excluded.status,
        summary_json = excluded.summary_json,
        last_bootstrapped_at = excluded.last_bootstrapped_at,
        updated_at = excluded.updated_at`,
  )
    .bind(
      createId("wos"),
      args.workspace.workspace_id,
      args.workspace.organization_id,
      args.status,
      JSON.stringify(args.summary),
      args.lastBootstrappedAt ?? null,
      timestamp,
    )
    .run();
}

async function buildWorkspaceOnboardingState(
  env: Env,
  workspace: WorkspaceRow,
): Promise<{
  status:
    | "workspace_created"
    | "baseline_ready"
    | "ready_for_demo"
    | "demo_run_started"
    | "demo_run_succeeded";
  checklist: {
    workspace_created: boolean;
    baseline_ready: boolean;
    service_account_created: boolean;
    api_key_created: boolean;
    demo_run_created: boolean;
    demo_run_succeeded: boolean;
  };
  summary: {
    providers_total: number;
    policies_total: number;
    providers_created: number;
    providers_existing: number;
    policies_created: number;
    policies_existing: number;
    service_accounts_total: number;
    active_service_accounts_total: number;
    api_keys_total: number;
    active_api_keys_total: number;
    demo_runs_total: number;
  };
  latest_demo_run: {
    run_id: string;
    status: string;
    trace_id: string;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  } | null;
  latest_demo_run_hint: {
    status_label: string;
    is_terminal: boolean;
    needs_attention: boolean;
    suggested_action: string | null;
  } | null;
  blockers: Array<{
    code: string;
    severity: "blocking" | "warning";
    message: string;
    surface: "onboarding" | "service-accounts" | "api-keys" | "playground" | "verification" | "go-live" | "settings";
  }>;
  recommended_next: {
    surface: "onboarding" | "service-accounts" | "api-keys" | "playground" | "verification" | "go-live" | "settings";
    action: string;
    reason: string;
  };
  delivery_guidance: {
    verification_status: WorkspaceDeliveryTrackRow["status"];
    go_live_status: WorkspaceDeliveryTrackRow["status"];
    next_surface: "onboarding" | "verification" | "go_live";
    summary: string;
    updated_at: string | null;
  };
  next_actions: string[];
}> {
  const demoConversationId = `onboarding-${workspace.slug}`;
  const latestDemoRun = await env.DB.prepare(
    `SELECT run_id, status, trace_id, created_at, updated_at, completed_at
       FROM runs
      WHERE tenant_id = ?1
        AND json_extract(context_json, '$.source_app') = 'web_console'
        AND json_extract(context_json, '$.workspace_slug') = ?2
        AND (
          json_extract(context_json, '$.onboarding_flow') = 'workspace_first_demo'
          OR json_extract(context_json, '$.conversation_id') = ?3
        )
      ORDER BY created_at DESC, run_id DESC
      LIMIT 1`,
  )
    .bind(workspace.tenant_id, workspace.slug, demoConversationId)
    .first<{
      run_id: string;
      status: string;
      trace_id: string;
      created_at: string;
      updated_at: string;
      completed_at: string | null;
    }>();
  const demoRunCountResult = await env.DB.prepare(
    `SELECT COUNT(*) AS count
       FROM runs
      WHERE tenant_id = ?1
        AND json_extract(context_json, '$.source_app') = 'web_console'
        AND json_extract(context_json, '$.workspace_slug') = ?2
        AND (
          json_extract(context_json, '$.onboarding_flow') = 'workspace_first_demo'
          OR json_extract(context_json, '$.conversation_id') = ?3
        )`,
  )
    .bind(workspace.tenant_id, workspace.slug, demoConversationId)
    .first<{ count: number | string | null }>();
  const bootstrap = await buildWorkspaceBootstrapResponse(env, workspace);
  const persistedOnboardingState = await getWorkspaceOnboardingPersistence(env, workspace.workspace_id);
  const persistedSummary = persistedOnboardingState
    ? safeParseJsonObject(persistedOnboardingState.summary_json)
    : {};
  const seed = buildWorkspaceBootstrapSeed(workspace);
  const serviceAccounts = await listWorkspaceServiceAccounts(env, workspace.workspace_id);
  const apiKeys = await listWorkspaceApiKeys(env, workspace.workspace_id);
  const activeServiceAccounts = serviceAccounts.filter((serviceAccount) => serviceAccount.status === "active");
  const activeApiKeys = apiKeys.filter((apiKey) => apiKey.status === "active");
  const baselineReady =
    bootstrap.summary.providers_total === seed.providers.length &&
    bootstrap.summary.policies_total === seed.policies.length;
  const serviceAccountCreated = activeServiceAccounts.length > 0;
  const apiKeyCreated = activeApiKeys.length > 0;
  const demoRunCreated = latestDemoRun !== null;
  const demoRunSucceeded = latestDemoRun?.status === "completed";
  const demoRunsTotal =
    typeof demoRunCountResult?.count === "number"
      ? demoRunCountResult.count
      : Number(demoRunCountResult?.count ?? 0) || 0;
  const deliveryTracks = await listWorkspaceDeliveryTracks(env, workspace.workspace_id);
  const deliveryTrackMap = new Map(deliveryTracks.map((track) => [track.track_key, track]));
  const verificationStatus = deliveryTrackMap.get("verification")?.status ?? "pending";
  const goLiveStatus = deliveryTrackMap.get("go_live")?.status ?? "pending";
  const deliveryUpdatedAtCandidates = deliveryTracks
    .map((track) => track.updated_at)
    .filter((value) => value.length > 0)
    .sort()
    .reverse();
  const deliveryUpdatedAt = deliveryUpdatedAtCandidates[0] ?? null;

  let status:
    | "workspace_created"
    | "baseline_ready"
    | "ready_for_demo"
    | "demo_run_started"
    | "demo_run_succeeded" = "workspace_created";
  if (baselineReady) {
    status = serviceAccountCreated && apiKeyCreated ? "ready_for_demo" : "baseline_ready";
  }
  if (baselineReady && serviceAccountCreated && apiKeyCreated && demoRunCreated) {
    status = demoRunSucceeded ? "demo_run_succeeded" : "demo_run_started";
  }

  const nextActions: string[] = [];
  if (!baselineReady) {
    nextActions.push("Bootstrap the baseline provider and policy bundle");
  }
  if (!serviceAccountCreated) {
    nextActions.push("Create a service account for the first workload");
  }
  if (!apiKeyCreated) {
    nextActions.push("Issue an API key and store the one-time secret");
  }
  if (baselineReady && serviceAccountCreated && apiKeyCreated && !demoRunCreated) {
    nextActions.push("Open Playground and execute the first demo flow");
  }
  if (demoRunCreated && !demoRunSucceeded) {
    nextActions.push("Inspect the latest demo run and drive it to completion");
  }
  if (demoRunSucceeded && verificationStatus !== "complete") {
    nextActions.push("Capture verification evidence and update the verification delivery track");
  }
  if (demoRunSucceeded && verificationStatus === "complete" && goLiveStatus !== "complete") {
    nextActions.push("Continue the go-live rehearsal and update the go-live delivery track");
  }

  const demoStatus = latestDemoRun?.status?.toLowerCase() ?? null;
  const demoFailedStatuses = new Set(["failed", "error", "cancelled", "canceled", "terminated", "timed_out", "timeout"]);
  const demoRunningStatuses = new Set(["pending", "queued", "running", "in_progress"]);
  const latestDemoRunHint = latestDemoRun
    ? {
        status_label: demoRunSucceeded
          ? "Demo run completed successfully"
          : demoFailedStatuses.has(demoStatus ?? "")
            ? "Demo run ended with a failure state"
            : demoRunningStatuses.has(demoStatus ?? "")
              ? "Demo run is still in progress"
              : "Demo run requires operator review",
        is_terminal: demoRunSucceeded || demoFailedStatuses.has(demoStatus ?? ""),
        needs_attention: !demoRunSucceeded,
        suggested_action: demoRunSucceeded
          ? "Move to verification and attach run evidence."
          : demoFailedStatuses.has(demoStatus ?? "")
            ? "Open Playground and retry the first demo flow after reviewing the run detail."
            : "Monitor run progress in Playground, then capture evidence after completion.",
      }
    : null;

  const blockers: Array<{
    code: string;
    severity: "blocking" | "warning";
    message: string;
    surface: "onboarding" | "service-accounts" | "api-keys" | "playground" | "verification" | "go-live" | "settings";
  }> = [];
  if (!baselineReady) {
    blockers.push({
      code: "baseline_not_ready",
      severity: "blocking",
      message: "Bootstrap baseline providers and policies before continuing onboarding.",
      surface: "onboarding",
    });
  }
  if (baselineReady && !serviceAccountCreated) {
    blockers.push({
      code: "service_account_missing",
      severity: "blocking",
      message:
        serviceAccounts.length > 0
          ? "Only disabled or historical service accounts remain. Create a new active service account for workspace runtime operations."
          : "Create at least one active service account for workspace runtime operations.",
      surface: "service-accounts",
    });
  }
  if (baselineReady && serviceAccountCreated && !apiKeyCreated) {
    blockers.push({
      code: "api_key_missing",
      severity: "blocking",
      message:
        apiKeys.length > 0
          ? "Only revoked or historical API keys remain. Issue a new active API key so the first workspace demo flow can be invoked."
          : "Issue an API key so the first workspace demo flow can be invoked.",
      surface: "api-keys",
    });
  }
  if (baselineReady && serviceAccountCreated && apiKeyCreated && !demoRunCreated) {
    blockers.push({
      code: "demo_run_missing",
      severity: "blocking",
      message: "No onboarding demo run exists yet. Run the first demo flow from Playground.",
      surface: "playground",
    });
  }
  if (demoRunCreated && !demoRunSucceeded && demoFailedStatuses.has(demoStatus ?? "")) {
    blockers.push({
      code: "demo_run_failed",
      severity: "blocking",
      message: "Latest onboarding demo run failed and requires replay or a fresh demo execution.",
      surface: "playground",
    });
  }
  if (demoRunCreated && !demoRunSucceeded && !demoFailedStatuses.has(demoStatus ?? "")) {
    blockers.push({
      code: "demo_run_in_progress",
      severity: "warning",
      message: "Latest onboarding demo run is not completed yet. Wait for completion before verification handoff.",
      surface: "playground",
    });
  }
  if (demoRunSucceeded && verificationStatus !== "complete") {
    blockers.push({
      code: "verification_track_incomplete",
      severity: "warning",
      message: "Verification delivery track is not complete. Attach evidence and close verification before go-live.",
      surface: "verification",
    });
  }
  if (demoRunSucceeded && verificationStatus === "complete" && goLiveStatus !== "complete") {
    blockers.push({
      code: "go_live_track_incomplete",
      severity: "warning",
      message: "Go-live track is not complete. Continue the rehearsal checklist and capture remaining evidence.",
      surface: "go-live",
    });
  }

  const firstBlocking = blockers.find((item) => item.severity === "blocking");
  const firstWarning = blockers.find((item) => item.severity === "warning");
  const recommendedNext: {
    surface: "onboarding" | "service-accounts" | "api-keys" | "playground" | "verification" | "go-live" | "settings";
    action: string;
    reason: string;
  } = firstBlocking
    ? {
        surface: firstBlocking.surface,
        action: "Resolve primary onboarding blocker",
        reason: firstBlocking.message,
      }
    : firstWarning
      ? {
          surface: firstWarning.surface,
          action: "Address readiness warning",
          reason: firstWarning.message,
        }
      : goLiveStatus !== "complete"
        ? {
            surface: "go-live",
            action: "Finalize mock go-live rehearsal",
            reason: "Onboarding baseline and demo evidence are ready; advance to go-live closure.",
          }
        : {
            surface: "verification",
            action: "Maintain evidence hygiene",
            reason: "Onboarding and delivery tracks are complete. Keep verification evidence current.",
          };

  const deliveryGuidance = {
    verification_status: verificationStatus,
    go_live_status: goLiveStatus,
    next_surface:
      verificationStatus !== "complete"
        ? "verification"
        : goLiveStatus !== "complete"
          ? "go_live"
          : "onboarding",
    summary:
      verificationStatus !== "complete"
        ? "Verification track is still open; capture run evidence and update delivery status."
        : goLiveStatus !== "complete"
          ? "Verification is complete; continue go-live rehearsal and collect final handoff evidence."
          : "Verification and go-live tracks are complete for this workspace.",
    updated_at: deliveryUpdatedAt,
  } satisfies {
    verification_status: WorkspaceDeliveryTrackRow["status"];
    go_live_status: WorkspaceDeliveryTrackRow["status"];
    next_surface: "onboarding" | "verification" | "go_live";
    summary: string;
    updated_at: string | null;
  };

  return {
    status,
    checklist: {
      workspace_created: true,
      baseline_ready: baselineReady,
      service_account_created: serviceAccountCreated,
      api_key_created: apiKeyCreated,
      demo_run_created: demoRunCreated,
      demo_run_succeeded: demoRunSucceeded,
    },
    summary: {
      ...bootstrap.summary,
      providers_created:
        typeof persistedSummary.providers_created === "number"
          ? persistedSummary.providers_created
          : bootstrap.summary.providers_created,
      providers_existing:
        typeof persistedSummary.providers_existing === "number"
          ? persistedSummary.providers_existing
          : bootstrap.summary.providers_existing,
      policies_created:
        typeof persistedSummary.policies_created === "number"
          ? persistedSummary.policies_created
          : bootstrap.summary.policies_created,
      policies_existing:
        typeof persistedSummary.policies_existing === "number"
          ? persistedSummary.policies_existing
          : bootstrap.summary.policies_existing,
      service_accounts_total: serviceAccounts.length,
      active_service_accounts_total: activeServiceAccounts.length,
      api_keys_total: apiKeys.length,
      active_api_keys_total: activeApiKeys.length,
      demo_runs_total: demoRunsTotal,
    },
    latest_demo_run: latestDemoRun
      ? {
          run_id: latestDemoRun.run_id,
          status: latestDemoRun.status,
          trace_id: latestDemoRun.trace_id,
          created_at: latestDemoRun.created_at,
          updated_at: latestDemoRun.updated_at,
          completed_at: latestDemoRun.completed_at,
        }
      : null,
    latest_demo_run_hint: latestDemoRunHint,
    blockers,
    recommended_next: recommendedNext,
    delivery_guidance: deliveryGuidance,
    next_actions: nextActions,
  };
}

function deriveUsagePeriod(subscription: WorkspacePlanSubscriptionRow | null): {
  period_start: string;
  period_end: string;
} {
  if (subscription?.current_period_start && subscription?.current_period_end) {
    return {
      period_start: subscription.current_period_start,
      period_end: subscription.current_period_end,
    };
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    period_start: monthStart.toISOString(),
    period_end: monthEnd.toISOString(),
  };
}

function buildWorkspacePlanLimitErrorDetails(args: {
  workspace: WorkspaceRow;
  plan: PricingPlanRow;
  scope: string;
  used: number;
  limit: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    scope: args.scope,
    used: args.used,
    limit: args.limit,
    remaining: Math.max(0, args.limit - args.used),
    workspace_id: args.workspace.workspace_id,
    plan_id: args.plan.plan_id,
    plan_code: args.plan.code,
    upgrade_href: "/settings?intent=upgrade",
    ...(args.periodStart ? { period_start: args.periodStart } : {}),
    ...(args.periodEnd ? { period_end: args.periodEnd } : {}),
    ...(args.extra ?? {}),
  };
}

async function getWorkspaceUsageSummary(
  env: Env,
  workspace: WorkspaceRow,
  plan: PricingPlanRow | null,
  subscription?: WorkspacePlanSubscriptionRow | null,
): Promise<{
  period_start: string;
  period_end: string;
  metrics: {
    runs_created: { used: number; limit: number | null; remaining: number | null; over_limit: boolean };
    artifact_storage_bytes: { used: number; limit: number | null; remaining: number | null; over_limit: boolean };
    active_tool_providers: { used: number; limit: number | null; remaining: number | null; over_limit: boolean };
  };
}> {
  const period = deriveUsagePeriod(subscription ?? null);
  const rows = await listWorkspaceUsageSummary(env, workspace.workspace_id, period.period_start, period.period_end);
  const usageTotals = new Map(rows.map((row) => [row.meter_name, row.quantity]));
  const activeToolProvidersResult = await env.DB.prepare(
    `SELECT COUNT(*) AS count
       FROM tool_providers
      WHERE tenant_id = ?1
        AND status = 'active'`,
  )
    .bind(workspace.tenant_id)
    .first<{ count: number | string | null }>();
  const artifactStorageResult = await env.DB.prepare(
    `SELECT COALESCE(SUM(size_bytes), 0) AS total
       FROM artifacts
      WHERE tenant_id = ?1
        AND created_at >= ?2
        AND created_at < ?3`,
  )
    .bind(workspace.tenant_id, period.period_start, period.period_end)
    .first<{ total: number | string | null }>();

  const activeToolProvidersUsed =
    typeof activeToolProvidersResult?.count === "number"
      ? activeToolProvidersResult.count
      : Number(activeToolProvidersResult?.count ?? 0) || 0;
  const artifactStorageUsed =
    typeof artifactStorageResult?.total === "number"
      ? artifactStorageResult.total
      : Number(artifactStorageResult?.total ?? 0) || 0;
  const runsCreatedUsed = (usageTotals.get("runs_created") ?? 0) + (usageTotals.get("replays_created") ?? 0);
  const runsLimit = plan ? getPlanLimitNumber(plan, "runs_per_month") : null;
  const providerLimit = plan ? getPlanLimitNumber(plan, "tool_providers") : null;

  function buildMetric(used: number, limit: number | null): {
    used: number;
    limit: number | null;
    remaining: number | null;
    over_limit: boolean;
  } {
    return {
      used,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - used),
      over_limit: limit === null ? false : used > limit,
    };
  }

  return {
    period_start: period.period_start,
    period_end: period.period_end,
    metrics: {
      runs_created: buildMetric(runsCreatedUsed, runsLimit),
      artifact_storage_bytes: buildMetric(artifactStorageUsed, null),
      active_tool_providers: buildMetric(activeToolProvidersUsed, providerLimit),
    },
  };
}

function getPlanLimitNumber(plan: PricingPlanRow, key: string): number | null {
  const limits = safeParseJsonObject(plan.limits_json);
  const rawValue = limits[key];
  if (typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue < 0) {
    return null;
  }
  return rawValue;
}

async function recordUsageLedgerEvent(args: {
  env: Env;
  workspace: WorkspaceRow;
  subscription?: WorkspacePlanSubscriptionRow | null;
  meterName: string;
  quantity: number;
  sourceType: string;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}): Promise<void> {
  const createdAt = args.createdAt ?? nowIso();
  const period = deriveUsagePeriod(args.subscription ?? null);
  await args.env.DB.prepare(
    `INSERT INTO usage_ledger (
        usage_event_id, workspace_id, organization_id, tenant_id, meter_name, quantity,
        source_type, source_id, period_start, period_end, metadata_json, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
  )
    .bind(
      createId("usage"),
      args.workspace.workspace_id,
      args.workspace.organization_id,
      args.workspace.tenant_id,
      args.meterName,
      args.quantity,
      args.sourceType,
      args.sourceId ?? null,
      period.period_start,
      period.period_end,
      JSON.stringify(args.metadata ?? {}),
      createdAt,
    )
    .run();
}

async function getWorkspaceSeatUsage(env: Env, workspaceId: string): Promise<{
  activeMemberships: number;
  pendingInvitations: number;
}> {
  const [activeMembershipsResult, pendingInvitationsResult] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS total
         FROM workspace_memberships
        WHERE workspace_id = ?1
          AND status = 'active'`,
    )
      .bind(workspaceId)
      .first<{ total: number | null }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total
         FROM workspace_invitations
        WHERE workspace_id = ?1
          AND status = 'pending'`,
    )
      .bind(workspaceId)
      .first<{ total: number | null }>(),
  ]);

  return {
    activeMemberships: Number(activeMembershipsResult?.total ?? 0),
    pendingInvitations: Number(pendingInvitationsResult?.total ?? 0),
  };
}

async function enforceWorkspaceMemberSeatLimit(args: {
  env: Env;
  workspace: WorkspaceRow;
  additionalReservations: number;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  const plan = await getPricingPlanById(args.env, args.workspace.plan_id);
  if (!plan || plan.status !== "active") {
    return;
  }

  const seatLimit = getPlanLimitNumber(plan, "member_seats");
  if (seatLimit === null) {
    return;
  }

  const usage = await getWorkspaceSeatUsage(args.env, args.workspace.workspace_id);
  const reservedSeats = usage.activeMemberships + usage.pendingInvitations;
  const nextReservedSeats = reservedSeats + args.additionalReservations;
  if (nextReservedSeats > seatLimit) {
    throw new ApiError(
      429,
      args.errorCode,
      args.errorMessage,
      buildWorkspacePlanLimitErrorDetails({
        workspace: args.workspace,
        plan,
        scope: "member_seats",
        used: reservedSeats,
        limit: seatLimit,
        extra: {
          active_memberships: usage.activeMemberships,
          pending_invitations: usage.pendingInvitations,
        },
      }),
    );
  }
}

async function enforceWorkspaceRunPlanLimit(env: Env, tenantId: string): Promise<void> {
  const workspace = await getWorkspaceByTenantId(env, tenantId);
  if (!workspace) {
    return;
  }

  const plan = await getPricingPlanById(env, workspace.plan_id);
  if (!plan || plan.status !== "active") {
    return;
  }

  const subscription = await getWorkspacePlanSubscription(env, workspace.workspace_id);
  const usage = await getWorkspaceUsageSummary(env, workspace, plan, subscription);
  const metric = usage.metrics.runs_created;
  if (metric.limit !== null && metric.used >= metric.limit) {
    throw new ApiError(
      429,
      "plan_limit_exceeded",
      "Workspace has reached the monthly run limit",
      buildWorkspacePlanLimitErrorDetails({
        workspace,
        plan,
        scope: "runs_created",
        used: metric.used,
        limit: metric.limit,
        periodStart: usage.period_start,
        periodEnd: usage.period_end,
      }),
    );
  }
}

async function enforceWorkspaceToolProviderPlanLimit(
  env: Env,
  tenantId: string,
  nextStatus: ToolProviderStatus,
): Promise<void> {
  if (nextStatus !== "active") {
    return;
  }

  const workspace = await getWorkspaceByTenantId(env, tenantId);
  if (!workspace) {
    return;
  }

  const plan = await getPricingPlanById(env, workspace.plan_id);
  if (!plan || plan.status !== "active") {
    return;
  }

  const subscription = await getWorkspacePlanSubscription(env, workspace.workspace_id);
  const usage = await getWorkspaceUsageSummary(env, workspace, plan, subscription);
  const metric = usage.metrics.active_tool_providers;
  if (metric.limit !== null && metric.used >= metric.limit) {
    throw new ApiError(
      429,
      "plan_limit_exceeded",
      "Workspace has reached the active tool provider limit",
      buildWorkspacePlanLimitErrorDetails({
        workspace,
        plan,
        scope: "active_tool_providers",
        used: metric.used,
        limit: metric.limit,
        periodStart: usage.period_start,
        periodEnd: usage.period_end,
      }),
    );
  }
}

function serializePricingPlan(plan: PricingPlanRow): {
  plan_id: string;
  code: string;
  display_name: string;
  tier: string;
  status: string;
  monthly_price_cents: number;
  yearly_price_cents: number | null;
  limits: Record<string, unknown>;
  features: Record<string, unknown>;
} {
  return {
    plan_id: plan.plan_id,
    code: plan.code,
    display_name: plan.display_name,
    tier: plan.tier,
    status: plan.status,
    monthly_price_cents: plan.monthly_price_cents,
    yearly_price_cents: plan.yearly_price_cents,
    limits: safeParseJsonObject(plan.limits_json),
    features: safeParseJsonObject(plan.features_json),
  };
}

function isWorkspacePlanFeatureEnabled(
  plan: PricingPlanRow | null,
  featureKey: "sso" | "audit_export" | "dedicated_environment",
): boolean {
  if (!plan) {
    return false;
  }

  return safeParseJsonObject(plan.features_json)[featureKey] === true;
}

function serializeWorkspacePlanSubscription(subscription: WorkspacePlanSubscriptionRow): {
  subscription_id: string;
  workspace_id: string;
  organization_id: string;
  plan_id: string;
  billing_provider: string;
  external_customer_ref: string | null;
  external_subscription_ref: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
} {
  return {
    subscription_id: subscription.subscription_id,
    workspace_id: subscription.workspace_id,
    organization_id: subscription.organization_id,
    plan_id: subscription.plan_id,
    billing_provider: subscription.billing_provider,
    external_customer_ref: subscription.external_customer_ref,
    external_subscription_ref: subscription.external_subscription_ref,
    status: subscription.status,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
    cancel_at_period_end: subscription.cancel_at_period_end === 1,
    created_at: subscription.created_at,
    updated_at: subscription.updated_at,
  };
}

function serializeBillingCheckoutSession(session: BillingCheckoutSessionRow): {
  session_id: string;
  status: BillingCheckoutSessionRow["status"];
  current_plan_id: string;
  target_plan_id: string;
  billing_interval: BillingCheckoutSessionRow["billing_interval"];
  billing_provider: string;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
} {
  return {
    session_id: session.checkout_session_id,
    status: session.status,
    current_plan_id: session.current_plan_id,
    target_plan_id: session.target_plan_id,
    billing_interval: session.billing_interval,
    billing_provider: session.billing_provider,
    expires_at: session.expires_at,
    completed_at: session.completed_at,
    created_at: session.created_at,
    updated_at: session.updated_at,
  };
}

function buildBillingCheckoutSessionUrls(sessionId: string): {
  checkout_url: string;
  review_url: string;
} {
  return {
    checkout_url: `/settings?intent=upgrade&checkout_session_id=${sessionId}`,
    review_url: `/settings?intent=upgrade&checkout_session_id=${sessionId}`,
  };
}

function buildWorkspaceAuditExportFilename(workspaceSlug: string, format: "json" | "jsonl" = "jsonl"): string {
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `govrail-audit-${workspaceSlug}-${dateStamp}.${format === "json" ? "json" : "jsonl"}`;
}

function serializeBillingCheckoutSessionSummary(
  session: BillingCheckoutSessionRow,
  targetPlan: PricingPlanRow | null,
  options?: {
    checkoutUrlOverride?: string | null;
    reviewUrlOverride?: string | null;
  },
): ReturnType<typeof serializeBillingCheckoutSession> & {
  target_plan_code: string | null;
  target_plan_display_name: string | null;
  checkout_url: string;
  review_url: string;
} {
  const urls = buildBillingCheckoutSessionUrls(session.checkout_session_id);
  return {
    ...serializeBillingCheckoutSession(session),
    target_plan_code: targetPlan?.code ?? null,
    target_plan_display_name: targetPlan?.display_name ?? null,
    checkout_url: options?.checkoutUrlOverride ?? urls.checkout_url,
    review_url: options?.reviewUrlOverride ?? urls.review_url,
  };
}

function buildWorkspaceBillingProviders(
  subscription: WorkspacePlanSubscriptionRow | null,
  env?: Env,
): ReturnType<typeof buildBillingProviderRegistry> {
  return buildBillingProviderRegistry(subscription?.billing_provider ?? null, {
    stripeCheckoutEnabled: env ? isStripeCheckoutEnabled(env) : false,
  });
}

function buildWorkspaceBillingSummary(
  env: Env,
  plan: PricingPlanRow | null,
  subscription: WorkspacePlanSubscriptionRow | null,
): {
  status: string;
  status_label: string;
  status_tone: "positive" | "warning" | "neutral";
  provider: string;
  plan_code: string | null;
  plan_display_name: string | null;
  monthly_price_cents: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  self_serve_enabled: boolean;
  self_serve_reason_code: "billing_self_serve_not_configured" | null;
  description: string;
  action: {
    kind: "upgrade" | "manage_plan" | "resolve_billing" | "contact_support";
    label: string;
    href: string;
    availability: "ready" | "staged";
  } | null;
} {
  const planCode = plan?.code ?? null;
  const planDisplayName = plan?.display_name ?? null;
  const monthlyPriceCents = plan?.monthly_price_cents ?? null;
  const isPaidPlan = (monthlyPriceCents ?? 0) > 0;
  const provider = subscription?.billing_provider ?? "manual";
  const cancelAtPeriodEnd = subscription?.cancel_at_period_end === 1;
  const currentPeriodStart = subscription?.current_period_start ?? null;
  const currentPeriodEnd = subscription?.current_period_end ?? null;
  const stripeCheckoutEnabled = isStripeCheckoutEnabled(env);
  const configuredSelfServeProvider = getOptionalEnvString(env, "BILLING_SELF_SERVE_PROVIDER");
  const allowMockCheckout = configuredSelfServeProvider?.toLowerCase() === "mock_checkout";
  const providerConfig = getBillingProviderDescriptor(provider, provider, {
    stripeCheckoutEnabled,
  });
  const checkoutProvider = resolveWorkspaceCheckoutProvider({
    preferredProviderCode: configuredSelfServeProvider ?? subscription?.billing_provider ?? null,
    stripeCheckoutEnabled,
    allowMockCheckout,
  });
  const checkoutProviderIsStripe = checkoutProvider?.code === "stripe";
  const checkoutProviderIsMock = checkoutProvider?.code === "mock_checkout";
  const checkoutSelfServeEnabled = checkoutProvider?.supports_checkout === true;
  const selfServeReasonCode =
    !checkoutProvider && !allowMockCheckout ? "billing_self_serve_not_configured" : null;
  const manageSelfServeEnabled = Boolean(
    providerConfig &&
      (providerConfig.supports_customer_portal || providerConfig.supports_subscription_cancel),
  );
  const resolveBillingSelfServeEnabled = Boolean(
    providerConfig &&
      (providerConfig.supports_customer_portal ||
        providerConfig.supports_subscription_cancel ||
        providerConfig.supports_checkout),
  );

  if (!subscription || (!isPaidPlan && subscription.status === "active")) {
    const actionReady = !isPaidPlan && checkoutSelfServeEnabled;
    return {
      status: isPaidPlan ? "manual_paid" : "manual_free",
      status_label: isPaidPlan ? "Manual billing active" : "Free plan",
      status_tone: "neutral",
      provider,
      plan_code: planCode,
      plan_display_name: planDisplayName,
      monthly_price_cents: monthlyPriceCents,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      self_serve_enabled: actionReady,
      self_serve_reason_code: actionReady ? null : selfServeReasonCode,
      description: isPaidPlan
        ? "This workspace is on a paid plan with manual billing operations."
        : actionReady && checkoutProviderIsStripe
          ? "This workspace is on the free plan. You can now start Stripe-hosted self-serve checkout for Pro."
          : actionReady && checkoutProviderIsMock
            ? "This workspace is on the free plan. A test-only mock checkout flow is configured for non-production validation."
            : "This workspace is on the free plan. Configure a production self-serve billing provider before operators can upgrade in product.",
      action: {
        kind: isPaidPlan ? "manage_plan" : "upgrade",
        label: isPaidPlan
          ? "Coordinate plan changes"
          : actionReady && checkoutProviderIsStripe
            ? "Upgrade to Pro"
            : actionReady && checkoutProviderIsMock
              ? "Run test checkout flow"
              : "Prepare self-serve upgrade",
        href: isPaidPlan ? "/settings?intent=manage-plan" : "/settings?intent=upgrade",
        availability: actionReady ? "ready" : "staged",
      },
    };
  }

  if (subscription.status === "past_due") {
    return {
      status: subscription.status,
      status_label: "Billing attention needed",
      status_tone: "warning",
      provider,
      plan_code: planCode,
      plan_display_name: planDisplayName,
      monthly_price_cents: monthlyPriceCents,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      self_serve_enabled: resolveBillingSelfServeEnabled,
      self_serve_reason_code: resolveBillingSelfServeEnabled ? null : selfServeReasonCode,
      description: "The subscription is past due and feature access may tighten if billing is not resolved.",
      action: {
        kind: "resolve_billing",
        label: resolveBillingSelfServeEnabled ? "Resolve billing" : "Coordinate billing recovery",
        href: "/settings?intent=resolve-billing",
        availability: resolveBillingSelfServeEnabled ? "ready" : "staged",
      },
    };
  }

  if (subscription.status === "trialing") {
    const trialUpgradeReady =
      Boolean(providerConfig?.supports_checkout) || checkoutSelfServeEnabled;
    return {
      status: subscription.status,
      status_label: "Trial active",
      status_tone: "positive",
      provider,
      plan_code: planCode,
      plan_display_name: planDisplayName,
      monthly_price_cents: monthlyPriceCents,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      self_serve_enabled: trialUpgradeReady,
      self_serve_reason_code: trialUpgradeReady ? null : selfServeReasonCode,
      description: "The workspace is in trial and can be converted into an ongoing paid subscription.",
      action: {
        kind: "upgrade",
        label: trialUpgradeReady
          ? checkoutProviderIsStripe
            ? "Convert to paid plan"
            : checkoutProviderIsMock
              ? "Run test conversion flow"
              : "Complete workspace-managed conversion"
          : "Prepare paid conversion",
        href: "/settings?intent=upgrade",
        availability: trialUpgradeReady ? "ready" : "staged",
      },
    };
  }

  if (subscription.status === "paused") {
    return {
      status: subscription.status,
      status_label: "Subscription paused",
      status_tone: "warning",
      provider,
      plan_code: planCode,
      plan_display_name: planDisplayName,
      monthly_price_cents: monthlyPriceCents,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      self_serve_enabled: manageSelfServeEnabled,
      self_serve_reason_code: manageSelfServeEnabled ? null : selfServeReasonCode,
      description: "The current subscription is paused and should be resumed or replaced before go-live.",
      action: {
        kind: "contact_support",
        label: manageSelfServeEnabled ? "Manage paused subscription" : "Coordinate resume",
        href: "/settings?intent=manage-plan",
        availability: manageSelfServeEnabled ? "ready" : "staged",
      },
    };
  }

  if (cancelAtPeriodEnd) {
    return {
      status: subscription.status,
      status_label: "Scheduled to end",
      status_tone: "warning",
      provider,
      plan_code: planCode,
      plan_display_name: planDisplayName,
      monthly_price_cents: monthlyPriceCents,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      self_serve_enabled: manageSelfServeEnabled,
      self_serve_reason_code: manageSelfServeEnabled ? null : selfServeReasonCode,
      description: "The workspace is scheduled to leave its current plan at the end of the billing window.",
      action: {
        kind: "manage_plan",
        label: manageSelfServeEnabled ? "Manage scheduled cancellation" : "Coordinate renewal",
        href: "/settings?intent=manage-plan",
        availability: manageSelfServeEnabled ? "ready" : "staged",
      },
    };
  }

  if (subscription.status === "cancelled") {
    const replacementUpgradeReady = checkoutSelfServeEnabled;
    return {
      status: subscription.status,
      status_label: "Subscription cancelled",
      status_tone: "warning",
      provider,
      plan_code: planCode,
      plan_display_name: planDisplayName,
      monthly_price_cents: monthlyPriceCents,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      self_serve_enabled: replacementUpgradeReady,
      self_serve_reason_code: replacementUpgradeReady ? null : selfServeReasonCode,
      description: "The previous paid subscription is no longer active for this workspace.",
      action: {
        kind: "upgrade",
        label: replacementUpgradeReady
          ? checkoutProviderIsStripe
            ? "Choose a new plan"
            : checkoutProviderIsMock
              ? "Run replacement test flow"
              : "Start replacement plan flow"
          : "Prepare replacement plan",
        href: "/settings?intent=upgrade",
        availability: replacementUpgradeReady ? "ready" : "staged",
      },
    };
  }

  const activeManageReady = manageSelfServeEnabled;
  return {
    status: subscription.status,
    status_label: isPaidPlan ? "Paid plan active" : "Subscription active",
    status_tone: "positive",
    provider,
    plan_code: planCode,
    plan_display_name: planDisplayName,
    monthly_price_cents: monthlyPriceCents,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    self_serve_enabled: activeManageReady,
    self_serve_reason_code: activeManageReady ? null : selfServeReasonCode,
    description: activeManageReady
      ? "The workspace has an active self-serve-capable subscription."
      : "The workspace is active on its current plan, with manual billing operations behind the scenes.",
    action: {
      kind: "manage_plan",
      label: activeManageReady ? "Manage subscription" : "Review plan operations",
      href: "/settings?intent=manage-plan",
      availability: activeManageReady ? "ready" : "staged",
    },
  };
}

async function createRun(request: Request, env: Env): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const subjectId = getSubjectId(request, env);
  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<RunCreateRequest>(request);
  const body = await normalizeRunCreateRequest(env, tenantId, rawBody);
  const meta = buildMeta(request);

  const payloadHash = await hashPayload(rawBody);
  const routeKey = "POST:/api/v1/runs";
  const existing = await getIdempotencyRecord(env, tenantId, routeKey, idempotencyKey);
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const run = await getRun(env, tenantId, existing.resource_id);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Existing idempotent run no longer exists");
    }

    const workflowStatus = await getWorkflowStatus(env, run.workflow_instance_id);
    return json(
      {
        run_id: run.run_id,
        status: run.status,
        workflow_status: workflowStatus,
        coordinator_id: run.run_id,
        trace_id: run.trace_id,
        created_at: run.created_at,
      },
      {
        ...meta,
        trace_id: run.trace_id,
      },
    );
  }

  await enforceWorkspaceRunPlanLimit(env, tenantId);
  await enforceRunCreateRateLimit(env, tenantId);

  const traceId = meta.trace_id;
  const run = await launchRun({
    env,
    tenantId,
    traceId,
    subjectId,
    body,
  });

  await putIdempotencyRecord({
    env,
    tenantId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "run",
    resourceId: run.runId,
  });

  const workspace = await getWorkspaceByTenantId(env, tenantId);
  if (workspace) {
    const subscription = await getWorkspacePlanSubscription(env, workspace.workspace_id);
    await recordUsageLedgerEvent({
      env,
      workspace,
      subscription,
      meterName: "runs_created",
      quantity: 1,
      sourceType: "run",
      sourceId: run.runId,
      metadata: {
        entry_agent_id: body.entry_agent_id ?? null,
      },
      createdAt: run.createdAt,
    });
  }

  return json(
    {
      run_id: run.runId,
      status: "queued",
      workflow_status: "running",
      coordinator_id: run.runId,
      trace_id: traceId,
      created_at: run.createdAt,
    },
    meta,
    { status: 201 },
  );
}

async function listPoliciesByTenant(request: Request, env: Env): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  if (statusParam !== null && statusParam !== "active" && statusParam !== "disabled") {
    throw new ApiError(400, "invalid_request", "status must be active or disabled");
  }

  const policies = await listPolicies(env, tenantId, (statusParam ?? undefined) as PolicyStatus | undefined);
  return json(
    {
      items: policies.map((policy) => serializePolicy(policy)),
      page_info: {
        next_cursor: null,
      },
    },
    buildMeta(request),
  );
}

async function createPolicy(request: Request, env: Env): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<PolicyCreateRequest>(request);
  const body = normalizePolicyCreateRequest(rawBody);
  const routeKey = "POST:/api/v1/policies";
  const payloadHash = await hashPayload(body);
  const existing = await getIdempotencyRecord(env, tenantId, routeKey, idempotencyKey);
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingPolicy = await getPolicy(env, tenantId, existing.resource_id);
    if (!existingPolicy) {
      throw new ApiError(404, "policy_not_found", "Existing idempotent policy no longer exists");
    }

    return json(serializePolicy(existingPolicy), buildMeta(request));
  }

  const policyId = body.policy_id ?? createId("pol");
  const alreadyExists = await getPolicy(env, tenantId, policyId);
  if (alreadyExists) {
    throw new ApiError(409, "policy_already_exists", "Policy already exists in current tenant");
  }

  const timestamp = nowIso();
  const approvalConfig = {
    ...(body.approval_config ?? {}),
  };
  const approverRoles = approvalConfig.approver_roles ?? [];

  await env.DB.prepare(
    `INSERT INTO policies (
        policy_id, tenant_id, channel, tool_provider_id, tool_name, decision, approver_roles_json,
        priority, status, conditions_json, approval_config_json, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)`,
  )
    .bind(
      policyId,
      tenantId,
      body.channel,
      body.scope.tool_provider_id ?? null,
      body.scope.tool_name ?? null,
      body.decision,
      JSON.stringify(approverRoles),
      body.priority,
      body.status,
      JSON.stringify(body.conditions),
      JSON.stringify(approvalConfig),
      timestamp,
    )
    .run();

  await putIdempotencyRecord({
    env,
    tenantId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "policy",
    resourceId: policyId,
  });

  const createdPolicy = await getPolicy(env, tenantId, policyId);
  if (!createdPolicy) {
    throw new ApiError(500, "internal_error", "Created policy could not be loaded");
  }

  return json(serializePolicy(createdPolicy), buildMeta(request), { status: 201 });
}

async function getPolicyById(request: Request, env: Env, policyId: string): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const policy = await getPolicy(env, tenantId, policyId);
  if (!policy) {
    throw new ApiError(404, "policy_not_found", "Policy does not exist in current tenant");
  }

  return json(serializePolicy(policy), buildMeta(request));
}

async function updatePolicy(request: Request, env: Env, policyId: string): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<PolicyUpdateRequest>(request);
  const body = normalizePolicyUpdateRequest(rawBody);
  const routeKey = `POST:/api/v1/policies/${policyId}`;
  const payloadHash = await hashPayload(body);
  const existing = await getIdempotencyRecord(env, tenantId, routeKey, idempotencyKey);
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingPolicy = await getPolicy(env, tenantId, policyId);
    if (!existingPolicy) {
      throw new ApiError(404, "policy_not_found", "Policy no longer exists");
    }

    return json(serializePolicy(existingPolicy), buildMeta(request));
  }

  const policy = await getPolicy(env, tenantId, policyId);
  if (!policy) {
    throw new ApiError(404, "policy_not_found", "Policy does not exist in current tenant");
  }

  const currentApprovalConfig = safeParseApprovalConfig(policy.approval_config_json);
  const rowApproverRoles = safeParseStringArray(policy.approver_roles_json);
  if (currentApprovalConfig.approver_roles === undefined && rowApproverRoles.length > 0) {
    currentApprovalConfig.approver_roles = rowApproverRoles;
  }

  const nextScope = {
    tool_provider_id: body.scope?.tool_provider_id ?? policy.tool_provider_id ?? undefined,
    tool_name: body.scope?.tool_name ?? policy.tool_name ?? undefined,
  };
  const nextConditions = body.conditions ?? safeParsePolicyConditions(policy.conditions_json);
  const nextApprovalConfig = body.approval_config ?? currentApprovalConfig;
  const nextApproverRoles = nextApprovalConfig.approver_roles ?? [];

  await env.DB.prepare(
    `UPDATE policies
        SET channel = ?1,
            tool_provider_id = ?2,
            tool_name = ?3,
            decision = ?4,
            approver_roles_json = ?5,
            priority = ?6,
            status = ?7,
            conditions_json = ?8,
            approval_config_json = ?9,
            updated_at = ?10
      WHERE tenant_id = ?11 AND policy_id = ?12`,
  )
    .bind(
      body.channel ?? policy.channel,
      nextScope.tool_provider_id ?? null,
      nextScope.tool_name ?? null,
      body.decision ?? policy.decision,
      JSON.stringify(nextApproverRoles),
      body.priority ?? policy.priority,
      body.status ?? policy.status,
      JSON.stringify(nextConditions),
      JSON.stringify(nextApprovalConfig),
      nowIso(),
      tenantId,
      policyId,
    )
    .run();

  await putIdempotencyRecord({
    env,
    tenantId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "policy",
    resourceId: policyId,
  });

  const updatedPolicy = await getPolicy(env, tenantId, policyId);
  if (!updatedPolicy) {
    throw new ApiError(404, "policy_not_found", "Policy no longer exists");
  }

  return json(serializePolicy(updatedPolicy), buildMeta(request));
}

async function disablePolicy(request: Request, env: Env, policyId: string): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const idempotencyKey = requireIdempotencyKey(request);
  const routeKey = `POST:/api/v1/policies/${policyId}:disable`;
  const payloadHash = await hashPayload({ action: "disable_policy" });
  const existing = await getIdempotencyRecord(env, tenantId, routeKey, idempotencyKey);
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingPolicy = await getPolicy(env, tenantId, policyId);
    if (!existingPolicy) {
      throw new ApiError(404, "policy_not_found", "Policy no longer exists");
    }

    return json(serializePolicy(existingPolicy), buildMeta(request));
  }

  const policy = await getPolicy(env, tenantId, policyId);
  if (!policy) {
    throw new ApiError(404, "policy_not_found", "Policy does not exist in current tenant");
  }

  if (policy.status !== "disabled") {
    await env.DB.prepare(
      `UPDATE policies
          SET status = 'disabled', updated_at = ?1
        WHERE tenant_id = ?2 AND policy_id = ?3`,
    )
      .bind(nowIso(), tenantId, policyId)
      .run();
  }

  await putIdempotencyRecord({
    env,
    tenantId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "policy",
    resourceId: policyId,
  });

  const updatedPolicy = await getPolicy(env, tenantId, policyId);
  if (!updatedPolicy) {
    throw new ApiError(404, "policy_not_found", "Policy no longer exists");
  }

  return json(serializePolicy(updatedPolicy), buildMeta(request));
}

async function listToolProvidersByTenant(request: Request, env: Env): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  if (statusParam !== null && statusParam !== "active" && statusParam !== "disabled") {
    throw new ApiError(400, "invalid_request", "status must be active or disabled");
  }

  const providers = await listToolProviders(
    env,
    tenantId,
    (statusParam ?? undefined) as ToolProviderStatus | undefined,
  );
  return json(
    {
      items: providers.map((provider) => serializeToolProvider(provider)),
      page_info: {
        next_cursor: null,
      },
    },
    buildMeta(request),
  );
}

async function createToolProvider(request: Request, env: Env): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<ToolProviderCreateRequest>(request);
  const body = normalizeToolProviderCreateRequest(rawBody);
  const routeKey = "POST:/api/v1/tool-providers";
  const payloadHash = await hashPayload(body);
  const existing = await getIdempotencyRecord(env, tenantId, routeKey, idempotencyKey);
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingProvider = await getToolProvider(env, tenantId, existing.resource_id);
    if (!existingProvider) {
      throw new ApiError(404, "tool_provider_not_found", "Existing idempotent tool provider no longer exists");
    }

    return json(serializeToolProvider(existingProvider), buildMeta(request));
  }

  const toolProviderId = body.tool_provider_id ?? createId("tp");
  const alreadyExists = await getToolProvider(env, tenantId, toolProviderId);
  if (alreadyExists) {
    throw new ApiError(409, "tool_provider_already_exists", "Tool provider already exists in current tenant");
  }

  await enforceWorkspaceToolProviderPlanLimit(env, tenantId, body.status);
  const timestamp = nowIso();
  await env.DB.prepare(
    `INSERT INTO tool_providers (
        tool_provider_id, tenant_id, name, provider_type, endpoint_url, auth_ref,
        visibility_policy_ref, execution_policy_ref, status, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
  )
    .bind(
      toolProviderId,
      tenantId,
      body.name,
      body.provider_type,
      body.endpoint_url,
      normalizeAuthRefInput(body.auth_ref, "tool_providers.auth_ref"),
      body.visibility_policy_ref,
      body.execution_policy_ref,
      body.status,
      timestamp,
    )
    .run();

  await putIdempotencyRecord({
    env,
    tenantId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "tool_provider",
    resourceId: toolProviderId,
  });

  const createdToolProvider = await getToolProvider(env, tenantId, toolProviderId);
  if (!createdToolProvider) {
    throw new ApiError(500, "internal_error", "Created tool provider could not be loaded");
  }

  if (createdToolProvider.status === "active") {
    const workspace = await getWorkspaceByTenantId(env, tenantId);
    if (workspace) {
      const subscription = await getWorkspacePlanSubscription(env, workspace.workspace_id);
      const usage = await getWorkspaceUsageSummary(
        env,
        workspace,
        await getPricingPlanById(env, workspace.plan_id),
        subscription,
      );
      await recordUsageLedgerEvent({
        env,
        workspace,
        subscription,
        meterName: "active_tool_providers",
        quantity: usage.metrics.active_tool_providers.used,
        sourceType: "tool_provider",
        sourceId: createdToolProvider.tool_provider_id,
        metadata: {
          action: "created",
        },
        createdAt: timestamp,
      });
    }
  }

  return json(serializeToolProvider(createdToolProvider), buildMeta(request), { status: 201 });
}

async function getToolProviderById(request: Request, env: Env, toolProviderId: string): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const provider = await getToolProvider(env, tenantId, toolProviderId);
  if (!provider) {
    throw new ApiError(404, "tool_provider_not_found", "Tool provider does not exist in current tenant");
  }

  return json(serializeToolProvider(provider), buildMeta(request));
}

async function updateToolProvider(request: Request, env: Env, toolProviderId: string): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const idempotencyKey = requireIdempotencyKey(request);
  const rawBody = await readJson<ToolProviderUpdateRequest>(request);
  const body = normalizeToolProviderUpdateRequest(rawBody);
  const routeKey = `POST:/api/v1/tool-providers/${toolProviderId}`;
  const payloadHash = await hashPayload(body);
  const existing = await getIdempotencyRecord(env, tenantId, routeKey, idempotencyKey);
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingProvider = await getToolProvider(env, tenantId, toolProviderId);
    if (!existingProvider) {
      throw new ApiError(404, "tool_provider_not_found", "Tool provider no longer exists");
    }

    return json(serializeToolProvider(existingProvider), buildMeta(request));
  }

  const provider = await getToolProvider(env, tenantId, toolProviderId);
  if (!provider) {
    throw new ApiError(404, "tool_provider_not_found", "Tool provider does not exist in current tenant");
  }

  const nextProvider = {
    name: body.name ?? provider.name,
    provider_type: body.provider_type ?? provider.provider_type,
    endpoint_url: normalizeToolProviderEndpoint(
      body.provider_type ?? provider.provider_type,
      body.endpoint_url ?? provider.endpoint_url,
    ),
    auth_ref:
      body.auth_ref !== undefined
        ? normalizeAuthRefInput(body.auth_ref, "tool_providers.auth_ref")
        : provider.auth_ref,
    visibility_policy_ref:
      body.visibility_policy_ref !== undefined ? body.visibility_policy_ref : provider.visibility_policy_ref,
    execution_policy_ref:
      body.execution_policy_ref !== undefined ? body.execution_policy_ref : provider.execution_policy_ref,
    status: body.status ?? provider.status,
  };

  if (provider.status !== "active" && nextProvider.status === "active") {
    await enforceWorkspaceToolProviderPlanLimit(env, tenantId, "active");
  }

  await env.DB.prepare(
    `UPDATE tool_providers
        SET name = ?1,
            provider_type = ?2,
            endpoint_url = ?3,
            auth_ref = ?4,
            visibility_policy_ref = ?5,
            execution_policy_ref = ?6,
            status = ?7,
            updated_at = ?8
      WHERE tenant_id = ?9 AND tool_provider_id = ?10`,
  )
    .bind(
      nextProvider.name,
      nextProvider.provider_type,
      nextProvider.endpoint_url,
      nextProvider.auth_ref,
      nextProvider.visibility_policy_ref,
      nextProvider.execution_policy_ref,
      nextProvider.status,
      nowIso(),
      tenantId,
      toolProviderId,
    )
    .run();

  await putIdempotencyRecord({
    env,
    tenantId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "tool_provider",
    resourceId: toolProviderId,
  });

  const updatedProvider = await getToolProvider(env, tenantId, toolProviderId);
  if (!updatedProvider) {
    throw new ApiError(404, "tool_provider_not_found", "Tool provider no longer exists");
  }

  if (provider.status !== updatedProvider.status) {
    const workspace = await getWorkspaceByTenantId(env, tenantId);
    if (workspace) {
      const subscription = await getWorkspacePlanSubscription(env, workspace.workspace_id);
      const usage = await getWorkspaceUsageSummary(
        env,
        workspace,
        await getPricingPlanById(env, workspace.plan_id),
        subscription,
      );
      await recordUsageLedgerEvent({
        env,
        workspace,
        subscription,
        meterName: "active_tool_providers",
        quantity: usage.metrics.active_tool_providers.used,
        sourceType: "tool_provider",
        sourceId: updatedProvider.tool_provider_id,
        metadata: {
          action: updatedProvider.status,
        },
      });
    }
  }

  return json(serializeToolProvider(updatedProvider), buildMeta(request));
}

async function disableToolProvider(request: Request, env: Env, toolProviderId: string): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const idempotencyKey = requireIdempotencyKey(request);
  const routeKey = `POST:/api/v1/tool-providers/${toolProviderId}:disable`;
  const payloadHash = await hashPayload({ action: "disable_tool_provider" });
  const existing = await getIdempotencyRecord(env, tenantId, routeKey, idempotencyKey);
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingProvider = await getToolProvider(env, tenantId, toolProviderId);
    if (!existingProvider) {
      throw new ApiError(404, "tool_provider_not_found", "Tool provider no longer exists");
    }

    return json(serializeToolProvider(existingProvider), buildMeta(request));
  }

  const provider = await getToolProvider(env, tenantId, toolProviderId);
  if (!provider) {
    throw new ApiError(404, "tool_provider_not_found", "Tool provider does not exist in current tenant");
  }

  if (provider.status !== "disabled") {
    await env.DB.prepare(
      `UPDATE tool_providers
          SET status = 'disabled', updated_at = ?1
        WHERE tenant_id = ?2 AND tool_provider_id = ?3`,
    )
      .bind(nowIso(), tenantId, toolProviderId)
      .run();
  }

  await putIdempotencyRecord({
    env,
    tenantId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "tool_provider",
    resourceId: toolProviderId,
  });

  const updatedProvider = await getToolProvider(env, tenantId, toolProviderId);
  if (!updatedProvider) {
    throw new ApiError(404, "tool_provider_not_found", "Tool provider no longer exists");
  }

  if (provider.status !== updatedProvider.status) {
    const workspace = await getWorkspaceByTenantId(env, tenantId);
    if (workspace) {
      const subscription = await getWorkspacePlanSubscription(env, workspace.workspace_id);
      const usage = await getWorkspaceUsageSummary(
        env,
        workspace,
        await getPricingPlanById(env, workspace.plan_id),
        subscription,
      );
      await recordUsageLedgerEvent({
        env,
        workspace,
        subscription,
        meterName: "active_tool_providers",
        quantity: usage.metrics.active_tool_providers.used,
        sourceType: "tool_provider",
        sourceId: updatedProvider.tool_provider_id,
        metadata: {
          action: "disabled",
        },
      });
    }
  }

  return json(serializeToolProvider(updatedProvider), buildMeta(request));
}

async function getRunById(request: Request, env: Env, runId: string): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const run = await getRun(env, tenantId, runId);
  if (!run) {
    throw new ApiError(404, "run_not_found", "Run does not exist in current tenant");
  }

  const [workflowStatus, coordinatorState] = await Promise.all([
    getWorkflowStatus(env, run.workflow_instance_id),
    getCoordinatorState(env, run.run_id),
  ]);

  return json(
    {
      run_id: run.run_id,
      tenant_id: run.tenant_id,
      status: run.status,
      workflow_status: workflowStatus,
      entry_agent_id: run.entry_agent_id,
      current_step_id: run.current_step_id,
      pending_approval_id: run.pending_approval_id,
      trace_id: run.trace_id,
      coordinator_state: coordinatorState,
      created_at: run.created_at,
      updated_at: run.updated_at,
      completed_at: run.completed_at,
    },
    {
      ...buildMeta(request),
      trace_id: run.trace_id,
    },
  );
}

async function getRunGraphById(request: Request, env: Env, runId: string): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const run = await getRun(env, tenantId, runId);
  if (!run) {
    throw new ApiError(404, "run_not_found", "Run does not exist in current tenant");
  }

  const graphQuery = parseRunGraphQuery(request);
  const graph = await getRunGraph(env, tenantId, runId, graphQuery);
  return json(
    {
      run: {
        run_id: run.run_id,
        status: run.status,
      },
      steps: graph.steps,
      approvals: graph.approvals,
      artifacts: graph.artifacts,
      page_info: graph.page_info,
    },
    {
      ...buildMeta(request),
      trace_id: run.trace_id,
    },
  );
}

async function getRunEventsById(request: Request, env: Env, runId: string): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const run = await getRun(env, tenantId, runId);
  if (!run) {
    throw new ApiError(404, "run_not_found", "Run does not exist in current tenant");
  }

  const query = parsePageQuery(request);
  const events = await listRunAuditEvents(env, tenantId, runId, query);
  return json(
    {
      run: {
        run_id: run.run_id,
        status: run.status,
      },
      items: events.items.map((event) => serializeAuditEvent(event)),
      page_info: events.page_info,
    },
    {
      ...buildMeta(request),
      trace_id: run.trace_id,
    },
  );
}

async function listRunArtifactsById(request: Request, env: Env, runId: string): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const run = await getRun(env, tenantId, runId);
  if (!run) {
    throw new ApiError(404, "run_not_found", "Run does not exist in current tenant");
  }

  const query = parsePageQuery(request);
  const artifacts = await listRunArtifacts(env, tenantId, runId, query);
  return json(
    {
      run: {
        run_id: run.run_id,
        status: run.status,
      },
      items: artifacts.items.map((artifact) => serializeArtifact(artifact)),
      page_info: artifacts.page_info,
    },
    {
      ...buildMeta(request),
      trace_id: run.trace_id,
    },
  );
}

async function getRunArtifactById(
  request: Request,
  env: Env,
  runId: string,
  artifactId: string,
): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const run = await getRun(env, tenantId, runId);
  if (!run) {
    throw new ApiError(404, "run_not_found", "Run does not exist in current tenant");
  }

  const artifact = await getArtifact(env, tenantId, runId, artifactId);
  if (!artifact) {
    throw new ApiError(404, "artifact_not_found", "Artifact does not exist in current run");
  }

  const data: Record<string, unknown> = serializeArtifact(artifact);
  if (shouldIncludeArtifactBody(request)) {
    const object = await env.ARTIFACTS_BUCKET.get(artifact.r2_key);
    if (!object) {
      throw new ApiError(500, "internal_error", "Artifact body is missing from storage");
    }
    data.body = parseArtifactBody(artifact.mime_type, await object.text());
  }

  return json(data, {
    ...buildMeta(request),
    trace_id: run.trace_id,
  });
}

async function cancelRunById(request: Request, env: Env, runId: string): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const subjectId = getSubjectId(request, env);
  const idempotencyKey = requireIdempotencyKey(request);
  const meta = buildMeta(request);
  const routeKey = `POST:/api/v1/runs/${runId}:cancel`;
  const payloadHash = await hashPayload({ action: "cancel_run" });
  const existing = await getIdempotencyRecord(env, tenantId, routeKey, idempotencyKey);
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const run = await getRun(env, tenantId, runId);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Run no longer exists");
    }

    return json(
      {
        run_id: run.run_id,
        status: run.status,
        cancelled_at: run.completed_at ?? run.updated_at,
      },
      {
        ...meta,
        trace_id: run.trace_id,
      },
    );
  }

  try {
    const { run, cancelledAt } = await cancelRun({
      env,
      tenantId,
      runId,
      traceId: meta.trace_id,
      actorType: "human",
      actorRef: subjectId,
      reason: "run_cancelled",
    });

    await putIdempotencyRecord({
      env,
      tenantId,
      routeKey,
      idempotencyKey,
      payloadHash,
      resourceType: "run_cancel",
      resourceId: runId,
    });

    return json(
      {
        run_id: run.run_id,
        status: "cancelled",
        cancelled_at: cancelledAt,
      },
      {
        ...meta,
        trace_id: run.trace_id,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "run_not_found") {
      throw new ApiError(404, "run_not_found", "Run does not exist in current tenant");
    }
    if (error instanceof Error && error.message === "invalid_state_transition") {
      throw new ApiError(409, "invalid_state_transition", "Run cannot be cancelled from its current state");
    }
    throw error;
  }
}

async function decideApproval(request: Request, env: Env, approvalId: string): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const subjectId = getSubjectId(request, env);
  const subjectRoles = getSubjectRoles(request, env);
  const idempotencyKey = requireIdempotencyKey(request);
  const body = await readJson<ApprovalDecisionRequest>(request);
  const meta = buildMeta(request);

  if (body.decision !== "approved" && body.decision !== "rejected") {
    throw new ApiError(400, "invalid_request", "Decision must be approved or rejected");
  }

  const approval = await getApproval(env, tenantId, approvalId);
  if (!approval) {
    throw new ApiError(404, "approval_not_found", "Approval does not exist in current tenant");
  }
  const run = await getRun(env, tenantId, approval.run_id);
  if (approval.status !== "pending") {
    throw new ApiError(409, "approval_already_decided", "Approval has already been decided");
  }
  if (approval.expires_at && approval.expires_at <= nowIso()) {
    await expireApproval({
      env,
      tenantId,
      approvalId,
      traceId: run?.trace_id ?? meta.trace_id,
      reason: "decision_attempt_after_expiry",
      actorType: "system",
      actorRef: "approval_api",
      terminateWorkflow: true,
    });
    throw new ApiError(409, "invalid_state_transition", "Approval has expired");
  }
  assertApprovalScope(subjectId, subjectRoles, approval.approver_scope_json);

  const routeKey = `POST:/api/v1/approvals/${approvalId}/decision`;
  const payloadHash = await hashPayload(body);
  const existing = await getIdempotencyRecord(env, tenantId, routeKey, idempotencyKey);
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const updatedApproval = await getApproval(env, tenantId, approvalId);
    if (!updatedApproval) {
      throw new ApiError(404, "approval_not_found", "Approval no longer exists");
    }

    return json(
      {
        approval_id: updatedApproval.approval_id,
        status: updatedApproval.status,
        run_id: updatedApproval.run_id,
        workflow_signal_status: "accepted",
        decided_at: updatedApproval.decided_at,
      },
      meta,
    );
  }

  const timestamp = nowIso();
  const signal: ApprovalDecisionSignal = {
    approval_id: approvalId,
    decision: body.decision,
    decided_by: subjectId,
    decided_at: timestamp,
    ...(body.comment ? { comment: body.comment } : {}),
    ...(body.reason_code ? { reason_code: body.reason_code } : {}),
  };

  await env.DB.prepare(
    `UPDATE approvals
        SET status = ?1,
            decision_by = ?2,
            decision_comment = ?3,
            decision_reason_code = ?4,
            decided_at = ?5
      WHERE tenant_id = ?6 AND approval_id = ?7 AND status = 'pending'`,
  )
    .bind(
      body.decision,
      subjectId,
      body.comment ?? null,
      body.reason_code ?? null,
      timestamp,
      tenantId,
      approvalId,
    )
    .run();

  await recordAuditEvent({
    env,
    tenantId,
    runId: approval.run_id,
    stepId: approval.step_id,
    traceId: run?.trace_id ?? meta.trace_id,
    eventType: "approval_decided",
    actorType: "human",
    actorRef: subjectId,
    payload: {
      approval_id: approvalId,
      policy_id: approval.policy_id,
      decision: body.decision,
      reason_code: body.reason_code ?? null,
    },
    createdAt: timestamp,
  });

  const approvalStub = env.APPROVAL_SESSION.get(env.APPROVAL_SESSION.idFromName(approvalId));
  const decisionResponse = await approvalStub.fetch("https://approval-session.internal/decide", {
    method: "POST",
    body: JSON.stringify(signal),
  });
  if (decisionResponse.status === 409) {
    throw new ApiError(409, "approval_already_decided", "Approval has already been decided");
  }

  const instance = await env.RUN_WORKFLOW.get(approval.run_id);
  await instance.sendEvent({
    type: "approval.decision",
    payload: signal,
  });

  await putIdempotencyRecord({
    env,
    tenantId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "approval_decision",
    resourceId: approvalId,
  });

  return json(
    {
      approval_id: approvalId,
      status: body.decision,
      run_id: approval.run_id,
      workflow_signal_status: "accepted",
      decided_at: timestamp,
    },
    {
      ...meta,
      trace_id: run?.trace_id ?? meta.trace_id,
    },
  );
}

async function replayRun(request: Request, env: Env, sourceRunId: string): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const subjectId = getSubjectId(request, env);
  const idempotencyKey = requireIdempotencyKey(request);
  const replay = await readJson<ReplayRunRequest>(request);
  const replayMode = replay.mode ?? "from_input";
  if (replay.mode !== undefined && replay.mode !== "from_input" && replay.mode !== "from_step") {
    throw new ApiError(400, "invalid_request", "Replay mode must be from_input or from_step");
  }
  const sourceRun = await getRun(env, tenantId, sourceRunId);
  if (!sourceRun) {
    throw new ApiError(404, "run_not_found", "Run does not exist in current tenant");
  }

  const routeKey = `POST:/api/v1/runs/${sourceRunId}/replay`;
  const payloadHash = await hashPayload(replay);
  const existing = await getIdempotencyRecord(env, tenantId, routeKey, idempotencyKey);
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }
    const run = await getRun(env, tenantId, existing.resource_id);
    if (!run) {
      throw new ApiError(404, "run_not_found", "Existing replay run no longer exists");
    }
    return json(
      {
        run_id: run.run_id,
        replay_source_run_id: sourceRunId,
        status: run.status,
        workflow_status: await getWorkflowStatus(env, run.workflow_instance_id),
        replay_mode: replayMode,
        created_at: run.created_at,
      },
      {
        ...buildMeta(request),
        trace_id: run.trace_id,
      },
    );
  }

  await enforceWorkspaceRunPlanLimit(env, tenantId);
  await enforceReplayRateLimit(env, tenantId);

  const sourceInput = await env.ARTIFACTS_BUCKET.get(sourceRun.input_blob_key);
  if (!sourceInput) {
    throw new ApiError(500, "internal_error", "Replay source input is missing from artifact storage");
  }

  const sourceBody = (await sourceInput.json()) as RunCreateRequest;
  const replayEntryAgentId = replay.overrides?.entry_agent_id ?? sourceBody.entry_agent_id;
  const replayStart = await resolveReplayStart(request, env, tenantId, sourceRunId, sourceRun, replayMode, replay);

  const replayBody = await normalizeRunCreateRequest(env, tenantId, {
    ...sourceBody,
    ...(replayEntryAgentId ? { entry_agent_id: replayEntryAgentId } : {}),
    context: {
      ...(sourceBody.context ?? {}),
      replay: {
        source_run_id: sourceRunId,
        reason: replay.reason ?? null,
        mode: replayMode,
        from_step_id: replayStart?.requestedStepId ?? null,
        from_step_type: replayStart?.requestedStepType ?? null,
        anchor_step_id: replayStart?.anchorStepId ?? null,
        anchor_step_type: replayStart?.anchorStepType ?? null,
        start_phase: replayStart?.startPhase ?? null,
        policy_version: replay.overrides?.policy_version ?? null,
      },
    },
  });

  const meta = buildMeta(request);
  const launched = await launchRun({
    env,
    tenantId,
    traceId: meta.trace_id,
    subjectId,
    body: replayBody,
    parentRunId: sourceRunId,
    replaySourceRunId: sourceRunId,
  });

  await putIdempotencyRecord({
    env,
    tenantId,
    routeKey,
    idempotencyKey,
    payloadHash,
    resourceType: "run",
    resourceId: launched.runId,
  });

  const workspace = await getWorkspaceByTenantId(env, tenantId);
  if (workspace) {
    const subscription = await getWorkspacePlanSubscription(env, workspace.workspace_id);
    await recordUsageLedgerEvent({
      env,
      workspace,
      subscription,
      meterName: "replays_created",
      quantity: 1,
      sourceType: "run_replay",
      sourceId: launched.runId,
      metadata: {
        replay_source_run_id: sourceRunId,
        replay_mode: replayMode,
      },
      createdAt: launched.createdAt,
    });
  }

  return json(
    {
      run_id: launched.runId,
      replay_source_run_id: sourceRunId,
      status: "queued",
      workflow_status: "running",
      replay_mode: replayMode,
      replay_from_step_id: replayStart?.requestedStepId ?? null,
      created_at: launched.createdAt,
    },
    meta,
    { status: 201 },
  );
}

async function resolveReplayStart(
  _request: Request,
  env: Env,
  tenantId: string,
  sourceRunId: string,
  sourceRun: RunRow,
  replayMode: ReplayRunRequest["mode"] | "from_input",
  replay: ReplayRunRequest,
): Promise<{
  requestedStepId: string;
  requestedStepType: string;
  anchorStepId: string;
  anchorStepType: string;
  startPhase: "planner" | "approval_wait" | "a2a_dispatch";
} | null> {
  if (replayMode !== "from_step") {
    return null;
  }

  const requestedStepId = replay.from_step_id ?? sourceRun.current_step_id;
  if (!requestedStepId) {
    throw new ApiError(
      409,
      "invalid_state_transition",
      "Replay from_step requires from_step_id or a source run current_step_id",
    );
  }

  const sourceStep = await env.DB.prepare(
    `SELECT step_id, step_type, sequence_no
       FROM run_steps
      WHERE tenant_id = ?1 AND run_id = ?2 AND step_id = ?3`,
  )
    .bind(tenantId, sourceRunId, requestedStepId)
    .first<{ step_id: string; step_type: string; sequence_no: number }>();
  if (!sourceStep) {
    throw new ApiError(400, "invalid_request", "Replay from_step_id does not exist on source run");
  }

  const startPhase = resolveReplayStartPhase(sourceStep.step_type);
  if (startPhase) {
    return {
      requestedStepId: sourceStep.step_id,
      requestedStepType: sourceStep.step_type,
      anchorStepId: sourceStep.step_id,
      anchorStepType: sourceStep.step_type,
      startPhase,
    };
  }

  const anchorStep = await env.DB.prepare(
    `SELECT step_id, step_type
       FROM run_steps
      WHERE tenant_id = ?1
        AND run_id = ?2
        AND sequence_no < ?3
        AND step_type IN ('planner', 'approval_wait', 'a2a_dispatch')
      ORDER BY sequence_no DESC
      LIMIT 1`,
  )
    .bind(tenantId, sourceRunId, sourceStep.sequence_no)
    .first<{ step_id: string; step_type: string }>();
  const anchorStartPhase = anchorStep ? resolveReplayStartPhase(anchorStep.step_type) : null;
  if (!anchorStep || !anchorStartPhase) {
    throw new ApiError(
      409,
      "invalid_state_transition",
      `Replay from step type ${sourceStep.step_type} has no workflow-native rewind anchor`,
    );
  }

  return {
    requestedStepId: sourceStep.step_id,
    requestedStepType: sourceStep.step_type,
    anchorStepId: anchorStep.step_id,
    anchorStepType: anchorStep.step_type,
    startPhase: anchorStartPhase,
  };
}

function resolveReplayStartPhase(stepType: string): "planner" | "approval_wait" | "a2a_dispatch" | null {
  if (stepType === "planner") {
    return "planner";
  }
  if (stepType === "approval_wait") {
    return "approval_wait";
  }
  if (stepType === "a2a_dispatch") {
    return "a2a_dispatch";
  }
  return null;
}

async function getWorkflowStatus(env: Env, runId: string): Promise<string> {
  try {
    const instance = await env.RUN_WORKFLOW.get(runId);
    const status = await instance.status();
    return status.status;
  } catch {
    return "unknown";
  }
}

async function normalizeRunCreateRequest(
  env: Env,
  tenantId: string,
  body: RunCreateRequest,
): Promise<RunCreateRequest> {
  if (!body.input || !body.input.kind) {
    throw new ApiError(400, "invalid_request", "Missing input.kind");
  }

  return {
    ...body,
    context: await normalizeRunContext(env, tenantId, body.context),
  };
}

async function normalizeRunContext(
  env: Env,
  tenantId: string,
  context: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  if (context === undefined) {
    return {};
  }

  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw new ApiError(400, "invalid_request", "context must be an object");
  }

  const normalized = { ...context };
  if ("a2a_dispatch" in context) {
    normalized.a2a_dispatch = await normalizeOutboundDispatchContext(env, tenantId, context.a2a_dispatch);
  }

  return normalized;
}

async function normalizeOutboundDispatchContext(
  env: Env,
  tenantId: string,
  value: unknown,
): Promise<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_request", "context.a2a_dispatch must be an object");
  }

  const candidate = value as Record<string, unknown>;
  const toolProviderId = normalizeAliasedStringField(candidate, "tool_provider_id", "provider_id");
  const agentId = normalizeRequiredAliasedStringField(
    candidate,
    "agent_id",
    "target_agent_id",
    "context.a2a_dispatch.agent_id",
  );
  const endpointUrl =
    candidate.endpoint_url === undefined
      ? null
      : normalizeRequiredString(candidate.endpoint_url, "context.a2a_dispatch.endpoint_url");
  const authRef =
    candidate.auth_ref === undefined
      ? undefined
      : normalizeAuthRefInput(
          normalizeRequiredString(candidate.auth_ref, "context.a2a_dispatch.auth_ref"),
          "context.a2a_dispatch.auth_ref",
        );
  const taskId =
    candidate.task_id === undefined
      ? undefined
      : normalizeRequiredString(candidate.task_id, "context.a2a_dispatch.task_id");
  const messageText =
    candidate.message_text === undefined
      ? undefined
      : normalizeRequiredString(candidate.message_text, "context.a2a_dispatch.message_text");
  const waitForCompletion =
    candidate.wait_for_completion === undefined
      ? undefined
      : normalizeBooleanField(candidate.wait_for_completion, "context.a2a_dispatch.wait_for_completion");
  const metadata =
    candidate.metadata === undefined
      ? undefined
      : normalizeObjectField(candidate.metadata, "context.a2a_dispatch.metadata");

  if (toolProviderId) {
    if (endpointUrl !== null || authRef !== undefined) {
      throw new ApiError(
        400,
        "invalid_request",
        "context.a2a_dispatch.endpoint_url/auth_ref are resolved server-side when tool_provider_id is provided",
      );
    }

    const provider = await getToolProvider(env, tenantId, toolProviderId);
    if (!provider) {
      throw new ApiError(404, "tool_provider_not_found", "Tool provider does not exist in current tenant");
    }
    if (provider.status !== "active") {
      throw new ApiError(422, "policy_denied", "Tool provider is disabled in current tenant");
    }
    if (provider.provider_type !== "http_api") {
      throw new ApiError(
        400,
        "invalid_request",
        "context.a2a_dispatch.tool_provider_id must reference an active http_api tool provider",
      );
    }

    validateResolvedOutboundEndpoint(provider.endpoint_url);

    return {
      tool_provider_id: provider.tool_provider_id,
      provider_type: provider.provider_type,
      endpoint_url: provider.endpoint_url,
      agent_id: agentId,
      ...(provider.auth_ref ? { auth_ref: provider.auth_ref } : {}),
      ...(taskId ? { task_id: taskId } : {}),
      ...(messageText ? { message_text: messageText } : {}),
      ...(typeof waitForCompletion === "boolean" ? { wait_for_completion: waitForCompletion } : {}),
      ...(metadata ? { metadata } : {}),
    };
  }

  if (endpointUrl === null) {
    throw new ApiError(
      400,
      "invalid_request",
      "context.a2a_dispatch.endpoint_url is required when tool_provider_id is not provided",
    );
  }

  validateDirectOutboundEndpoint(endpointUrl);

  return {
    endpoint_url: endpointUrl,
    agent_id: agentId,
    ...(authRef ? { auth_ref: authRef } : {}),
    ...(taskId ? { task_id: taskId } : {}),
    ...(messageText ? { message_text: messageText } : {}),
    ...(typeof waitForCompletion === "boolean" ? { wait_for_completion: waitForCompletion } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function normalizeAliasedStringField(
  source: Record<string, unknown>,
  primaryKey: string,
  aliasKey: string,
): string | null {
  const primary = source[primaryKey];
  const alias = source[aliasKey];

  if (primary === undefined && alias === undefined) {
    return null;
  }

  const normalizedPrimary =
    primary === undefined ? null : normalizeRequiredString(primary, `context.a2a_dispatch.${primaryKey}`);
  const normalizedAlias =
    alias === undefined ? null : normalizeRequiredString(alias, `context.a2a_dispatch.${aliasKey}`);

  if (normalizedPrimary && normalizedAlias && normalizedPrimary !== normalizedAlias) {
    throw new ApiError(
      400,
      "invalid_request",
      `context.a2a_dispatch.${primaryKey} and ${aliasKey} must match when both are provided`,
    );
  }

  return normalizedPrimary ?? normalizedAlias;
}

function normalizeRequiredAliasedStringField(
  source: Record<string, unknown>,
  primaryKey: string,
  aliasKey: string,
  fieldName: string,
): string {
  const value = normalizeAliasedStringField(source, primaryKey, aliasKey);
  if (!value) {
    throw new ApiError(400, "invalid_request", `${fieldName} is required`);
  }
  return value;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a non-empty string`);
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a non-empty string`);
  }

  return trimmed;
}

function normalizeBooleanField(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ApiError(400, "invalid_request", `${fieldName} must be a boolean`);
  }
  return value;
}

function normalizeObjectField(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_request", `${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function validateDirectOutboundEndpoint(endpointUrl: string): void {
  const scheme = getOutboundEndpointScheme(endpointUrl);
  if (scheme === "mock" || scheme === "demo") {
    return;
  }

  if (scheme === "http" || scheme === "https") {
    throw new ApiError(
      400,
      "invalid_request",
      "context.a2a_dispatch.tool_provider_id is required for http(s) outbound endpoints",
    );
  }

  throw new ApiError(
    400,
    "invalid_request",
    "context.a2a_dispatch.endpoint_url must use mock:// or demo:// unless tool_provider_id is provided",
  );
}

function validateResolvedOutboundEndpoint(endpointUrl: string): void {
  const scheme = getOutboundEndpointScheme(endpointUrl);
  if (scheme === "https" || scheme === "mock" || scheme === "demo") {
    return;
  }

  throw new ApiError(
    400,
    "invalid_request",
    "Resolved outbound endpoint must use mock://, demo://, or https://",
  );
}

function getOutboundEndpointScheme(endpointUrl: string): "mock" | "demo" | "http" | "https" | null {
  if (endpointUrl.startsWith("mock://")) {
    return "mock";
  }
  if (endpointUrl.startsWith("demo://")) {
    return "demo";
  }

  try {
    const url = new URL(endpointUrl);
    if (url.protocol === "http:") {
      return "http";
    }
    if (url.protocol === "https:") {
      return "https";
    }
  } catch {
    return null;
  }

  return null;
}

function normalizePolicyCreateRequest(body: PolicyCreateRequest): {
  policy_id?: string;
  channel: string;
  scope: {
    tool_provider_id?: string;
    tool_name?: string;
  };
  conditions: PolicyConditions;
  decision: PolicyDecision;
  approval_config: PolicyApprovalConfig;
  priority: number;
  status: PolicyStatus;
} {
  if (!body.channel || body.channel.trim() === "") {
    throw new ApiError(400, "invalid_request", "Policy channel is required");
  }

  if (!body.decision || !["allow", "deny", "approval_required"].includes(body.decision)) {
    throw new ApiError(400, "invalid_request", "Policy decision must be allow, deny, or approval_required");
  }

  const priority = body.priority ?? 0;
  if (!Number.isInteger(priority) || priority < 0) {
    throw new ApiError(400, "invalid_request", "Policy priority must be a non-negative integer");
  }

  const status = body.status ?? "active";
  if (status !== "active" && status !== "disabled") {
    throw new ApiError(400, "invalid_request", "Policy status must be active or disabled");
  }

  const scope = normalizePolicyScope(body.scope);
  const conditions = normalizePolicyConditions(body.conditions);
  const approvalConfig = normalizePolicyApprovalConfig(body.approval_config);

  if (body.policy_id !== undefined && body.policy_id.trim() === "") {
    throw new ApiError(400, "invalid_request", "policy_id must not be empty");
  }

  return {
    ...(body.policy_id ? { policy_id: body.policy_id } : {}),
    channel: body.channel.trim(),
    scope,
    conditions,
    decision: body.decision,
    approval_config: approvalConfig,
    priority,
    status,
  };
}

function normalizePolicyUpdateRequest(body: PolicyUpdateRequest): {
  channel?: string;
  scope?: {
    tool_provider_id?: string;
    tool_name?: string;
  };
  conditions?: PolicyConditions;
  decision?: PolicyDecision;
  approval_config?: PolicyApprovalConfig;
  priority?: number;
  status?: PolicyStatus;
} {
  const normalized: {
    channel?: string;
    scope?: {
      tool_provider_id?: string;
      tool_name?: string;
    };
    conditions?: PolicyConditions;
    decision?: PolicyDecision;
    approval_config?: PolicyApprovalConfig;
    priority?: number;
    status?: PolicyStatus;
  } = {};

  if (body.channel !== undefined) {
    const value = body.channel.trim();
    if (value === "") {
      throw new ApiError(400, "invalid_request", "Policy channel must not be empty");
    }
    normalized.channel = value;
  }

  if (body.scope !== undefined) {
    normalized.scope = normalizePolicyScope(body.scope);
  }

  if (body.conditions !== undefined) {
    normalized.conditions = normalizePolicyConditions(body.conditions);
  }

  if (body.decision !== undefined) {
    if (!["allow", "deny", "approval_required"].includes(body.decision)) {
      throw new ApiError(400, "invalid_request", "Policy decision must be allow, deny, or approval_required");
    }
    normalized.decision = body.decision;
  }

  if (body.approval_config !== undefined) {
    normalized.approval_config = normalizePolicyApprovalConfig(body.approval_config);
  }

  if (body.priority !== undefined) {
    if (!Number.isInteger(body.priority) || body.priority < 0) {
      throw new ApiError(400, "invalid_request", "Policy priority must be a non-negative integer");
    }
    normalized.priority = body.priority;
  }

  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "disabled") {
      throw new ApiError(400, "invalid_request", "Policy status must be active or disabled");
    }
    normalized.status = body.status;
  }

  if (Object.keys(normalized).length === 0) {
    throw new ApiError(400, "invalid_request", "At least one policy field must be provided");
  }

  return normalized;
}

function normalizePolicyScope(scope: PolicyCreateRequest["scope"]): {
  tool_provider_id?: string;
  tool_name?: string;
} {
  const normalized: {
    tool_provider_id?: string;
    tool_name?: string;
  } = {};

  if (scope?.tool_provider_id !== undefined) {
    const value = scope.tool_provider_id.trim();
    if (value === "") {
      throw new ApiError(400, "invalid_request", "scope.tool_provider_id must not be empty");
    }
    normalized.tool_provider_id = value;
  }

  if (scope?.tool_name !== undefined) {
    const value = scope.tool_name.trim();
    if (value === "") {
      throw new ApiError(400, "invalid_request", "scope.tool_name must not be empty");
    }
    normalized.tool_name = value;
  }

  return normalized;
}

function normalizePolicyConditions(conditions: PolicyConditions | undefined): PolicyConditions {
  if (!conditions) {
    return {};
  }

  const normalized: PolicyConditions = {};
  if (conditions.risk_level !== undefined) {
    if (!["low", "medium", "high"].includes(conditions.risk_level)) {
      throw new ApiError(400, "invalid_request", "conditions.risk_level must be low, medium, or high");
    }
    normalized.risk_level = conditions.risk_level;
  }

  if (conditions.target_classification !== undefined) {
    if (!["internal", "external", "restricted"].includes(conditions.target_classification)) {
      throw new ApiError(400, "invalid_request", "conditions.target_classification must be internal, external, or restricted");
    }
    normalized.target_classification = conditions.target_classification;
  }

  if (conditions.labels !== undefined) {
    if (!Array.isArray(conditions.labels) || !conditions.labels.every((label) => typeof label === "string" && label.trim() !== "")) {
      throw new ApiError(400, "invalid_request", "conditions.labels must be an array of non-empty strings");
    }
    normalized.labels = conditions.labels.map((label) => label.trim());
  }

  return normalized;
}

function normalizePolicyApprovalConfig(config: PolicyApprovalConfig | undefined): PolicyApprovalConfig {
  if (!config) {
    return {};
  }

  const normalized: PolicyApprovalConfig = {};
  if (config.approver_roles !== undefined) {
    if (!Array.isArray(config.approver_roles) || !config.approver_roles.every((role) => typeof role === "string" && role.trim() !== "")) {
      throw new ApiError(400, "invalid_request", "approval_config.approver_roles must be an array of non-empty strings");
    }
    normalized.approver_roles = config.approver_roles.map((role) => role.trim());
  }

  if (config.timeout_seconds !== undefined) {
    if (!Number.isInteger(config.timeout_seconds) || config.timeout_seconds <= 0) {
      throw new ApiError(400, "invalid_request", "approval_config.timeout_seconds must be a positive integer");
    }
    normalized.timeout_seconds = config.timeout_seconds;
  }

  return normalized;
}

function normalizeToolProviderCreateRequest(body: ToolProviderCreateRequest): {
  tool_provider_id?: string;
  name: string;
  provider_type: ToolProviderType;
  endpoint_url: string;
  auth_ref: string | null;
  visibility_policy_ref: string | null;
  execution_policy_ref: string | null;
  status: ToolProviderStatus;
} {
  if (!body.name || body.name.trim() === "") {
    throw new ApiError(400, "invalid_request", "Tool provider name is required");
  }

  if (
    !body.provider_type ||
    !["mcp_server", "mcp_portal", "http_api"].includes(body.provider_type)
  ) {
    throw new ApiError(400, "invalid_request", "provider_type must be mcp_server, mcp_portal, or http_api");
  }

  if (!body.endpoint_url || body.endpoint_url.trim() === "") {
    throw new ApiError(400, "invalid_request", "endpoint_url is required");
  }

  const status = body.status ?? "active";
  if (status !== "active" && status !== "disabled") {
    throw new ApiError(400, "invalid_request", "Tool provider status must be active or disabled");
  }

  if (body.tool_provider_id !== undefined && body.tool_provider_id.trim() === "") {
    throw new ApiError(400, "invalid_request", "tool_provider_id must not be empty");
  }

  return {
    ...(body.tool_provider_id !== undefined ? { tool_provider_id: body.tool_provider_id.trim() } : {}),
    name: body.name.trim(),
    provider_type: body.provider_type,
    endpoint_url: normalizeToolProviderEndpoint(body.provider_type, body.endpoint_url.trim()),
    auth_ref: normalizeNullableReference(body.auth_ref),
    visibility_policy_ref: normalizeNullableReference(body.visibility_policy_ref),
    execution_policy_ref: normalizeNullableReference(body.execution_policy_ref),
    status,
  };
}

function normalizeToolProviderUpdateRequest(body: ToolProviderUpdateRequest): {
  name?: string;
  provider_type?: ToolProviderType;
  endpoint_url?: string;
  auth_ref?: string | null;
  visibility_policy_ref?: string | null;
  execution_policy_ref?: string | null;
  status?: ToolProviderStatus;
} {
  const normalized: {
    name?: string;
    provider_type?: ToolProviderType;
    endpoint_url?: string;
    auth_ref?: string | null;
    visibility_policy_ref?: string | null;
    execution_policy_ref?: string | null;
    status?: ToolProviderStatus;
  } = {};

  if (body.name !== undefined) {
    const value = body.name.trim();
    if (value === "") {
      throw new ApiError(400, "invalid_request", "Tool provider name must not be empty");
    }
    normalized.name = value;
  }

  if (body.provider_type !== undefined) {
    if (!["mcp_server", "mcp_portal", "http_api"].includes(body.provider_type)) {
      throw new ApiError(400, "invalid_request", "provider_type must be mcp_server, mcp_portal, or http_api");
    }
    normalized.provider_type = body.provider_type;
  }

  if (body.endpoint_url !== undefined) {
    const value = body.endpoint_url.trim();
    if (value === "") {
      throw new ApiError(400, "invalid_request", "endpoint_url must not be empty");
    }
    normalized.endpoint_url = value;
  }

  if (body.auth_ref !== undefined) {
    normalized.auth_ref = normalizeNullableReference(body.auth_ref);
  }

  if (body.visibility_policy_ref !== undefined) {
    normalized.visibility_policy_ref = normalizeNullableReference(body.visibility_policy_ref);
  }

  if (body.execution_policy_ref !== undefined) {
    normalized.execution_policy_ref = normalizeNullableReference(body.execution_policy_ref);
  }

  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "disabled") {
      throw new ApiError(400, "invalid_request", "Tool provider status must be active or disabled");
    }
    normalized.status = body.status;
  }

  if (Object.keys(normalized).length === 0) {
    throw new ApiError(400, "invalid_request", "At least one tool provider field must be provided");
  }

  return normalized;
}

function normalizeToolProviderEndpoint(
  providerType: ToolProviderType,
  endpointUrl: string,
): string {
  if (providerType === "http_api") {
    validateResolvedOutboundEndpoint(endpointUrl);
  }
  return endpointUrl;
}

function normalizeNullableReference(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  return trimmed;
}

function normalizeAuthRefInput(value: string | null | undefined, fieldPath: string): string | null {
  try {
    return normalizeAuthRef(value);
  } catch (error) {
    if (error instanceof ApiError && error.code === "upstream_auth_invalid") {
      throw new ApiError(400, "invalid_request", `${fieldPath} is invalid: ${error.message}`, error.details);
    }
    throw error;
  }
}

function serializePolicy(policy: PolicyRow): {
  policy_id: string;
  tenant_id: string;
  channel: string;
  scope: {
    tool_provider_id: string | null;
    tool_name: string | null;
  };
  decision: PolicyDecision;
  priority: number;
  status: PolicyStatus;
  conditions: PolicyConditions;
  approval_config: PolicyApprovalConfig;
  created_at: string;
  updated_at: string;
} {
  const parsedApprovalConfig = safeParseApprovalConfig(policy.approval_config_json);
  if (parsedApprovalConfig.approver_roles === undefined) {
    const rowRoles = safeParseStringArray(policy.approver_roles_json);
    if (rowRoles.length > 0) {
      parsedApprovalConfig.approver_roles = rowRoles;
    }
  }

  return {
    policy_id: policy.policy_id,
    tenant_id: policy.tenant_id,
    channel: policy.channel,
    scope: {
      tool_provider_id: policy.tool_provider_id,
      tool_name: policy.tool_name,
    },
    decision: policy.decision,
    priority: policy.priority,
    status: policy.status,
    conditions: safeParsePolicyConditions(policy.conditions_json),
    approval_config: parsedApprovalConfig,
    created_at: policy.created_at,
    updated_at: policy.updated_at,
  };
}

function serializeToolProvider(provider: ToolProviderRow): {
  tool_provider_id: string;
  tenant_id: string;
  name: string;
  provider_type: ToolProviderType;
  endpoint_url: string;
  auth_ref: string | null;
  visibility_policy_ref: string | null;
  execution_policy_ref: string | null;
  status: ToolProviderStatus;
  created_at: string;
  updated_at: string;
} {
  return {
    tool_provider_id: provider.tool_provider_id,
    tenant_id: provider.tenant_id,
    name: provider.name,
    provider_type: provider.provider_type,
    endpoint_url: provider.endpoint_url,
    auth_ref: provider.auth_ref,
    visibility_policy_ref: provider.visibility_policy_ref,
    execution_policy_ref: provider.execution_policy_ref,
    status: provider.status,
    created_at: provider.created_at,
    updated_at: provider.updated_at,
  };
}

function serializeArtifact(artifact: ArtifactRow): {
  artifact_id: string;
  run_id: string;
  step_id: string | null;
  artifact_type: string;
  mime_type: string;
  r2_key: string;
  sha256: string | null;
  size_bytes: number | null;
  created_at: string;
} {
  return {
    artifact_id: artifact.artifact_id,
    run_id: artifact.run_id,
    step_id: artifact.step_id,
    artifact_type: artifact.artifact_type,
    mime_type: artifact.mime_type,
    r2_key: artifact.r2_key,
    sha256: artifact.sha256,
    size_bytes: artifact.size_bytes,
    created_at: artifact.created_at,
  };
}

function safeParsePolicyConditions(raw: string): PolicyConditions {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const candidate = parsed as Record<string, unknown>;
    const conditions: PolicyConditions = {};
    if (candidate.risk_level === "low" || candidate.risk_level === "medium" || candidate.risk_level === "high") {
      conditions.risk_level = candidate.risk_level;
    }
    if (
      candidate.target_classification === "internal" ||
      candidate.target_classification === "external" ||
      candidate.target_classification === "restricted"
    ) {
      conditions.target_classification = candidate.target_classification;
    }
    if (Array.isArray(candidate.labels)) {
      conditions.labels = candidate.labels.filter((value): value is string => typeof value === "string");
    }
    return conditions;
  } catch {
    return {};
  }
}

function safeParseApprovalConfig(raw: string): PolicyApprovalConfig {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const candidate = parsed as Record<string, unknown>;
    const config: PolicyApprovalConfig = {};
    if (Array.isArray(candidate.approver_roles)) {
      config.approver_roles = candidate.approver_roles.filter((value): value is string => typeof value === "string");
    }
    if (typeof candidate.timeout_seconds === "number" && candidate.timeout_seconds > 0) {
      config.timeout_seconds = candidate.timeout_seconds;
    }
    return config;
  } catch {
    return {};
  }
}

function safeParseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function safeParseDeliveryEvidenceLinks(raw: string): Array<{ label: string; url: string }> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return null;
        }

        const candidate = item as Record<string, unknown>;
        const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
        const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
        if (!label || !url) {
          return null;
        }

        return { label, url };
      })
      .filter((item): item is { label: string; url: string } => item !== null);
  } catch {
    return [];
  }
}

function serializeAuditEvent(event: {
  event_id: string;
  run_id: string;
  step_id: string | null;
  trace_id: string;
  event_type: string;
  actor_type: string;
  actor_ref: string | null;
  payload_json: string;
  created_at: string;
}): {
  event_id: string;
  run_id: string;
  step_id: string | null;
  trace_id: string;
  event_type: string;
  actor: {
    type: string;
    ref: string | null;
  };
  payload: Record<string, unknown>;
  created_at: string;
} {
  return {
    event_id: event.event_id,
    run_id: event.run_id,
    step_id: event.step_id,
    trace_id: event.trace_id,
    event_type: event.event_type,
    actor: {
      type: event.actor_type,
      ref: event.actor_ref,
    },
    payload: safeParseJsonObject(event.payload_json),
    created_at: event.created_at,
  };
}

function safeParseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function shouldIncludeArtifactBody(request: Request): boolean {
  const value = new URL(request.url).searchParams.get("include_body");
  return value === "true" || value === "1";
}

function parseRunGraphQuery(request: Request): {
  includePayloads: boolean;
  pageSize: number;
  cursor: string | null;
} {
  const params = new URL(request.url).searchParams;
  const includePayloads = params.get("include_payloads") === "true" || params.get("include_payloads") === "1";
  const pageSizeParam = params.get("page_size");
  const pageSize = pageSizeParam === null || pageSizeParam === "" ? 100 : Number(pageSizeParam);
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new ApiError(400, "invalid_request", "page_size must be a positive integer");
  }

  const cursor = params.get("cursor");
  return {
    includePayloads,
    pageSize,
    cursor,
  };
}

function parsePageQuery(request: Request): {
  pageSize: number;
  cursor: string | null;
} {
  const params = new URL(request.url).searchParams;
  const pageSizeParam = params.get("page_size");
  const pageSize = pageSizeParam === null || pageSizeParam === "" ? 100 : Number(pageSizeParam);
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new ApiError(400, "invalid_request", "page_size must be a positive integer");
  }

  return {
    pageSize,
    cursor: params.get("cursor"),
  };
}

function parseArtifactBody(mimeType: string, raw: string): unknown {
  if (mimeType.includes("json")) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function isAuditEventEnvelope(value: unknown): value is AuditEventEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.message_type === "audit_event" &&
    typeof candidate.dedupe_key === "string" &&
    typeof candidate.event_id === "string" &&
    typeof candidate.tenant_id === "string" &&
    typeof candidate.run_id === "string" &&
    typeof candidate.trace_id === "string" &&
    typeof candidate.event_type === "string" &&
    typeof candidate.created_at === "string" &&
    candidate.actor !== null &&
    typeof candidate.actor === "object" &&
    !Array.isArray(candidate.actor) &&
    candidate.payload !== null &&
    typeof candidate.payload === "object" &&
    !Array.isArray(candidate.payload)
  );
}

function assertApprovalScope(
  subjectId: string,
  subjectRoles: string[],
  approverScopeJson: string,
): void {
  const scope = safeParseJsonObject(approverScopeJson);
  const requiredRoles = Array.isArray(scope.approver_roles)
    ? scope.approver_roles.filter((value): value is string => typeof value === "string" && value.trim() !== "")
    : [];

  if (requiredRoles.length === 0) {
    return;
  }

  if (subjectId === "anonymous") {
    throw new ApiError(403, "tenant_access_denied", "Approval decision requires an authenticated approver");
  }

  const subjectRoleSet = new Set(subjectRoles);
  const hasRequiredRole = requiredRoles.some((role) => subjectRoleSet.has(role));
  if (!hasRequiredRole) {
    throw new ApiError(403, "tenant_access_denied", "Approver does not satisfy approval scope", {
      required_roles: requiredRoles,
    });
  }
}
