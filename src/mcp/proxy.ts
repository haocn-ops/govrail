import { resolveAuthHeaders } from "../lib/auth.js";
import { recordAuditEvent } from "../lib/audit.js";
import { getRun, getToolProvider, listActivePolicies } from "../lib/db.js";
import { ApiError, buildMeta, getRequiredTenantId, getSubjectId, readJson, requireIdempotencyKey } from "../lib/http.js";
import { createId, hashPayload, nowIso } from "../lib/ids.js";
import type { PolicyApprovalConfig, PolicyConditions, PolicyDecision, PolicyRow } from "../types.js";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  risk_level: "low" | "high";
}

interface PolicyEvaluationContext {
  toolProviderId: string;
  toolName: string;
  riskLevel: ToolDefinition["risk_level"];
  targetClassification: "internal" | "external" | "restricted" | null;
  labels: string[];
  args: Record<string, unknown>;
}

interface ResolvedPolicyDecision {
  decision: PolicyDecision;
  policyId: string | null;
  approverRoles: string[];
  timeoutSeconds: number;
}

const DEFAULT_APPROVER_ROLES = ["legal_approver"];
const DEFAULT_APPROVAL_TIMEOUT_SECONDS = 24 * 60 * 60;
const MCP_POLICY_CHANNEL = "mcp_tool_call";
const MCP_SSE_KEEPALIVE_MS = 15_000;

export async function handleMcpProxy(
  request: Request,
  env: Env,
  toolProviderId: string,
): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const toolProvider = await getToolProvider(env, tenantId, toolProviderId);
  if (!toolProvider) {
    throw new ApiError(404, "tool_provider_not_found", "Tool provider does not exist in current tenant");
  }

  if (toolProvider.status !== "active") {
    throw new ApiError(422, "policy_denied", "Tool provider is disabled");
  }

  if (request.method === "GET") {
    return buildMcpStreamResponse(request, toolProviderId);
  }

  const meta = buildMeta(request);
  const rpc = await readJson<JsonRpcRequest>(request);
  switch (rpc.method) {
    case "initialize":
      return rpcResponse({
        jsonrpc: "2.0",
        id: rpc.id ?? null,
        result: {
          serverInfo: {
            name: toolProvider.name,
            version: "0.1.0",
          },
          capabilities: {
            tools: {},
          },
        },
      });
    case "tools/list":
      return handleToolsList(request, env, toolProviderId, rpc, meta);
    case "tools/call":
      return handleToolsCall(
        request,
        env,
        toolProviderId,
        toolProvider.endpoint_url,
        toolProvider.auth_ref,
        rpc,
        meta,
      );
    default:
      throw new ApiError(400, "invalid_request", "Unsupported MCP method");
  }
}

function buildMcpStreamResponse(request: Request, toolProviderId: string): Response {
  const meta = buildMeta(request);
  const endpoint = `${new URL(request.url).origin}${new URL(request.url).pathname}`;
  const encoder = new TextEncoder();
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          formatSseEvent("ready", {
            tool_provider_id: toolProviderId,
            transport: "sse",
            endpoint,
            status: "ready",
            meta,
          }),
        ),
      );

      keepAliveTimer = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, MCP_SSE_KEEPALIVE_MS);
    },
    cancel() {
      if (keepAliveTimer !== null) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-content-type-options": "nosniff",
    },
  });
}

function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function handleToolsList(
  request: Request,
  env: Env,
  toolProviderId: string,
  rpc: JsonRpcRequest,
  meta: { request_id: string; trace_id: string },
): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const policies = await listActivePolicies(env, tenantId, MCP_POLICY_CHANNEL, toolProviderId);
  const tools = getDemoTools(toolProviderId)
    .flatMap((tool) => {
      const decision = resolvePolicyDecision(policies, {
        toolProviderId,
        toolName: tool.name,
        riskLevel: tool.risk_level,
        targetClassification: null,
        labels: [],
        args: {},
      });
      const requiresApproval =
        decision.decision === "approval_required" ||
        hasScopedPolicyDecision(policies, toolProviderId, tool.name, "approval_required") ||
        evaluateDefaultPolicyDecision(tool.name, getListApprovalHintArgs(tool.name)) === "approval_required";

      if (decision.decision === "deny") {
        return [];
      }

      return [
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          metadata: {
            provider_id: toolProviderId,
            risk_level: tool.risk_level,
            requires_approval: requiresApproval,
          },
        },
      ];
    });

  return rpcResponse({
    jsonrpc: "2.0",
    id: rpc.id ?? null,
    result: {
      tools,
    },
  });
}

async function handleToolsCall(
  request: Request,
  env: Env,
  toolProviderId: string,
  endpointUrl: string,
  authRef: string | null,
  rpc: JsonRpcRequest,
  meta: { request_id: string; trace_id: string },
): Promise<Response> {
  const tenantId = getRequiredTenantId(request);
  const subjectId = getSubjectId(request, env);
  const idempotencyKey = requireIdempotencyKey(request);
  const routeKey = `POST:/api/v1/mcp/${toolProviderId}`;
  const payloadHash = await hashPayload(rpc);
  const existing = await env.DB.prepare(
    `SELECT resource_id, payload_hash
       FROM idempotency_records
      WHERE tenant_id = ?1 AND route_key = ?2 AND idempotency_key = ?3`,
  )
    .bind(tenantId, routeKey, idempotencyKey)
    .first<{ resource_id: string; payload_hash: string }>();

  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    const existingCall = await env.DB.prepare(
      `SELECT call_id, status, approval_id, response_blob_key
         FROM mcp_calls
        WHERE tenant_id = ?1 AND call_id = ?2`,
    )
      .bind(tenantId, existing.resource_id)
      .first<{
        call_id: string;
        status: string;
        approval_id: string | null;
        response_blob_key: string | null;
      }>();

    if (!existingCall) {
      throw new ApiError(404, "mcp_call_not_found", "Existing idempotent MCP call no longer exists");
    }

    if (existingCall.approval_id) {
      return buildApprovalRequiredResponse(existingCall.approval_id, meta);
    }

    const previousResponse =
      existingCall.response_blob_key === null
        ? null
        : await env.ARTIFACTS_BUCKET.get(existingCall.response_blob_key);
    const result = previousResponse ? await previousResponse.json() : { accepted: true };
    return rpcResponse(result);
  }

  const runId = request.headers.get("x-run-id");
  if (!runId) {
    throw new ApiError(400, "invalid_request", "Missing required header: X-Run-Id");
  }
  const run = await getRun(env, tenantId, runId);
  if (!run) {
    throw new ApiError(404, "run_not_found", "Run does not exist in current tenant");
  }

  const toolName = rpc.params?.name;
  if (!toolName) {
    throw new ApiError(400, "invalid_request", "Missing tool name");
  }

  const args = rpc.params?.arguments ?? {};
  const tool = getDemoTools(toolProviderId).find((candidate) => candidate.name === toolName);
  if (!tool) {
    throw new ApiError(404, "tool_not_found", "Tool is not registered on current provider");
  }

  const policies = await listActivePolicies(env, tenantId, MCP_POLICY_CHANNEL, toolProviderId);
  const policy = resolvePolicyDecision(policies, {
    toolProviderId,
    toolName,
    riskLevel: tool.risk_level,
    targetClassification: detectTargetClassification(toolName, args),
    labels: extractLabels(args),
    args,
  });
  const policyDecision = policy.decision;
  const timestamp = nowIso();
  const stepId = createId("step");
  const callId = createId("mcp");
  const requestBlobKey = `tenants/${tenantId}/runs/${runId}/steps/${stepId}/mcp-request.json`;
  await env.ARTIFACTS_BUCKET.put(requestBlobKey, JSON.stringify(rpc, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  let approvalId: string | null = null;
  let responseBlobKey: string | null = null;
  let callStatus = policyDecision === "allow" ? "completed" : policyDecision === "deny" ? "failed" : "blocked";
  let stepStatus = policyDecision === "allow" ? "completed" : policyDecision === "deny" ? "failed" : "blocked";
  let responsePayload: Record<string, unknown> | null = null;

  if (policyDecision === "approval_required") {
    approvalId = createId("apr");
    await createApprovalForToolCall({
      env,
      approvalId,
      tenantId,
      runId,
      stepId,
      subjectId,
      toolProviderId,
      toolName,
      riskLevel: tool.risk_level,
      targetClassification: detectTargetClassification(toolName, args),
      args,
      traceId: meta.trace_id,
      policy,
    });
  } else if (policyDecision === "allow") {
    responsePayload =
      endpointUrl.startsWith("mock://") || endpointUrl.startsWith("demo://")
        ? buildMockToolResult(toolName, args)
        : await forwardToolCall(env, endpointUrl, authRef, rpc);
    responseBlobKey = `tenants/${tenantId}/runs/${runId}/steps/${stepId}/mcp-response.json`;
    await env.ARTIFACTS_BUCKET.put(responseBlobKey, JSON.stringify(responsePayload, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO run_steps (
          step_id, tenant_id, run_id, parent_step_id, sequence_no, step_type, actor_type, actor_ref,
          status, input_blob_key, output_blob_key, started_at, ended_at, error_code, metadata_json
        ) VALUES (
          ?1, ?2, ?3, NULL,
          COALESCE((SELECT MAX(sequence_no) + 1 FROM run_steps WHERE run_id = ?3), 1),
          ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, ?11, ?12
        )`,
    ).bind(
      stepId,
      tenantId,
      runId,
      "mcp_call",
      "tool",
      toolProviderId,
      stepStatus,
      requestBlobKey,
      responseBlobKey,
      timestamp,
      policyDecision === "deny" ? "policy_denied" : null,
      JSON.stringify({ tool_name: toolName, policy_decision: policyDecision, policy_id: policy.policyId }),
    ),
    env.DB.prepare(
      `INSERT INTO mcp_calls (
          call_id, tenant_id, run_id, step_id, tool_provider_id, tool_name, policy_decision, approval_id,
          request_blob_key, response_blob_key, started_at, ended_at, status, error_code
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, ?12, ?13)`,
    ).bind(
      callId,
      tenantId,
      runId,
      stepId,
      toolProviderId,
      toolName,
      policyDecision,
      approvalId,
      requestBlobKey,
      responseBlobKey,
      timestamp,
      callStatus,
      policyDecision === "deny" ? "policy_denied" : null,
    ),
    env.DB.prepare(
      `INSERT INTO idempotency_records (
          record_id, tenant_id, route_key, idempotency_key, payload_hash, resource_type, resource_id, created_at, expires_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    ).bind(
      createId("idem"),
      tenantId,
      routeKey,
      idempotencyKey,
      payloadHash,
      "mcp_call",
      callId,
      timestamp,
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ),
    env.DB.prepare(
      "UPDATE runs SET current_step_id = ?1, updated_at = ?2, pending_approval_id = COALESCE(?3, pending_approval_id), status = CASE WHEN ?3 IS NOT NULL THEN 'waiting_approval' ELSE status END WHERE tenant_id = ?4 AND run_id = ?5",
    ).bind(stepId, timestamp, approvalId, tenantId, runId),
  ]);

  await recordAuditEvent({
    env,
    tenantId,
    runId,
    stepId,
    traceId: meta.trace_id,
    eventType: "policy_evaluated",
    actorType: "system",
    actorRef: "mcp_gateway",
    payload: {
      channel: MCP_POLICY_CHANNEL,
      tool_provider_id: toolProviderId,
      tool_name: toolName,
      decision: policyDecision,
      policy_id: policy.policyId,
    },
    createdAt: timestamp,
  });

  if (approvalId) {
    await recordAuditEvent({
      env,
      tenantId,
      runId,
      stepId,
      traceId: meta.trace_id,
      eventType: "side_effect_blocked",
      actorType: "system",
      actorRef: "mcp_gateway",
      payload: {
        channel: MCP_POLICY_CHANNEL,
        tool_provider_id: toolProviderId,
        tool_name: toolName,
        reason: "approval_required",
        approval_id: approvalId,
        policy_id: policy.policyId,
      },
      createdAt: timestamp,
    });
    const stub = env.RUN_COORDINATOR.get(env.RUN_COORDINATOR.idFromName(runId));
    await stub.fetch("https://run-coordinator.internal/approval", {
      method: "POST",
      body: JSON.stringify({ approval_id: approvalId }),
    });
    return buildApprovalRequiredResponse(approvalId, meta);
  }

  if (policyDecision === "deny") {
    await recordAuditEvent({
      env,
      tenantId,
      runId,
      stepId,
      traceId: meta.trace_id,
      eventType: "side_effect_blocked",
      actorType: "system",
      actorRef: "mcp_gateway",
      payload: {
        channel: MCP_POLICY_CHANNEL,
        tool_provider_id: toolProviderId,
        tool_name: toolName,
        reason: "policy_denied",
        policy_id: policy.policyId,
      },
      createdAt: timestamp,
    });
    throw new ApiError(422, "policy_denied", "Tool call was denied by policy");
  }

  await recordAuditEvent({
    env,
    tenantId,
    runId,
    stepId,
    traceId: meta.trace_id,
    eventType: "side_effect_executed",
    actorType: "tool",
    actorRef: toolProviderId,
    payload: {
      channel: MCP_POLICY_CHANNEL,
      tool_provider_id: toolProviderId,
      tool_name: toolName,
      policy_id: policy.policyId,
      result_status: callStatus,
    },
    createdAt: timestamp,
  });

  return rpcResponse({
    jsonrpc: "2.0",
    id: rpc.id ?? null,
    result: responsePayload ?? { accepted: true },
  });
}

function getDemoTools(toolProviderId: string): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    {
      name: "read_erp",
      description: "Read records from ERP data sources.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
      },
      risk_level: "low",
    },
    {
      name: "send_email",
      description: "Send an email through the gateway.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "array", items: { type: "string" } },
          subject: { type: "string" },
          body: { type: "string" },
        },
      },
      risk_level: "high",
    },
    {
      name: "delete_record",
      description: "Delete a record from an external system.",
      inputSchema: {
        type: "object",
        properties: {
          record_id: { type: "string" },
        },
      },
      risk_level: "high",
    },
  ];

  if (toolProviderId.includes("email")) {
    return tools.filter((tool) => tool.name === "send_email");
  }

  if (toolProviderId.includes("data") || toolProviderId.includes("erp")) {
    return tools.filter((tool) => tool.name === "read_erp" || tool.name === "delete_record");
  }

  return tools;
}

function resolvePolicyDecision(
  policies: PolicyRow[],
  context: PolicyEvaluationContext,
): ResolvedPolicyDecision {
  let bestMatch:
    | {
        policy: PolicyRow;
        specificity: number;
        approvalConfig: PolicyApprovalConfig;
      }
    | null = null;

  for (const policy of policies) {
    if (!matchesPolicyScope(policy, context)) {
      continue;
    }

    const conditions = parsePolicyConditions(policy.conditions_json);
    if (!conditions || !matchesPolicyConditions(conditions, context)) {
      continue;
    }

    const candidate = {
      policy,
      specificity: calculatePolicySpecificity(policy, conditions),
      approvalConfig: parseApprovalConfig(policy),
    };

    if (!bestMatch || comparePolicyCandidates(candidate, bestMatch) > 0) {
      bestMatch = candidate;
    }
  }

  if (bestMatch) {
    return {
      decision: bestMatch.policy.decision,
      policyId: bestMatch.policy.policy_id,
      approverRoles: bestMatch.approvalConfig.approver_roles ?? DEFAULT_APPROVER_ROLES,
      timeoutSeconds: bestMatch.approvalConfig.timeout_seconds ?? DEFAULT_APPROVAL_TIMEOUT_SECONDS,
    };
  }

  return {
    decision: evaluateDefaultPolicyDecision(context.toolName, context.args),
    policyId: null,
    approverRoles: DEFAULT_APPROVER_ROLES,
    timeoutSeconds: DEFAULT_APPROVAL_TIMEOUT_SECONDS,
  };
}

function evaluateDefaultPolicyDecision(
  toolName: string,
  args: Record<string, unknown>,
): PolicyDecision {
  if (/^(delete|erase|drop)/i.test(toolName)) {
    return "deny";
  }

  if (toolName === "send_email") {
    const recipients = Array.isArray(args.to) ? args.to : [];
    const hasExternalRecipient = recipients.some(
      (value) =>
        typeof value === "string" &&
        !value.endsWith("@internal.example.com") &&
        !value.endsWith("@localhost"),
    );
    return hasExternalRecipient ? "approval_required" : "allow";
  }

  return "allow";
}

async function createApprovalForToolCall(args: {
  env: Env;
  approvalId: string;
  tenantId: string;
  runId: string;
  stepId: string;
  subjectId: string;
  toolProviderId: string;
  toolName: string;
  riskLevel: ToolDefinition["risk_level"];
  targetClassification: "internal" | "external" | "restricted" | null;
  args: Record<string, unknown>;
  traceId: string;
  policy: ResolvedPolicyDecision;
}): Promise<void> {
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + args.policy.timeoutSeconds * 1000).toISOString();
  const approvalBlobKey = `tenants/${args.tenantId}/runs/${args.runId}/audit/${args.approvalId}.json`;
  await args.env.ARTIFACTS_BUCKET.put(
    approvalBlobKey,
    JSON.stringify(
      {
        summary: {
          action: args.toolName,
          provider: args.toolProviderId,
          risk_level: args.riskLevel,
          reason: buildApprovalReason(args.toolName, args.targetClassification, args.policy.policyId),
        },
        subject_snapshot: args.args,
        trace: {
          trace_id: args.traceId,
          run_id: args.runId,
          step_id: args.stepId,
        },
      },
      null,
      2,
    ),
    {
      httpMetadata: { contentType: "application/json" },
    },
  );

  await args.env.DB.prepare(
    `INSERT INTO approvals (
        approval_id, tenant_id, run_id, step_id, policy_id, subject_type, subject_ref, status,
        requested_by, approver_scope_json, decision_by, decision_comment, decision_reason_code, expires_at, created_at, decided_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9, NULL, NULL, NULL, ?10, ?11, NULL)`,
  )
    .bind(
      args.approvalId,
      args.tenantId,
      args.runId,
      args.stepId,
      args.policy.policyId ?? "pol_default_external_send_v1",
      "tool_call",
      args.toolName,
      args.subjectId,
      JSON.stringify({ approver_roles: args.policy.approverRoles }),
      expiresAt,
      timestamp,
    )
    .run();

  await recordAuditEvent({
    env: args.env,
    tenantId: args.tenantId,
    runId: args.runId,
    stepId: args.stepId,
    traceId: args.traceId,
    eventType: "approval_created",
    actorType: "system",
    actorRef: "approval_gateway",
    payload: {
      approval_id: args.approvalId,
      policy_id: args.policy.policyId ?? "pol_default_external_send_v1",
      subject_type: "tool_call",
      subject_ref: args.toolName,
    },
    createdAt: timestamp,
  });

  const stub = args.env.APPROVAL_SESSION.get(args.env.APPROVAL_SESSION.idFromName(args.approvalId));
  await stub.fetch("https://approval-session.internal/init", {
    method: "POST",
    body: JSON.stringify({
      approval_id: args.approvalId,
      run_id: args.runId,
      status: "pending",
      decision: null,
    }),
  });
}

async function forwardToolCall(
  env: Env,
  endpointUrl: string,
  authRef: string | null,
  rpc: JsonRpcRequest,
): Promise<Record<string, unknown>> {
  const headers = resolveAuthHeaders(env, authRef);
  headers.set("content-type", "application/json");

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(rpc),
  });

  if (!response.ok) {
    throw new ApiError(503, "upstream_unavailable", "Upstream MCP endpoint is unavailable");
  }

  return (await response.json()) as Record<string, unknown>;
}

function buildMockToolResult(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (toolName === "read_erp") {
    return {
      content: [
        {
          type: "text",
          text: `Read ERP results for query: ${String(args.query ?? "")}`,
        },
      ],
    };
  }

  if (toolName === "send_email") {
    return {
      content: [
        {
          type: "text",
          text: `Email accepted for delivery to ${JSON.stringify(args.to ?? [])}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `Executed tool ${toolName}`,
      },
    ],
  };
}

function buildApprovalRequiredResponse(
  approvalId: string,
  meta: { request_id: string; trace_id: string },
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "approval_required",
        message: "This tool call requires human approval",
        details: {
          approval_id: approvalId,
        },
      },
      meta,
    }),
    {
      status: 423,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}

function matchesPolicyScope(policy: PolicyRow, context: PolicyEvaluationContext): boolean {
  if (policy.tool_provider_id !== null && policy.tool_provider_id !== context.toolProviderId) {
    return false;
  }

  if (policy.tool_name !== null && policy.tool_name !== context.toolName) {
    return false;
  }

  return true;
}

function parsePolicyConditions(raw: string): PolicyConditions | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as PolicyConditions;
  } catch {
    return null;
  }
}

function parseApprovalConfig(policy: PolicyRow): PolicyApprovalConfig {
  const approvalConfig = safeParseObject(policy.approval_config_json);
  const configRoles = Array.isArray(approvalConfig.approver_roles)
    ? approvalConfig.approver_roles.filter((value): value is string => typeof value === "string")
    : [];
  const rowRoles = safeParseStringArray(policy.approver_roles_json);

  return {
    approver_roles: configRoles.length > 0 ? configRoles : rowRoles.length > 0 ? rowRoles : DEFAULT_APPROVER_ROLES,
    timeout_seconds:
      typeof approvalConfig.timeout_seconds === "number" && approvalConfig.timeout_seconds > 0
        ? approvalConfig.timeout_seconds
        : DEFAULT_APPROVAL_TIMEOUT_SECONDS,
  };
}

function safeParseObject(raw: string): Record<string, unknown> {
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

function matchesPolicyConditions(
  conditions: PolicyConditions,
  context: PolicyEvaluationContext,
): boolean {
  const entries = Object.entries(conditions as Record<string, unknown>);
  for (const [key, value] of entries) {
    switch (key) {
      case "risk_level":
        if (value !== context.riskLevel) {
          return false;
        }
        break;
      case "target_classification":
        if (
          typeof value !== "string" ||
          context.targetClassification === null ||
          value !== context.targetClassification
        ) {
          return false;
        }
        break;
      case "labels":
        if (!Array.isArray(value)) {
          return false;
        }
        for (const label of value) {
          if (typeof label !== "string" || !context.labels.includes(label)) {
            return false;
          }
        }
        break;
      default:
        return false;
    }
  }

  return true;
}

function calculatePolicySpecificity(policy: PolicyRow, conditions: PolicyConditions): number {
  let specificity = 0;
  if (policy.tool_provider_id !== null) {
    specificity += 1;
  }
  if (policy.tool_name !== null) {
    specificity += 1;
  }

  for (const key of Object.keys(conditions as Record<string, unknown>)) {
    switch (key) {
      case "risk_level":
      case "target_classification":
      case "labels":
        specificity += 1;
        break;
      default:
        break;
    }
  }

  return specificity;
}

function comparePolicyCandidates(
  left: { policy: PolicyRow; specificity: number },
  right: { policy: PolicyRow; specificity: number },
): number {
  if (left.policy.priority !== right.policy.priority) {
    return left.policy.priority - right.policy.priority;
  }

  if (left.specificity !== right.specificity) {
    return left.specificity - right.specificity;
  }

  const strictnessDelta = decisionStrictness(left.policy.decision) - decisionStrictness(right.policy.decision);
  if (strictnessDelta !== 0) {
    return strictnessDelta;
  }

  if (left.policy.updated_at !== right.policy.updated_at) {
    return left.policy.updated_at > right.policy.updated_at ? 1 : -1;
  }

  return left.policy.policy_id > right.policy.policy_id ? 1 : -1;
}

function decisionStrictness(decision: PolicyDecision): number {
  switch (decision) {
    case "deny":
      return 3;
    case "approval_required":
      return 2;
    case "allow":
      return 1;
  }
}

function detectTargetClassification(
  toolName: string,
  args: Record<string, unknown>,
): "internal" | "external" | "restricted" | null {
  if (toolName !== "send_email") {
    return null;
  }

  const recipients = Array.isArray(args.to) ? args.to : [];
  if (recipients.length === 0) {
    return null;
  }

  const classification = recipients.some(
    (value) =>
      typeof value === "string" &&
      !value.endsWith("@internal.example.com") &&
      !value.endsWith("@localhost"),
  )
    ? "external"
    : "internal";

  return classification;
}

function extractLabels(args: Record<string, unknown>): string[] {
  if (!Array.isArray(args.labels)) {
    return [];
  }

  return args.labels.filter((value): value is string => typeof value === "string");
}

function hasScopedPolicyDecision(
  policies: PolicyRow[],
  toolProviderId: string,
  toolName: string,
  decision: PolicyDecision,
): boolean {
  return policies.some(
    (policy) =>
      policy.decision === decision &&
      (policy.tool_provider_id === null || policy.tool_provider_id === toolProviderId) &&
      (policy.tool_name === null || policy.tool_name === toolName),
  );
}

function getListApprovalHintArgs(toolName: string): Record<string, unknown> {
  if (toolName === "send_email") {
    return {
      to: ["external@example.com"],
    };
  }

  return {};
}

function buildApprovalReason(
  toolName: string,
  targetClassification: "internal" | "external" | "restricted" | null,
  policyId: string | null,
): string {
  if (targetClassification !== null) {
    return `target classification is ${targetClassification}`;
  }

  if (policyId) {
    return `matched policy ${policyId}`;
  }

  return `tool ${toolName} requires approval`;
}

function json(data: unknown, meta: { request_id: string; trace_id: string }, init?: ResponseInit): Response {
  return new Response(
    JSON.stringify({
      data,
      meta,
    }),
    {
      status: init?.status ?? 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...init?.headers,
      },
    },
  );
}

function rpcResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}
