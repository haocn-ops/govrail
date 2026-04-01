import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const baseUrl = process.env.BASE_URL;
const tenantId = process.env.TENANT_ID;
const subjectId = process.env.SUBJECT_ID ?? "post_deploy_verifier";
const subjectRoles = process.env.SUBJECT_ROLES ?? "platform_admin,legal_approver";
const verifyMode = normalizeVerifyMode(process.env.VERIFY_MODE);
const existingRunId = process.env.RUN_ID ?? process.env.EXISTING_RUN_ID ?? null;
const expectedRunRateLimit = readOptionalPositiveInteger(process.env.EXPECT_RATE_LIMIT_RUNS_PER_MINUTE);
const expectedReplayRateLimit = readOptionalPositiveInteger(process.env.EXPECT_RATE_LIMIT_REPLAYS_PER_MINUTE);
const verifyOutputPath = normalizeOptionalString(process.env.VERIFY_OUTPUT_PATH);
const verificationStartedAt = nowIso();
const verificationStartedAtMs = Date.now();
const verificationChecks = [];

if (process.argv.includes("--help")) {
  printUsage();
  process.exit(0);
}

if (!baseUrl || !tenantId) {
  console.error("Missing required env vars: BASE_URL and TENANT_ID");
  printUsage();
  process.exit(1);
}

const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
const traceId = `trc_verify_${Date.now()}`;
const suffix = `${Date.now()}`;

async function main() {
  logStep("Start verification");

  logStep("Check health");
  const health = await request("GET", "/api/v1/health", {
    expectedStatus: 200,
    includeTenant: false,
    includeSubject: false,
  });
  assert(health.json.data?.ok === true, "Health endpoint did not return ok=true");
  assert(health.json.data?.service === "agent-control-plane", "Health endpoint service mismatch");

  logStep("Check agent card");
  const agentCard = await request("GET", "/.well-known/agent-card.json", {
    expectedStatus: 200,
    includeTenant: false,
  });
  assert(agentCard.json.name === "Agent Control Plane Gateway", "Unexpected agent card name");
  assert(agentCard.json.capabilities?.tasks === true, "Agent card tasks capability mismatch");
  assert(agentCard.json.capabilities?.streaming === true, "Agent card streaming capability mismatch");
  assert(
    agentCard.json.endpoints?.message_send === `${normalizedBaseUrl}/api/v1/a2a/message:send`,
    "Agent card message_send endpoint mismatch",
  );
  assert(
    agentCard.json.endpoints?.message_stream === `${normalizedBaseUrl}/api/v1/a2a/message:stream`,
    "Agent card message_stream endpoint mismatch",
  );
  assert(
    agentCard.json.endpoints?.task_get === `${normalizedBaseUrl}/api/v1/a2a/tasks/{id}`,
    "Agent card task_get endpoint mismatch",
  );
  assert(
    agentCard.json.endpoints?.task_cancel === `${normalizedBaseUrl}/api/v1/a2a/tasks/{id}:cancel`,
    "Agent card task_cancel endpoint mismatch",
  );

  logStep("List admin resources");
  const providers = await request("GET", "/api/v1/tool-providers", { expectedStatus: 200 });
  const policies = await request("GET", "/api/v1/policies", { expectedStatus: 200 });
  const toolProviderId = `tp_verify_${suffix}`;
  const policyId = `pol_verify_${suffix}`;

  logStep("Check SSE streams");
  const a2aStream = await request("GET", "/api/v1/a2a/message:stream", {
    expectedStatus: 200,
    parseJson: false,
  });
  assert(
    (a2aStream.headers.get("content-type") ?? "").startsWith("text/event-stream"),
    "A2A stream content-type mismatch",
  );
  assert(
    (a2aStream.headers.get("cache-control") ?? "").includes("no-cache"),
    "A2A stream cache-control mismatch",
  );
  const a2aEvents = parseSseEvents(a2aStream.text);
  const a2aReady = a2aEvents.find((event) => event.event === "ready");
  const a2aSnapshot = a2aEvents.find((event) => event.event === "snapshot");
  assert(a2aReady !== undefined, "A2A stream missing ready event");
  assert(a2aSnapshot !== undefined, "A2A stream missing snapshot event");
  const a2aReadyData = parseJsonObject(a2aReady?.data);
  const a2aSnapshotData = parseJsonObject(a2aSnapshot?.data);
  assert(a2aReadyData?.endpoint === "/api/v1/a2a/message:stream", "A2A ready endpoint mismatch");
  assert(a2aReadyData?.transport === "sse", "A2A ready transport mismatch");
  assert(a2aReadyData?.tenant_id === tenantId, "A2A ready tenant mismatch");
  assert(typeof a2aSnapshotData?.generated_at === "string", "A2A snapshot missing generated_at");
  assert(typeof a2aSnapshotData?.task_count === "number", "A2A snapshot missing task_count");
  assert(Array.isArray(a2aSnapshotData?.tasks), "A2A snapshot missing task list");

  const activeProviderId = Array.isArray(providers.json.data?.items)
    ? providers.json.data.items.find((item) => item?.status === "active" && typeof item?.tool_provider_id === "string")
        ?.tool_provider_id ?? null
    : null;
  if (activeProviderId) {
    const mcpStream = await request("GET", `/api/v1/mcp/${activeProviderId}`, {
      expectedStatus: 200,
      parseJson: false,
      readStreamPrefix: true,
    });
    assert(
      (mcpStream.headers.get("content-type") ?? "").startsWith("text/event-stream"),
      "MCP stream content-type mismatch",
    );
    assert(
      (mcpStream.headers.get("cache-control") ?? "").includes("no-cache"),
      "MCP stream cache-control mismatch",
    );
    const mcpEvents = parseSseEvents(mcpStream.text);
    const mcpReady = mcpEvents.find((event) => event.event === "ready");
    assert(mcpReady !== undefined, "MCP stream missing ready event");
    const mcpReadyData = parseJsonObject(mcpReady?.data);
    assert(mcpReadyData?.tool_provider_id === activeProviderId, "MCP ready provider mismatch");
    assert(mcpReadyData?.transport === "sse", "MCP ready transport mismatch");
    assert(mcpReadyData?.endpoint === `${normalizedBaseUrl}/api/v1/mcp/${activeProviderId}`, "MCP ready endpoint mismatch");
    assert(mcpReadyData?.status === "ready", "MCP ready status mismatch");
  } else {
    logStep("No active tool provider available for MCP SSE check; skipped");
  }

  if (verifyMode === "readonly") {
    const readonlySummary = await runReadonlyVerification();
    await emitVerificationResult({
      ok: true,
      mode: verifyMode,
      base_url: normalizedBaseUrl,
      tenant_id: tenantId,
      trace_id: traceId,
      started_at: verificationStartedAt,
      completed_at: nowIso(),
      duration_ms: Date.now() - verificationStartedAtMs,
      check_count: verificationChecks.length,
      checks: verificationChecks,
      tool_provider_count: countItems(providers.json.data?.items),
      policy_count: countItems(policies.json.data?.items),
      ...readonlySummary,
    });
    return;
  }

  logStep("Create tool provider");
  const createdProvider = await request("POST", "/api/v1/tool-providers", {
    expectedStatus: 201,
    idempotencyKey: `verify-tool-provider-create-${suffix}`,
    body: {
      tool_provider_id: toolProviderId,
      name: "Post Deploy Verify Provider",
      provider_type: "mcp_server",
      endpoint_url: "https://verify.example.test/mcp",
      auth_ref: null,
      status: "active",
    },
  });
  assert(createdProvider.json.data.tool_provider_id === toolProviderId, "Tool provider create mismatch");
  const createdProviderStream = await request("GET", `/api/v1/mcp/${toolProviderId}`, {
    expectedStatus: 200,
    parseJson: false,
    readStreamPrefix: true,
  });
  assert(
    (createdProviderStream.headers.get("content-type") ?? "").startsWith("text/event-stream"),
    "Created MCP stream content-type mismatch",
  );

  logStep("Get and update tool provider");
  await request("GET", `/api/v1/tool-providers/${toolProviderId}`, { expectedStatus: 200 });
  const updatedProvider = await request("POST", `/api/v1/tool-providers/${toolProviderId}`, {
    expectedStatus: 200,
    idempotencyKey: `verify-tool-provider-update-${suffix}`,
    body: {
      endpoint_url: "https://verify-updated.example.test/mcp",
      status: "active",
    },
  });
  assert(
    updatedProvider.json.data.endpoint_url === "https://verify-updated.example.test/mcp",
    "Tool provider update mismatch",
  );

  logStep("Create policy");
  const createdPolicy = await request("POST", "/api/v1/policies", {
    expectedStatus: 201,
    idempotencyKey: `verify-policy-create-${suffix}`,
    body: {
      policy_id: policyId,
      channel: "mcp_tool_call",
      scope: {
        tool_provider_id: toolProviderId,
        tool_name: "send_email",
      },
      conditions: {
        risk_level: "high",
        target_classification: "external",
      },
      decision: "approval_required",
      approval_config: {
        approver_roles: ["legal_approver"],
        timeout_seconds: 3600,
      },
      priority: 100,
      status: "active",
    },
  });
  assert(createdPolicy.json.data.policy_id === policyId, "Policy create mismatch");

  logStep("Get and update policy");
  await request("GET", `/api/v1/policies/${policyId}`, { expectedStatus: 200 });
  const updatedPolicy = await request("POST", `/api/v1/policies/${policyId}`, {
    expectedStatus: 200,
    idempotencyKey: `verify-policy-update-${suffix}`,
    body: {
      priority: 110,
      status: "active",
      conditions: {
        risk_level: "medium",
        target_classification: "external",
      },
    },
  });
  assert(updatedPolicy.json.data.priority === 110, "Policy update mismatch");

  logStep("Create run");
  const createRunIdempotencyKey = `verify-run-create-${suffix}`;
  const createRunBody = {
    input: {
      kind: "user_instruction",
      text: "Run a post-deploy verification task and produce an artifact.",
    },
    context: {},
    policy_context: {
      labels: ["verification"],
    },
  };
  const createdRun = await request("POST", "/api/v1/runs", {
    expectedStatus: 201,
    idempotencyKey: createRunIdempotencyKey,
    body: createRunBody,
  });
  const runId = createdRun.json.data.run_id;
  assert(typeof runId === "string" && runId !== "", "Missing run id");

  const rateLimitSummary = {
    runs_create_rate_limit: "skipped",
    runs_replay_rate_limit: "skipped",
  };

  if (expectedRunRateLimit !== null) {
    rateLimitSummary.runs_create_rate_limit = await verifyRunCreateRateLimit({
      expectedLimit: expectedRunRateLimit,
      initialIdempotencyKey: createRunIdempotencyKey,
      initialBody: createRunBody,
    });
  }

  logStep("Wait for run completion");
  const run = await pollRunCompleted(runId);
  assert(run.status === "completed", `Run did not complete successfully: ${run.status}`);

  logStep("Fetch graph, events, and artifacts");
  const graph = await request("GET", `/api/v1/runs/${runId}/graph`, { expectedStatus: 200 });
  assert(Array.isArray(graph.json.data?.steps), "Graph response shape mismatch");
  assert(hasPageInfo(graph.json.data?.page_info), "Graph page_info mismatch");
  const sourceStepId = getFirstStepId(graph.json.data.steps);
  assert(typeof sourceStepId === "string" && sourceStepId !== "", "Missing source step id");
  const graphWithParams = await request("GET", `/api/v1/runs/${runId}/graph?include_payloads=true&page_size=1`, {
    expectedStatus: 200,
  });
  assert(Array.isArray(graphWithParams.json.data?.steps), "Graph query param response shape mismatch");
  assert(hasPageInfo(graphWithParams.json.data?.page_info), "Graph query params page_info mismatch");
  assert(graphWithParams.json.data?.run?.run_id === runId, "Graph query params run mismatch");
  assert(graphWithParams.json.data.steps.length <= 1, "Graph page_size did not limit steps");
  assert(graphWithParams.json.data.approvals.length <= 1, "Graph page_size did not limit approvals");
  assert(graphWithParams.json.data.artifacts.length <= 1, "Graph page_size did not limit artifacts");
  if (graphWithParams.json.data.artifacts.length > 0) {
    assert(graphWithParams.json.data.artifacts[0].body !== undefined, "Graph include_payloads did not expand body");
  }
  await request("GET", `/api/v1/runs/${runId}/events`, { expectedStatus: 200 });
  const artifacts = await request("GET", `/api/v1/runs/${runId}/artifacts`, { expectedStatus: 200 });
  assert(Array.isArray(artifacts.json.data.items), "Artifacts response shape mismatch");
  assert(artifacts.json.data.items.length >= 1, "Expected at least one artifact");
  const firstArtifact = artifacts.json.data.items[0];
  assert(typeof firstArtifact.artifact_id === "string" && firstArtifact.artifact_id !== "", "Missing artifact id");
  const fetchedArtifact = await request(
    "GET",
    `/api/v1/runs/${runId}/artifacts/${firstArtifact.artifact_id}?include_body=true`,
    { expectedStatus: 200 },
  );
  assert(fetchedArtifact.json.data.body !== undefined, "Artifact body was not returned");

  logStep("Replay run from step");
  const replayFromStepIdempotencyKey = `verify-replay-from-step-${suffix}`;
  const replayFromStepBody = {
    mode: "from_step",
    from_step_id: sourceStepId,
    reason: "Post deploy verification replay from step",
  };
  const replayFromStep = await request("POST", `/api/v1/runs/${runId}/replay`, {
    expectedStatus: 201,
    idempotencyKey: replayFromStepIdempotencyKey,
    body: replayFromStepBody,
  });
  assert(replayFromStep.json.data.replay_source_run_id === runId, "Replay source run mismatch");
  assert(replayFromStep.json.data.replay_mode === "from_step", "Replay mode mismatch");
  const replayRunId = replayFromStep.json.data.run_id;
  assert(typeof replayRunId === "string" && replayRunId !== "", "Missing replay run id");
  const replayRun = await pollRunCompleted(replayRunId);
  assert(replayRun.status === "completed", `Replay run did not complete successfully: ${replayRun.status}`);
  const replayGraph = await request("GET", `/api/v1/runs/${replayRunId}/graph`, { expectedStatus: 200 });
  const replaySteps = Array.isArray(replayGraph.json.data?.steps) ? replayGraph.json.data.steps : [];
  assert(replaySteps.length >= 1, "Replay graph response shape mismatch");
  const replayMetadata = parseJsonObject(replaySteps[0]?.metadata_json);
  assert(replayMetadata?.is_replay === true, "Replay metadata missing is_replay");
  assert(
    replayMetadata?.replay_from_step === sourceStepId,
    "Replay metadata missing replay_from_step",
  );
  assert(replayMetadata?.replay_start_phase === "planner", "Replay metadata missing replay_start_phase");

  if (expectedReplayRateLimit !== null) {
    rateLimitSummary.runs_replay_rate_limit = await verifyReplayRateLimit({
      runId,
      expectedLimit: expectedReplayRateLimit,
      initialIdempotencyKey: replayFromStepIdempotencyKey,
      initialBody: replayFromStepBody,
    });
  }

  logStep("Disable created policy and tool provider");
  const disabledPolicy = await request("POST", `/api/v1/policies/${policyId}:disable`, {
    expectedStatus: 200,
    idempotencyKey: `verify-policy-disable-${suffix}`,
    body: {},
  });
  assert(disabledPolicy.json.data.status === "disabled", "Policy disable did not return disabled status");

  const disabledProvider = await request("POST", `/api/v1/tool-providers/${toolProviderId}:disable`, {
    expectedStatus: 200,
    idempotencyKey: `verify-tool-provider-disable-${suffix}`,
    body: {},
  });
  assert(
    disabledProvider.json.data.status === "disabled",
    "Tool provider disable did not return disabled status",
  );

  const disabledPolicies = await request("GET", "/api/v1/policies?status=disabled", { expectedStatus: 200 });
  assert(
    Array.isArray(disabledPolicies.json.data?.items) &&
      disabledPolicies.json.data.items.some((item) => item?.policy_id === policyId),
    "Disabled policy was not visible in disabled policy listing",
  );
  const fetchedDisabledPolicy = await request("GET", `/api/v1/policies/${policyId}`, { expectedStatus: 200 });
  assert(fetchedDisabledPolicy.json.data.status === "disabled", "Fetched policy was not disabled after cleanup");

  const disabledProviders = await request("GET", "/api/v1/tool-providers?status=disabled", { expectedStatus: 200 });
  assert(
    Array.isArray(disabledProviders.json.data?.items) &&
      disabledProviders.json.data.items.some((item) => item?.tool_provider_id === toolProviderId),
    "Disabled tool provider was not visible in disabled provider listing",
  );
  const fetchedDisabledProvider = await request("GET", `/api/v1/tool-providers/${toolProviderId}`, {
    expectedStatus: 200,
  });
  assert(
    fetchedDisabledProvider.json.data.status === "disabled",
    "Fetched tool provider was not disabled after cleanup",
  );

  await emitVerificationResult({
    ok: true,
    mode: verifyMode,
    base_url: normalizedBaseUrl,
    tenant_id: tenantId,
    trace_id: traceId,
    started_at: verificationStartedAt,
    completed_at: nowIso(),
    duration_ms: Date.now() - verificationStartedAtMs,
    check_count: verificationChecks.length,
    checks: verificationChecks,
    tool_provider_id: toolProviderId,
    policy_id: policyId,
    tool_provider_status: fetchedDisabledProvider.json.data.status,
    policy_status: fetchedDisabledPolicy.json.data.status,
    run_id: runId,
    ...rateLimitSummary,
  });
}

async function runReadonlyVerification() {
  if (!existingRunId) {
    logStep("Readonly mode without RUN_ID; skipping run-specific checks");
    return {
      run_checks: "skipped",
      reason: "RUN_ID or EXISTING_RUN_ID was not provided",
    };
  }

  logStep(`Readonly mode: inspect existing run ${existingRunId}`);
  const run = await request("GET", `/api/v1/runs/${existingRunId}`, { expectedStatus: 200 });
  const graph = await request("GET", `/api/v1/runs/${existingRunId}/graph`, { expectedStatus: 200 });
  assert(Array.isArray(graph.json.data?.steps), "Graph response shape mismatch");
  assert(hasPageInfo(graph.json.data?.page_info), "Graph page_info mismatch");
  const graphWithParams = await request("GET", `/api/v1/runs/${existingRunId}/graph?include_payloads=true&page_size=1`, {
    expectedStatus: 200,
  });
  assert(Array.isArray(graphWithParams.json.data?.steps), "Graph query param response shape mismatch");
  assert(graphWithParams.json.data?.run?.run_id === existingRunId, "Graph query params run mismatch");
  assert(hasPageInfo(graphWithParams.json.data?.page_info), "Graph query params page_info mismatch");
  assert(graphWithParams.json.data.steps.length <= 1, "Graph page_size did not limit steps");
  assert(graphWithParams.json.data.approvals.length <= 1, "Graph page_size did not limit approvals");
  assert(graphWithParams.json.data.artifacts.length <= 1, "Graph page_size did not limit artifacts");
  await request("GET", `/api/v1/runs/${existingRunId}/events`, { expectedStatus: 200 });
  const artifacts = await request("GET", `/api/v1/runs/${existingRunId}/artifacts`, { expectedStatus: 200 });
  const items = Array.isArray(artifacts.json.data?.items) ? artifacts.json.data.items : [];

  let artifactSummary = {
    artifact_count: items.length,
    artifact_body_checked: false,
  };

  if (items.length > 0) {
    const firstArtifact = items[0];
    assert(typeof firstArtifact.artifact_id === "string" && firstArtifact.artifact_id !== "", "Missing artifact id");
    const fetchedArtifact = await request(
      "GET",
      `/api/v1/runs/${existingRunId}/artifacts/${firstArtifact.artifact_id}?include_body=true`,
      { expectedStatus: 200 },
    );
    assert(fetchedArtifact.json.data.body !== undefined, "Artifact body was not returned");
    artifactSummary = {
      artifact_count: items.length,
      artifact_body_checked: true,
    };
  } else {
    logStep("Readonly mode: run has no artifacts yet; body check skipped");
  }

  return {
    run_checks: "completed",
    run_id: existingRunId,
    run_status: run.json.data?.status ?? "unknown",
    ...artifactSummary,
  };
}

async function verifyRunCreateRateLimit({ expectedLimit, initialIdempotencyKey, initialBody }) {
  logStep(`Verify create-run rate limit (${expectedLimit}/min)`);
  const idempotentRetry = await request("POST", "/api/v1/runs", {
    expectedStatus: 200,
    idempotencyKey: initialIdempotencyKey,
    body: initialBody,
  });
  assert(typeof idempotentRetry.json.data?.run_id === "string", "Idempotent create-run retry did not return run id");

  const additionalAllowed = Math.max(0, expectedLimit - 1);
  for (let index = 0; index < additionalAllowed; index += 1) {
    const allowed = await request("POST", "/api/v1/runs", {
      expectedStatus: 201,
      idempotencyKey: `verify-run-rate-limit-allowed-${suffix}-${index}`,
      body: {
        input: {
          kind: "user_instruction",
          text: `Rate limit allowed create-run ${index + 1}`,
        },
        context: {},
        policy_context: {
          labels: ["verification", "rate-limit"],
        },
      },
    });
    assert(typeof allowed.json.data?.run_id === "string", "Allowed create-run rate limit check did not return run id");
  }

  const blocked = await request("POST", "/api/v1/runs", {
    expectedStatus: 429,
    idempotencyKey: `verify-run-rate-limit-blocked-${suffix}`,
    body: {
      input: {
        kind: "user_instruction",
        text: "Rate limit blocked create-run",
      },
      context: {},
      policy_context: {
        labels: ["verification", "rate-limit"],
      },
    },
  });
  assert(blocked.json.error?.code === "rate_limited", "Create-run rate limit did not return rate_limited");
  assert(blocked.json.error?.details?.scope === "runs_create", "Create-run rate limit scope mismatch");
  assert(blocked.json.error?.details?.limit === expectedLimit, "Create-run rate limit limit mismatch");
  assert(
    typeof blocked.json.error?.details?.retry_after_seconds === "number" &&
      blocked.json.error.details.retry_after_seconds >= 1,
    "Create-run rate limit missing retry_after_seconds",
  );
  return "verified";
}

async function verifyReplayRateLimit({ runId, expectedLimit, initialIdempotencyKey, initialBody }) {
  logStep(`Verify replay rate limit (${expectedLimit}/min)`);
  const idempotentRetry = await request("POST", `/api/v1/runs/${runId}/replay`, {
    expectedStatus: 200,
    idempotencyKey: initialIdempotencyKey,
    body: initialBody,
  });
  assert(typeof idempotentRetry.json.data?.run_id === "string", "Idempotent replay retry did not return run id");

  const additionalAllowed = Math.max(0, expectedLimit - 1);
  for (let index = 0; index < additionalAllowed; index += 1) {
    const allowed = await request("POST", `/api/v1/runs/${runId}/replay`, {
      expectedStatus: 201,
      idempotencyKey: `verify-replay-rate-limit-allowed-${suffix}-${index}`,
      body: {
        mode: "from_input",
        reason: `Rate limit allowed replay ${index + 1}`,
      },
    });
    assert(typeof allowed.json.data?.run_id === "string", "Allowed replay rate limit check did not return run id");
  }

  const blocked = await request("POST", `/api/v1/runs/${runId}/replay`, {
    expectedStatus: 429,
    idempotencyKey: `verify-replay-rate-limit-blocked-${suffix}`,
    body: {
      mode: "from_input",
      reason: "Rate limit blocked replay",
    },
  });
  assert(blocked.json.error?.code === "rate_limited", "Replay rate limit did not return rate_limited");
  assert(blocked.json.error?.details?.scope === "runs_replay", "Replay rate limit scope mismatch");
  assert(blocked.json.error?.details?.limit === expectedLimit, "Replay rate limit limit mismatch");
  assert(
    typeof blocked.json.error?.details?.retry_after_seconds === "number" &&
      blocked.json.error.details.retry_after_seconds >= 1,
    "Replay rate limit missing retry_after_seconds",
  );
  return "verified";
}

async function pollRunCompleted(runId) {
  const timeoutMs = 15000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const response = await request("GET", `/api/v1/runs/${runId}`, { expectedStatus: 200 });
    const run = response.json.data;
    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for run ${runId} to complete`);
}

async function request(method, path, options = {}) {
  const headers = new Headers();
  headers.set("x-trace-id", traceId);
  if (options.includeTenant !== false) {
    headers.set("x-tenant-id", tenantId);
  }
  if (method !== "GET") {
    headers.set("content-type", "application/json");
  }
  if (options.idempotencyKey) {
    headers.set("idempotency-key", options.idempotencyKey);
  }
  if (options.includeSubject !== false) {
    headers.set("x-authenticated-subject", subjectId);
    headers.set("x-authenticated-roles", subjectRoles);
  }

  const response = await fetch(`${normalizedBaseUrl}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
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

  if (response.status !== options.expectedStatus) {
    throw new Error(
      `Unexpected status for ${method} ${path}: expected ${options.expectedStatus}, got ${response.status}, body=${text}`,
    );
  }

  return { status: response.status, json, text, headers: responseHeaders };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function logStep(message) {
  const entry = {
    at: nowIso(),
    elapsed_ms: Date.now() - verificationStartedAtMs,
    message,
  };
  verificationChecks.push(entry);
  console.log(
    JSON.stringify({
      level: "info",
      event: "verify_step",
      trace_id: traceId,
      tenant_id: tenantId,
      mode: verifyMode,
      ...entry,
    }),
  );
}

function normalizeVerifyMode(rawMode) {
  const value = (rawMode ?? "write").trim().toLowerCase();
  if (value === "readonly" || value === "read_only" || value === "read-only" || value === "ro") {
    return "readonly";
  }
  return "write";
}

function readOptionalPositiveInteger(rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return null;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received ${rawValue}`);
  }
  return parsed;
}

function normalizeOptionalString(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }
  const trimmed = rawValue.trim();
  return trimmed === "" ? null : trimmed;
}

function nowIso() {
  return new Date().toISOString();
}

async function emitVerificationResult(result) {
  const payload = verifyOutputPath
    ? {
        ...result,
        verification_output_path: verifyOutputPath,
      }
    : result;
  const body = JSON.stringify(payload, null, 2);
  if (verifyOutputPath) {
    await mkdir(dirname(verifyOutputPath), { recursive: true });
    await writeFile(verifyOutputPath, `${body}\n`, "utf8");
  }
  console.log(body);
}

function countItems(items) {
  return Array.isArray(items) ? items.length : 0;
}

function getFirstStepId(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return null;
  }

  const firstStep = steps[0];
  return typeof firstStep?.step_id === "string" ? firstStep.step_id : null;
}

function hasPageInfo(pageInfo) {
  return !!pageInfo && Object.prototype.hasOwnProperty.call(pageInfo, "next_cursor");
}

function parseJsonObject(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseSseEvents(text) {
  return text
    .trim()
    .split(/\n\n+/)
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => {
      const event = { event: "message", data: "" };
      const dataLines = [];

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

function printUsage() {
  console.error(
    [
      "Usage:",
      '  BASE_URL="https://<worker>" TENANT_ID="tenant_verify" node scripts/post_deploy_verify.mjs',
      '  BASE_URL="https://<worker>" TENANT_ID="tenant_prod" VERIFY_MODE=readonly RUN_ID="<existing_run_id>" node scripts/post_deploy_verify.mjs',
      "",
      "Optional env vars:",
      "  SUBJECT_ID",
      "  SUBJECT_ROLES",
      "    (used as trusted-edge identity and role headers by the verifier)",
      "  VERIFY_MODE=write|readonly",
      "  RUN_ID or EXISTING_RUN_ID",
      "  EXPECT_RATE_LIMIT_RUNS_PER_MINUTE",
      "  EXPECT_RATE_LIMIT_REPLAYS_PER_MINUTE",
      "  VERIFY_OUTPUT_PATH",
    ].join("\n"),
  );
}

main().catch((error) => {
  const failure = {
    ok: false,
    mode: verifyMode,
    base_url: normalizedBaseUrl,
    tenant_id: tenantId,
    trace_id: traceId,
    started_at: verificationStartedAt,
    completed_at: nowIso(),
    duration_ms: Date.now() - verificationStartedAtMs,
    check_count: verificationChecks.length,
    checks: verificationChecks,
    error: serializeError(error),
  };

  emitVerificationResult(failure).catch(() => {});
  console.error(
    JSON.stringify({
      level: "error",
      event: "verify_failed",
      trace_id: traceId,
      tenant_id: tenantId,
      mode: verifyMode,
      error: serializeError(error),
    }),
  );
  process.exit(1);
});

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    name: "Error",
    message: String(error),
    stack: null,
  };
}
