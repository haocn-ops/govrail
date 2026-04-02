export type ControlPlaneHealth = {
  ok: boolean;
  service: string;
  version: string;
  now: string;
};

export type ControlPlanePolicy = {
  policy_id: string;
  tenant_id: string;
  channel: string;
  scope: {
    tool_provider_id: string | null;
    tool_name: string | null;
  };
  decision: "allow" | "deny" | "approval_required";
  priority: number;
  status: "active" | "disabled";
  conditions: {
    risk_level?: "low" | "medium" | "high";
    target_classification?: "internal" | "external" | "restricted";
    labels?: string[];
  };
  approval_config: {
    approver_roles?: string[];
    timeout_seconds?: number;
  };
  created_at: string;
  updated_at: string;
};

export type ControlPlaneToolProvider = {
  tool_provider_id: string;
  tenant_id: string;
  name: string;
  provider_type: "mcp_server" | "mcp_portal" | "http_api";
  endpoint_url: string;
  auth_ref: string | null;
  visibility_policy_ref: string | null;
  execution_policy_ref: string | null;
  status: "active" | "disabled";
  created_at: string;
  updated_at: string;
};
