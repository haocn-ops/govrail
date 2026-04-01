import { cancelRun } from "../lib/cancellation.js";
import { getRunGraph } from "../lib/db.js";
import { launchRun } from "../lib/runs.js";
import { ApiError, buildMeta, getSubjectId, json, readJson, requireIdempotencyKey } from "../lib/http.js";
import { createId, hashPayload, nowIso } from "../lib/ids.js";
import type {
  A2AMessageSendRequest,
  A2AStatusSignal,
  A2AWebhookPushRequest,
  RunCreateRequest,
} from "../types.js";

const sseEncoder = new TextEncoder();

export async function handleA2AMessageSend(
  request: Request,
  env: Env,
  tenantId: string,
  subjectId: string,
): Promise<Response> {
  const idempotencyKey = requireIdempotencyKey(request);
  const payload = await readJson<A2AMessageSendRequest>(request);
  const meta = buildMeta(request);
  const routeKey = "POST:/api/v1/a2a/message:send";
  const payloadHash = await hashPayload(payload);

  const existingIdempotency = await env.DB.prepare(
    `SELECT resource_id, payload_hash
       FROM idempotency_records
      WHERE tenant_id = ?1 AND route_key = ?2 AND idempotency_key = ?3`,
  )
    .bind(tenantId, routeKey, idempotencyKey)
    .first<{ resource_id: string; payload_hash: string }>();

  if (existingIdempotency) {
    if (existingIdempotency.payload_hash !== payloadHash) {
      throw new ApiError(409, "idempotency_conflict", "Idempotency key was already used for another payload");
    }

    return handleA2ATaskGet(request, env, tenantId, existingIdempotency.resource_id);
  }

  const remoteTaskId = payload.task_id ?? createId("remote_task");
  const existingTask = await env.DB.prepare(
    `SELECT task_id, run_id, status
       FROM a2a_tasks
      WHERE tenant_id = ?1 AND remote_task_id = ?2`,
  )
    .bind(tenantId, remoteTaskId)
    .first<{ task_id: string; run_id: string; status: string }>();

  if (existingTask) {
    const timestamp = nowIso();
    await env.DB.prepare(
      `UPDATE a2a_tasks
          SET last_remote_message_id = ?1, updated_at = ?2
        WHERE tenant_id = ?3 AND task_id = ?4`,
    )
      .bind(payload.message_id ?? null, timestamp, tenantId, existingTask.task_id)
      .run();

    await env.DB.prepare(
      `INSERT INTO run_steps (
          step_id, tenant_id, run_id, parent_step_id, sequence_no, step_type, actor_type, actor_ref,
          status, input_blob_key, output_blob_key, started_at, ended_at, error_code, metadata_json
        ) VALUES (
          ?1, ?2, ?3, NULL,
          COALESCE((SELECT MAX(sequence_no) + 1 FROM run_steps WHERE run_id = ?3), 1),
          ?4, ?5, ?6, ?7, NULL, NULL, ?8, ?8, NULL, ?9
        )`,
    )
      .bind(
        createId("step"),
        tenantId,
        existingTask.run_id,
        "a2a_message",
        "agent",
        payload.sender?.agent_id ?? "remote_agent",
        "completed",
        timestamp,
        JSON.stringify({
          remote_task_id: remoteTaskId,
          remote_message_id: payload.message_id ?? null,
        }),
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO idempotency_records (
          record_id, tenant_id, route_key, idempotency_key, payload_hash, resource_type, resource_id, created_at, expires_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
      .bind(
        createId("idem"),
        tenantId,
        routeKey,
        idempotencyKey,
        payloadHash,
        "a2a_task",
        existingTask.task_id,
        timestamp,
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      )
      .run();

    return json(
      {
        accepted: true,
        task_id: existingTask.task_id,
        run_id: existingTask.run_id,
        status: existingTask.status,
      },
      meta,
      { status: 202 },
    );
  }

  const runBody: RunCreateRequest = {
    input: {
      kind: "user_instruction",
      text: payload.content?.text ?? "A2A inbound task received",
    },
    entry_agent_id: payload.target?.agent_id ?? "a2a_inbound_gateway",
    context: {
      conversation_id: payload.conversation_id ?? null,
      remote_task_id: remoteTaskId,
      remote_message_id: payload.message_id ?? null,
      remote_agent_id: payload.sender?.agent_id ?? null,
      remote_metadata: payload.metadata ?? {},
    },
    policy_context: {
      labels: ["a2a", "inbound"],
    },
  };

  const run = await launchRun({
    env,
    tenantId,
    traceId: meta.trace_id,
    subjectId,
    body: runBody,
  });

  const taskId = createId("task");
  const timestamp = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO a2a_tasks (
          task_id, tenant_id, run_id, direction, remote_task_id, remote_agent_id, remote_endpoint_url,
          last_remote_message_id, status, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
    ).bind(
      taskId,
      tenantId,
      run.runId,
      "inbound",
      remoteTaskId,
      payload.sender?.agent_id ?? "remote_agent",
      typeof payload.metadata?.remote_endpoint === "string" ? payload.metadata.remote_endpoint : null,
      payload.message_id ?? null,
      "in_progress",
      timestamp,
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
      "a2a_task",
      taskId,
      timestamp,
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ),
  ]);

  return json(
    {
      accepted: true,
      task_id: taskId,
      run_id: run.runId,
      status: "in_progress",
      trace_id: meta.trace_id,
      created_at: run.createdAt,
    },
    meta,
    { status: 202 },
  );
}

export async function handleA2AMessageStream(
  request: Request,
  env: Env,
  tenantId: string,
): Promise<Response> {
  const meta = buildMeta(request);
  const tasksResult = await env.DB.prepare(
    `SELECT t.task_id, t.run_id, t.direction, t.remote_task_id, t.remote_agent_id,
            t.remote_endpoint_url, t.last_remote_message_id, t.status AS task_status,
            t.created_at, t.updated_at,
            r.status AS run_status, r.current_step_id, r.pending_approval_id,
            r.created_at AS run_created_at, r.updated_at AS run_updated_at, r.completed_at
       FROM a2a_tasks t
       JOIN runs r ON r.run_id = t.run_id
      WHERE t.tenant_id = ?1
      ORDER BY t.updated_at DESC, t.task_id ASC
      LIMIT 50`,
  )
    .bind(tenantId)
    .run();

  const tasks = (tasksResult.results ?? []) as unknown as A2AMessageStreamRow[];
  const snapshotTasks = await Promise.all(
    tasks.map(async (task) => {
      const graph = await getRunGraph(env, tenantId, task.run_id);
      return {
        task_id: task.task_id,
        run_id: task.run_id,
        direction: task.direction,
        status: deriveTaskStatus(task.run_status, task.task_status),
        remote_task_id: task.remote_task_id,
        remote_agent_id: task.remote_agent_id,
        remote_endpoint_url: task.remote_endpoint_url,
        last_remote_message_id: task.last_remote_message_id,
        created_at: task.created_at,
        updated_at: task.updated_at,
        run: {
          status: task.run_status,
          current_step_id: task.current_step_id,
          pending_approval_id: task.pending_approval_id,
          created_at: task.run_created_at,
          updated_at: task.run_updated_at,
          completed_at: task.completed_at,
        },
        artifacts: graph.artifacts.map((artifact) => ({
          artifact_id: artifact.artifact_id,
          artifact_type: artifact.artifact_type,
          mime_type: artifact.mime_type,
          r2_key: artifact.r2_key,
          sha256: artifact.sha256,
          size_bytes: artifact.size_bytes,
          created_at: artifact.created_at,
        })),
      };
    }),
  );

  const chunks = [
    encodeSseEvent("ready", {
      endpoint: "/api/v1/a2a/message:stream",
      transport: "sse",
      status: "streaming",
      request_id: meta.request_id,
      trace_id: meta.trace_id,
      tenant_id: tenantId,
    }),
    encodeSseEvent("snapshot", {
      tenant_id: tenantId,
      generated_at: nowIso(),
      task_count: snapshotTasks.length,
      tasks: snapshotTasks,
    }),
  ];

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    },
  );
}

export async function handleA2ATaskGet(
  request: Request,
  env: Env,
  tenantId: string,
  taskId: string,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT t.task_id, t.run_id, t.status AS task_status, t.updated_at, r.status AS run_status
       FROM a2a_tasks t
       JOIN runs r ON r.run_id = t.run_id
      WHERE t.tenant_id = ?1 AND t.task_id = ?2`,
  )
    .bind(tenantId, taskId)
    .first<{
      task_id: string;
      run_id: string;
      task_status: string;
      updated_at: string;
      run_status: string;
    }>();

  if (!row) {
    throw new ApiError(404, "task_not_found", "A2A task does not exist in current tenant");
  }

  return json(
    {
      task_id: row.task_id,
      status: deriveTaskStatus(row.run_status, row.task_status),
      run_id: row.run_id,
      last_message_at: row.updated_at,
    },
    buildMeta(request),
  );
}

export async function handleA2ATaskCancel(
  request: Request,
  env: Env,
  tenantId: string,
  taskId: string,
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT t.task_id, t.run_id, r.status AS run_status
       FROM a2a_tasks t
       JOIN runs r ON r.run_id = t.run_id
      WHERE t.tenant_id = ?1 AND t.task_id = ?2`,
  )
    .bind(tenantId, taskId)
    .first<{ task_id: string; run_id: string; run_status: string }>();

  if (!row) {
    throw new ApiError(404, "task_not_found", "A2A task does not exist in current tenant");
  }

  if (["completed", "failed", "cancelled"].includes(row.run_status)) {
    throw new ApiError(409, "invalid_state_transition", "Task cannot be cancelled from its current state");
  }

  const meta = buildMeta(request);
  const subjectId = getSubjectId(request, env);
  const { cancelledAt } = await cancelRun({
    env,
    tenantId,
    runId: row.run_id,
    traceId: meta.trace_id,
    actorType: "human",
    actorRef: subjectId,
    reason: "a2a_task_cancelled",
  });

  return json(
    {
      task_id: taskId,
      run_id: row.run_id,
      status: "cancelled",
      cancelled_at: cancelledAt,
    },
    meta,
  );
}

export async function handleA2AWebhookPush(
  request: Request,
  env: Env,
  tenantId: string,
): Promise<Response> {
  const payload = await readJson<A2AWebhookPushRequest>(request);
  const meta = buildMeta(request);
  const remoteTaskId = payload.remote_task_id;
  const taskId = payload.task_id;

  if (!remoteTaskId && !taskId) {
    throw new ApiError(400, "invalid_request", "Webhook push requires task_id or remote_task_id");
  }

  const row = await env.DB.prepare(
    `SELECT task_id, run_id, remote_task_id
       FROM a2a_tasks
      WHERE tenant_id = ?1 AND (
        (?2 IS NOT NULL AND task_id = ?2) OR
        (?3 IS NOT NULL AND remote_task_id = ?3)
      )
      LIMIT 1`,
  )
    .bind(tenantId, taskId ?? null, remoteTaskId ?? null)
    .first<{ task_id: string; run_id: string; remote_task_id: string }>();

  if (!row) {
    throw new ApiError(404, "task_not_found", "A2A task does not exist in current tenant");
  }

  const nextStatus = payload.status ?? "in_progress";
  const timestamp = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE a2a_tasks SET status = ?1, last_remote_message_id = ?2, updated_at = ?3 WHERE tenant_id = ?4 AND task_id = ?5",
    ).bind(nextStatus, payload.message_id ?? null, timestamp, tenantId, row.task_id),
    env.DB.prepare(
      "UPDATE runs SET updated_at = ?1 WHERE tenant_id = ?2 AND run_id = ?3",
    ).bind(timestamp, tenantId, row.run_id),
  ]);

  const signal: A2AStatusSignal = {
    task_id: row.task_id,
    remote_task_id: row.remote_task_id,
    status: nextStatus,
    ...(payload.message_id ? { message_id: payload.message_id } : {}),
    ...(payload.artifact ? { artifact_json: JSON.stringify(payload.artifact) } : {}),
  };

  try {
    const instance = await env.RUN_WORKFLOW.get(row.run_id);
    await instance.sendEvent({
      type: "a2a.task.status",
      payload: signal,
    });
  } catch {
    // If the workflow is already terminal, we still persist the task update and return success.
  }

  return json(
    {
      accepted: true,
      task_id: row.task_id,
      run_id: row.run_id,
      status: nextStatus,
      updated_at: timestamp,
    },
    meta,
  );
}

function deriveTaskStatus(runStatus: string, taskStatus: string): string {
  if (runStatus === "completed") return "completed";
  if (runStatus === "failed") return "failed";
  if (runStatus === "cancelled") return "cancelled";
  return taskStatus;
}

function encodeSseEvent(event: string, data: unknown): Uint8Array {
  const lines = [`event: ${event}`];
  const payload = typeof data === "string" ? data : JSON.stringify(data);

  for (const line of payload.split(/\r?\n/)) {
    lines.push(`data: ${line}`);
  }

  lines.push("");
  return sseEncoder.encode(`${lines.join("\n")}\n`);
}

interface A2AMessageStreamRow {
  task_id: string;
  run_id: string;
  direction: string;
  remote_task_id: string;
  remote_agent_id: string;
  remote_endpoint_url: string | null;
  last_remote_message_id: string | null;
  task_status: string;
  created_at: string;
  updated_at: string;
  run_status: string;
  current_step_id: string | null;
  pending_approval_id: string | null;
  run_created_at: string;
  run_updated_at: string;
  completed_at: string | null;
}
