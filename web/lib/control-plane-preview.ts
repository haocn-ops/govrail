import type { ControlPlanePolicy, ControlPlaneToolProvider } from "@/lib/control-plane-types";

export const previewPolicies: ControlPlanePolicy[] = [
  {
    policy_id: "pol_mcp_email_external_approval_v1",
    tenant_id: "tenant_demo",
    channel: "mcp_tool_call",
    scope: {
      tool_provider_id: "tp_email",
      tool_name: "send_email"
    },
    decision: "approval_required",
    priority: 100,
    status: "active",
    conditions: {
      target_classification: "external",
      risk_level: "high"
    },
    approval_config: {
      approver_roles: ["legal_approver"],
      timeout_seconds: 86400
    },
    created_at: "2026-04-02T08:00:00.000Z",
    updated_at: "2026-04-02T08:00:00.000Z"
  },
  {
    policy_id: "pol_mcp_data_read_approval_v1",
    tenant_id: "tenant_demo",
    channel: "mcp_tool_call",
    scope: {
      tool_provider_id: "tp_data",
      tool_name: "read_erp"
    },
    decision: "approval_required",
    priority: 90,
    status: "active",
    conditions: {
      risk_level: "low"
    },
    approval_config: {
      approver_roles: ["ops_approver"],
      timeout_seconds: 43200
    },
    created_at: "2026-04-02T08:00:00.000Z",
    updated_at: "2026-04-02T08:00:00.000Z"
  },
  {
    policy_id: "pol_mcp_data_delete_deny_v1",
    tenant_id: "tenant_demo",
    channel: "mcp_tool_call",
    scope: {
      tool_provider_id: "tp_data",
      tool_name: "delete_record"
    },
    decision: "deny",
    priority: 100,
    status: "active",
    conditions: {},
    approval_config: {},
    created_at: "2026-04-02T08:00:00.000Z",
    updated_at: "2026-04-02T08:00:00.000Z"
  }
];

export const previewToolProviders: ControlPlaneToolProvider[] = [
  {
    tool_provider_id: "tp_email",
    tenant_id: "tenant_demo",
    name: "Email Gateway",
    provider_type: "mcp_server",
    endpoint_url: "mock://email",
    auth_ref: null,
    visibility_policy_ref: null,
    execution_policy_ref: null,
    status: "active",
    created_at: "2026-04-02T08:00:00.000Z",
    updated_at: "2026-04-02T08:00:00.000Z"
  },
  {
    tool_provider_id: "tp_data",
    tenant_id: "tenant_demo",
    name: "ERP Reader",
    provider_type: "mcp_server",
    endpoint_url: "mock://erp",
    auth_ref: null,
    visibility_policy_ref: null,
    execution_policy_ref: null,
    status: "active",
    created_at: "2026-04-02T08:00:00.000Z",
    updated_at: "2026-04-02T08:00:00.000Z"
  }
];
