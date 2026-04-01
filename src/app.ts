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
import { listRunAuditEvents, recordAuditEvent } from "./lib/audit.js";
import { normalizeAuthRef } from "./lib/auth.js";
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
  ApiError,
  buildMeta,
  enforceNorthboundAccess,
  errorResponse,
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
  ApprovalDecisionRequest,
  ApprovalDecisionSignal,
  ArtifactRow,
  AuditEventEnvelope,
  PolicyApprovalConfig,
  PolicyConditions,
  PolicyCreateRequest,
  PolicyDecision,
  PolicyRow,
  PolicyStatus,
  PolicyUpdateRequest,
  RunRow,
  ToolProviderCreateRequest,
  ToolProviderRow,
  ToolProviderStatus,
  ToolProviderType,
  ToolProviderUpdateRequest,
  ReplayRunRequest,
  RunCreateRequest,
} from "./types.js";

const API_BASE = "/api/v1";

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

  if (url.pathname.startsWith(`${API_BASE}/`)) {
    enforceNorthboundAccess(request, env);
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
      service: "agent-control-plane",
      version: "0.1.0",
      now: nowIso(),
    },
    buildMeta(request),
  );
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
