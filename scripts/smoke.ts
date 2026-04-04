import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import app from "../src/app.js";
import { handleA2AMessageStream } from "../src/a2a/inbound.js";
import { dispatchOutboundTask } from "../src/a2a/outbound.js";
import { seedDefaultCatalog } from "../src/lib/bootstrap.js";
import { listActivePolicies } from "../src/lib/db.js";
import { createId, hashPayload, nowIso } from "../src/lib/ids.js";
import type {
  A2AStatusSignal,
  ApiKeyRow,
  ApprovalDecisionSignal,
  AuditEventEnvelope,
  OutboundA2ADispatchConfig,
  PolicyConditions,
  PolicyDecision,
  PolicyRow,
  RunCreateRequest,
  RunWorkflowParams,
  ServiceAccountRow,
} from "../src/types.js";

const tenantId = "tenant_smoke";
type MockEnv = Env & {
  __workflow: MockWorkflowBinding;
  __queue: MockQueue;
  MCP_API_TOKEN: string;
  A2A_SHARED_KEY: string;
  NORTHBOUND_AUTH_MODE?: string;
  RATE_LIMIT_RUNS_PER_MINUTE?: string;
  RATE_LIMIT_REPLAYS_PER_MINUTE?: string;
};

let env: Awaited<ReturnType<typeof createMockEnv>>;

interface SmokePolicyEvaluationResult {
  channel: "a2a_dispatch" | "external_action";
  subjectType: "a2a_dispatch" | "external_action";
  subjectRef: string;
  decision: PolicyDecision;
  policyId: string | null;
  approverRoles: string[];
  timeoutSeconds: number;
  labels: string[];
  approvalPayloadTemplate?: Record<string, unknown> | null;
}

const DEFAULT_APPROVER_ROLES = ["legal_approver"];
const DEFAULT_EXTERNAL_POLICY_ID = "pol_default_external_send_v1";
const DEFAULT_A2A_POLICY_ID = "pol_default_a2a_dispatch_v1";
const DEFAULT_APPROVAL_TIMEOUT_SECONDS = 24 * 60 * 60;

async function main(): Promise<void> {
  env = await createMockEnv();
  try {
    await applyMigrations(env.DB);
    await seedDefaultCatalog(env.DB, tenantId);

    const health = await api("/api/v1/health");
    assert.equal(health.status, 200);
    assert.equal(health.json.data.ok, true);
    assert.equal(health.json.data.service, "govrail-control-plane");
    assert.equal(health.json.data.version, "0.1.0");

    const healthHead = await api("/api/v1/health", {
      method: "HEAD",
    });
    assert.equal(healthHead.status, 200);
    assert.deepEqual(healthHead.json, {});

    env.NORTHBOUND_AUTH_MODE = "trusted_edge";
    const trustedEdgeMissingIdentity = await api("/api/v1/tool-providers");
    assert.equal(trustedEdgeMissingIdentity.status, 401);
    assert.equal(trustedEdgeMissingIdentity.json.error.code, "unauthorized");

    const trustedEdgeRejectedOverride = await api("/api/v1/tool-providers", {
      headers: {
        "x-subject-id": "override_user",
      },
    });
    assert.equal(trustedEdgeRejectedOverride.status, 401);
    assert.equal(trustedEdgeRejectedOverride.json.error.code, "unauthorized");

    const trustedEdgeAccepted = await api("/api/v1/tool-providers", {
      headers: {
        "x-authenticated-subject": "platform_admin@example.com",
        "x-authenticated-roles": "platform_admin,legal_approver",
      },
    });
    assert.equal(trustedEdgeAccepted.status, 200);

    env.NORTHBOUND_AUTH_MODE = "permissive";

    const baseRunPayload = {
      input: {
        kind: "user_instruction",
        text: "請先等法務審批，再派發給遠端供應商分析 agent",
      },
      context: {
        a2a_dispatch: {
          endpoint_url: "mock://remote-agent",
          agent_id: "agent_remote_supplier_analysis",
          message_text: "請分析供應商報價差異",
          wait_for_completion: true,
        },
      },
      policy_context: {
        labels: ["external-send"],
      },
    };

    const created = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-1",
      },
      body: JSON.stringify(baseRunPayload),
    });
    assert.equal(created.status, 201);
    const firstRunId = created.json.data.run_id as string;

    const createdAgain = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-1",
      },
      body: JSON.stringify(baseRunPayload),
    });
    assert.equal(createdAgain.status, 200);
    assert.equal(createdAgain.json.data.run_id, firstRunId);

    const createdConflict = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-1",
      },
      body: JSON.stringify({
        ...baseRunPayload,
        input: {
          kind: "user_instruction",
          text: "different payload",
        },
      }),
    });
    assert.equal(createdConflict.status, 409);
    assert.equal(createdConflict.json.error.code, "idempotency_conflict");

    env.RATE_LIMIT_RUNS_PER_MINUTE = "1";
    const limitedRun = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-rate-limit-1",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "first rate limited run should pass",
        },
      }),
    });
    assert.equal(limitedRun.status, 201);

    const limitedRunAgain = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-rate-limit-1",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "first rate limited run should pass",
        },
      }),
    });
    assert.equal(limitedRunAgain.status, 200);

    const limitedRunBlocked = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-rate-limit-2",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "second distinct run should be blocked",
        },
      }),
    });
    assert.equal(limitedRunBlocked.status, 429);
    assert.equal(limitedRunBlocked.json.error.code, "rate_limited");
    assert.equal(limitedRunBlocked.json.error.details.scope, "runs_create");
    assert.equal(limitedRunBlocked.json.error.details.limit, 1);
    assert.ok((limitedRunBlocked.json.error.details.retry_after_seconds as number) >= 1);
    env.RATE_LIMIT_RUNS_PER_MINUTE = "0";

    await verifyWorkspaceApiKeyAuth();
    await verifyWorkspaceApiKeyScopeCoverage();
    await verifySaasWorkspaceCreateIdempotencyIncludesPlan();
    await verifyDisabledSaasWorkspaceIsHiddenAndBlocked();
    await verifyInactiveOrganizationMembershipBlocksWorkspaceAccess();
    await verifySaasInvitationRespectsSeatLimit();
    await verifySaasBootstrapRespectsToolProviderPlanLimit();
    await verifySaasUsagePeriodAndPlanLimitDetailsFollowSubscription();
    await verifySaasBootstrapPersistsOnboardingState();
    await verifySaasUserResolutionRequiresAuthIdentityMatch();
    await verifyDisabledWorkspaceInvitationCannotBeAccepted();
    await verifySaasUserResolutionDoesNotFallbackByEmail();

    const listedToolProviders = await api("/api/v1/tool-providers");
    assert.equal(listedToolProviders.status, 200);
    assert.ok(
      (listedToolProviders.json.data.items as Array<{ tool_provider_id: string }>).some(
        (provider) => provider.tool_provider_id === "tp_email",
      ),
    );

    const invalidToolProviderAuthRef = await api("/api/v1/tool-providers", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-tool-provider-invalid-auth-ref-1",
      },
      body: JSON.stringify({
        tool_provider_id: "tp_invalid_auth_ref",
        name: "Invalid Auth Ref",
        provider_type: "mcp_server",
        endpoint_url: "https://invalid-auth-ref.example.test/mcp",
        auth_ref: "header:X-Api-Key",
        status: "active",
      }),
    });
    assert.equal(invalidToolProviderAuthRef.status, 400);
    assert.equal(invalidToolProviderAuthRef.json.error.code, "invalid_request");
    assert.match(
      invalidToolProviderAuthRef.json.error.message,
      /tool_providers\.auth_ref is invalid/i,
    );

    const createdToolProvider = await api("/api/v1/tool-providers", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-tool-provider-1",
      },
      body: JSON.stringify({
        tool_provider_id: "tp_secure_admin",
        name: "Secure MCP Admin",
        provider_type: "mcp_server",
        endpoint_url: "https://secure-admin.example.test/mcp",
        auth_ref: "bearer:MCP_API_TOKEN",
        status: "active",
      }),
    });
    assert.equal(createdToolProvider.status, 201);
    assert.equal(createdToolProvider.json.data.tool_provider_id, "tp_secure_admin");
    assert.equal(createdToolProvider.json.data.auth_ref, "bearer:MCP_API_TOKEN");

    const invalidRunAuthRef = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-invalid-auth-ref-1",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "invalid auth ref should be rejected before dispatch",
        },
        context: {
          a2a_dispatch: {
            endpoint_url: "mock://remote-agent",
            agent_id: "agent_remote_supplier_analysis",
            auth_ref: "bearer:",
          },
        },
      }),
    });
    assert.equal(invalidRunAuthRef.status, 400);
    assert.equal(invalidRunAuthRef.json.error.code, "invalid_request");
    assert.match(
      invalidRunAuthRef.json.error.message,
      /context\.a2a_dispatch\.auth_ref is invalid/i,
    );

    const createdToolProviderAgain = await api("/api/v1/tool-providers", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-tool-provider-1",
      },
      body: JSON.stringify({
        tool_provider_id: "tp_secure_admin",
        name: "Secure MCP Admin",
        provider_type: "mcp_server",
        endpoint_url: "https://secure-admin.example.test/mcp",
        auth_ref: "bearer:MCP_API_TOKEN",
        status: "active",
      }),
    });
    assert.equal(createdToolProviderAgain.status, 200);
    assert.equal(createdToolProviderAgain.json.data.tool_provider_id, "tp_secure_admin");

    const disabledToolProvider = await api("/api/v1/tool-providers/tp_secure_admin:disable", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-tool-provider-disable-1",
      },
      body: JSON.stringify({}),
    });
    assert.equal(disabledToolProvider.status, 200);
    assert.equal(disabledToolProvider.json.data.status, "disabled");

    const listedDisabledToolProviders = await api("/api/v1/tool-providers?status=disabled");
    assert.equal(listedDisabledToolProviders.status, 200);
    assert.ok(
      (listedDisabledToolProviders.json.data.items as Array<{ tool_provider_id: string }>).some(
        (provider) => provider.tool_provider_id === "tp_secure_admin",
      ),
    );

    const fetchedToolProvider = await api("/api/v1/tool-providers/tp_secure_admin");
    assert.equal(fetchedToolProvider.status, 200);
    assert.equal(fetchedToolProvider.json.data.tool_provider_id, "tp_secure_admin");
    assert.equal(fetchedToolProvider.json.data.status, "disabled");

    const disabledProviderGet = await api("/api/v1/mcp/tp_secure_admin");
    assert.equal(disabledProviderGet.status, 422);
    assert.equal(disabledProviderGet.json.error.code, "policy_denied");

    const disabledProviderCall = await api("/api/v1/mcp/tp_secure_admin", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-tool-provider-disabled-call-1",
        "x-run-id": "run_missing_for_disabled_provider",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-disabled-provider",
        method: "tools/call",
        params: {
          name: "send_email",
          arguments: {
            to: ["vendor@example.com"],
            subject: "Disabled provider check",
            body: "blocked",
          },
        },
      }),
    });
    assert.equal(disabledProviderCall.status, 422);
    assert.equal(disabledProviderCall.json.error.code, "policy_denied");

    const updatedToolProvider = await api("/api/v1/tool-providers/tp_secure_admin", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-tool-provider-update-1",
      },
      body: JSON.stringify({
        endpoint_url: "https://secure-admin-updated.example.test/mcp",
        status: "active",
        auth_ref: "header:X-Api-Key:A2A_SHARED_KEY",
      }),
    });
    assert.equal(updatedToolProvider.status, 200);
    assert.equal(updatedToolProvider.json.data.endpoint_url, "https://secure-admin-updated.example.test/mcp");
    assert.equal(updatedToolProvider.json.data.status, "active");
    assert.equal(updatedToolProvider.json.data.auth_ref, "header:X-Api-Key:A2A_SHARED_KEY");

    const updatedToolProviderAgain = await api("/api/v1/tool-providers/tp_secure_admin", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-tool-provider-update-1",
      },
      body: JSON.stringify({
        endpoint_url: "https://secure-admin-updated.example.test/mcp",
        status: "active",
        auth_ref: "header:X-Api-Key:A2A_SHARED_KEY",
      }),
    });
    assert.equal(updatedToolProviderAgain.status, 200);
    assert.equal(updatedToolProviderAgain.json.data.endpoint_url, "https://secure-admin-updated.example.test/mcp");

    const waitingRun = await waitForRunStatus(firstRunId, "waiting_approval");
    const approvalId = waitingRun.pending_approval_id as string;
    assert.ok(approvalId);

    const unauthorizedApproval = await api(`/api/v1/approvals/${approvalId}/decision`, {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-approval-unauthorized-1",
        "x-subject-id": "user_procurement_1",
      },
      body: JSON.stringify({
        decision: "approved",
      }),
    });
    assert.equal(unauthorizedApproval.status, 403);
    assert.equal(unauthorizedApproval.json.error.code, "tenant_access_denied");

    const approved = await api(`/api/v1/approvals/${approvalId}/decision`, {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-approval-1",
        "x-subject-id": "user_legal_1",
        "x-subject-roles": "legal_approver",
      },
      body: JSON.stringify({
        decision: "approved",
        comment: "smoke approved",
      }),
    });
    assert.equal(approved.status, 200);

    const outboundTask = await findOutboundTask(firstRunId);
    assert.ok(outboundTask.task_id);

    const cancelCandidate = await createApprovedOutboundRun({
      key: "smoke-run-cancel",
      text: "請審批後派發，再取消這個 outbound 任務",
    });
    const cancelTask = await findOutboundTask(cancelCandidate.runId);
    const cancelled = await api(`/api/v1/a2a/tasks/${cancelTask.task_id}:cancel`, {
      method: "POST",
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.json.data.task_id, cancelTask.task_id);
    assert.equal(cancelled.json.data.status, "cancelled");
    const cancelledRun = await waitForRunStatus(cancelCandidate.runId, "cancelled");
    assert.equal(cancelledRun.status, "cancelled");

    const runCancelCandidate = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-cancel-direct",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "請等待審批，稍後直接取消整個 run",
        },
        policy_context: {
          labels: ["external-send"],
        },
      }),
    });
    assert.equal(runCancelCandidate.status, 201);
    const runCancelId = runCancelCandidate.json.data.run_id as string;
    const runCancelWaiting = await waitForRunStatus(runCancelId, "waiting_approval");
    const runCancelApprovalId = runCancelWaiting.pending_approval_id as string;
    const runCancel = await api(`/api/v1/runs/${runCancelId}:cancel`, {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-cancel-direct-1",
        "x-subject-id": "user_ops_1",
      },
    });
    assert.equal(runCancel.status, 200);
    const cancelledApprovalRow = await env.DB.prepare(
      `SELECT status
         FROM approvals
        WHERE tenant_id = ?1 AND approval_id = ?2`,
    )
      .bind(tenantId, runCancelApprovalId)
      .first<{ status: string }>();
    assert.equal(cancelledApprovalRow?.status, "cancelled");
    const cancelledRunDirect = await waitForRunStatus(runCancelId, "cancelled");
    assert.equal(cancelledRunDirect.status, "cancelled");
    const cancelledRunEvents = await api(`/api/v1/runs/${runCancelId}/events`);
    assert.equal(cancelledRunEvents.status, 200);
    assert.ok(
      (cancelledRunEvents.json.data.items as Array<{ event_type: string }>).some(
        (event) => event.event_type === "approval_cancelled",
      ),
    );

    const failedCandidate = await createApprovedOutboundRun({
      key: "smoke-run-failed",
      text: "請審批後派發，稍後讓遠端任務失敗",
    });
    const failedTask = await findOutboundTask(failedCandidate.runId);
    const webhookMissingTask = await api("/api/v1/a2a/webhooks/push", {
      method: "POST",
      body: JSON.stringify({
        status: "completed",
      }),
    });
    assert.equal(webhookMissingTask.status, 400);
    assert.equal(webhookMissingTask.json.error.code, "invalid_request");

    const webhookTaskNotFound = await api("/api/v1/a2a/webhooks/push", {
      method: "POST",
      body: JSON.stringify({
        task_id: "task_missing",
        status: "completed",
      }),
    });
    assert.equal(webhookTaskNotFound.status, 404);
    assert.equal(webhookTaskNotFound.json.error.code, "task_not_found");

    const failedWebhook = await api("/api/v1/a2a/webhooks/push", {
      method: "POST",
      body: JSON.stringify({
        task_id: failedTask.task_id,
        status: "failed",
      }),
    });
    assert.equal(failedWebhook.status, 200);
    const failedRun = await waitForRunStatus(failedCandidate.runId, "failed");
    assert.equal(failedRun.status, "failed");

    const webhook = await api("/api/v1/a2a/webhooks/push", {
      method: "POST",
      body: JSON.stringify({
        task_id: outboundTask.task_id,
        status: "completed",
        artifact: {
          summary: "remote analysis finished",
          vendor_count: 2,
        },
      }),
    });
    assert.equal(webhook.status, 200);

    const completedRun = await waitForRunStatus(firstRunId, "completed");
    assert.equal(completedRun.status, "completed");

    const graph = await api(`/api/v1/runs/${firstRunId}/graph?page_size=1&include_payloads=true`);
    assert.equal(graph.status, 200);
    assert.equal(graph.json.data.steps.length, 1);
    assert.equal(graph.json.data.approvals.length, 1);
    assert.equal(graph.json.data.artifacts.length, 1);
    assert.ok(graph.json.data.artifacts[0].body);
    assert.ok(graph.json.data.page_info.next_cursor);

    const graphPage2 = await api(
      `/api/v1/runs/${firstRunId}/graph?page_size=1&include_payloads=true&cursor=${graph.json.data.page_info.next_cursor}`,
    );
    assert.equal(graphPage2.status, 200);
    assert.equal(graphPage2.json.data.steps.length, 1);
    assert.equal(graphPage2.json.data.approvals.length, 0);
    assert.equal(graphPage2.json.data.artifacts.length, 1);
    assert.notEqual(graphPage2.json.data.steps[0].step_id, graph.json.data.steps[0].step_id);

    const eventsPage1 = await api(`/api/v1/runs/${firstRunId}/events?page_size=1`);
    assert.equal(eventsPage1.status, 200);
    assert.equal(eventsPage1.json.data.items.length, 1);
    if (eventsPage1.json.data.page_info.next_cursor) {
      const eventsPage2 = await api(
        `/api/v1/runs/${firstRunId}/events?page_size=1&cursor=${eventsPage1.json.data.page_info.next_cursor}`,
      );
      assert.equal(eventsPage2.status, 200);
      assert.equal(eventsPage2.json.data.items.length, 1);
      assert.notEqual(eventsPage2.json.data.items[0].event_id, eventsPage1.json.data.items[0].event_id);
    }

    const artifactsPage1 = await api(`/api/v1/runs/${firstRunId}/artifacts?page_size=1`);
    assert.equal(artifactsPage1.status, 200);
    assert.equal(artifactsPage1.json.data.items.length, 1);
    assert.ok(artifactsPage1.json.data.page_info.next_cursor);

    const artifactsPage2 = await api(
      `/api/v1/runs/${firstRunId}/artifacts?page_size=1&cursor=${artifactsPage1.json.data.page_info.next_cursor}`,
    );
    assert.equal(artifactsPage2.status, 200);
    assert.equal(artifactsPage2.json.data.items.length, 1);
    assert.notEqual(
      artifactsPage2.json.data.items[0].artifact_id,
      artifactsPage1.json.data.items[0].artifact_id,
    );

    const artifacts = await api(`/api/v1/runs/${firstRunId}/artifacts`);
    assert.equal(artifacts.status, 200);
    assert.ok(artifacts.json.data.items.length >= 1);
    const remoteArtifact = (artifacts.json.data.items as Array<{ artifact_id: string; artifact_type: string }>).find(
      (artifact) => artifact.artifact_type === "a2a_remote_artifact",
    );
    assert.ok(remoteArtifact);

    const fetchedArtifact = await api(
      `/api/v1/runs/${firstRunId}/artifacts/${remoteArtifact?.artifact_id}?include_body=true`,
    );
    assert.equal(fetchedArtifact.status, 200);
    assert.equal(fetchedArtifact.json.data.artifact_type, "a2a_remote_artifact");
    assert.equal(fetchedArtifact.json.data.body.summary, "remote analysis finished");

    const runSummaryArtifact = (artifacts.json.data.items as Array<{ artifact_id: string; artifact_type: string }>).find(
      (artifact) => artifact.artifact_type === "run_summary",
    );
    assert.ok(runSummaryArtifact);
    const fetchedRunSummary = await api(
      `/api/v1/runs/${firstRunId}/artifacts/${runSummaryArtifact?.artifact_id}?include_body=true`,
    );
    assert.equal(fetchedRunSummary.status, 200);
    assert.equal(fetchedRunSummary.json.data.artifact_type, "run_summary");
    assert.equal(fetchedRunSummary.json.data.body.kind, "run_summary_v1");
    assert.equal(fetchedRunSummary.json.data.body.run_id, firstRunId);
    assert.equal(fetchedRunSummary.json.data.body.status, "completed");
    assert.equal(fetchedRunSummary.json.data.body.approval?.approval_id, approvalId);
    assert.equal(fetchedRunSummary.json.data.body.approval?.decision, "approved");
    assert.equal(fetchedRunSummary.json.data.body.outbound?.task_id, outboundTask.task_id);

    const missingArtifact = await api(`/api/v1/runs/${firstRunId}/artifacts/art_missing`);
    assert.equal(missingArtifact.status, 404);
    assert.equal(missingArtifact.json.error.code, "artifact_not_found");

    const replay = await api(`/api/v1/runs/${firstRunId}/replay`, {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-replay-1",
      },
      body: JSON.stringify({
        mode: "from_input",
        reason: "smoke replay",
      }),
    });
    assert.equal(replay.status, 201);
    assert.equal(replay.json.data.replay_source_run_id, firstRunId);
    assert.equal(replay.json.data.replay_mode, "from_input");

    const replayFromStep = await api(`/api/v1/runs/${firstRunId}/replay`, {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-replay-from-step-1",
      },
      body: JSON.stringify({
        mode: "from_step",
        from_step_id: completedRun.current_step_id,
        reason: "smoke replay from dispatch step",
      }),
    });
    assert.equal(replayFromStep.status, 201);
    assert.equal(replayFromStep.json.data.replay_source_run_id, firstRunId);
    assert.equal(replayFromStep.json.data.replay_mode, "from_step");
    assert.equal(replayFromStep.json.data.replay_from_step_id, completedRun.current_step_id);

    const replayFromStepRunId = replayFromStep.json.data.run_id as string;
    const replayFromStepRunning = await waitForRunStatus(replayFromStepRunId, "running");
    assert.equal(replayFromStepRunning.pending_approval_id, null);

    const replayFromStepGraph = await api(`/api/v1/runs/${replayFromStepRunId}/graph`);
    assert.equal(replayFromStepGraph.status, 200);
    assert.equal(replayFromStepGraph.json.data.approvals.length, 0);
    assert.equal(replayFromStepGraph.json.data.steps.length, 2);
    const replayPlannerMetadata = JSON.parse(replayFromStepGraph.json.data.steps[0].metadata_json ?? "{}") as {
      is_replay?: boolean;
      replay_from_step?: string | null;
      replay_start_phase?: string | null;
    };
    assert.equal(replayPlannerMetadata.is_replay, true);
    assert.equal(replayPlannerMetadata.replay_from_step, completedRun.current_step_id);
    assert.equal(replayPlannerMetadata.replay_start_phase, "a2a_dispatch");

    env.RATE_LIMIT_REPLAYS_PER_MINUTE = "1";
    const replayLimited = await api(`/api/v1/runs/${firstRunId}/replay`, {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-replay-rate-limit-1",
      },
      body: JSON.stringify({
        mode: "from_input",
        reason: "smoke replay rate limit",
      }),
    });
    assert.equal(replayLimited.status, 201);

    const replayLimitedAgain = await api(`/api/v1/runs/${firstRunId}/replay`, {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-replay-rate-limit-1",
      },
      body: JSON.stringify({
        mode: "from_input",
        reason: "smoke replay rate limit",
      }),
    });
    assert.equal(replayLimitedAgain.status, 200);

    const replayLimitedBlocked = await api(`/api/v1/runs/${firstRunId}/replay`, {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-replay-rate-limit-2",
      },
      body: JSON.stringify({
        mode: "from_input",
        reason: "smoke replay rate limit blocked",
      }),
    });
    assert.equal(replayLimitedBlocked.status, 429);
    assert.equal(replayLimitedBlocked.json.error.code, "rate_limited");
    assert.equal(replayLimitedBlocked.json.error.details.scope, "runs_replay");
    assert.equal(replayLimitedBlocked.json.error.details.limit, 1);
    assert.ok((replayLimitedBlocked.json.error.details.retry_after_seconds as number) >= 1);
    env.RATE_LIMIT_REPLAYS_PER_MINUTE = "0";

    const replayInvalidMode = await api(`/api/v1/runs/${firstRunId}/replay`, {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-replay-invalid-mode-1",
      },
      body: JSON.stringify({
        mode: "invalid_mode",
      }),
    });
    assert.equal(replayInvalidMode.status, 400);
    assert.equal(replayInvalidMode.json.error.code, "invalid_request");

    const rejected = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-reject",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "請等待審批，然後拒絕",
        },
        policy_context: {
          labels: ["external-send"],
        },
      }),
    });
    assert.equal(rejected.status, 201);
    const rejectedRunId = rejected.json.data.run_id as string;
    const rejectedWaiting = await waitForRunStatus(rejectedRunId, "waiting_approval");
    const rejectedApproval = rejectedWaiting.pending_approval_id as string;
    const rejectDecision = await api(`/api/v1/approvals/${rejectedApproval}/decision`, {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-approval-reject-1",
        "x-subject-id": "user_legal_1",
        "x-subject-roles": "legal_approver",
      },
      body: JSON.stringify({
        decision: "rejected",
      }),
    });
    assert.equal(rejectDecision.status, 200);
    const rejectedRun = await waitForRunStatus(rejectedRunId, "failed");
    assert.equal(rejectedRun.status, "failed");

    const shortTimeoutNow = nowIso();
    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO tool_providers (
              tool_provider_id, tenant_id, name, provider_type, endpoint_url, auth_ref,
              visibility_policy_ref, execution_policy_ref, status, created_at, updated_at
            ) VALUES (?1, ?2, ?3, 'http_api', ?4, ?5, NULL, NULL, 'active', ?6, ?6)`,
        )
        .bind(
          "tp_remote_a2a_timeout",
          tenantId,
          "Remote A2A Timeout Provider",
          "https://provider-timeout.example.test/a2a/message:send",
          "header:X-Api-Key:A2A_SHARED_KEY",
          shortTimeoutNow,
        ),
      env.DB
        .prepare(
          `INSERT INTO policies (
              policy_id, tenant_id, channel, tool_provider_id, tool_name, decision, approver_roles_json,
              priority, status, conditions_json, approval_config_json, created_at, updated_at
            ) VALUES (?1, ?2, 'a2a_dispatch', ?3, NULL, 'approval_required', ?4, 100, 'active', ?5, ?6, ?7, ?7)`,
        )
        .bind(
          "pol_a2a_timeout_approval_v1",
          tenantId,
          "tp_remote_a2a_timeout",
          JSON.stringify(["security_approver"]),
          JSON.stringify({
            labels: ["timeout-check"],
            risk_level: "high",
          }),
          JSON.stringify({
            approver_roles: ["security_approver"],
            timeout_seconds: 1,
          }),
          shortTimeoutNow,
        ),
    ]);

    const originalExpiredFetch = globalThis.fetch;
    let expiredOutboundFetchCount = 0;
    globalThis.fetch = (async () => {
      expiredOutboundFetchCount += 1;
      throw new Error("approval timeout case should not reach outbound fetch");
    }) as typeof fetch;

    try {
      const expiredCandidate = await api("/api/v1/runs", {
        method: "POST",
        headers: {
          "idempotency-key": "smoke-run-expire",
        },
        body: JSON.stringify({
          input: {
            kind: "user_instruction",
            text: "請等待審批直到超時",
          },
          policy_context: {
            labels: ["timeout-check"],
            risk_tier: "high",
          },
          context: {
            a2a_dispatch: {
              tool_provider_id: "tp_remote_a2a_timeout",
              agent_id: "agent_remote_timeout",
              wait_for_completion: false,
            },
          },
        }),
      });
      assert.equal(expiredCandidate.status, 201);
      const expiredRunId = expiredCandidate.json.data.run_id as string;
      const expiredWaiting = await waitForRunStatus(expiredRunId, "waiting_approval");
      const expiredApprovalId = expiredWaiting.pending_approval_id as string;

      const expiredRun = await waitForRunStatus(expiredRunId, "failed");
      assert.equal(expiredRun.status, "failed");
      const expiredApprovalRow = await env.DB.prepare(
        `SELECT status
           FROM approvals
          WHERE tenant_id = ?1 AND approval_id = ?2`,
      )
        .bind(tenantId, expiredApprovalId)
        .first<{ status: string }>();
      assert.equal(expiredApprovalRow?.status, "expired");
      assert.equal(expiredOutboundFetchCount, 0);
      const expiredTaskCount = await env.DB.prepare(
        `SELECT COUNT(*) AS total
           FROM a2a_tasks
          WHERE tenant_id = ?1 AND run_id = ?2 AND direction = 'outbound'`,
      )
        .bind(tenantId, expiredRunId)
        .first<{ total: number }>();
      assert.equal(expiredTaskCount?.total, 0);
      const expiredEvents = await api(`/api/v1/runs/${expiredRunId}/events`);
      assert.equal(expiredEvents.status, 200);
      assert.ok(
        (expiredEvents.json.data.items as Array<{ event_type: string }>).some(
          (event) => event.event_type === "approval_expired",
        ),
      );
    } finally {
      globalThis.fetch = originalExpiredFetch;
    }

    const inbound = await api("/api/v1/a2a/message:send", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-inbound-1",
      },
      body: JSON.stringify({
        task_id: "remote-task-inbound-1",
        message_id: "remote-msg-1",
        sender: {
          agent_id: "agent_remote_planner",
        },
        target: {
          agent_id: "agent_control_plane",
        },
        content: {
          type: "text",
          text: "請建立一個 inbound 任務",
        },
        metadata: {
          remote_endpoint: "https://remote.example.test/a2a/message:send",
        },
      }),
    });
    assert.equal(inbound.status, 202);
    assert.equal(inbound.json.data.accepted, true);
    assert.equal(inbound.json.data.status, "in_progress");

    const inboundFollowUp = await api("/api/v1/a2a/message:send", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-inbound-follow-up-1",
      },
      body: JSON.stringify({
        task_id: "remote-task-inbound-1",
        message_id: "remote-msg-2",
        sender: {
          agent_id: "agent_remote_planner",
        },
        target: {
          agent_id: "agent_control_plane",
        },
        content: {
          type: "text",
          text: "請把 follow-up 也寫進同一個 inbound 任務",
        },
        metadata: {
          remote_endpoint: "https://remote.example.test/a2a/message:send",
        },
      }),
    });
    assert.equal(inboundFollowUp.status, 202);
    assert.equal(inboundFollowUp.json.data.accepted, true);
    assert.equal(inboundFollowUp.json.data.run_id, inbound.json.data.run_id);

    const inboundMessageStep = await env.DB.prepare(
      `SELECT step_id
         FROM run_steps
        WHERE tenant_id = ?1
          AND run_id = ?2
          AND step_type = 'a2a_message'
        ORDER BY sequence_no DESC
        LIMIT 1`,
    )
      .bind(tenantId, inbound.json.data.run_id as string)
      .first<{ step_id: string }>();
    assert.ok(inboundMessageStep?.step_id);

    const replayFromInboundMessage = await api(`/api/v1/runs/${inbound.json.data.run_id as string}/replay`, {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-replay-from-a2a-message-1",
      },
      body: JSON.stringify({
        mode: "from_step",
        from_step_id: inboundMessageStep?.step_id,
        reason: "smoke replay from a2a_message step",
      }),
    });
    assert.equal(replayFromInboundMessage.status, 201);
    assert.equal(replayFromInboundMessage.json.data.replay_mode, "from_step");
    assert.equal(replayFromInboundMessage.json.data.replay_from_step_id, inboundMessageStep?.step_id);

    const replayFromInboundRunId = replayFromInboundMessage.json.data.run_id as string;
    const replayFromInboundRun = await waitForRunStatus(replayFromInboundRunId, "completed");
    assert.equal(replayFromInboundRun.status, "completed");
    const replayFromInboundGraph = await api(`/api/v1/runs/${replayFromInboundRunId}/graph`);
    assert.equal(replayFromInboundGraph.status, 200);
    assert.equal(replayFromInboundGraph.json.data.approvals.length, 0);
    assert.equal(replayFromInboundGraph.json.data.steps.length, 1);
    const replayFromInboundPlannerMetadata = JSON.parse(
      replayFromInboundGraph.json.data.steps[0].metadata_json ?? "{}",
    ) as {
      is_replay?: boolean;
      replay_from_step?: string | null;
      replay_start_phase?: string | null;
    };
    assert.equal(replayFromInboundPlannerMetadata.is_replay, true);
    assert.equal(replayFromInboundPlannerMetadata.replay_from_step, inboundMessageStep?.step_id);
    assert.equal(replayFromInboundPlannerMetadata.replay_start_phase, "planner");

    const agentCard = await (app.fetch as (
      request: Request,
      env: Env,
    ) => Promise<Response>)(new Request("http://local/.well-known/agent-card.json"), env as Env);
    assert.equal(agentCard.status, 200);
    const agentCardJson = (await agentCard.json()) as {
      capabilities: { tasks: boolean; streaming: boolean };
      endpoints: { message_stream: string };
    };
    assert.equal(agentCardJson.capabilities.tasks, true);
    assert.equal(agentCardJson.capabilities.streaming, true);
    assert.equal(agentCardJson.endpoints.message_stream, "http://local/api/v1/a2a/message:stream");

    const inboundStream = await handleA2AMessageStream(
      new Request("http://local/api/v1/a2a/message:stream", {
        headers: {
          "x-tenant-id": tenantId,
          accept: "text/event-stream",
        },
      }),
      env as Env,
      tenantId,
    );
    assert.equal(inboundStream.status, 200);
    assert.equal(inboundStream.headers.get("content-type"), "text/event-stream; charset=utf-8");
    const inboundStreamEvents = parseSseEvents(await inboundStream.text());
    const readyEvent = inboundStreamEvents.find((event) => event.event === "ready");
    const snapshotEvent = inboundStreamEvents.find((event) => event.event === "snapshot");
    assert.ok(readyEvent);
    assert.ok(snapshotEvent);
    const snapshot = JSON.parse(snapshotEvent?.data ?? "{}") as {
      task_count: number;
      tasks: Array<{
        task_id: string;
        run_id: string;
        status: string;
        artifacts: Array<{ artifact_type: string }>;
      }>;
    };
    assert.ok(snapshot.task_count >= 1);
    assert.ok(snapshot.tasks.some((task) => task.task_id === outboundTask.task_id));
    const streamedOutboundTask = snapshot.tasks.find((task) => task.task_id === outboundTask.task_id);
    assert.ok(streamedOutboundTask);
    assert.equal(streamedOutboundTask?.status, "completed");
    assert.ok((streamedOutboundTask?.artifacts ?? []).some((artifact) => artifact.artifact_type === "a2a_remote_artifact"));

    const inboundTask = await api(`/api/v1/a2a/tasks/${inbound.json.data.task_id as string}`);
    assert.equal(inboundTask.status, 200);

    const initialPolicies = await api("/api/v1/policies");
    assert.equal(initialPolicies.status, 200);
    assert.equal(initialPolicies.json.data.items.length, 4);

    const createdPolicy = await api("/api/v1/policies", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-policy-create-1",
      },
      body: JSON.stringify({
        policy_id: "pol_mcp_email_internal_deny_v1",
        channel: "mcp_tool_call",
        scope: {
          tool_provider_id: "tp_email",
          tool_name: "send_email",
        },
        conditions: {
          target_classification: "internal",
          risk_level: "high",
        },
        decision: "deny",
        priority: 120,
      }),
    });
    assert.equal(createdPolicy.status, 201);
    assert.equal(createdPolicy.json.data.policy_id, "pol_mcp_email_internal_deny_v1");

    const createdPolicyAgain = await api("/api/v1/policies", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-policy-create-1",
      },
      body: JSON.stringify({
        policy_id: "pol_mcp_email_internal_deny_v1",
        channel: "mcp_tool_call",
        scope: {
          tool_provider_id: "tp_email",
          tool_name: "send_email",
        },
        conditions: {
          target_classification: "internal",
          risk_level: "high",
        },
        decision: "deny",
        priority: 120,
      }),
    });
    assert.equal(createdPolicyAgain.status, 200);

    const disabledPoliciesBefore = await api("/api/v1/policies?status=disabled");
    assert.equal(disabledPoliciesBefore.status, 200);
    assert.equal(disabledPoliciesBefore.json.data.items.length, 0);

    const policiesAfterCreate = await api("/api/v1/policies");
    assert.equal(policiesAfterCreate.status, 200);
    assert.equal(policiesAfterCreate.json.data.items.length, 5);

    const mcpList = await api("/api/v1/mcp/tp_email", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-list",
        method: "tools/list",
      }),
    });
    assert.equal(mcpList.status, 200);
    assert.deepEqual(
      (mcpList.json.result.tools as Array<{ name: string }>).map((tool) => tool.name),
      ["send_email"],
    );
    assert.equal(mcpList.json.result.tools[0].metadata.requires_approval, true);

    const mcpGet = await api(
      "/api/v1/mcp/tp_email",
      {
        method: "GET",
      },
      {
        parseJson: false,
        readStreamPrefix: true,
      },
    );
    assert.equal(mcpGet.status, 200);
    assert.match(mcpGet.headers.get("content-type") ?? "", /^text\/event-stream/i);
    assert.equal(mcpGet.headers.get("cache-control"), "no-cache, no-transform");
    assert.match(mcpGet.text, /event: ready/);
    assert.match(mcpGet.text, /"tool_provider_id":"tp_email"/);
    assert.match(mcpGet.text, /"transport":"sse"/);
    assert.match(mcpGet.text, /"status":"ready"/);
    assert.match(mcpGet.text, /"endpoint":"http:\/\/local\/api\/v1\/mcp\/tp_email"/);

    const mcpDataList = await api("/api/v1/mcp/tp_data", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-data-list",
        method: "tools/list",
      }),
    });
    assert.equal(mcpDataList.status, 200);
    assert.deepEqual(
      (mcpDataList.json.result.tools as Array<{ name: string }>).map((tool) => tool.name),
      ["read_erp"],
    );
    assert.equal(mcpDataList.json.result.tools[0].metadata.requires_approval, true);

    const mcpCall = await api("/api/v1/mcp/tp_email", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-mcp-call-1",
        "x-run-id": firstRunId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-call",
        method: "tools/call",
        params: {
          name: "send_email",
          arguments: {
            to: ["vendor@example.com"],
            subject: "Price Difference Summary",
            body: "Please review",
          },
        },
      }),
    });
    assert.equal(mcpCall.status, 423);
    assert.equal(mcpCall.json.error.code, "approval_required");
    const emailApproval = await env.DB.prepare(
      `SELECT policy_id
         FROM approvals
        WHERE tenant_id = ?1
          AND run_id = ?2
          AND subject_type = 'tool_call'
          AND subject_ref = 'send_email'
        ORDER BY created_at DESC
        LIMIT 1`,
    )
      .bind(tenantId, firstRunId)
      .first<{ policy_id: string }>();
    assert.equal(emailApproval?.policy_id, "pol_mcp_email_external_approval_v1");

    const mcpCallRepeat = await api("/api/v1/mcp/tp_email", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-mcp-call-1",
        "x-run-id": firstRunId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-call",
        method: "tools/call",
        params: {
          name: "send_email",
          arguments: {
            to: ["vendor@example.com"],
            subject: "Price Difference Summary",
            body: "Please review",
          },
        },
      }),
    });
    assert.equal(mcpCallRepeat.status, 423);

    const mcpCallStep = await env.DB.prepare(
      `SELECT step_id
         FROM run_steps
        WHERE tenant_id = ?1
          AND run_id = ?2
          AND step_type = 'mcp_call'
        ORDER BY sequence_no DESC
        LIMIT 1`,
    )
      .bind(tenantId, firstRunId)
      .first<{ step_id: string }>();
    assert.ok(mcpCallStep?.step_id);

    const replayFromMcpStep = await api(`/api/v1/runs/${firstRunId}/replay`, {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-replay-from-mcp-step-1",
      },
      body: JSON.stringify({
        mode: "from_step",
        from_step_id: mcpCallStep?.step_id,
        reason: "smoke replay from mcp_call step",
      }),
    });
    assert.equal(replayFromMcpStep.status, 201);
    assert.equal(replayFromMcpStep.json.data.replay_source_run_id, firstRunId);
    assert.equal(replayFromMcpStep.json.data.replay_mode, "from_step");
    assert.equal(replayFromMcpStep.json.data.replay_from_step_id, mcpCallStep?.step_id);

    const replayFromMcpRunId = replayFromMcpStep.json.data.run_id as string;
    const replayFromMcpRunning = await waitForRunStatus(replayFromMcpRunId, "running");
    assert.equal(replayFromMcpRunning.pending_approval_id, null);

    const replayFromMcpGraph = await api(`/api/v1/runs/${replayFromMcpRunId}/graph`);
    assert.equal(replayFromMcpGraph.status, 200);
    assert.equal(replayFromMcpGraph.json.data.approvals.length, 0);
    assert.equal(replayFromMcpGraph.json.data.steps.length, 2);
    const replayFromMcpPlannerMetadata = JSON.parse(
      replayFromMcpGraph.json.data.steps[0].metadata_json ?? "{}",
    ) as {
      is_replay?: boolean;
      replay_from_step?: string | null;
      replay_start_phase?: string | null;
    };
    assert.equal(replayFromMcpPlannerMetadata.is_replay, true);
    assert.equal(replayFromMcpPlannerMetadata.replay_from_step, mcpCallStep?.step_id);
    assert.equal(replayFromMcpPlannerMetadata.replay_start_phase, "a2a_dispatch");

    const mcpRead = await api("/api/v1/mcp/tp_data", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-mcp-read-1",
        "x-run-id": firstRunId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-read",
        method: "tools/call",
        params: {
          name: "read_erp",
          arguments: {
            query: "SELECT * FROM vendors LIMIT 1",
          },
        },
      }),
    });
    assert.equal(mcpRead.status, 423);
    assert.equal(mcpRead.json.error.code, "approval_required");

    const mcpMissingRun = await api("/api/v1/mcp/tp_email", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-mcp-missing-run-1",
        "x-run-id": "run_missing",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-missing-run",
        method: "tools/call",
        params: {
          name: "send_email",
          arguments: {
            to: ["vendor@example.com"],
            subject: "Missing run",
            body: "should fail",
          },
        },
      }),
    });
    assert.equal(mcpMissingRun.status, 404);
    assert.equal(mcpMissingRun.json.error.code, "run_not_found");

    const mcpInternalEmailDenied = await api("/api/v1/mcp/tp_email", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-mcp-email-internal-denied-1",
        "x-run-id": firstRunId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-internal-email-denied",
        method: "tools/call",
        params: {
          name: "send_email",
          arguments: {
            to: ["procurement@internal.example.com"],
            subject: "Internal sync",
            body: "FYI",
          },
        },
      }),
    });
    assert.equal(mcpInternalEmailDenied.status, 422);
    assert.equal(mcpInternalEmailDenied.json.error.code, "policy_denied");

    const disabledPolicy = await api("/api/v1/policies/pol_mcp_email_internal_deny_v1:disable", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-policy-disable-1",
      },
    });
    assert.equal(disabledPolicy.status, 200);
    assert.equal(disabledPolicy.json.data.status, "disabled");

    const disabledPoliciesAfter = await api("/api/v1/policies?status=disabled");
    assert.equal(disabledPoliciesAfter.status, 200);
    assert.deepEqual(
      (disabledPoliciesAfter.json.data.items as Array<{ policy_id: string }>).map((policy) => policy.policy_id),
      ["pol_mcp_email_internal_deny_v1"],
    );

    const fetchedPolicy = await api("/api/v1/policies/pol_mcp_email_internal_deny_v1");
    assert.equal(fetchedPolicy.status, 200);
    assert.equal(fetchedPolicy.json.data.policy_id, "pol_mcp_email_internal_deny_v1");
    assert.equal(fetchedPolicy.json.data.status, "disabled");

    const updatedPolicy = await api("/api/v1/policies/pol_mcp_email_internal_deny_v1", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-policy-update-1",
      },
      body: JSON.stringify({
        status: "active",
        priority: 130,
        conditions: {
          risk_level: "medium",
          target_classification: "internal",
        },
      }),
    });
    assert.equal(updatedPolicy.status, 200);
    assert.equal(updatedPolicy.json.data.status, "active");
    assert.equal(updatedPolicy.json.data.priority, 130);
    assert.equal(updatedPolicy.json.data.conditions.risk_level, "medium");

    const updatedPolicyAgain = await api("/api/v1/policies/pol_mcp_email_internal_deny_v1", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-policy-update-1",
      },
      body: JSON.stringify({
        status: "active",
        priority: 130,
        conditions: {
          risk_level: "medium",
          target_classification: "internal",
        },
      }),
    });
    assert.equal(updatedPolicyAgain.status, 200);
    assert.equal(updatedPolicyAgain.json.data.priority, 130);

    const mcpInternalEmail = await api("/api/v1/mcp/tp_email", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-mcp-email-internal-1",
        "x-run-id": firstRunId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-internal-email",
        method: "tools/call",
        params: {
          name: "send_email",
          arguments: {
            to: ["procurement@internal.example.com"],
            subject: "Internal sync",
            body: "FYI",
          },
        },
      }),
    });
    assert.equal(mcpInternalEmail.status, 200);
    assert.match(mcpInternalEmail.json.result.content[0].text as string, /procurement@internal\.example\.com/);

    const mcpDeny = await api("/api/v1/mcp/tp_data", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-mcp-deny-1",
        "x-run-id": firstRunId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-deny",
        method: "tools/call",
        params: {
          name: "delete_record",
          arguments: {
            record_id: "rec_123",
          },
        },
      }),
    });
    assert.equal(mcpDeny.status, 422);
    assert.equal(mcpDeny.json.error.code, "policy_denied");

    const runEvents = await api(`/api/v1/runs/${firstRunId}/events`);
    assert.equal(runEvents.status, 200);
    const eventTypes = new Set(
      (runEvents.json.data.items as Array<{ event_type: string }>).map((event) => event.event_type),
    );
    assert.ok(eventTypes.has("policy_evaluated"));
    assert.ok(eventTypes.has("approval_created"));
    assert.ok(eventTypes.has("approval_decided"));
    assert.ok(eventTypes.has("side_effect_blocked"));
    assert.ok(eventTypes.has("side_effect_executed"));
    const queueEventTypes = new Set(env.__queue.messages.map((event) => event.event_type));
    assert.ok(queueEventTypes.has("approval_created"));
    assert.ok(queueEventTypes.has("approval_cancelled"));
    assert.ok(queueEventTypes.has("approval_expired"));
    assert.ok(queueEventTypes.has("side_effect_executed"));
    assert.ok(env.__queue.messages.every((event) => event.message_type === "audit_event"));
    assert.ok(env.__queue.messages.every((event) => typeof event.dedupe_key === "string" && event.dedupe_key !== ""));
    const firstQueuedEvent = env.__queue.messages[0];
    if (!firstQueuedEvent) {
      throw new Error("Expected at least one queued audit event");
    }
    await (app.queue as (batch: MessageBatch<unknown>, env: Env) => Promise<void>)(
      new MockMessageBatch("agent-control-plane-events", [
        new MockQueueMessage(firstQueuedEvent),
        new MockQueueMessage(firstQueuedEvent),
      ]),
      env as Env,
    );
    const dedupeRows = await env.DB.prepare(
      `SELECT COUNT(*) AS total
         FROM queue_dedupe_records
        WHERE dedupe_key = ?1`,
    )
      .bind(firstQueuedEvent.dedupe_key)
      .first<{ total: number }>();
    assert.equal(dedupeRows?.total, 1);

    await verifyOutboundAuthRef();
    await verifyOutboundAgentCardCache();
    await verifyOutboundAgentCardCrossOriginFallback();
    await verifyOutboundAgentCardRedirectFallback();
    await verifyOutboundProviderScopedPolicies();
    await verifyOutboundToolProviderResolution();
    await verifyOutboundToolProviderConflictingFieldsRejected();
    await verifyOutboundHttpEndpointRequiresProvider();
    await verifyOutboundProviderHttpEndpointRejected();
    await verifyMcpAuthRef();

    console.log("Smoke checks passed");
    console.log(
      JSON.stringify(
        {
          firstRunId,
          approvalId,
          outboundTaskId: outboundTask.task_id,
          replayRunId: replay.json.data.run_id,
          rejectedRunId,
          cancelledRunId: cancelCandidate.runId,
          failedRunId: failedCandidate.runId,
        },
        null,
        2,
      ),
    );
  } finally {
    env.__workflow.dispose();
  }
}

type ApiOptions = {
  parseJson?: boolean;
  readStreamPrefix?: boolean;
  skipTenantHeader?: boolean;
  overrideTenantHeader?: string | null;
};

async function api(
  path: string,
  init: RequestInit = {},
  options: ApiOptions = {},
): Promise<{ status: number; json: any; text: string; headers: Headers }> {
  const headers = new Headers(init.headers);
  if (options.overrideTenantHeader !== undefined) {
    if (options.overrideTenantHeader === null) {
      headers.delete("x-tenant-id");
    } else {
      headers.set("x-tenant-id", options.overrideTenantHeader);
    }
  } else if (!options.skipTenantHeader && !headers.has("x-tenant-id")) {
    headers.set("x-tenant-id", tenantId);
  }
  headers.set("content-type", "application/json");

  const response = await (app.fetch as (
    request: Request,
    env: Env,
  ) => Promise<Response>)(
    new Request(`http://local${path}`, {
      ...init,
      headers,
    }),
    env as Env,
  );

  const responseHeaders = new Headers(response.headers);
  let text = "";
  if (options.readStreamPrefix) {
    const reader = response.body?.getReader();
    if (reader) {
      try {
        const { value } = await reader.read();
        text = value ? new TextDecoder().decode(value) : "";
      } finally {
        await reader.cancel().catch(() => {});
      }
    } else {
      text = await response.text();
    }
  } else {
    text = await response.text();
  }

  const shouldParseJson = options.parseJson ?? (responseHeaders.get("content-type") ?? "").includes("application/json");
  const json = shouldParseJson && text ? JSON.parse(text) : shouldParseJson ? {} : {};
  return {
    status: response.status,
    json,
    text,
    headers: responseHeaders,
  };
}

async function computeSha256Hex(value: string): Promise<string> {
  return createHash("sha256").update(value).digest("hex");
}

async function seedSaasUser(args: {
  userId?: string | undefined;
  email?: string | undefined;
  displayName?: string | undefined;
  authProvider?: string | undefined;
  authSubject?: string | undefined;
  status?: "active" | "disabled" | undefined;
} = {}): Promise<{
  user_id: string;
  email: string;
  auth_subject: string;
}> {
  const now = nowIso();
  const userId = args.userId ?? createId("usr");
  const email = (args.email ?? `${userId}@example.com`).trim().toLowerCase();
  const authSubject = args.authSubject ?? email;
  await env.DB.prepare(
    `INSERT INTO users (
        user_id, email, email_normalized, display_name, auth_provider, auth_subject, status,
        last_login_at, created_at, updated_at
      ) VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?7)`,
  )
    .bind(
      userId,
      email,
      args.displayName ?? "Smoke SaaS User",
      args.authProvider ?? "header_subject",
      authSubject,
      args.status ?? "active",
      now,
    )
    .run();

  return {
    user_id: userId,
    email,
    auth_subject: authSubject,
  };
}

async function seedSaasOrganizationOwner(args: {
  organizationId?: string | undefined;
  organizationSlug?: string | undefined;
  organizationDisplayName?: string | undefined;
  organizationStatus?: "active" | "disabled" | undefined;
  userEmail?: string | undefined;
} = {}): Promise<{
  organization_id: string;
  user_id: string;
  subject_id: string;
  email: string;
}> {
  const now = nowIso();
  const user = await seedSaasUser({
    email: args.userEmail,
    displayName: "Smoke SaaS Owner",
  });
  const organizationId = args.organizationId ?? createId("org");
  await env.DB.prepare(
    `INSERT INTO organizations (
        organization_id, slug, display_name, status, created_by_user_id, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
  )
    .bind(
      organizationId,
      args.organizationSlug ?? organizationId.replace(/_/g, "-"),
      args.organizationDisplayName ?? "Smoke SaaS Org",
      args.organizationStatus ?? "active",
      user.user_id,
      now,
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO organization_memberships (
        membership_id, organization_id, user_id, role, status, joined_at, invited_by_user_id, created_at, updated_at
      ) VALUES (?1, ?2, ?3, 'organization_owner', 'active', ?4, ?3, ?4, ?4)`,
  )
    .bind(createId("orgm"), organizationId, user.user_id, now)
    .run();

  return {
    organization_id: organizationId,
    user_id: user.user_id,
    subject_id: user.auth_subject,
    email: user.email,
  };
}

async function seedSaasWorkspaceContext(args: {
  organizationId?: string | undefined;
  organizationSlug?: string | undefined;
  organizationDisplayName?: string | undefined;
  organizationStatus?: "active" | "disabled" | undefined;
  userEmail?: string | undefined;
  workspaceId?: string | undefined;
  tenantId?: string | undefined;
  workspaceSlug?: string | undefined;
  workspaceDisplayName?: string | undefined;
  workspaceStatus?: "active" | "disabled" | undefined;
  workspaceRole?:
    | "workspace_owner"
    | "workspace_admin"
    | "operator"
    | "approver"
    | "auditor"
    | "viewer"
    | undefined;
  planId?: string | undefined;
} = {}): Promise<{
  organization_id: string;
  user_id: string;
  subject_id: string;
  workspace_id: string;
  tenant_id: string;
}> {
  const now = nowIso();
  const owner = await seedSaasOrganizationOwner({
    organizationId: args.organizationId,
    organizationSlug: args.organizationSlug,
    organizationDisplayName: args.organizationDisplayName,
    organizationStatus: args.organizationStatus,
    userEmail: args.userEmail,
  });
  const workspaceId = args.workspaceId ?? createId("ws");
  const tenantId = args.tenantId ?? createId("tenant");
  await env.DB.prepare(
    `INSERT INTO workspaces (
        workspace_id, organization_id, tenant_id, slug, display_name, status, plan_id, data_region,
        created_by_user_id, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'global', ?8, ?9, ?9)`,
  )
    .bind(
      workspaceId,
      owner.organization_id,
      tenantId,
      args.workspaceSlug ?? workspaceId.replace(/_/g, "-"),
      args.workspaceDisplayName ?? "Smoke SaaS Workspace",
      args.workspaceStatus ?? "active",
      args.planId ?? "plan_free",
      owner.user_id,
      now,
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO workspace_memberships (
        workspace_membership_id, workspace_id, user_id, role, status, joined_at, invited_by_user_id, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?3, ?5, ?5)`,
  )
    .bind(
      createId("wsm"),
      workspaceId,
      owner.user_id,
      args.workspaceRole ?? "workspace_owner",
      now,
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO workspace_plan_subscriptions (
        subscription_id, workspace_id, organization_id, plan_id, billing_provider, status,
        current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, 'manual', 'active', ?5, NULL, 0, ?5, ?5)`,
  )
    .bind(createId("sub"), workspaceId, owner.organization_id, args.planId ?? "plan_free", now)
    .run();

  return {
    organization_id: owner.organization_id,
    user_id: owner.user_id,
    subject_id: owner.subject_id,
    workspace_id: workspaceId,
    tenant_id: tenantId,
  };
}

async function verifySaasWorkspaceCreateIdempotencyIncludesPlan(): Promise<void> {
  const owner = await seedSaasOrganizationOwner();
  const workspaceId = createId("ws");
  const tenantId = createId("tenant");
  const createPayload = {
    workspace_id: workspaceId,
    organization_id: owner.organization_id,
    tenant_id: tenantId,
    slug: workspaceId.replace(/_/g, "-"),
    display_name: "Smoke Idempotent Workspace",
    plan_id: "plan_free",
  };

  const created = await api(
    "/api/v1/saas/workspaces",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-saas-create-workspace-1",
        "x-authenticated-subject": owner.subject_id,
      },
      body: JSON.stringify(createPayload),
    },
    { skipTenantHeader: true },
  );
  assert.equal(created.status, 201);
  assert.equal(created.json.data.workspace.workspace_id, workspaceId);
  assert.equal(created.json.data.plan.plan_id, "plan_free");

  const replayed = await api(
    "/api/v1/saas/workspaces",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-saas-create-workspace-1",
        "x-authenticated-subject": owner.subject_id,
      },
      body: JSON.stringify(createPayload),
    },
    { skipTenantHeader: true },
  );
  assert.equal(replayed.status, 200);
  assert.equal(replayed.json.data.workspace.workspace_id, workspaceId);
  assert.equal(replayed.json.data.plan.plan_id, "plan_free");
}

async function verifyDisabledSaasWorkspaceIsHiddenAndBlocked(): Promise<void> {
  const sharedOrganizationId = createId("org");
  const sharedEmail = `${createId("owner")}@example.com`;
  const activeWorkspace = await seedSaasWorkspaceContext({
    organizationId: sharedOrganizationId,
    userEmail: sharedEmail,
    workspaceStatus: "active",
  });
  const disabledWorkspaceId = createId("ws");
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO workspaces (
        workspace_id, organization_id, tenant_id, slug, display_name, status, plan_id, data_region,
        created_by_user_id, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, 'Disabled Smoke Workspace', 'disabled', 'plan_free', 'global', ?5, ?6, ?6)`,
  )
    .bind(
      disabledWorkspaceId,
      sharedOrganizationId,
      createId("tenant"),
      disabledWorkspaceId.replace(/_/g, "-"),
      activeWorkspace.user_id,
      now,
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO workspace_memberships (
        workspace_membership_id, workspace_id, user_id, role, status, joined_at, invited_by_user_id, created_at, updated_at
      ) VALUES (?1, ?2, ?3, 'workspace_owner', 'active', ?4, ?3, ?4, ?4)`,
  )
    .bind(createId("wsm"), disabledWorkspaceId, activeWorkspace.user_id, now)
    .run();

  const me = await api(
    "/api/v1/saas/me",
    {
      headers: {
        "x-authenticated-subject": activeWorkspace.subject_id,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(me.status, 200);
  const listedWorkspaceIds = (me.json.data.workspaces as Array<{ workspace_id: string }>).map(
    (workspace) => workspace.workspace_id,
  );
  assert.ok(listedWorkspaceIds.includes(activeWorkspace.workspace_id));
  assert.ok(!listedWorkspaceIds.includes(disabledWorkspaceId));

  const disabledDetail = await api(
    `/api/v1/saas/workspaces/${disabledWorkspaceId}`,
    {
      headers: {
        "x-authenticated-subject": activeWorkspace.subject_id,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(disabledDetail.status, 403);
  assert.equal(disabledDetail.json.error.code, "tenant_access_denied");
}

async function verifyInactiveOrganizationMembershipBlocksWorkspaceAccess(): Promise<void> {
  const workspace = await seedSaasWorkspaceContext();
  const disabledAt = nowIso();
  await env.DB.prepare(
    `UPDATE organization_memberships
        SET status = 'disabled',
            updated_at = ?1
      WHERE organization_id = ?2
        AND user_id = ?3`,
  )
    .bind(disabledAt, workspace.organization_id, workspace.user_id)
    .run();

  const me = await api(
    "/api/v1/saas/me",
    {
      headers: {
        "x-authenticated-subject": workspace.subject_id,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(me.status, 200);
  const listedWorkspaceIds = (me.json.data.workspaces as Array<{ workspace_id: string }>).map(
    (item) => item.workspace_id,
  );
  assert.ok(!listedWorkspaceIds.includes(workspace.workspace_id));

  const detail = await api(
    `/api/v1/saas/workspaces/${workspace.workspace_id}`,
    {
      headers: {
        "x-authenticated-subject": workspace.subject_id,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(detail.status, 403);
  assert.equal(detail.json.error.code, "tenant_access_denied");
}

async function verifySaasSubjectEmailSpoofIsRejected(): Promise<void> {
  const userId = createId("usr");
  const email = `${createId("spoof")}@example.com`;
  const timestamp = nowIso();
  await env.DB.prepare(
    `INSERT INTO users (
        user_id, email, email_normalized, display_name, auth_provider, auth_subject, status,
        last_login_at, created_at, updated_at
      ) VALUES (?1, ?2, ?2, 'Spoof Target', 'passwordless', ?2, 'active', ?3, ?3, ?3)`,
  )
    .bind(userId, email, timestamp)
    .run();

  const me = await api(
    "/api/v1/saas/me",
    {
      headers: {
        "x-subject-id": email,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(me.status, 401);
  assert.equal(me.json.error.code, "unauthorized");
}

async function verifySaasInvitationRespectsSeatLimit(): Promise<void> {
  const workspace = await seedSaasWorkspaceContext();
  const now = nowIso();
  for (let index = 0; index < 2; index += 1) {
    const inviteToken = `seat_limit_${index}_${createId("token")}`;
    await env.DB.prepare(
      `INSERT INTO workspace_invitations (
          invitation_id, organization_id, workspace_id, email_normalized, role, token_hash, status,
          invited_by_user_id, expires_at, accepted_by_user_id, accepted_at, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, 'viewer', ?5, 'pending', ?6, ?7, NULL, NULL, ?8, ?8)`,
    )
      .bind(
        createId("inv"),
        workspace.organization_id,
        workspace.workspace_id,
        `seat-limit-${index}@example.com`,
        await computeSha256Hex(inviteToken),
        workspace.user_id,
        new Date(Date.now() + 60_000).toISOString(),
        now,
      )
      .run();
  }

  const invite = await api(
    `/api/v1/saas/workspaces/${workspace.workspace_id}/invitations`,
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-saas-seat-limit-1",
        "x-authenticated-subject": workspace.subject_id,
      },
      body: JSON.stringify({
        email: "overflow-seat@example.com",
        role: "viewer",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    },
    { skipTenantHeader: true },
  );
  assert.equal(invite.status, 429);
  assert.equal(invite.json.error.code, "invitation_limit_reached");
  assert.equal(invite.json.error.details.scope, "member_seats");
  assert.equal(invite.json.error.details.limit, 3);
}

async function verifySaasBootstrapRespectsToolProviderPlanLimit(): Promise<void> {
  const workspace = await seedSaasWorkspaceContext();
  const now = nowIso();
  for (let index = 0; index < 2; index += 1) {
    await env.DB.prepare(
      `INSERT INTO tool_providers (
          tool_provider_id, tenant_id, name, provider_type, endpoint_url, auth_ref,
          visibility_policy_ref, execution_policy_ref, status, created_at, updated_at
        ) VALUES (?1, ?2, ?3, 'mcp_server', ?4, NULL, NULL, NULL, 'active', ?5, ?5)`,
    )
      .bind(
        `tp_smoke_limit_${index}_${createId("tp")}`,
        workspace.tenant_id,
        `Smoke Limit Provider ${index + 1}`,
        `https://limit-${index + 1}.example.test/mcp`,
        now,
      )
      .run();
  }

  const bootstrap = await api(
    `/api/v1/saas/workspaces/${workspace.workspace_id}/bootstrap`,
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-saas-bootstrap-limit-1",
        "x-authenticated-subject": workspace.subject_id,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(bootstrap.status, 429);
  assert.equal(bootstrap.json.error.code, "plan_limit_exceeded");
  assert.equal(bootstrap.json.error.details.scope, "active_tool_providers");
  assert.equal(bootstrap.json.error.details.limit, 3);
}

async function verifySaasUsagePeriodAndPlanLimitDetailsFollowSubscription(): Promise<void> {
  const workspace = await seedSaasWorkspaceContext();
  const periodStart = "2026-04-15T00:00:00.000Z";
  const periodEnd = "2026-05-15T00:00:00.000Z";
  const createdAt = "2026-04-20T12:00:00.000Z";
  await env.DB.prepare(
    `UPDATE workspace_plan_subscriptions
        SET current_period_start = ?1,
            current_period_end = ?2,
            updated_at = ?3
      WHERE workspace_id = ?4`,
  )
    .bind(periodStart, periodEnd, createdAt, workspace.workspace_id)
    .run();
  await env.DB.prepare(
    `INSERT INTO usage_ledger (
        usage_event_id, workspace_id, organization_id, tenant_id, meter_name, quantity,
        source_type, source_id, period_start, period_end, metadata_json, created_at
      ) VALUES (?1, ?2, ?3, ?4, 'runs_created', 1000, 'smoke_seed', ?5, ?6, ?7, '{}', ?8)`,
  )
    .bind(
      createId("usage"),
      workspace.workspace_id,
      workspace.organization_id,
      workspace.tenant_id,
      "seeded-run-limit",
      periodStart,
      periodEnd,
      createdAt,
    )
    .run();

  const blockedRun = await api(
    "/api/v1/runs",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-saas-period-limit-1",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "trigger run limit in custom subscription period",
        },
      }),
    },
    { overrideTenantHeader: workspace.tenant_id },
  );
  assert.equal(blockedRun.status, 429);
  assert.equal(blockedRun.json.error.code, "plan_limit_exceeded");
  assert.equal(blockedRun.json.error.details.scope, "runs_created");
  assert.equal(blockedRun.json.error.details.period_start, periodStart);
  assert.equal(blockedRun.json.error.details.period_end, periodEnd);
  assert.equal(blockedRun.json.error.details.plan_id, "plan_free");
  assert.equal(blockedRun.json.error.details.plan_code, "free");
  assert.equal(blockedRun.json.error.details.upgrade_href, "/settings?intent=upgrade");

  const workspaceDetail = await api(
    `/api/v1/saas/workspaces/${workspace.workspace_id}`,
    {
      headers: {
        "x-authenticated-subject": workspace.subject_id,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(workspaceDetail.status, 200);
  assert.equal(workspaceDetail.json.data.usage.period_start, periodStart);
  assert.equal(workspaceDetail.json.data.usage.period_end, periodEnd);
  assert.equal(workspaceDetail.json.data.usage.metrics.runs_created.used, 1000);
}

async function verifySaasBootstrapPersistsOnboardingState(): Promise<void> {
  const workspace = await seedSaasWorkspaceContext();
  const bootstrap = await api(
    `/api/v1/saas/workspaces/${workspace.workspace_id}/bootstrap`,
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-saas-bootstrap-persistence-1",
        "x-authenticated-subject": workspace.subject_id,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(bootstrap.status, 201);

  const persistedState = await env.DB.prepare(
    `SELECT status, summary_json, last_bootstrapped_at
       FROM workspace_onboarding_states
      WHERE workspace_id = ?1`,
  )
    .bind(workspace.workspace_id)
    .first<{ status: string; summary_json: string; last_bootstrapped_at: string | null }>();
  assert.equal(persistedState?.status, "baseline_ready");
  assert.equal(typeof persistedState?.last_bootstrapped_at, "string");
  const persistedSummary = JSON.parse(persistedState?.summary_json ?? "{}") as {
    providers_created?: number;
    policies_created?: number;
  };
  assert.equal(persistedSummary.providers_created, 2);
  assert.equal(persistedSummary.policies_created, 3);

  const workspaceDetail = await api(
    `/api/v1/saas/workspaces/${workspace.workspace_id}`,
    {
      headers: {
        "x-authenticated-subject": workspace.subject_id,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(workspaceDetail.status, 200);
  assert.equal(workspaceDetail.json.data.onboarding.summary.providers_created, 2);
  assert.equal(workspaceDetail.json.data.onboarding.summary.policies_created, 3);
  assert.equal(workspaceDetail.json.data.onboarding.checklist.baseline_ready, true);
}

async function verifySaasUserResolutionRequiresAuthIdentityMatch(): Promise<void> {
  const user = await seedSaasUser({
    email: `${createId("email")}@example.com`,
    authSubject: `subject_${createId("id")}`,
  });

  const emailFallbackAttempt = await api(
    "/api/v1/saas/me",
    {
      headers: {
        "x-subject-id": user.email,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(emailFallbackAttempt.status, 401);
  assert.equal(emailFallbackAttempt.json.error.code, "unauthorized");

  const authIdentityAttempt = await api(
    "/api/v1/saas/me",
    {
      headers: {
        "x-authenticated-subject": user.auth_subject,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(authIdentityAttempt.status, 200);
  assert.equal(authIdentityAttempt.json.data.user.user_id, user.user_id);
}

async function verifyDisabledWorkspaceInvitationCannotBeAccepted(): Promise<void> {
  const workspace = await seedSaasWorkspaceContext({
    workspaceStatus: "disabled",
  });
  const invitee = await seedSaasUser({
    displayName: "Smoke Invitee",
  });
  const now = nowIso();
  const inviteToken = `invite_${createId("token")}`;
  const invitationId = createId("inv");
  await env.DB.prepare(
    `INSERT INTO workspace_invitations (
        invitation_id, organization_id, workspace_id, email_normalized, role, token_hash, status,
        invited_by_user_id, expires_at, accepted_by_user_id, accepted_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, 'operator', ?5, 'pending', ?6, ?7, NULL, NULL, ?8, ?8)`,
  )
    .bind(
      invitationId,
      workspace.organization_id,
      workspace.workspace_id,
      invitee.email,
      await computeSha256Hex(inviteToken),
      workspace.user_id,
      new Date(Date.now() + 60_000).toISOString(),
      now,
    )
    .run();

  const accepted = await api(
    "/api/v1/saas/invitations:accept",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-saas-invitation-disabled-1",
        "x-authenticated-subject": invitee.auth_subject,
      },
      body: JSON.stringify({
        invite_token: inviteToken,
      }),
    },
    { skipTenantHeader: true },
  );
  assert.equal(accepted.status, 409);
  assert.equal(accepted.json.error.code, "invalid_state_transition");
}

async function verifySaasWorkspaceRequiresActiveOrganizationMembership(): Promise<void> {
  const workspace = await seedSaasWorkspaceContext();
  await env.DB.prepare(
    `UPDATE organization_memberships
        SET status = 'disabled',
            updated_at = ?1
      WHERE organization_id = ?2 AND user_id = ?3`,
  )
    .bind(nowIso(), workspace.organization_id, workspace.user_id)
    .run();

  const me = await api(
    "/api/v1/saas/me",
    {
      headers: {
        "x-authenticated-subject": workspace.subject_id,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(me.status, 200);
  const workspaceIds = (me.json.data.workspaces as Array<{ workspace_id: string }>).map((item) => item.workspace_id);
  assert.ok(!workspaceIds.includes(workspace.workspace_id));

  const detail = await api(
    `/api/v1/saas/workspaces/${workspace.workspace_id}`,
    {
      headers: {
        "x-authenticated-subject": workspace.subject_id,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(detail.status, 403);
  assert.equal(detail.json.error.code, "tenant_access_denied");
}

async function verifySaasUserResolutionDoesNotFallbackByEmail(): Promise<void> {
  const user = await seedSaasUser({
    email: "no-fallback@example.com",
    authSubject: "subject_no_fallback",
    displayName: "No Fallback User",
  });

  const me = await api(
    "/api/v1/saas/me",
    {
      headers: {
        "x-subject-id": user.email,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(me.status, 401);
  assert.equal(me.json.error.code, "unauthorized");
}

async function seedWorkspaceServiceAccount(
  env: Env,
  workspaceId: string,
  tenantId: string,
  createdByUserId: string,
  options: {
    role?: ServiceAccountRow["role"];
    description?: string;
  } = {},
): Promise<ServiceAccountRow> {
  const now = nowIso();
  const serviceAccountId = createId("svc");
  const serviceAccountName = `smoke-service-account-${createId("name")}`;
  const description = options.description ?? "Smoke test service account";
  const role = options.role ?? "workspace_service";
  await env.DB.prepare(
    `INSERT INTO service_accounts (
        service_account_id, workspace_id, tenant_id, name, description, role, status,
        created_by_user_id, last_used_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7, NULL, ?8, ?8)`,
  )
    .bind(
      serviceAccountId,
      workspaceId,
      tenantId,
      serviceAccountName,
      description,
      role,
      createdByUserId,
      now,
    )
    .run();

  return {
    service_account_id: serviceAccountId,
    workspace_id: workspaceId,
    tenant_id: tenantId,
    name: serviceAccountName,
    description,
    role,
    status: "active",
    created_by_user_id: createdByUserId,
    last_used_at: null,
    created_at: now,
    updated_at: now,
  };
}

type SeedApiKeyOptions = {
  status?: ApiKeyRow["status"];
  revokedAt?: string | null;
  expiresAt?: string | null;
  scope?: string[];
};

async function seedWorkspaceApiKey(
  env: Env,
  workspaceId: string,
  tenantId: string,
  serviceAccountId: string | null,
  createdByUserId: string | null,
  options: SeedApiKeyOptions = {},
): Promise<{ apiKeyId: string; plaintextKey: string }> {
  const plaintextKey = `grk_smoke_${createId("key")}`;
  const keyHash = await computeSha256Hex(plaintextKey);
  const now = nowIso();
  const expiresAt = options.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const revokedAt = options.revokedAt ?? null;
  const status = options.status ?? "active";
  const apiKeyId = createId("api");
  const keyPrefix = plaintextKey.slice(0, 32);
  const scopeJson = JSON.stringify(options.scope ?? []);
  await env.DB.prepare(
    `INSERT INTO api_keys (
        api_key_id, workspace_id, tenant_id, service_account_id, key_prefix, key_hash,
        scope_json, status, created_by_user_id, last_used_at, expires_at, revoked_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10, ?11, ?12, ?12)`,
  )
    .bind(
      apiKeyId,
      workspaceId,
      tenantId,
      serviceAccountId,
      keyPrefix,
      keyHash,
      scopeJson,
      status,
      createdByUserId,
      expiresAt,
      revokedAt,
      now,
    )
    .run();

  return {
    apiKeyId,
    plaintextKey,
  };
}

async function ensureSmokeWorkspaceContext(
  env: Env,
  tenantId: string,
): Promise<{ workspace_id: string; tenant_id: string; user_id: string }> {
  const existingWorkspace = await env.DB.prepare(
    `SELECT workspace_id, tenant_id
       FROM workspaces
      WHERE tenant_id = ?1
      LIMIT 1`,
  )
    .bind(tenantId)
    .first<{ workspace_id: string; tenant_id: string }>();
  const existingUser = await env.DB.prepare(
    `SELECT user_id
       FROM users
      ORDER BY user_id
      LIMIT 1`,
  ).first<{ user_id: string }>();
  if (existingWorkspace && existingUser) {
    return {
      workspace_id: existingWorkspace.workspace_id,
      tenant_id: existingWorkspace.tenant_id,
      user_id: existingUser.user_id,
    };
  }

  const now = nowIso();
  const organizationId = "org_smoke";
  const userId = existingUser?.user_id ?? "usr_smoke";
  const workspaceId = existingWorkspace?.workspace_id ?? "ws_smoke";

  await env.DB.prepare(
    `INSERT OR IGNORE INTO organizations (
        organization_id, slug, display_name, status, created_by_user_id, created_at, updated_at
      ) VALUES (?1, 'smoke-org', 'Smoke Org', 'active', ?2, ?3, ?3)`,
  )
    .bind(organizationId, userId, now)
    .run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (
        user_id, email, email_normalized, display_name, auth_provider, auth_subject, status,
        last_login_at, created_at, updated_at
      ) VALUES (?1, 'smoke@example.com', 'smoke@example.com', 'Smoke User', 'passwordless',
        'smoke@example.com', 'active', ?2, ?2, ?2)`,
  )
    .bind(userId, now)
    .run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO workspaces (
        workspace_id, organization_id, tenant_id, slug, display_name, status, plan_id, data_region,
        created_by_user_id, created_at, updated_at
      ) VALUES (?1, ?2, ?3, 'smoke', 'Smoke Workspace', 'active', 'plan_free', 'global', ?4, ?5, ?5)`,
  )
    .bind(workspaceId, organizationId, tenantId, userId, now)
    .run();

  return {
    workspace_id: workspaceId,
    tenant_id: tenantId,
    user_id: userId,
  };
}

async function verifyWorkspaceApiKeyAuth(): Promise<void> {
  const workspaceContext = await ensureSmokeWorkspaceContext(env, tenantId);

  const serviceAccount = await seedWorkspaceServiceAccount(
    env,
    workspaceContext.workspace_id,
    workspaceContext.tenant_id,
    workspaceContext.user_id,
  );
  const activeKey = await seedWorkspaceApiKey(
    env,
    workspaceContext.workspace_id,
    workspaceContext.tenant_id,
    serviceAccount.service_account_id,
    workspaceContext.user_id,
  );

  const runPayload = {
    input: {
      kind: "user_instruction",
      text: "Run triggered by workspace API key",
    },
    policy_context: {
      labels: ["api-key"],
    },
  };

  const runResponse = await api(
    "/api/v1/runs",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-run-1",
        authorization: `Bearer ${activeKey.plaintextKey}`,
      },
      body: JSON.stringify(runPayload),
    },
    { skipTenantHeader: true },
  );
  assert.equal(runResponse.status, 201);
  const runId = runResponse.json.data.run_id as string;
  const runRow = await env.DB.prepare(
    `SELECT run_id, tenant_id
       FROM runs
      WHERE run_id = ?1`,
  )
    .bind(runId)
    .first<{ run_id: string; tenant_id: string }>();
  assert.equal(runRow?.tenant_id, workspaceContext.tenant_id);

  const keyRecord = await env.DB.prepare(
    `SELECT last_used_at FROM api_keys WHERE api_key_id = ?1`,
  )
    .bind(activeKey.apiKeyId)
    .first<{ last_used_at: string | null }>();
  assert.ok(keyRecord?.last_used_at, "API key should have recorded last_used_at");

  const xApiKeyResponse = await api(
    "/api/v1/runs",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-run-x-api-key",
        "x-api-key": activeKey.plaintextKey,
      },
      body: JSON.stringify(runPayload),
    },
    { skipTenantHeader: true },
  );
  assert.equal(xApiKeyResponse.status, 201);
  const xApiKeyRunId = xApiKeyResponse.json.data.run_id as string;
  const xApiKeyRunRow = await env.DB.prepare("SELECT tenant_id FROM runs WHERE run_id = ?1")
    .bind(xApiKeyRunId)
    .first<{ tenant_id: string }>();
  assert.equal(xApiKeyRunRow?.tenant_id, workspaceContext.tenant_id);

  const wrongTenantResponse = await api(
    "/api/v1/runs",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-run-2",
        authorization: `Bearer ${activeKey.plaintextKey}`,
        "x-tenant-id": "wrong-tenant",
      },
      body: JSON.stringify(runPayload),
    },
    { skipTenantHeader: true },
  );
  assert.equal(wrongTenantResponse.status, 201);
  const wrongRunId = wrongTenantResponse.json.data.run_id as string;
  const wrongRunRow = await env.DB.prepare("SELECT tenant_id FROM runs WHERE run_id = ?1")
    .bind(wrongRunId)
    .first<{ tenant_id: string }>();
  assert.equal(wrongRunRow?.tenant_id, workspaceContext.tenant_id);

  const revokedKey = await seedWorkspaceApiKey(
    env,
    workspaceContext.workspace_id,
    workspaceContext.tenant_id,
    serviceAccount.service_account_id,
    workspaceContext.user_id,
    {
      status: "revoked",
      revokedAt: nowIso(),
    },
  );
  const revokedResponse = await api(
    "/api/v1/runs",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-revoked",
        authorization: `Bearer ${revokedKey.plaintextKey}`,
      },
      body: JSON.stringify(runPayload),
    },
    { skipTenantHeader: true },
  );
  assert.ok(revokedResponse.status >= 400 && revokedResponse.status < 500);
}

async function verifyWorkspaceApiKeyScopeCoverage(): Promise<void> {
  const workspaceContext = await ensureSmokeWorkspaceContext(env, tenantId);
  const runtimeServiceAccount = await seedWorkspaceServiceAccount(
    env,
    workspaceContext.workspace_id,
    workspaceContext.tenant_id,
    workspaceContext.user_id,
  );
  const approvalServiceAccount = await seedWorkspaceServiceAccount(
    env,
    workspaceContext.workspace_id,
    workspaceContext.tenant_id,
    workspaceContext.user_id,
    {
      role: "legal_approver",
      description: "Smoke approval service account",
    },
  );
  const runsWriteKey = await seedWorkspaceApiKey(
    env,
    workspaceContext.workspace_id,
    workspaceContext.tenant_id,
    runtimeServiceAccount.service_account_id,
    workspaceContext.user_id,
    {
      scope: ["runs:write"],
    },
  );
  const runsManageKey = await seedWorkspaceApiKey(
    env,
    workspaceContext.workspace_id,
    workspaceContext.tenant_id,
    runtimeServiceAccount.service_account_id,
    workspaceContext.user_id,
    {
      scope: ["runs:manage"],
    },
  );
  const approvalsWriteKey = await seedWorkspaceApiKey(
    env,
    workspaceContext.workspace_id,
    workspaceContext.tenant_id,
    approvalServiceAccount.service_account_id,
    workspaceContext.user_id,
    {
      scope: ["approvals:write"],
    },
  );
  const a2aWriteKey = await seedWorkspaceApiKey(
    env,
    workspaceContext.workspace_id,
    workspaceContext.tenant_id,
    runtimeServiceAccount.service_account_id,
    workspaceContext.user_id,
    {
      scope: ["a2a:write"],
    },
  );
  const mcpCallKey = await seedWorkspaceApiKey(
    env,
    workspaceContext.workspace_id,
    workspaceContext.tenant_id,
    runtimeServiceAccount.service_account_id,
    workspaceContext.user_id,
    {
      scope: ["mcp:call"],
    },
  );

  const runPayload = {
    input: {
      kind: "user_instruction",
      text: "Scope coverage smoke run for workspace API key",
    },
    policy_context: {
      labels: ["api-key-scope"],
    },
  };

  const allowedRun = await api(
    "/api/v1/runs",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-scope-allowed",
        authorization: `Bearer ${runsWriteKey.plaintextKey}`,
      },
      body: JSON.stringify(runPayload),
    },
    { skipTenantHeader: true },
  );
  assert.equal(allowedRun.status, 201);
  const allowedRunId = allowedRun.json.data.run_id as string;

  const deniedRun = await api(
    "/api/v1/runs",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-scope-denied",
        authorization: `Bearer ${runsManageKey.plaintextKey}`,
      },
      body: JSON.stringify(runPayload),
    },
    { skipTenantHeader: true },
  );
  assertWorkspaceApiKeyScopeDenied(deniedRun, ["runs:write"]);

  const completedRun = await waitForRunStatus(allowedRunId, "completed");

  const replayAllowed = await api(
    `/api/v1/runs/${allowedRunId}/replay`,
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-replay-allowed",
        authorization: `Bearer ${runsWriteKey.plaintextKey}`,
      },
      body: JSON.stringify({
        mode: "from_input",
        reason: "scope coverage replay allow",
      }),
    },
    { skipTenantHeader: true },
  );
  assert.equal(replayAllowed.status, 201);
  assert.equal(replayAllowed.json.data.replay_source_run_id, allowedRunId);

  const replayDenied = await api(
    `/api/v1/runs/${allowedRunId}/replay`,
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-replay-denied",
        authorization: `Bearer ${runsManageKey.plaintextKey}`,
      },
      body: JSON.stringify({
        mode: "from_step",
        from_step_id: completedRun.current_step_id,
        reason: "scope coverage replay deny",
      }),
    },
    { skipTenantHeader: true },
  );
  assertWorkspaceApiKeyScopeDenied(replayDenied, ["runs:write"]);

  const cancelCandidate = await api("/api/v1/runs", {
    method: "POST",
    headers: {
      "idempotency-key": "smoke-api-key-run-cancel-candidate",
    },
    body: JSON.stringify({
      input: {
        kind: "user_instruction",
        text: "Create a pending approval run for API key cancel scope coverage",
      },
      policy_context: {
        labels: ["external-send"],
      },
    }),
  });
  assert.equal(cancelCandidate.status, 201);
  const cancelRunId = cancelCandidate.json.data.run_id as string;
  const cancelWaiting = await waitForRunStatus(cancelRunId, "waiting_approval");
  assert.ok(cancelWaiting.pending_approval_id);

  const cancelDenied = await api(
    `/api/v1/runs/${cancelRunId}:cancel`,
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-run-cancel-denied",
        authorization: `Bearer ${runsWriteKey.plaintextKey}`,
      },
    },
    { skipTenantHeader: true },
  );
  assertWorkspaceApiKeyScopeDenied(cancelDenied, ["runs:manage"]);

  const cancelAllowed = await api(
    `/api/v1/runs/${cancelRunId}:cancel`,
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-run-cancel-allowed",
        authorization: `Bearer ${runsManageKey.plaintextKey}`,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(cancelAllowed.status, 200);
  const cancelledRun = await waitForRunStatus(cancelRunId, "cancelled");
  assert.equal(cancelledRun.status, "cancelled");

  const approvalCandidate = await api("/api/v1/runs", {
    method: "POST",
    headers: {
      "idempotency-key": "smoke-api-key-approval-candidate",
    },
    body: JSON.stringify({
      input: {
        kind: "user_instruction",
        text: "Create a pending approval for API key approval scope coverage",
      },
      policy_context: {
        labels: ["external-send"],
      },
    }),
  });
  assert.equal(approvalCandidate.status, 201);
  const approvalRunId = approvalCandidate.json.data.run_id as string;
  const approvalWaiting = await waitForRunStatus(approvalRunId, "waiting_approval");
  const approvalId = approvalWaiting.pending_approval_id as string;
  assert.ok(approvalId);

  const approvalDenied = await api(
    `/api/v1/approvals/${approvalId}/decision`,
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-approval-denied",
        authorization: `Bearer ${runsWriteKey.plaintextKey}`,
      },
      body: JSON.stringify({
        decision: "approved",
      }),
    },
    { skipTenantHeader: true },
  );
  assertWorkspaceApiKeyScopeDenied(approvalDenied, ["approvals:write"]);

  const approvalAllowed = await api(
    `/api/v1/approvals/${approvalId}/decision`,
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-approval-allowed",
        authorization: `Bearer ${approvalsWriteKey.plaintextKey}`,
      },
      body: JSON.stringify({
        decision: "approved",
      }),
    },
    { skipTenantHeader: true },
  );
  assert.equal(approvalAllowed.status, 200);

  const inboundPayload = {
    task_id: `remote-task-scope-${createId("task")}`,
    message_id: `remote-msg-scope-${createId("msg")}`,
    sender: {
      agent_id: "agent_remote_scope_test",
    },
    target: {
      agent_id: "agent_control_plane",
    },
    content: {
      type: "text",
      text: "Scope coverage inbound message",
    },
    metadata: {
      remote_endpoint: "https://remote.example.test/a2a/message:send",
    },
  };

  const a2aDenied = await api(
    "/api/v1/a2a/message:send",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-a2a-denied",
        authorization: `Bearer ${runsWriteKey.plaintextKey}`,
      },
      body: JSON.stringify(inboundPayload),
    },
    { skipTenantHeader: true },
  );
  assertWorkspaceApiKeyScopeDenied(a2aDenied, ["a2a:write"]);

  const a2aAllowed = await api(
    "/api/v1/a2a/message:send",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-a2a-allowed",
        authorization: `Bearer ${a2aWriteKey.plaintextKey}`,
      },
      body: JSON.stringify({
        ...inboundPayload,
        task_id: `remote-task-scope-${createId("task")}`,
        message_id: `remote-msg-scope-${createId("msg")}`,
      }),
    },
    { skipTenantHeader: true },
  );
  assert.equal(a2aAllowed.status, 202);

  const outboundCandidate = await createApprovedOutboundRun({
    key: "smoke-api-key-a2a-cancel-candidate",
    text: "Create outbound task for API key a2a cancel scope coverage",
  });
  const outboundTask = await findOutboundTask(outboundCandidate.runId);

  const a2aCancelDenied = await api(
    `/api/v1/a2a/tasks/${outboundTask.task_id}:cancel`,
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-a2a-cancel-denied",
        authorization: `Bearer ${runsWriteKey.plaintextKey}`,
      },
    },
    { skipTenantHeader: true },
  );
  assertWorkspaceApiKeyScopeDenied(a2aCancelDenied, ["a2a:write"]);

  const a2aCancelAllowed = await api(
    `/api/v1/a2a/tasks/${outboundTask.task_id}:cancel`,
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-a2a-cancel-allowed",
        authorization: `Bearer ${a2aWriteKey.plaintextKey}`,
      },
    },
    { skipTenantHeader: true },
  );
  assert.equal(a2aCancelAllowed.status, 200);

  const mcpDenied = await api(
    "/api/v1/mcp/tp_email",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-mcp-denied",
        authorization: `Bearer ${runsWriteKey.plaintextKey}`,
        "x-run-id": allowedRunId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-scope-denied",
        method: "tools/call",
        params: {
          name: "send_email",
          arguments: {
            to: ["vendor@example.com"],
            subject: "Scope denied check",
            body: "blocked by scope",
          },
        },
      }),
    },
    { skipTenantHeader: true },
  );
  assertWorkspaceApiKeyScopeDenied(mcpDenied, ["mcp:call"]);

  const mcpAllowed = await api(
    "/api/v1/mcp/tp_email",
    {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-api-key-mcp-allowed",
        authorization: `Bearer ${mcpCallKey.plaintextKey}`,
        "x-run-id": allowedRunId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-scope-allowed",
        method: "tools/call",
        params: {
          name: "send_email",
          arguments: {
            to: ["vendor@example.com"],
            subject: "Scope allowed check",
            body: "requires approval",
          },
        },
      }),
    },
    { skipTenantHeader: true },
  );
  assert.equal(mcpAllowed.status, 423);
  assert.equal(mcpAllowed.json.error.code, "approval_required");
}

function assertWorkspaceApiKeyScopeDenied(
  response: { status: number; json: any },
  requiredScopes: string[],
): void {
  assert.equal(response.status, 403);
  assert.equal(
    response.json.error.code,
    "workspace_api_key_scope_denied",
    "expected workspace API key scope enforcement error code",
  );
  assert.deepEqual(response.json.error.details.required_scopes, requiredScopes);
}

function parseSseEvents(text: string): Array<{ event: string; data: string; id?: string }> {
  return text
    .trim()
    .split(/\n\n+/)
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => {
      const event: { event: string; data: string; id?: string } = { event: "message", data: "" };
      const dataLines: string[] = [];

      for (const line of chunk.split(/\r?\n/)) {
        if (line.startsWith("event:")) {
          event.event = line.slice("event:".length).trim();
          continue;
        }
        if (line.startsWith("id:")) {
          event.id = line.slice("id:".length).trim();
          continue;
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.slice("data:".length).replace(/^ /, ""));
        }
      }

      event.data = dataLines.join("\n");
      return event;
    });
}

async function createMockEnv(): Promise<MockEnv> {
  const db = new MockD1Database();
  const bucket = new MockR2Bucket();
  const queue = new MockQueue();
  const runCoordinator = new MockRunCoordinatorNamespace();
  const approvalSession = new MockApprovalSessionNamespace();
  const rateLimiter = new MockRateLimiterNamespace();
  const workflow = new MockWorkflowBinding({
    db,
    bucket,
    queue,
    runCoordinator,
    approvalSession,
    secrets: {
      MCP_API_TOKEN: "mcp-secret-token",
      A2A_SHARED_KEY: "a2a-shared-key",
    },
  });

  return {
    MCP_API_TOKEN: "mcp-secret-token",
    A2A_SHARED_KEY: "a2a-shared-key",
    RATE_LIMIT_RUNS_PER_MINUTE: "0",
    RATE_LIMIT_REPLAYS_PER_MINUTE: "0",
    DB: db as unknown as D1Database,
    ARTIFACTS_BUCKET: bucket as unknown as R2Bucket,
    EVENT_QUEUE: queue as unknown as Queue,
    RUN_COORDINATOR: runCoordinator as unknown as DurableObjectNamespace,
    APPROVAL_SESSION: approvalSession as unknown as DurableObjectNamespace,
    RATE_LIMITER: rateLimiter as unknown as DurableObjectNamespace,
    RUN_WORKFLOW: workflow as unknown as Workflow<RunWorkflowParams>,
    __workflow: workflow,
    __queue: queue,
  };
}

async function applyMigrations(db: D1Database): Promise<void> {
  const migrationFiles = (await readdir("migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const migrationFile of migrationFiles) {
    const sql = await readFile(`migrations/${migrationFile}`, "utf8");
    const statements = sql
      .split(/;\s*\n/g)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await db.prepare(statement).run();
    }
  }
}

async function verifyOutboundAuthRef(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let capturedApiKey = "";
  let capturedTenantId = "";
  let capturedTraceId = "";
  let capturedPostUrl = "";
  let capturedIdempotencyKey = "";
  let capturedTargetAgentId = "";
  let capturedContentText = "";
  let capturedOriginRunId = "";
  let capturedOriginTraceId = "";
  let cardFetchCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === "GET") {
      cardFetchCount += 1;
      return new Response(
        JSON.stringify({
          name: "Remote Auth Test Agent",
          endpoints: {
            message_send: "/api/v1/a2a/message:send",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    capturedApiKey = request.headers.get("x-api-key") ?? "";
    capturedTenantId = request.headers.get("x-tenant-id") ?? "";
    capturedTraceId = request.headers.get("x-trace-id") ?? "";
    capturedIdempotencyKey = request.headers.get("idempotency-key") ?? "";
    capturedPostUrl = request.url;
    const payload = (await request.json()) as {
      target?: { agent_id?: string };
      content?: { text?: string };
      metadata?: { origin_run_id?: string; origin_trace_id?: string };
    };
    capturedTargetAgentId = payload.target?.agent_id ?? "";
    capturedContentText = payload.content?.text ?? "";
    capturedOriginRunId = payload.metadata?.origin_run_id ?? "";
    capturedOriginTraceId = payload.metadata?.origin_trace_id ?? "";
    return new Response(
      JSON.stringify({
        accepted: true,
        task_id: "remote_task_auth_test",
        status: "completed",
        message_id: "msg_remote_auth_test",
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const result = await dispatchOutboundTask({
      env: env as Env,
      tenantId,
      runId: "run_auth_outbound_test",
      traceId: "trc_auth_outbound_test",
      subjectId: "user_auth_test",
      config: {
        endpoint_url: "https://remote-agent.example.test/a2a/message:send",
        agent_id: "agent_remote_auth_test",
        auth_ref: "header:X-Api-Key:A2A_SHARED_KEY",
        wait_for_completion: false,
      },
    });
    assert.equal(result.status, "completed");
    assert.equal(result.usedAgentCard, true);
    assert.equal(result.agentCardUrl, "https://remote-agent.example.test/.well-known/agent-card.json");
    assert.equal(result.resolvedEndpointUrl, "https://remote-agent.example.test/api/v1/a2a/message:send");
    assert.equal(cardFetchCount, 1);
    assert.equal(capturedApiKey, "a2a-shared-key");
    assert.equal(capturedTenantId, tenantId);
    assert.equal(capturedTraceId, "trc_auth_outbound_test");
    assert.equal(capturedIdempotencyKey, "a2a-outbound:run_auth_outbound_test:agent_remote_auth_test");
    assert.equal(capturedPostUrl, "https://remote-agent.example.test/api/v1/a2a/message:send");
    assert.equal(capturedTargetAgentId, "agent_remote_auth_test");
    assert.equal(capturedContentText, "Dispatch from run run_auth_outbound_test");
    assert.equal(capturedOriginRunId, "run_auth_outbound_test");
    assert.equal(capturedOriginTraceId, "trc_auth_outbound_test");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyOutboundAgentCardCache(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let cardFetchCount = 0;
  let messageSendCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === "GET") {
      cardFetchCount += 1;
      return new Response(
        JSON.stringify({
          name: "Remote Cache Test Agent",
          endpoints: {
            message_send: "/gateway/a2a/message:send",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    messageSendCount += 1;
    assert.equal(request.url, "https://remote-cache.example.test/gateway/a2a/message:send");
    return new Response(
      JSON.stringify({
        accepted: true,
        task_id: `remote_task_cache_test_${messageSendCount}`,
        status: "in_progress",
        message_id: `msg_remote_cache_test_${messageSendCount}`,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const first = await dispatchOutboundTask({
      env: env as Env,
      tenantId,
      runId: "run_card_cache_test_1",
      traceId: "trc_card_cache_test_1",
      subjectId: "user_cache_test",
      config: {
        endpoint_url: "https://remote-cache.example.test/a2a/message:send",
        agent_id: "agent_remote_cache_test",
        wait_for_completion: false,
      },
    });

    const second = await dispatchOutboundTask({
      env: env as Env,
      tenantId,
      runId: "run_card_cache_test_2",
      traceId: "trc_card_cache_test_2",
      subjectId: "user_cache_test",
      config: {
        endpoint_url: "https://remote-cache.example.test/a2a/message:send",
        agent_id: "agent_remote_cache_test",
        wait_for_completion: false,
      },
    });

    assert.equal(first.usedAgentCard, true);
    assert.equal(second.usedAgentCard, true);
    assert.equal(first.resolvedEndpointUrl, "https://remote-cache.example.test/gateway/a2a/message:send");
    assert.equal(second.resolvedEndpointUrl, "https://remote-cache.example.test/gateway/a2a/message:send");
    assert.equal(cardFetchCount, 1);
    assert.equal(messageSendCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyOutboundAgentCardCrossOriginFallback(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let cardFetchCount = 0;
  let messageSendCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === "GET") {
      cardFetchCount += 1;
      return new Response(
        JSON.stringify({
          name: "Cross Origin Agent",
          endpoints: {
            message_send: "https://evil.example.test/a2a/message:send",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    messageSendCount += 1;
    return new Response(
      JSON.stringify({
        accepted: true,
        task_id: "remote_task_cross_origin_fallback",
        status: "completed",
        message_id: "msg_remote_cross_origin_fallback",
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        dispatchOutboundTask({
          env: env as Env,
          tenantId,
          runId: "run_card_cross_origin_test",
          traceId: "trc_card_cross_origin_test",
          subjectId: "user_cross_origin_test",
          config: {
            endpoint_url: "https://remote-cross-origin.example.test/a2a/message:send",
            agent_id: "agent_remote_cross_origin_test",
            wait_for_completion: false,
          },
        }),
      /missing a valid same-origin endpoints\.message_send/,
    );
    assert.equal(cardFetchCount, 1);
    assert.equal(messageSendCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyOutboundAgentCardRedirectFallback(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let cardFetchCount = 0;
  let messageSendCount = 0;
  let capturedPostUrl = "";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === "GET") {
      cardFetchCount += 1;
      return {
        ok: true,
        url: "https://evil-redirect.example.test/.well-known/agent-card.json",
        json: async () => ({
          name: "Redirected Agent Card",
          endpoints: {
            message_send: "/gateway/send",
          },
        }),
      } as unknown as Response;
    }

    messageSendCount += 1;
    capturedPostUrl = request.url;
    return new Response(
      JSON.stringify({
        accepted: true,
        task_id: "remote_task_redirect_fallback",
        status: "completed",
        message_id: "msg_remote_redirect_fallback",
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const result = await dispatchOutboundTask({
      env: env as Env,
      tenantId,
      runId: "run_card_redirect_test",
      traceId: "trc_card_redirect_test",
      subjectId: "user_redirect_test",
      config: {
        endpoint_url: "https://remote-redirect.example.test/a2a/message:send",
        agent_id: "agent_remote_redirect_test",
        wait_for_completion: false,
      },
    });

    assert.equal(result.usedAgentCard, false);
    assert.equal(result.agentCardUrl, undefined);
    assert.equal(result.resolvedEndpointUrl, "https://remote-redirect.example.test/a2a/message:send");
    assert.equal(cardFetchCount, 1);
    assert.equal(messageSendCount, 1);
    assert.equal(capturedPostUrl, "https://remote-redirect.example.test/a2a/message:send");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyOutboundProviderScopedPolicies(): Promise<void> {
  const now = nowIso();
  const providers = [
    {
      tool_provider_id: "tp_remote_a2a_policy_a",
      name: "Remote A2A Provider A",
      endpoint_url: "https://provider-policy-a.example.test/a2a/message:send",
    },
    {
      tool_provider_id: "tp_remote_a2a_policy_b",
      name: "Remote A2A Provider B",
      endpoint_url: "https://provider-policy-b.example.test/a2a/message:send",
    },
    {
      tool_provider_id: "tp_remote_a2a_policy_c",
      name: "Remote A2A Provider C",
      endpoint_url: "https://provider-policy-c.example.test/a2a/message:send",
    },
  ];

  for (const provider of providers) {
    await env.DB.prepare(
      `INSERT INTO tool_providers (
          tool_provider_id, tenant_id, name, provider_type, endpoint_url, auth_ref,
          visibility_policy_ref, execution_policy_ref, status, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, 'active', ?7, ?7)`,
    )
      .bind(
        provider.tool_provider_id,
        tenantId,
        provider.name,
        "http_api",
        provider.endpoint_url,
        "header:X-Api-Key:A2A_SHARED_KEY",
        now,
      )
      .run();
  }

  await env.DB.batch([
    env.DB
      .prepare(
        `INSERT INTO policies (
            policy_id, tenant_id, channel, tool_provider_id, tool_name, decision, approver_roles_json,
            priority, status, conditions_json, approval_config_json, created_at, updated_at
          ) VALUES (?1, ?2, 'a2a_dispatch', ?3, NULL, 'approval_required', ?4, 100, 'active', ?5, ?6, ?7, ?7)`,
      )
      .bind(
        "pol_a2a_provider_a_approval_v1",
        tenantId,
        "tp_remote_a2a_policy_a",
        JSON.stringify(["security_approver"]),
        JSON.stringify({
          labels: ["vendor-share"],
          risk_level: "high",
        }),
        JSON.stringify({
          approver_roles: ["security_approver"],
          timeout_seconds: 3600,
        }),
        now,
      ),
    env.DB
      .prepare(
        `INSERT INTO policies (
            policy_id, tenant_id, channel, tool_provider_id, tool_name, decision, approver_roles_json,
            priority, status, conditions_json, approval_config_json, created_at, updated_at
          ) VALUES (?1, ?2, 'a2a_dispatch', ?3, NULL, 'approval_required', ?4, 100, 'active', ?5, ?6, ?7, ?7)`,
      )
      .bind(
        "pol_a2a_provider_b_condition_mismatch_v1",
        tenantId,
        "tp_remote_a2a_policy_b",
        JSON.stringify(["security_approver"]),
        JSON.stringify({
          labels: ["finance"],
          risk_level: "medium",
        }),
        JSON.stringify({
          approver_roles: ["security_approver"],
          timeout_seconds: 3600,
        }),
        now,
      ),
    env.DB
      .prepare(
        `INSERT INTO policies (
            policy_id, tenant_id, channel, tool_provider_id, tool_name, decision, approver_roles_json,
            priority, status, conditions_json, approval_config_json, created_at, updated_at
          ) VALUES (?1, ?2, 'a2a_dispatch', ?3, NULL, 'deny', '[]', 100, 'active', ?4, '{}', ?5, ?5)`,
      )
      .bind(
        "pol_a2a_provider_c_deny_v1",
        tenantId,
        "tp_remote_a2a_policy_c",
        JSON.stringify({
          labels: ["restricted-share"],
          risk_level: "high",
        }),
        now,
      ),
  ]);

  const originalFetch = globalThis.fetch;
  const cardFetchUrls: string[] = [];
  const outboundPostUrls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === "GET") {
      cardFetchUrls.push(request.url);
      return new Response(
        JSON.stringify({
          name: "Scoped Policy Agent",
          endpoints: {
            message_send: "/gateway/send",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    outboundPostUrls.push(request.url);
    return new Response(
      JSON.stringify({
        accepted: true,
        task_id: `remote_task_${outboundPostUrls.length}`,
        status: "completed",
        message_id: `msg_remote_${outboundPostUrls.length}`,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const providerA = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-a2a-policy-provider-a",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "請派發 provider A 產生內部摘要",
        },
        policy_context: {
          labels: ["vendor-share"],
          risk_tier: "high",
        },
        context: {
          a2a_dispatch: {
            tool_provider_id: "tp_remote_a2a_policy_a",
            agent_id: "agent_remote_policy_a",
            wait_for_completion: false,
          },
        },
      }),
    });
    assert.equal(providerA.status, 201);
    const providerARunId = providerA.json.data.run_id as string;
    const providerAWaiting = await waitForRunStatus(providerARunId, "waiting_approval");
    const providerAApprovalId = providerAWaiting.pending_approval_id as string;
    assert.ok(providerAApprovalId);

    const providerAApproval = await env.DB.prepare(
      `SELECT policy_id, subject_type, subject_ref, approver_scope_json
         FROM approvals
        WHERE tenant_id = ?1 AND approval_id = ?2`,
    )
      .bind(tenantId, providerAApprovalId)
      .first<{
        policy_id: string;
        subject_type: string;
        subject_ref: string;
        approver_scope_json: string;
      }>();
    assert.equal(providerAApproval?.policy_id, "pol_a2a_provider_a_approval_v1");
    assert.equal(providerAApproval?.subject_type, "a2a_dispatch");
    assert.equal(providerAApproval?.subject_ref, "agent_remote_policy_a");
    assert.deepEqual(JSON.parse(providerAApproval?.approver_scope_json ?? "{}"), {
      approver_roles: ["security_approver"],
    });
    const providerAApprovalPayloadObject = await env.ARTIFACTS_BUCKET.get(
      `tenants/${tenantId}/runs/${providerARunId}/audit/${providerAApprovalId}.json`,
    );
    const providerAApprovalPayload = providerAApprovalPayloadObject
      ? ((await providerAApprovalPayloadObject.json()) as {
          summary?: {
            action?: string;
            provider?: string | null;
            risk_level?: string | null;
            reason?: string;
          };
          subject_snapshot?: {
            tool_provider_id?: string | null;
            agent_id?: string;
          };
          trace?: {
            trace_id?: string;
            run_id?: string;
            step_id?: string;
          };
        })
      : null;
    assert.equal(providerAApprovalPayload?.summary?.action, "dispatch_a2a_task");
    assert.equal(providerAApprovalPayload?.summary?.provider, "tp_remote_a2a_policy_a");
    assert.equal(providerAApprovalPayload?.summary?.risk_level, "high");
    assert.match(providerAApprovalPayload?.summary?.reason ?? "", /pol_a2a_provider_a_approval_v1/);
    assert.equal(providerAApprovalPayload?.subject_snapshot?.tool_provider_id, "tp_remote_a2a_policy_a");
    assert.equal(providerAApprovalPayload?.subject_snapshot?.agent_id, "agent_remote_policy_a");
    assert.equal(providerAApprovalPayload?.trace?.run_id, providerARunId);
    assert.equal(providerAApprovalPayload?.trace?.step_id !== undefined, true);
    assert.equal(cardFetchUrls.length, 0);
    assert.equal(outboundPostUrls.length, 0);

    const providerAApproved = await api(`/api/v1/approvals/${providerAApprovalId}/decision`, {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-a2a-policy-provider-a-approval",
        "x-subject-id": "user_security_provider_a",
        "x-subject-roles": "security_approver",
      },
      body: JSON.stringify({
        decision: "approved",
      }),
    });
    assert.equal(providerAApproved.status, 200);
    await waitForRunStatus(providerARunId, "completed");

    const providerATask = await env.DB.prepare(
      `SELECT remote_endpoint_url
         FROM a2a_tasks
        WHERE tenant_id = ?1 AND run_id = ?2 AND direction = 'outbound'
        LIMIT 1`,
    )
      .bind(tenantId, providerARunId)
      .first<{ remote_endpoint_url: string }>();
    assert.equal(providerATask?.remote_endpoint_url, "https://provider-policy-a.example.test/gateway/send");

    const providerB = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-a2a-policy-provider-b",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "請派發 provider B 產生內部摘要",
        },
        policy_context: {
          labels: ["vendor-share"],
          risk_tier: "high",
        },
        context: {
          a2a_dispatch: {
            tool_provider_id: "tp_remote_a2a_policy_b",
            agent_id: "agent_remote_policy_b",
            wait_for_completion: false,
          },
        },
      }),
    });
    assert.equal(providerB.status, 201);
    const providerBRunId = providerB.json.data.run_id as string;
    await waitForRunStatus(providerBRunId, "completed");
    const providerBApprovalCount = await env.DB.prepare(
      `SELECT COUNT(*) AS total
         FROM approvals
        WHERE tenant_id = ?1 AND run_id = ?2`,
    )
      .bind(tenantId, providerBRunId)
      .first<{ total: number }>();
    assert.equal(providerBApprovalCount?.total, 0);
    const providerBEvents = await api(`/api/v1/runs/${providerBRunId}/events`);
    assert.equal(providerBEvents.status, 200);
    const providerBApprovalCreated = (
      providerBEvents.json.data.items as Array<{ event_type: string }>
    ).some((event) => event.event_type === "approval_created");
    assert.equal(providerBApprovalCreated, false);

    const providerBDispatchStep = await env.DB.prepare(
      `SELECT metadata_json
         FROM run_steps
        WHERE tenant_id = ?1 AND run_id = ?2 AND step_type = 'a2a_dispatch'
        LIMIT 1`,
    )
      .bind(tenantId, providerBRunId)
      .first<{ metadata_json: string }>();
    const providerBMetadata = JSON.parse(providerBDispatchStep?.metadata_json ?? "{}") as {
      tool_provider_id?: string;
      resolved_endpoint_url?: string;
      used_agent_card?: boolean;
    };
    assert.equal(providerBMetadata.tool_provider_id, "tp_remote_a2a_policy_b");
    assert.equal(providerBMetadata.resolved_endpoint_url, "https://provider-policy-b.example.test/gateway/send");
    assert.equal(providerBMetadata.used_agent_card, true);

    const providerC = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-a2a-policy-provider-c",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "請派發 provider C 產生內部摘要",
        },
        policy_context: {
          labels: ["restricted-share"],
          risk_tier: "high",
        },
        context: {
          a2a_dispatch: {
            tool_provider_id: "tp_remote_a2a_policy_c",
            agent_id: "agent_remote_policy_c",
            wait_for_completion: false,
          },
        },
      }),
    });
    assert.equal(providerC.status, 201);
    const providerCRunId = providerC.json.data.run_id as string;
    await waitForRunStatus(providerCRunId, "failed");
    const providerCRun = await env.DB.prepare(
      `SELECT error_code
         FROM runs
        WHERE tenant_id = ?1 AND run_id = ?2`,
    )
      .bind(tenantId, providerCRunId)
      .first<{ error_code: string | null }>();
    assert.equal(providerCRun?.error_code, "policy_denied");

    const providerCTaskCount = await env.DB.prepare(
      `SELECT COUNT(*) AS total
         FROM a2a_tasks
        WHERE tenant_id = ?1 AND run_id = ?2 AND direction = 'outbound'`,
    )
      .bind(tenantId, providerCRunId)
      .first<{ total: number }>();
    assert.equal(providerCTaskCount?.total, 0);
    assert.equal(
      outboundPostUrls.includes("https://provider-policy-c.example.test/gateway/send"),
      false,
    );
    assert.equal(
      cardFetchUrls.includes("https://provider-policy-c.example.test/.well-known/agent-card.json"),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyOutboundToolProviderResolution(): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO tool_providers (
        tool_provider_id, tenant_id, name, provider_type, endpoint_url, auth_ref,
        visibility_policy_ref, execution_policy_ref, status, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, 'active', ?7, ?7)`,
  )
    .bind(
      "tp_remote_a2a",
      tenantId,
      "Remote A2A Provider",
      "http_api",
      "https://provider-remote.example.test/a2a/message:send",
      "header:X-Api-Key:A2A_SHARED_KEY",
      now,
    )
    .run();

  const originalFetch = globalThis.fetch;
  let outboundFetchCount = 0;
  let cardFetchCount = 0;
  let capturedApiKey = "";
  let capturedPostUrl = "";
  let capturedIdempotencyKey = "";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === "GET") {
      cardFetchCount += 1;
      assert.equal(request.url, "https://provider-remote.example.test/.well-known/agent-card.json");
      return new Response(
        JSON.stringify({
          name: "Provider Backed Agent",
          endpoints: {
            message_send: "/gateway/send",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    outboundFetchCount += 1;
    capturedApiKey = request.headers.get("x-api-key") ?? "";
    capturedPostUrl = request.url;
    capturedIdempotencyKey = request.headers.get("idempotency-key") ?? "";
    return new Response(
      JSON.stringify({
        accepted: true,
        task_id: "remote_task_provider_resolution",
        status: "completed",
        message_id: "msg_remote_provider_resolution",
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const created = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-a2a-provider-resolution",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "請派發給遠端 provider 解析測試",
        },
        context: {
          a2a_dispatch: {
            tool_provider_id: "tp_remote_a2a",
            agent_id: "agent_remote_provider",
            wait_for_completion: false,
          },
        },
      }),
    });
    assert.equal(created.status, 201);
    const runId = created.json.data.run_id as string;
    await waitForRunStatus(runId, "completed");

    const outboundTask = await env.DB.prepare(
      `SELECT remote_endpoint_url
         FROM a2a_tasks
        WHERE tenant_id = ?1 AND run_id = ?2 AND direction = 'outbound'
        LIMIT 1`,
    )
      .bind(tenantId, runId)
      .first<{ remote_endpoint_url: string }>();
    assert.equal(outboundTask?.remote_endpoint_url, "https://provider-remote.example.test/gateway/send");

    const dispatchStep = await env.DB.prepare(
      `SELECT metadata_json
         FROM run_steps
        WHERE tenant_id = ?1 AND run_id = ?2 AND step_type = 'a2a_dispatch'
        LIMIT 1`,
    )
      .bind(tenantId, runId)
      .first<{ metadata_json: string }>();
    const metadata = JSON.parse(dispatchStep?.metadata_json ?? "{}") as {
      tool_provider_id?: string;
      resolved_endpoint_url?: string;
      used_agent_card?: boolean;
    };
    assert.equal(metadata.tool_provider_id, "tp_remote_a2a");
    assert.equal(metadata.resolved_endpoint_url, "https://provider-remote.example.test/gateway/send");
    assert.equal(metadata.used_agent_card, true);
    assert.equal(cardFetchCount, 1);
    assert.equal(outboundFetchCount, 1);
    assert.equal(capturedApiKey, "a2a-shared-key");
    assert.equal(capturedPostUrl, "https://provider-remote.example.test/gateway/send");
    assert.equal(capturedIdempotencyKey, `a2a-outbound:${runId}:tp_remote_a2a`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyOutboundToolProviderConflictingFieldsRejected(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    throw new Error("fetch should not be called for conflicting outbound provider input");
  }) as typeof fetch;

  try {
    const created = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-a2a-provider-conflicting-fields",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "這筆 provider-backed outbound 不該接受混入的 transport 欄位",
        },
        context: {
          a2a_dispatch: {
            tool_provider_id: "tp_remote_a2a",
            agent_id: "agent_remote_provider",
            endpoint_url: "https://malicious.example.test/a2a/message:send",
            auth_ref: "header:X-Api-Key:SHOULD_NOT_BE_USED",
            wait_for_completion: false,
          },
        },
      }),
    });
    assert.equal(created.status, 400);
    assert.equal(created.json.error.code, "invalid_request");
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyOutboundHttpEndpointRequiresProvider(): Promise<void> {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    throw new Error("fetch should not be called for rejected outbound input");
  }) as typeof fetch;

  try {
    const created = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-a2a-direct-http-rejected",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "這筆請求應該在 API 邊界被拒絕",
        },
        context: {
          a2a_dispatch: {
            endpoint_url: "https://unsafe.example.test/a2a/message:send",
            agent_id: "agent_remote_unsafe",
            wait_for_completion: false,
          },
        },
      }),
    });
    assert.equal(created.status, 400);
    assert.equal(created.json.error.code, "invalid_request");
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyOutboundProviderHttpEndpointRejected(): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO tool_providers (
        tool_provider_id, tenant_id, name, provider_type, endpoint_url, auth_ref,
        visibility_policy_ref, execution_policy_ref, status, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, NULL, 'active', ?6, ?6)`,
  )
    .bind(
      "tp_remote_a2a_http",
      tenantId,
      "Remote A2A HTTP Provider",
      "http_api",
      "http://provider-remote-http.example.test/a2a/message:send",
      now,
    )
    .run();

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    throw new Error("fetch should not be called for rejected provider-backed outbound input");
  }) as typeof fetch;

  try {
    const created = await api("/api/v1/runs", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-run-a2a-provider-http-rejected",
      },
      body: JSON.stringify({
        input: {
          kind: "user_instruction",
          text: "這筆 provider-backed http outbound 應該被拒絕",
        },
        context: {
          a2a_dispatch: {
            tool_provider_id: "tp_remote_a2a_http",
            agent_id: "agent_remote_http_rejected",
            wait_for_completion: false,
          },
        },
      }),
    });
    assert.equal(created.status, 400);
    assert.equal(created.json.error.code, "invalid_request");
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyMcpAuthRef(): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO tool_providers (
        tool_provider_id, tenant_id, name, provider_type, endpoint_url, auth_ref,
        visibility_policy_ref, execution_policy_ref, status, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, 'active', ?7, ?7)`,
  )
    .bind(
      "tp_secure",
      tenantId,
      "Secure MCP",
      "mcp_server",
      "https://mcp.example.test/rpc",
      "bearer:MCP_API_TOKEN",
      now,
    )
    .run();

  const created = await api("/api/v1/runs", {
    method: "POST",
    headers: {
      "idempotency-key": "smoke-run-auth-mcp",
    },
    body: JSON.stringify({
      input: {
        kind: "user_instruction",
        text: "請執行安全 MCP 測試",
      },
    }),
  });
  assert.equal(created.status, 201);
  const runId = created.json.data.run_id as string;
  await waitForRunStatus(runId, "completed");

  const originalFetch = globalThis.fetch;
  let capturedAuthorization = "";
  let capturedContentType = "";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    capturedAuthorization = request.headers.get("authorization") ?? "";
    capturedContentType = request.headers.get("content-type") ?? "";
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc_secure_1",
        result: {
          content: [
            {
              type: "text",
              text: "secure upstream response",
            },
          ],
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const response = await api("/api/v1/mcp/tp_secure", {
      method: "POST",
      headers: {
        "idempotency-key": "smoke-mcp-auth-1",
        "x-run-id": runId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc_secure_1",
        method: "tools/call",
        params: {
          name: "read_erp",
          arguments: {
            query: "select 1",
          },
        },
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(capturedAuthorization, "Bearer mcp-secret-token");
    assert.equal(capturedContentType, "application/json");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function poll<T>(
  fn: () => Promise<T | null>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const intervalMs = options.intervalMs ?? 50;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out while waiting for smoke condition");
}

async function waitForRunStatus(
  runId: string,
  expectedStatus: string,
): Promise<Record<string, unknown>> {
  return poll(async () => {
    const result = await api(`/api/v1/runs/${runId}`);
    return result.json.data.status === expectedStatus ? result.json.data : null;
  });
}

async function findOutboundTask(
  runId: string,
): Promise<{ task_id: string; remote_task_id: string }> {
  return poll(async () => {
    const row = await env.DB.prepare(
      `SELECT task_id, remote_task_id
         FROM a2a_tasks
        WHERE run_id = ?1 AND direction = 'outbound'
        LIMIT 1`,
    )
      .bind(runId)
      .first<{ task_id: string; remote_task_id: string }>();
    return row ?? null;
  });
}

async function createApprovedOutboundRun(args: {
  key: string;
  text: string;
}): Promise<{ runId: string; approvalId: string }> {
  const created = await api("/api/v1/runs", {
    method: "POST",
    headers: {
      "idempotency-key": args.key,
    },
    body: JSON.stringify({
      input: {
        kind: "user_instruction",
        text: args.text,
      },
      context: {
        a2a_dispatch: {
          endpoint_url: "mock://remote-agent",
          agent_id: "agent_remote_supplier_analysis",
          wait_for_completion: true,
        },
      },
      policy_context: {
        labels: ["external-send"],
      },
    }),
  });
  assert.equal(created.status, 201);
  const runId = created.json.data.run_id as string;
  const waitingRun = await waitForRunStatus(runId, "waiting_approval");
  const approvalId = waitingRun.pending_approval_id as string;
  const approved = await api(`/api/v1/approvals/${approvalId}/decision`, {
    method: "POST",
    headers: {
      "idempotency-key": `${args.key}-approval`,
      "x-subject-id": "user_legal_1",
      "x-subject-roles": "legal_approver",
    },
    body: JSON.stringify({
      decision: "approved",
    }),
  });
  assert.equal(approved.status, 200);
  return { runId, approvalId };
}

class MockD1Database {
  private readonly db = new DatabaseSync(":memory:");

  prepare(query: string): MockPreparedStatement {
    return new MockPreparedStatement(this.db, query);
  }

  async batch(statements: MockPreparedStatement[]): Promise<Array<{ results?: unknown[] }>> {
    const results: Array<{ results?: unknown[] }> = [];
    for (const statement of statements) {
      results.push(await statement.execute());
    }
    return results;
  }
}

class MockQueue {
  readonly messages: AuditEventEnvelope[] = [];

  async send(message: AuditEventEnvelope): Promise<void> {
    this.messages.push(message);
  }
}

class MockMessageBatch implements MessageBatch<unknown> {
  constructor(
    public readonly queue: string,
    public readonly messages: readonly Message<unknown>[],
  ) {}

  retryAll(): void {}

  ackAll(): void {
    for (const message of this.messages) {
      message.ack();
    }
  }
}

class MockQueueMessage implements Message<unknown> {
  readonly id = createId("msg");
  readonly timestamp = new Date();
  readonly attempts = 1;
  acked = false;
  retried = false;

  constructor(public readonly body: unknown) {}

  retry(): void {
    this.retried = true;
  }

  ack(): void {
    this.acked = true;
  }
}

class MockPreparedStatement {
  private params: unknown[] = [];

  constructor(
    private readonly db: DatabaseSync,
    private readonly query: string,
  ) {}

  bind(...params: unknown[]): MockPreparedStatement {
    this.params = params;
    return this;
  }

  async run(): Promise<{ success: true; results?: unknown[] }> {
    return this.execute();
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.query).get(...toSqlParams(this.params)) as T | undefined;
    return row ?? null;
  }

  async execute(): Promise<{ success: true; results?: unknown[] }> {
    const normalized = this.query.trim().toUpperCase();
    const statement = this.db.prepare(this.query);
    if (normalized.startsWith("SELECT")) {
      return {
        success: true,
        results: statement.all(...toSqlParams(this.params)) as unknown[],
      };
    }
    statement.run(...toSqlParams(this.params));
    return { success: true };
  }
}

class MockR2Bucket {
  private readonly objects = new Map<string, string>();

  async put(key: string, value: string | ArrayBuffer | ArrayBufferView | Blob | null): Promise<void> {
    if (value === null) {
      this.objects.delete(key);
      return;
    }
    if (typeof value === "string") {
      this.objects.set(key, value);
      return;
    }
    if (value instanceof Blob) {
      this.objects.set(key, await value.text());
      return;
    }
    if (ArrayBuffer.isView(value)) {
      this.objects.set(key, Buffer.from(value.buffer).toString("utf8"));
      return;
    }
    this.objects.set(key, Buffer.from(value).toString("utf8"));
  }

  async get(key: string): Promise<{ json(): Promise<unknown>; text(): Promise<string> } | null> {
    const value = this.objects.get(key);
    if (value === undefined) {
      return null;
    }
    return {
      async json() {
        return JSON.parse(value);
      },
      async text() {
        return value;
      },
    };
  }
}

class MockRunCoordinatorNamespace {
  private readonly store = new Map<string, Record<string, unknown>>();

  idFromName(name: string): string {
    return name;
  }

  get(id: string): { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } {
    return {
      fetch: async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input.toString());
        if (init?.method === "POST" && url.pathname === "/init") {
          this.store.set(id, JSON.parse(init.body as string));
          return new Response(null, { status: 204 });
        }
        const current = this.store.get(id);
        if (!current) {
          return new Response(null, { status: 404 });
        }
        if (init?.method === "POST" && url.pathname === "/step") {
          const payload = JSON.parse(init.body as string) as { step_id: string };
          current.current_step_id = payload.step_id;
          current.last_sequence_no = Number(current.last_sequence_no ?? 0) + 1;
          return Response.json(current);
        }
        if (init?.method === "POST" && url.pathname === "/approval") {
          const payload = JSON.parse(init.body as string) as { approval_id: string | null };
          current.pending_approval_id = payload.approval_id;
          current.status = payload.approval_id ? "waiting_approval" : "running";
          return Response.json(current);
        }
        if (init?.method === "POST" && url.pathname === "/status") {
          const payload = JSON.parse(init.body as string) as { status: string };
          current.status = payload.status;
          return Response.json(current);
        }
        if (url.pathname === "/state") {
          return Response.json(current);
        }
        return new Response("Not found", { status: 404 });
      },
    };
  }
}

class MockApprovalSessionNamespace {
  private readonly store = new Map<string, Record<string, unknown>>();

  idFromName(name: string): string {
    return name;
  }

  get(id: string): { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } {
    return {
      fetch: async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input.toString());
        if (init?.method === "POST" && url.pathname === "/init") {
          this.store.set(id, JSON.parse(init.body as string));
          return new Response(null, { status: 204 });
        }
        const current = this.store.get(id);
        if (!current) {
          return new Response(null, { status: 404 });
        }
        if (init?.method === "POST" && url.pathname === "/decide") {
          if (current.status !== "pending") {
            return Response.json(current, { status: 409 });
          }
          const signal = JSON.parse(init.body as string);
          current.status = signal.decision;
          current.decision = signal;
          return Response.json(current);
        }
        if (init?.method === "POST" && url.pathname === "/expire") {
          if (current.status !== "pending") {
            return Response.json(current, { status: 409 });
          }
          current.status = "expired";
          current.decision = null;
          return Response.json(current);
        }
        if (init?.method === "POST" && url.pathname === "/cancel") {
          if (current.status !== "pending") {
            return Response.json(current, { status: 409 });
          }
          current.status = "cancelled";
          current.decision = null;
          return Response.json(current);
        }
        if (url.pathname === "/state") {
          return Response.json(current);
        }
        return new Response("Not found", { status: 404 });
      },
    };
  }
}

class MockRateLimiterNamespace {
  private readonly store = new Map<string, { window_start_ms: number; count: number }>();

  idFromName(name: string): string {
    return name;
  }

  get(id: string): { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } {
    return {
      fetch: async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input.toString());
        if (init?.method !== "POST" || url.pathname !== "/check") {
          return new Response("Not found", { status: 404 });
        }

        const payload = JSON.parse((init.body as string) ?? "{}") as {
          limit?: number;
          window_seconds?: number;
          now_ms?: number;
        };
        const limit = Number(payload.limit);
        const windowSeconds = Number(payload.window_seconds);
        if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(windowSeconds) || windowSeconds <= 0) {
          return Response.json({ error: "invalid_rate_limit_config" }, { status: 400 });
        }

        const nowMs = Number.isFinite(payload.now_ms) ? Number(payload.now_ms) : Date.now();
        const windowMs = windowSeconds * 1000;
        const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
        const windowEndsAtMs = windowStartMs + windowMs;
        const current = this.store.get(id);
        const state =
          current && current.window_start_ms === windowStartMs
            ? current
            : {
                window_start_ms: windowStartMs,
                count: 0,
              };

        if (state.count >= limit) {
          return Response.json({
            allowed: false,
            limit,
            remaining: 0,
            retry_after_seconds: Math.max(1, Math.ceil((windowEndsAtMs - nowMs) / 1000)),
            window_started_at: new Date(windowStartMs).toISOString(),
            window_ends_at: new Date(windowEndsAtMs).toISOString(),
          });
        }

        const nextState = {
          window_start_ms: windowStartMs,
          count: state.count + 1,
        };
        this.store.set(id, nextState);
        return Response.json({
          allowed: true,
          limit,
          remaining: Math.max(0, limit - nextState.count),
          retry_after_seconds: 0,
          window_started_at: new Date(windowStartMs).toISOString(),
          window_ends_at: new Date(windowEndsAtMs).toISOString(),
        });
      },
    };
  }
}

class MockWorkflowBinding {
  private readonly instances = new Map<string, MockWorkflowInstance>();

  constructor(
    private readonly deps: {
      db: MockD1Database;
      bucket: MockR2Bucket;
      queue: MockQueue;
      runCoordinator: MockRunCoordinatorNamespace;
      approvalSession: MockApprovalSessionNamespace;
      secrets: {
        MCP_API_TOKEN: string;
        A2A_SHARED_KEY: string;
      };
    },
  ) {}

  async create(options?: { id?: string; params?: RunWorkflowParams }): Promise<MockWorkflowInstance> {
    const id = options?.id;
    const params = options?.params;
    if (!id || !params) {
      throw new Error("Mock workflow requires id and params");
    }
    const instance = new MockWorkflowInstance(id, params, this.deps);
    this.instances.set(id, instance);
    void instance.start();
    return instance;
  }

  async get(id: string): Promise<MockWorkflowInstance> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Workflow instance ${id} not found`);
    }
    return instance;
  }

  dispose(): void {
    this.instances.clear();
  }
}

class MockWorkflowInstance {
  private statusValue: InstanceStatus["status"] = "queued";
  private terminated = false;
  private readonly eventQueue = new Map<string, unknown[]>();
  private readonly waiters = new Map<string, (value: unknown) => void>();
  private runStartedAt: string | null = null;
  private policyEvaluationForSummary: SmokePolicyEvaluationResult | null = null;
  private approvalIdForSummary: string | null = null;
  private approvalDecisionForSummary: ApprovalDecisionSignal | null = null;
  private outboundDispatchForSummary: Record<string, unknown> | null = null;

  constructor(
    public readonly id: string,
    private readonly params: RunWorkflowParams,
    private readonly deps: {
      db: MockD1Database;
      bucket: MockR2Bucket;
      queue: MockQueue;
      runCoordinator: MockRunCoordinatorNamespace;
      approvalSession: MockApprovalSessionNamespace;
      secrets: {
        MCP_API_TOKEN: string;
        A2A_SHARED_KEY: string;
      };
    },
  ) {}

  async start(): Promise<void> {
    try {
      this.runStartedAt = await this.markRunRunning();
      const plannerStepId = await this.createPlannerStep();
      const replayStartPhase = this.getReplayStartPhase();
      const outboundDispatch = extractOutboundDispatch(this.params.context);
      const basePolicyEvaluation =
        replayStartPhase === "approval_wait"
          ? await this.loadReplayApprovalEvaluation(outboundDispatch)
          : await this.evaluatePolicy(outboundDispatch);
      const policyEvaluation =
        replayStartPhase === "approval_wait"
          ? basePolicyEvaluation
          : replayStartPhase === "a2a_dispatch"
            ? {
                ...basePolicyEvaluation,
                decision: "allow" as const,
              }
            : basePolicyEvaluation;
      this.policyEvaluationForSummary = policyEvaluation;

      await this.recordAuditEvent(plannerStepId, "policy_evaluated", {
        channel: policyEvaluation.channel,
        subject_ref: policyEvaluation.subjectRef,
        decision: policyEvaluation.decision,
        policy_id: policyEvaluation.policyId,
        labels: policyEvaluation.labels,
      });

      if (policyEvaluation.decision === "deny") {
        const timestamp = nowIso();
        await this.deps.db
          .prepare(
            "UPDATE runs SET status = 'failed', error_code = 'policy_denied', error_message = ?1, updated_at = ?2, completed_at = ?2 WHERE run_id = ?3 AND tenant_id = ?4",
          )
          .bind(
            `Policy denied ${policyEvaluation.channel} for ${policyEvaluation.subjectRef}`,
            timestamp,
            this.params.runId,
            this.params.tenantId,
          )
          .run();
        await this.recordAuditEvent(
          plannerStepId,
          "side_effect_blocked",
          {
            channel: policyEvaluation.channel,
            subject_ref: policyEvaluation.subjectRef,
            decision: policyEvaluation.decision,
            policy_id: policyEvaluation.policyId,
          },
          timestamp,
        );
        const blockedStub = this.deps.runCoordinator.get(this.params.runId);
        await blockedStub.fetch("https://run-coordinator.internal/status", {
          method: "POST",
          body: JSON.stringify({ status: "failed" }),
        });
        this.statusValue = "errored";
        return;
      }

      const needsApproval = policyEvaluation.decision === "approval_required";
      if (needsApproval) {
        const approvalId = await this.createApproval(plannerStepId, policyEvaluation);
        this.approvalIdForSummary = approvalId;
        this.statusValue = "waiting";
        let decision: ApprovalDecisionSignal;
        try {
          decision = (await this.waitForEvent("approval.decision")) as ApprovalDecisionSignal;
        } catch (error) {
          if (error instanceof Error && error.message === "approval_wait_timeout") {
            const timestamp = nowIso();
            const eventId = createId("evt");
            await this.deps.db.batch([
              this.deps.db
                .prepare(
                  "UPDATE approvals SET status = 'expired', decided_at = COALESCE(decided_at, ?1) WHERE tenant_id = ?2 AND approval_id = ?3 AND status = 'pending'",
                )
                .bind(timestamp, this.params.tenantId, approvalId),
              this.deps.db
                .prepare(
                  "UPDATE runs SET status = 'failed', pending_approval_id = NULL, error_code = 'approval_expired', error_message = 'Approval expired before a decision was received', updated_at = ?1, completed_at = ?1 WHERE run_id = ?2 AND tenant_id = ?3",
                )
                .bind(timestamp, this.params.runId, this.params.tenantId),
              this.deps.db
                .prepare(
                  `INSERT INTO audit_events (
                      event_id, tenant_id, run_id, step_id, trace_id, event_type, actor_type, actor_ref, payload_json, created_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
                )
                .bind(
                  eventId,
                  this.params.tenantId,
                  this.params.runId,
                  plannerStepId,
                  this.params.traceId,
                  "approval_expired",
                  "system",
                  "run_workflow",
                  JSON.stringify({
                    approval_id: approvalId,
                    policy_id:
                      policyEvaluation.policyId ??
                      (policyEvaluation.channel === "a2a_dispatch"
                        ? DEFAULT_A2A_POLICY_ID
                        : DEFAULT_EXTERNAL_POLICY_ID),
                    reason: "workflow_timeout",
                  }),
                  timestamp,
                ),
            ]);
            await this.deps.queue.send({
              message_type: "audit_event",
              dedupe_key: `audit_event:${eventId}`,
              event_id: eventId,
              tenant_id: this.params.tenantId,
              run_id: this.params.runId,
              step_id: plannerStepId,
              trace_id: this.params.traceId,
              event_type: "approval_expired",
              actor: {
                type: "system",
                ref: "run_workflow",
              },
              payload: {
                approval_id: approvalId,
                policy_id:
                  policyEvaluation.policyId ??
                  (policyEvaluation.channel === "a2a_dispatch"
                    ? DEFAULT_A2A_POLICY_ID
                    : DEFAULT_EXTERNAL_POLICY_ID),
                reason: "workflow_timeout",
              },
              created_at: timestamp,
            });
            const approvalStub = this.deps.approvalSession.get(approvalId);
            await approvalStub.fetch("https://approval-session.internal/expire", {
              method: "POST",
              body: JSON.stringify({
                approval_id: approvalId,
                run_id: this.params.runId,
                status: "expired",
                decision: null,
              }),
            });
            const stub = this.deps.runCoordinator.get(this.params.runId);
            await stub.fetch("https://run-coordinator.internal/approval", {
              method: "POST",
              body: JSON.stringify({ approval_id: null }),
            });
            await stub.fetch("https://run-coordinator.internal/status", {
              method: "POST",
              body: JSON.stringify({ status: "failed" }),
            });
            this.statusValue = "errored";
            return;
          }
          throw error;
        }
        if (decision.decision === "rejected") {
          await this.failRun("approval_rejected", "Approval was rejected");
          return;
        }
        this.approvalDecisionForSummary = decision;
        await this.deps.db
          .prepare(
            "UPDATE runs SET status = ?1, pending_approval_id = NULL, updated_at = ?2 WHERE run_id = ?3 AND tenant_id = ?4",
          )
          .bind("running", nowIso(), this.params.runId, this.params.tenantId)
          .run();
        const stub = this.deps.runCoordinator.get(this.params.runId);
        await stub.fetch("https://run-coordinator.internal/approval", {
          method: "POST",
          body: JSON.stringify({ approval_id: null }),
        });
        await stub.fetch("https://run-coordinator.internal/status", {
          method: "POST",
          body: JSON.stringify({ status: "running" }),
        });
        void approvalId;
      }
      if (outboundDispatch) {
        const result = await dispatchOutboundTask({
          env: ({
            MCP_API_TOKEN: this.deps.secrets.MCP_API_TOKEN,
            A2A_SHARED_KEY: this.deps.secrets.A2A_SHARED_KEY,
            DB: this.deps.db as unknown as D1Database,
            ARTIFACTS_BUCKET: this.deps.bucket as unknown as R2Bucket,
          } as unknown) as Env,
          tenantId: this.params.tenantId,
          runId: this.params.runId,
          traceId: this.params.traceId,
          subjectId: this.params.subjectId,
          config: outboundDispatch,
        });

        this.outboundDispatchForSummary = {
          channel: "a2a_dispatch",
          agent_id: outboundDispatch.agent_id,
          tool_provider_id: outboundDispatch.tool_provider_id ?? null,
          endpoint_url: outboundDispatch.endpoint_url,
          wait_for_completion: outboundDispatch.wait_for_completion ?? false,
          task_id: result.taskId,
          remote_task_id: result.remoteTaskId,
          resolved_endpoint_url: result.resolvedEndpointUrl ?? outboundDispatch.endpoint_url,
          agent_card_url: result.agentCardUrl ?? null,
          used_agent_card: result.usedAgentCard ?? false,
          dispatch_status: result.status,
          remote_status: null,
          remote_artifact_written: false,
        };

        const stepId = createId("step");
        const timestamp = nowIso();
        const dispatchSequenceNo = needsApproval ? 3 : 2;
        await this.deps.db.batch([
          this.deps.db
            .prepare(
              `INSERT INTO run_steps (
                  step_id, tenant_id, run_id, parent_step_id, sequence_no, step_type, actor_type, actor_ref,
                  status, input_blob_key, output_blob_key, started_at, ended_at, error_code, metadata_json
                ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, NULL, NULL, ?9, ?9, NULL, ?10)`,
            )
            .bind(
              stepId,
              this.params.tenantId,
              this.params.runId,
              dispatchSequenceNo,
              "a2a_dispatch",
              "agent",
              outboundDispatch.agent_id,
              result.status === "completed" ? "completed" : "running",
              timestamp,
              JSON.stringify({
                tool_provider_id: outboundDispatch.tool_provider_id ?? null,
                task_id: result.taskId,
                remote_task_id: result.remoteTaskId,
                endpoint_url: outboundDispatch.endpoint_url,
                resolved_endpoint_url: result.resolvedEndpointUrl ?? outboundDispatch.endpoint_url,
                agent_card_url: result.agentCardUrl ?? null,
                used_agent_card: result.usedAgentCard ?? false,
              }),
            ),
          this.deps.db
            .prepare(
              "UPDATE runs SET current_step_id = ?1, updated_at = ?2 WHERE run_id = ?3 AND tenant_id = ?4",
            )
            .bind(stepId, timestamp, this.params.runId, this.params.tenantId),
        ]);

        await this.recordAuditEvent(
          stepId,
          "side_effect_executed",
          {
            channel: "a2a_dispatch",
            tool_provider_id: outboundDispatch.tool_provider_id ?? null,
            task_id: result.taskId,
            remote_task_id: result.remoteTaskId,
            endpoint_url: outboundDispatch.endpoint_url,
            resolved_endpoint_url: result.resolvedEndpointUrl ?? outboundDispatch.endpoint_url,
            agent_card_url: result.agentCardUrl ?? null,
            used_agent_card: result.usedAgentCard ?? false,
            status: result.status,
          },
          timestamp,
        );

        if (outboundDispatch.wait_for_completion) {
          this.statusValue = "waiting";
          const remote = (await this.waitForEvent("a2a.task.status")) as A2AStatusSignal;
          if (this.outboundDispatchForSummary) {
            this.outboundDispatchForSummary.remote_status = remote.status;
            this.outboundDispatchForSummary.remote_artifact_written = !!remote.artifact_json;
          }
          if (remote.status === "failed" || remote.status === "cancelled") {
            await this.failRun("a2a_remote_failed", `Remote A2A task ended with status ${remote.status}`);
            return;
          }
          if (remote.artifact_json) {
            const artifact = JSON.parse(remote.artifact_json) as Record<string, unknown>;
            const artifactId = createId("art");
            const body = JSON.stringify(artifact, null, 2);
            const r2Key = `tenants/${this.params.tenantId}/runs/${this.params.runId}/artifacts/${artifactId}.json`;
            await this.deps.bucket.put(r2Key, body);
            await this.deps.db
              .prepare(
                `INSERT INTO artifacts (
                    artifact_id, tenant_id, run_id, step_id, artifact_type, mime_type, r2_key, sha256, size_bytes, created_at
                  ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9)`,
              )
              .bind(
                artifactId,
                this.params.tenantId,
                this.params.runId,
                "a2a_remote_artifact",
                "application/json",
                r2Key,
                await hashPayload(artifact),
                body.length,
                nowIso(),
              )
              .run();
          }
        }
      }

      const completedAt = await this.writeSummaryArtifact();
      await this.deps.db
        .prepare(
          "UPDATE runs SET status = ?1, updated_at = ?2, completed_at = ?2 WHERE run_id = ?3 AND tenant_id = ?4",
        )
        .bind("completed", completedAt, this.params.runId, this.params.tenantId)
        .run();
      const stub = this.deps.runCoordinator.get(this.params.runId);
      await stub.fetch("https://run-coordinator.internal/status", {
        method: "POST",
        body: JSON.stringify({ status: "completed" }),
      });
      this.statusValue = "complete";
    } catch (error) {
      await this.failRun("workflow_error", error instanceof Error ? error.message : String(error));
    }
  }

  async status(): Promise<InstanceStatus> {
    return {
      status: this.terminated ? "terminated" : this.statusValue,
    };
  }

  async sendEvent(event: { type: string; payload: unknown }): Promise<void> {
    const waiter = this.waiters.get(event.type);
    if (waiter) {
      this.waiters.delete(event.type);
      waiter(event.payload);
      return;
    }
    const queued = this.eventQueue.get(event.type) ?? [];
    queued.push(event.payload);
    this.eventQueue.set(event.type, queued);
  }

  async terminate(): Promise<void> {
    this.terminated = true;
    this.statusValue = "terminated";
  }

  private async markRunRunning(): Promise<string> {
    const timestamp = nowIso();
    await this.deps.db
      .prepare("UPDATE runs SET status = ?1, updated_at = ?2 WHERE run_id = ?3 AND tenant_id = ?4")
      .bind("running", timestamp, this.params.runId, this.params.tenantId)
      .run();
    const stub = this.deps.runCoordinator.get(this.params.runId);
    await stub.fetch("https://run-coordinator.internal/status", {
      method: "POST",
      body: JSON.stringify({ status: "running" }),
    });
    this.statusValue = "running";
    return timestamp;
  }

  private async createPlannerStep(): Promise<string> {
    const stepId = createId("step");
    const timestamp = nowIso();
    const replayContext =
      this.params.context.replay &&
      typeof this.params.context.replay === "object" &&
      !Array.isArray(this.params.context.replay)
        ? (this.params.context.replay as Record<string, unknown>)
        : undefined;
    const replayStartPhase = this.getReplayStartPhase();
    await this.deps.db.batch([
      this.deps.db
        .prepare(
          `INSERT INTO run_steps (
              step_id, tenant_id, run_id, parent_step_id, sequence_no, step_type, actor_type, actor_ref,
              status, input_blob_key, output_blob_key, started_at, ended_at, error_code, metadata_json
            ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, NULL, NULL, ?9, ?9, NULL, ?10)`,
        )
        .bind(
          stepId,
          this.params.tenantId,
          this.params.runId,
          1,
          "planner",
          "agent",
          this.params.entryAgentId ?? "catalog_router",
          "completed",
          timestamp,
          JSON.stringify({
            labels: this.params.policyContext.labels ?? [],
            is_replay: !!replayContext,
            replay_from_step:
              replayContext?.mode === "from_step" && typeof replayContext.from_step_id === "string"
                ? replayContext.from_step_id
                : null,
            replay_start_phase: replayStartPhase,
          }),
        ),
      this.deps.db
        .prepare(
          "UPDATE runs SET current_step_id = ?1, updated_at = ?2 WHERE run_id = ?3 AND tenant_id = ?4",
        )
        .bind(stepId, timestamp, this.params.runId, this.params.tenantId),
    ]);
    const stub = this.deps.runCoordinator.get(this.params.runId);
    await stub.fetch("https://run-coordinator.internal/step", {
      method: "POST",
      body: JSON.stringify({ step_id: stepId }),
    });
    return stepId;
  }

  private getReplayStartPhase(): "planner" | "approval_wait" | "a2a_dispatch" | null {
    const replayContext =
      this.params.context.replay &&
      typeof this.params.context.replay === "object" &&
      !Array.isArray(this.params.context.replay)
        ? (this.params.context.replay as Record<string, unknown>)
        : null;
    if (!replayContext || replayContext.mode !== "from_step") {
      return null;
    }
    if (replayContext.start_phase === "planner") {
      return "planner";
    }
    if (replayContext.start_phase === "approval_wait") {
      return "approval_wait";
    }
    if (replayContext.start_phase === "a2a_dispatch") {
      return "a2a_dispatch";
    }
    return null;
  }

  private async evaluatePolicy(
    outboundDispatch: OutboundA2ADispatchConfig | null,
  ): Promise<SmokePolicyEvaluationResult> {
    const object = await this.deps.bucket.get(this.params.inputBlobKey);
    const payload = object ? ((await object.json()) as RunCreateRequest) : null;
    const text = payload?.input?.text ?? "";
    const labels = this.params.policyContext.labels ?? [];

    if (outboundDispatch?.tool_provider_id) {
      const policies = await listActivePolicies(
        ({ DB: this.deps.db as unknown as D1Database } as unknown) as Env,
        this.params.tenantId,
        "a2a_dispatch",
        outboundDispatch.tool_provider_id,
      );
      const matchedPolicy = selectBestSmokePolicy({
        policies,
        toolProviderId: outboundDispatch.tool_provider_id,
        labels,
        riskLevel: normalizeSmokeRiskLevel(this.params.policyContext.risk_tier),
      });
      if (matchedPolicy) {
        return {
          channel: "a2a_dispatch",
          subjectType: "a2a_dispatch",
          subjectRef: outboundDispatch.agent_id,
          decision: matchedPolicy.decision,
          policyId: matchedPolicy.policy_id,
          approverRoles: parseSmokePolicyApproverRoles(matchedPolicy),
          timeoutSeconds: parseSmokePolicyApprovalTimeoutSeconds(matchedPolicy),
          labels,
        };
      }

      return {
        channel: "a2a_dispatch",
        subjectType: "a2a_dispatch",
        subjectRef: outboundDispatch.agent_id,
        decision: "allow",
        policyId: null,
        approverRoles: DEFAULT_APPROVER_ROLES,
        timeoutSeconds: DEFAULT_APPROVAL_TIMEOUT_SECONDS,
        labels,
      };
    }

    return buildSmokeHeuristicPolicyEvaluation({
      labels,
      text,
      outboundDispatch,
    });
  }

  private async loadReplayApprovalEvaluation(
    outboundDispatch: OutboundA2ADispatchConfig | null,
  ): Promise<SmokePolicyEvaluationResult> {
    const restored = await this.restoreReplayApprovalEvaluation();
    if (restored) {
      return restored;
    }

    const baseEvaluation = await this.evaluatePolicy(outboundDispatch);
    return {
      ...baseEvaluation,
      decision: "approval_required",
    };
  }

  private async restoreReplayApprovalEvaluation(): Promise<SmokePolicyEvaluationResult | null> {
    const replayContext =
      this.params.context.replay &&
      typeof this.params.context.replay === "object" &&
      !Array.isArray(this.params.context.replay)
        ? (this.params.context.replay as Record<string, unknown>)
        : null;
    const sourceRunId =
      replayContext && typeof replayContext.source_run_id === "string" ? replayContext.source_run_id : null;
    const anchorStepId =
      replayContext && typeof replayContext.anchor_step_id === "string" ? replayContext.anchor_step_id : null;
    if (!sourceRunId || !anchorStepId) {
      return null;
    }

    const approvalStep = await this.deps.db
      .prepare(
        `SELECT metadata_json
           FROM run_steps
          WHERE tenant_id = ?1 AND run_id = ?2 AND step_id = ?3 AND step_type = 'approval_wait'`,
      )
      .bind(this.params.tenantId, sourceRunId, anchorStepId)
      .first<{ metadata_json: string }>();
    const approvalId = parseSmokeReplayApprovalId(approvalStep?.metadata_json ?? null);
    if (!approvalId) {
      return null;
    }

    const approval = await this.deps.db
      .prepare(
        `SELECT policy_id, subject_type, subject_ref, approver_scope_json, created_at, expires_at
           FROM approvals
          WHERE tenant_id = ?1 AND approval_id = ?2`,
      )
      .bind(this.params.tenantId, approvalId)
      .first<{
        policy_id: string;
        subject_type: string;
        subject_ref: string;
        approver_scope_json: string;
        created_at: string;
        expires_at: string;
      }>();
    if (!approval) {
      return null;
    }

    return {
      channel: approval.subject_type === "a2a_dispatch" ? "a2a_dispatch" : "external_action",
      subjectType: approval.subject_type === "a2a_dispatch" ? "a2a_dispatch" : "external_action",
      subjectRef: approval.subject_ref,
      decision: "approval_required",
      policyId: approval.policy_id,
      approverRoles: parseSmokeApprovalScopeRoles(approval.approver_scope_json),
      timeoutSeconds: parseSmokeApprovalTimeoutSecondsFromRow(approval.created_at, approval.expires_at),
      labels: this.params.policyContext.labels ?? [],
      approvalPayloadTemplate: await readSmokeReplayApprovalPayload(
        this.deps.bucket,
        this.params.tenantId,
        sourceRunId,
        approvalId,
      ),
    };
  }

  private async createApproval(
    plannerStepId: string,
    policyEvaluation: SmokePolicyEvaluationResult,
  ): Promise<string> {
    const approvalId = createId("apr");
    const timestamp = nowIso();
    const approvalPayload = await buildSmokeWorkflowApprovalPayload({
      bucket: this.deps.bucket,
      runId: this.params.runId,
      stepId: plannerStepId,
      traceId: this.params.traceId,
      inputBlobKey: this.params.inputBlobKey,
      policyContext: this.params.policyContext,
      outboundDispatch: extractOutboundDispatch(this.params.context),
      policyEvaluation,
    });
    const approvalBlobKey = `tenants/${this.params.tenantId}/runs/${this.params.runId}/audit/${approvalId}.json`;
    await this.deps.bucket.put(approvalBlobKey, JSON.stringify(approvalPayload, null, 2));
    await this.deps.db.batch([
      this.deps.db
        .prepare(
          `INSERT INTO approvals (
              approval_id, tenant_id, run_id, step_id, policy_id, subject_type, subject_ref, status,
              requested_by, approver_scope_json, decision_by, decision_comment, decision_reason_code, expires_at, created_at, decided_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9, NULL, NULL, NULL, ?10, ?11, NULL)`,
        )
        .bind(
          approvalId,
          this.params.tenantId,
          this.params.runId,
          plannerStepId,
          policyEvaluation.policyId ??
            (policyEvaluation.channel === "a2a_dispatch"
              ? DEFAULT_A2A_POLICY_ID
              : DEFAULT_EXTERNAL_POLICY_ID),
          policyEvaluation.subjectType,
          policyEvaluation.subjectRef,
          this.params.subjectId,
          JSON.stringify({
            approver_roles:
              policyEvaluation.approverRoles.length > 0
                ? policyEvaluation.approverRoles
                : DEFAULT_APPROVER_ROLES,
          }),
          new Date(Date.now() + policyEvaluation.timeoutSeconds * 1000).toISOString(),
          timestamp,
        ),
      this.deps.db
        .prepare(
          `INSERT INTO run_steps (
              step_id, tenant_id, run_id, parent_step_id, sequence_no, step_type, actor_type, actor_ref,
              status, input_blob_key, output_blob_key, started_at, ended_at, error_code, metadata_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, NULL, ?10, NULL, NULL, ?11)`,
        )
        .bind(
          createId("step"),
          this.params.tenantId,
          this.params.runId,
          plannerStepId,
          2,
          "approval_wait",
          "system",
          "approval_gateway",
          "blocked",
          timestamp,
          JSON.stringify({ approval_id: approvalId }),
        ),
      this.deps.db
        .prepare(
          "UPDATE runs SET status = ?1, pending_approval_id = ?2, updated_at = ?3 WHERE run_id = ?4 AND tenant_id = ?5",
        )
        .bind("waiting_approval", approvalId, timestamp, this.params.runId, this.params.tenantId),
    ]);
    await this.recordAuditEvent(
      plannerStepId,
      "approval_created",
      {
        approval_id: approvalId,
        policy_id:
          policyEvaluation.policyId ??
          (policyEvaluation.channel === "a2a_dispatch"
            ? DEFAULT_A2A_POLICY_ID
            : DEFAULT_EXTERNAL_POLICY_ID),
        subject_type: policyEvaluation.subjectType,
        subject_ref: policyEvaluation.subjectRef,
        approval_blob_key: approvalBlobKey,
      },
      timestamp,
    );
    const stub = this.deps.runCoordinator.get(this.params.runId);
    await stub.fetch("https://run-coordinator.internal/approval", {
      method: "POST",
      body: JSON.stringify({ approval_id: approvalId }),
    });
    const approvalStub = this.deps.approvalSession.get(approvalId);
    await approvalStub.fetch("https://approval-session.internal/init", {
      method: "POST",
      body: JSON.stringify({
        approval_id: approvalId,
        run_id: this.params.runId,
        status: "pending",
        decision: null,
      }),
    });
    return approvalId;
  }

  private async recordAuditEvent(
    stepId: string | null,
    eventType: AuditEventEnvelope["event_type"],
    payload: Record<string, unknown>,
    createdAt = nowIso(),
  ): Promise<void> {
    const eventId = createId("evt");
    await this.deps.db
      .prepare(
        `INSERT INTO audit_events (
            event_id, tenant_id, run_id, step_id, trace_id, event_type, actor_type, actor_ref, payload_json, created_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      )
      .bind(
        eventId,
        this.params.tenantId,
        this.params.runId,
        stepId,
        this.params.traceId,
        eventType,
        "system",
        "run_workflow",
        JSON.stringify(payload),
        createdAt,
      )
      .run();
    await this.deps.queue.send({
      message_type: "audit_event",
      dedupe_key: `audit_event:${eventId}`,
      event_id: eventId,
      tenant_id: this.params.tenantId,
      run_id: this.params.runId,
      step_id: stepId,
      trace_id: this.params.traceId,
      event_type: eventType,
      actor: {
        type: "system",
        ref: "run_workflow",
      },
      payload,
      created_at: createdAt,
    });
  }

  private async writeSummaryArtifact(): Promise<string> {
    const completedAt = nowIso();
    const policyEvaluation = this.policyEvaluationForSummary;
    let policySource: "matched" | "default" | "none" = "none";
    let effectivePolicyId: string | null = null;
    if (policyEvaluation?.policyId) {
      policySource = "matched";
      effectivePolicyId = policyEvaluation.policyId;
    } else if (policyEvaluation?.decision === "approval_required") {
      policySource = "default";
      effectivePolicyId =
        policyEvaluation.channel === "a2a_dispatch" ? DEFAULT_A2A_POLICY_ID : DEFAULT_EXTERNAL_POLICY_ID;
    }

    const artifactId = createId("art");
    const body = JSON.stringify(
      {
        kind: "run_summary_v1",
        run_id: this.params.runId,
        tenant_id: this.params.tenantId,
        trace_id: this.params.traceId,
        request_id: this.params.requestId,
        status: "completed",
        summary: policyEvaluation?.decision === "approval_required" ? "Run completed after approval." : "Run completed.",
        started_at: this.runStartedAt,
        completed_at: completedAt,
        replay: (() => {
          const replayContext = this.params.context.replay as Record<string, unknown> | undefined;
          if (!replayContext || typeof replayContext.mode !== "string") {
            return null;
          }
          const replayFromStepId =
            replayContext.mode === "from_step" && typeof replayContext.from_step_id === "string"
              ? replayContext.from_step_id
              : null;
          const replayStartPhase = this.getReplayStartPhase();
          return {
            mode: replayContext.mode,
            from_step_id: replayFromStepId,
            start_phase: replayStartPhase,
            reason: typeof replayContext.reason === "string" ? replayContext.reason : null,
          };
        })(),
        subject: {
          subject_id: this.params.subjectId,
          entry_agent_id: this.params.entryAgentId,
        },
        policy: policyEvaluation
          ? {
              channel: policyEvaluation.channel,
              subject_ref: policyEvaluation.subjectRef,
              decision: policyEvaluation.decision,
              matched_policy_id: policyEvaluation.policyId,
              effective_policy_id: effectivePolicyId,
              policy_source: policySource,
              approver_roles:
                policyEvaluation.approverRoles.length > 0 ? policyEvaluation.approverRoles : DEFAULT_APPROVER_ROLES,
              timeout_seconds: policyEvaluation.timeoutSeconds,
              labels: policyEvaluation.labels,
              risk_tier: this.params.policyContext.risk_tier ?? null,
              approval_required: policyEvaluation.decision === "approval_required",
            }
          : null,
        approval:
          this.approvalIdForSummary || this.approvalDecisionForSummary
            ? {
                approval_id:
                  this.approvalIdForSummary ?? this.approvalDecisionForSummary?.approval_id ?? null,
                decision: this.approvalDecisionForSummary?.decision ?? null,
                decided_by: this.approvalDecisionForSummary?.decided_by ?? null,
                decided_at: this.approvalDecisionForSummary?.decided_at ?? null,
                comment: this.approvalDecisionForSummary?.comment ?? null,
                reason_code: this.approvalDecisionForSummary?.reason_code ?? null,
              }
            : null,
        outbound: this.outboundDispatchForSummary,
        generated_at: completedAt,
      },
      null,
      2,
    );
    const r2Key = `tenants/${this.params.tenantId}/runs/${this.params.runId}/artifacts/${artifactId}.json`;
    await this.deps.bucket.put(r2Key, body);
    await this.deps.db
      .prepare(
        `INSERT INTO artifacts (
            artifact_id, tenant_id, run_id, step_id, artifact_type, mime_type, r2_key, sha256, size_bytes, created_at
          ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .bind(
        artifactId,
        this.params.tenantId,
        this.params.runId,
        "run_summary",
        "application/json",
        r2Key,
        await hashPayload(JSON.parse(body)),
        body.length,
        completedAt,
      )
      .run();
    return completedAt;
  }

  private async failRun(errorCode: string, message: string): Promise<void> {
    await this.deps.db
      .prepare(
        "UPDATE runs SET status = ?1, error_code = ?2, error_message = ?3, updated_at = ?4, completed_at = ?4 WHERE run_id = ?5 AND tenant_id = ?6",
      )
      .bind("failed", errorCode, message, nowIso(), this.params.runId, this.params.tenantId)
      .run();
    const stub = this.deps.runCoordinator.get(this.params.runId);
    await stub.fetch("https://run-coordinator.internal/status", {
      method: "POST",
      body: JSON.stringify({ status: "failed" }),
    });
    this.statusValue = "errored";
  }

  private async waitForEvent(type: string): Promise<unknown> {
    const queued = this.eventQueue.get(type);
    if (queued && queued.length > 0) {
      return queued.shift();
    }
    if (type === "approval.decision") {
      return new Promise((resolve, reject) => {
        let settled = false;
        const resolveOnce = (value: unknown): void => {
          settled = true;
          resolve(value);
        };
        const rejectOnce = (error: Error): void => {
          settled = true;
          reject(error);
        };
        this.waiters.set(type, resolveOnce);
        const poll = async (): Promise<void> => {
          if (settled) {
            return;
          }
          const approval = await this.deps.db
            .prepare(
              `SELECT expires_at, status
                 FROM approvals
                WHERE tenant_id = ?1 AND run_id = ?2
                ORDER BY created_at DESC
                LIMIT 1`,
            )
            .bind(this.params.tenantId, this.params.runId)
            .first<{ expires_at: string | null; status: string }>();
          if (!approval || approval.status !== "pending") {
            return;
          }
          if (approval.expires_at && approval.expires_at <= nowIso()) {
            this.waiters.delete(type);
            rejectOnce(new Error("approval_wait_timeout"));
            return;
          }
          const timer = setTimeout(() => void poll(), 10);
          timer.unref?.();
        };
        void poll();
      });
    }
    return new Promise((resolve) => {
      this.waiters.set(type, resolve);
    });
  }
}

function extractOutboundDispatch(
  context: Record<string, unknown>,
): OutboundA2ADispatchConfig | null {
  const candidate =
    context.a2a_dispatch &&
    typeof context.a2a_dispatch === "object" &&
    !Array.isArray(context.a2a_dispatch)
      ? (context.a2a_dispatch as Record<string, unknown>)
      : null;

  if (!candidate) return null;
  if (typeof candidate.endpoint_url !== "string" || typeof candidate.agent_id !== "string") {
    return null;
  }

  return {
    ...(typeof candidate.tool_provider_id === "string" ? { tool_provider_id: candidate.tool_provider_id } : {}),
    ...(candidate.provider_type === "mcp_server" ||
    candidate.provider_type === "mcp_portal" ||
    candidate.provider_type === "http_api"
      ? { provider_type: candidate.provider_type }
      : {}),
    endpoint_url: candidate.endpoint_url,
    agent_id: candidate.agent_id,
    ...(typeof candidate.auth_ref === "string" ? { auth_ref: candidate.auth_ref } : {}),
    ...(typeof candidate.task_id === "string" ? { task_id: candidate.task_id } : {}),
    ...(typeof candidate.message_text === "string" ? { message_text: candidate.message_text } : {}),
    ...(typeof candidate.wait_for_completion === "boolean"
      ? { wait_for_completion: candidate.wait_for_completion }
      : {}),
    ...(candidate.metadata && typeof candidate.metadata === "object" && !Array.isArray(candidate.metadata)
      ? { metadata: candidate.metadata as Record<string, unknown> }
      : {}),
  };
}

async function buildSmokeWorkflowApprovalPayload(args: {
  bucket: MockR2Bucket;
  runId: string;
  stepId: string;
  traceId: string;
  inputBlobKey: string;
  policyContext: RunWorkflowParams["policyContext"];
  outboundDispatch: OutboundA2ADispatchConfig | null;
  policyEvaluation: SmokePolicyEvaluationResult;
}): Promise<Record<string, unknown>> {
  if (args.policyEvaluation.approvalPayloadTemplate) {
    return mergeSmokeReplayApprovalPayloadTemplate(args.policyEvaluation.approvalPayloadTemplate, {
      traceId: args.traceId,
      runId: args.runId,
      stepId: args.stepId,
    });
  }

  const inputPayload = await readSmokeApprovalInputPayload(args.bucket, args.inputBlobKey);
  const input =
    inputPayload?.input && typeof inputPayload.input === "object" && !Array.isArray(inputPayload.input)
      ? (inputPayload.input as Record<string, unknown>)
      : null;
  const inputText = typeof input?.text === "string" ? input.text : null;
  const inputStructuredPayload =
    input?.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
      ? (input.payload as Record<string, unknown>)
      : null;

  return {
    summary: {
      action: args.policyEvaluation.channel === "a2a_dispatch" ? "dispatch_a2a_task" : "external_action",
      provider: args.outboundDispatch?.tool_provider_id ?? null,
      risk_level: normalizeSmokeRiskLevel(args.policyContext.risk_tier),
      reason: buildSmokeWorkflowApprovalReason(args.policyEvaluation, args.outboundDispatch),
    },
    subject_snapshot: args.outboundDispatch
      ? {
          tool_provider_id: args.outboundDispatch.tool_provider_id ?? null,
          agent_id: args.outboundDispatch.agent_id,
          endpoint_url: args.outboundDispatch.endpoint_url,
          message_text: args.outboundDispatch.message_text ?? null,
          wait_for_completion: args.outboundDispatch.wait_for_completion ?? false,
          metadata: args.outboundDispatch.metadata ?? null,
          input_text: inputText,
        }
      : {
          input_text: inputText,
          input_payload: inputStructuredPayload,
          labels: args.policyEvaluation.labels,
        },
    trace: {
      trace_id: args.traceId,
      run_id: args.runId,
      step_id: args.stepId,
    },
  };
}

function mergeSmokeReplayApprovalPayloadTemplate(
  template: Record<string, unknown>,
  trace: { traceId: string; runId: string; stepId: string },
): Record<string, unknown> {
  const summary =
    template.summary && typeof template.summary === "object" && !Array.isArray(template.summary)
      ? (template.summary as Record<string, unknown>)
      : {};
  const subjectSnapshot =
    template.subject_snapshot &&
    typeof template.subject_snapshot === "object" &&
    !Array.isArray(template.subject_snapshot)
      ? (template.subject_snapshot as Record<string, unknown>)
      : {};

  return {
    summary,
    subject_snapshot: subjectSnapshot,
    trace: {
      trace_id: trace.traceId,
      run_id: trace.runId,
      step_id: trace.stepId,
    },
  };
}

async function readSmokeApprovalInputPayload(
  bucket: MockR2Bucket,
  inputBlobKey: string,
): Promise<Record<string, unknown> | null> {
  const object = await bucket.get(inputBlobKey);
  if (!object) {
    return null;
  }
  return (await object.json()) as Record<string, unknown>;
}

function buildSmokeWorkflowApprovalReason(
  policyEvaluation: SmokePolicyEvaluationResult,
  outboundDispatch: OutboundA2ADispatchConfig | null,
): string {
  if (policyEvaluation.policyId) {
    return `matched policy ${policyEvaluation.policyId}`;
  }
  if (outboundDispatch?.tool_provider_id) {
    return `provider-scoped outbound A2A dispatch for ${outboundDispatch.tool_provider_id}`;
  }
  return "workflow fallback approval policy";
}

function buildSmokeHeuristicPolicyEvaluation(args: {
  labels: string[];
  text: string;
  outboundDispatch: OutboundA2ADispatchConfig | null;
  forcedDecision?: PolicyDecision;
}): SmokePolicyEvaluationResult {
  const normalizedText = args.text.toLowerCase();
  const looksExternalAction =
    args.labels.includes("external-send") ||
    args.text.includes("外發") ||
    normalizedText.includes("external");

  const decision = args.forcedDecision ?? (looksExternalAction ? "approval_required" : "allow");

  if (args.outboundDispatch?.tool_provider_id) {
    return {
      channel: "a2a_dispatch",
      subjectType: "a2a_dispatch",
      subjectRef: args.outboundDispatch.agent_id,
      decision,
      policyId: decision === "approval_required" ? DEFAULT_A2A_POLICY_ID : null,
      approverRoles: DEFAULT_APPROVER_ROLES,
      timeoutSeconds: DEFAULT_APPROVAL_TIMEOUT_SECONDS,
      labels: args.labels,
    };
  }

  return {
    channel: "external_action",
    subjectType: "external_action",
    subjectRef: "send_email",
    decision,
    policyId: decision === "approval_required" ? DEFAULT_EXTERNAL_POLICY_ID : null,
    approverRoles: DEFAULT_APPROVER_ROLES,
    timeoutSeconds: DEFAULT_APPROVAL_TIMEOUT_SECONDS,
    labels: args.labels,
  };
}

function parseSmokeReplayApprovalId(metadataJson: string | null): string | null {
  if (!metadataJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadataJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return typeof (parsed as Record<string, unknown>).approval_id === "string"
      ? ((parsed as Record<string, unknown>).approval_id as string)
      : null;
  } catch {
    return null;
  }
}

function parseSmokeApprovalScopeRoles(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_APPROVER_ROLES;
    }
    const approverRoles = (parsed as Record<string, unknown>).approver_roles;
    if (!Array.isArray(approverRoles)) {
      return DEFAULT_APPROVER_ROLES;
    }
    const roles = approverRoles.filter((value): value is string => typeof value === "string");
    return roles.length > 0 ? roles : DEFAULT_APPROVER_ROLES;
  } catch {
    return DEFAULT_APPROVER_ROLES;
  }
}

function parseSmokeApprovalTimeoutSecondsFromRow(createdAt: string, expiresAt: string): number {
  const createdAtMs = Date.parse(createdAt);
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= createdAtMs) {
    return DEFAULT_APPROVAL_TIMEOUT_SECONDS;
  }
  return Math.max(1, Math.round((expiresAtMs - createdAtMs) / 1000));
}

async function readSmokeReplayApprovalPayload(
  bucket: MockR2Bucket,
  tenantId: string,
  sourceRunId: string,
  approvalId: string,
): Promise<Record<string, unknown> | null> {
  const object = await bucket.get(`tenants/${tenantId}/runs/${sourceRunId}/audit/${approvalId}.json`);
  if (!object) {
    return null;
  }
  const parsed = (await object.json()) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function parseSmokePolicyApproverRoles(policy: PolicyRow): string[] {
  try {
    const parsed = JSON.parse(policy.approval_config_json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const approverRoles = (parsed as Record<string, unknown>).approver_roles;
      if (Array.isArray(approverRoles)) {
        const roles = approverRoles.filter((value): value is string => typeof value === "string");
        if (roles.length > 0) {
          return roles;
        }
      }
    }
  } catch {}

  try {
    const parsed = JSON.parse(policy.approver_roles_json) as unknown;
    if (Array.isArray(parsed)) {
      const roles = parsed.filter((value): value is string => typeof value === "string");
      if (roles.length > 0) {
        return roles;
      }
    }
  } catch {}

  return DEFAULT_APPROVER_ROLES;
}

function parseSmokePolicyApprovalTimeoutSeconds(policy: PolicyRow): number {
  try {
    const parsed = JSON.parse(policy.approval_config_json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const timeoutSeconds = (parsed as Record<string, unknown>).timeout_seconds;
      if (typeof timeoutSeconds === "number" && Number.isFinite(timeoutSeconds) && timeoutSeconds > 0) {
        return timeoutSeconds;
      }
    }
  } catch {}

  return DEFAULT_APPROVAL_TIMEOUT_SECONDS;
}

function selectBestSmokePolicy(args: {
  policies: PolicyRow[];
  toolProviderId: string;
  labels: string[];
  riskLevel: PolicyConditions["risk_level"] | null;
}): PolicyRow | null {
  let bestPolicy: PolicyRow | null = null;

  for (const policy of args.policies) {
    if (policy.tool_name !== null) {
      continue;
    }

    const conditions = parseSmokePolicyConditions(policy.conditions_json);
    if (!conditions || !matchesSmokePolicyConditions(conditions, args)) {
      continue;
    }

    if (!bestPolicy) {
      bestPolicy = policy;
      continue;
    }

    if (policy.priority !== bestPolicy.priority) {
      if (policy.priority > bestPolicy.priority) {
        bestPolicy = policy;
      }
      continue;
    }

    const policySpecificity = getSmokePolicySpecificity(policy, args.toolProviderId, conditions);
    const bestSpecificity = getSmokePolicySpecificity(
      bestPolicy,
      args.toolProviderId,
      parseSmokePolicyConditions(bestPolicy.conditions_json) ?? {},
    );
    if (policySpecificity !== bestSpecificity) {
      if (policySpecificity > bestSpecificity) {
        bestPolicy = policy;
      }
      continue;
    }

    const policySeverity = getSmokePolicyDecisionSeverity(policy.decision);
    const bestSeverity = getSmokePolicyDecisionSeverity(bestPolicy.decision);
    if (policySeverity > bestSeverity) {
      bestPolicy = policy;
      continue;
    }
    if (policySeverity < bestSeverity) {
      continue;
    }

    if (policy.updated_at !== bestPolicy.updated_at) {
      if (policy.updated_at > bestPolicy.updated_at) {
        bestPolicy = policy;
      }
      continue;
    }

    if (policy.policy_id > bestPolicy.policy_id) {
      bestPolicy = policy;
    }
  }

  return bestPolicy;
}

function parseSmokePolicyConditions(raw: string): PolicyConditions | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as PolicyConditions;
  } catch {
    return null;
  }
}

function matchesSmokePolicyConditions(
  conditions: PolicyConditions,
  args: {
    labels: string[];
    riskLevel: PolicyConditions["risk_level"] | null;
  },
): boolean {
  for (const [key, value] of Object.entries(conditions as Record<string, unknown>)) {
    switch (key) {
      case "labels":
        if (!Array.isArray(value)) {
          return false;
        }
        for (const label of value) {
          if (typeof label !== "string" || !args.labels.includes(label)) {
            return false;
          }
        }
        break;
      case "risk_level":
        if (value !== args.riskLevel) {
          return false;
        }
        break;
      case "target_classification":
        return false;
      default:
        return false;
    }
  }

  return true;
}

function getSmokePolicySpecificity(
  policy: PolicyRow,
  toolProviderId: string,
  conditions: PolicyConditions,
): number {
  let specificity = policy.tool_provider_id === toolProviderId ? 1 : 0;

  for (const key of Object.keys(conditions as Record<string, unknown>)) {
    switch (key) {
      case "labels":
      case "risk_level":
        specificity += 1;
        break;
      default:
        break;
    }
  }

  return specificity;
}

function normalizeSmokeRiskLevel(value: string | undefined): PolicyConditions["risk_level"] | null {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return null;
}

function getSmokePolicyDecisionSeverity(decision: PolicyDecision): number {
  if (decision === "deny") {
    return 3;
  }
  if (decision === "approval_required") {
    return 2;
  }
  return 1;
}

function toSqlParams(params: unknown[]): Array<string | number | bigint | Uint8Array | null> {
  return params.map((param) => {
    if (
      param === null ||
      typeof param === "string" ||
      typeof param === "number" ||
      typeof param === "bigint" ||
      param instanceof Uint8Array
    ) {
      return param;
    }

    if (typeof param === "boolean") {
      return param ? 1 : 0;
    }

    return JSON.stringify(param);
  });
}

await main();
