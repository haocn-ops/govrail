export const dashboardStats = [
  { label: "Healthy Agents", value: "12", detail: "+2 in the last hour" },
  { label: "Running Tasks", value: "37", detail: "5 waiting on approvals" },
  { label: "Artifacts Today", value: "184", detail: "32 bundles exported" },
  { label: "Blocked Egress", value: "4", detail: "All denied by policy" }
];

export const runtimeSeries = [
  { time: "08:00", runs: 18, approvals: 4 },
  { time: "09:00", runs: 24, approvals: 6 },
  { time: "10:00", runs: 29, approvals: 5 },
  { time: "11:00", runs: 34, approvals: 7 },
  { time: "12:00", runs: 31, approvals: 4 },
  { time: "13:00", runs: 37, approvals: 5 }
];

export const agentRows = [
  {
    name: "catalog_router",
    status: "Running",
    desiredState: "Started",
    region: "apac",
    tasks: 12,
    version: "v0.19.4"
  },
  {
    name: "approval_guard",
    status: "Running",
    desiredState: "Started",
    region: "global",
    tasks: 3,
    version: "v0.19.4"
  },
  {
    name: "artifact_worker",
    status: "Degraded",
    desiredState: "Started",
    region: "us-east",
    tasks: 21,
    version: "v0.19.2"
  },
  {
    name: "remote_dispatch",
    status: "Stopped",
    desiredState: "Stopped",
    region: "eu-west",
    tasks: 0,
    version: "v0.18.9"
  }
];

export const recentTasks = [
  {
    id: "task_4901",
    agent: "catalog_router",
    status: "Succeeded",
    duration: "3.2s",
    startedAt: "2m ago"
  },
  {
    id: "task_4900",
    agent: "artifact_worker",
    status: "Running",
    duration: "24s",
    startedAt: "4m ago"
  },
  {
    id: "task_4898",
    agent: "approval_guard",
    status: "Waiting approval",
    duration: "2m 08s",
    startedAt: "8m ago"
  },
  {
    id: "task_4896",
    agent: "remote_dispatch",
    status: "Failed",
    duration: "14s",
    startedAt: "11m ago"
  }
];

export const auditSignals = [
  {
    title: "Approval queue steady",
    detail: "5 items remain in review across legal_approver and platform_admin.",
    timestamp: "Updated 1m ago"
  },
  {
    title: "Egress block observed",
    detail: "4 outbound attempts matched deny policy in the last hour.",
    timestamp: "Updated 3m ago"
  },
  {
    title: "Artifact throughput up",
    detail: "Bundle persistence improved 14% after the latest deployment.",
    timestamp: "Updated 7m ago"
  }
];

export const artifactRows = [
  {
    name: "run-summary.json",
    type: "Summary",
    size: "18 KB",
    updatedAt: "2m ago",
    runId: "run_4901"
  },
  {
    name: "approval-payload.json",
    type: "Audit",
    size: "7 KB",
    updatedAt: "8m ago",
    runId: "run_4898"
  },
  {
    name: "dispatch-artifact.json",
    type: "Remote output",
    size: "42 KB",
    updatedAt: "18m ago",
    runId: "run_4896"
  }
];

export const egressPolicies = [
  { target: "api.openai.com", decision: "Allow", rationale: "Core model inference endpoint" },
  { target: "mcp.internal", decision: "Allow", rationale: "Trusted internal tool provider" },
  { target: "smtp.external.example", decision: "Approval required", rationale: "External side effects need human gate" },
  { target: "*.unknown", decision: "Deny", rationale: "Not in explicit egress allow-list" }
];

export const apiKeyRows = [
  {
    name: "prod-control-plane",
    scope: "invoke, logs:read, artifacts:read",
    owner: "platform_admin",
    rotatedAt: "2026-03-22"
  },
  {
    name: "playground-preview",
    scope: "invoke",
    owner: "developer",
    rotatedAt: "2026-03-30"
  }
];

export const logLines = [
  "[08:41:11] run_4901 · planner step accepted by approval_guard",
  "[08:41:14] run_4901 · outbound dispatch started for remote_dispatch",
  "[08:41:21] run_4900 · artifact bundle persisted to object storage",
  "[08:41:33] run_4898 · waiting_approval gate still open",
  "[08:41:45] run_4896 · webhook push marked remote task as failed"
];
