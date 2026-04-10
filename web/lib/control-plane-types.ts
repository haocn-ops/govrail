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

export type ControlPlaneWorkspaceListItem = {
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
};

export type ControlPlaneWorkspace = {
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
};

export type ControlPlanePricingPlan = {
  plan_id: string;
  code: string;
  display_name: string;
  tier: string;
  status: string;
  monthly_price_cents: number;
  yearly_price_cents: number | null;
  limits: Record<string, unknown>;
  features: Record<string, unknown>;
};

export type ControlPlaneWorkspaceSubscription = {
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
};

export type ControlPlaneWorkspaceBillingAction = {
  kind: "upgrade" | "manage_plan" | "resolve_billing" | "contact_support";
  label: string;
  href: string;
  availability: "ready" | "staged";
};

export type ControlPlaneWorkspaceBillingSummary = {
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
  self_serve_reason_code?: "billing_self_serve_not_configured" | null;
  description: string;
  action: ControlPlaneWorkspaceBillingAction | null;
};

export type ControlPlaneWorkspaceBillingCheckoutSession = {
  session_id: string;
  status: "open" | "completed" | "expired" | "cancelled";
  current_plan_id: string;
  target_plan_id: string;
  target_plan_code: string | null;
  target_plan_display_name: string | null;
  billing_interval: "monthly" | "yearly";
  billing_provider: string;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  checkout_url: string;
  review_url: string;
};

export type ControlPlaneWorkspaceBillingCheckoutSessionDetail = {
  checkout_session: ControlPlaneWorkspaceBillingCheckoutSession;
  current_plan: ControlPlanePricingPlan | null;
  target_plan: ControlPlanePricingPlan | null;
};

export type ControlPlaneWorkspaceBillingCheckoutSessionCompleteResult =
  ControlPlaneWorkspaceBillingCheckoutSessionDetail & {
    subscription: ControlPlaneWorkspaceSubscription | null;
    billing_summary: ControlPlaneWorkspaceBillingSummary;
    billing_providers: ControlPlaneWorkspaceBillingProviders;
  };

export type ControlPlaneWorkspaceBillingSubscriptionResult = {
  plan: ControlPlanePricingPlan | null;
  subscription: ControlPlaneWorkspaceSubscription;
  billing_summary: ControlPlaneWorkspaceBillingSummary;
  billing_providers: ControlPlaneWorkspaceBillingProviders;
};

export type ControlPlaneWorkspaceBillingPortalSession = {
  billing_provider: string;
  portal_url: string;
  return_url: string | null;
};

export type ControlPlaneWorkspaceBillingProvider = {
  code: string;
  display_name: string;
  kind: "manual" | "internal" | "mock" | "external";
  status: "active" | "available" | "staged";
  is_current: boolean;
  supports_checkout: boolean;
  supports_customer_portal: boolean;
  supports_subscription_cancel: boolean;
  supports_webhooks: boolean;
  webhook_path: string | null;
  notes: string[];
};

export type ControlPlaneWorkspaceBillingProviders = {
  current_provider_code: string | null;
  providers: ControlPlaneWorkspaceBillingProvider[];
};

export type ControlPlaneWorkspaceSsoProtocol = "oidc" | "saml";

export type ControlPlaneWorkspaceSsoSaveRequest = {
  enabled?: boolean | null;
  provider_type?: ControlPlaneWorkspaceSsoProtocol | null;
  connection_mode?: "workspace";
  metadata_url?: string | null;
  issuer_url?: string | null;
  entrypoint_url?: string | null;
  audience?: string | null;
  domain?: string | null;
  email_domain?: string | null;
  email_domains?: string[] | null;
  client_id?: string | null;
  signing_certificate?: string | null;
  notes?: string | null;
};

export type ControlPlaneContractIssue = {
  code: string;
  message: string;
  status: number | null;
  retryable: boolean;
  details: Record<string, unknown>;
};

export type ControlPlaneContractMeta = {
  source: "live" | "fallback_feature_gate" | "fallback_control_plane_unavailable" | "fallback_error";
  normalized_at: string;
  issue: ControlPlaneContractIssue | null;
};

export type ControlPlaneWorkspaceSsoReadiness = {
  feature: "sso";
  feature_enabled: boolean;
  status: "staged" | "not_configured" | "configured";
  provider_type: ControlPlaneWorkspaceSsoProtocol | null;
  connection_mode: "workspace";
  supported_protocols: ControlPlaneWorkspaceSsoProtocol[];
  next_steps: string[];
  upgrade_href: string | null;
  plan_code: string | null;
  enabled?: boolean;
  configured?: boolean;
  configuration_state?: "not_configured" | "configured";
  availability_status?: "available";
  delivery_status?: "staged" | "ga";
  readiness_version?: string;
  configured_at?: string | null;
  issuer_url?: string | null;
  metadata_url?: string | null;
  entrypoint_url?: string | null;
  email_domain?: string | null;
  email_domains?: string[];
  client_id?: string | null;
  audience?: string | null;
  signing_certificate?: string | null;
  notes?: string | null;
  contract_meta?: ControlPlaneContractMeta;
};

export type ControlPlaneWorkspaceDedicatedEnvironmentReadiness = {
  feature: "dedicated_environment";
  feature_enabled: boolean;
  status: "staged" | "not_configured" | "configured";
  deployment_model: "single_tenant" | "pooled_with_isolation";
  target_region: string | null;
  isolation_summary: string;
  next_steps: string[];
  upgrade_href: string | null;
  plan_code: string | null;
  enabled?: boolean;
  configured?: boolean;
  configuration_state?: "not_configured" | "configured";
  availability_status?: "available";
  delivery_status?: "staged" | "ga";
  readiness_version?: string;
  configured_at?: string | null;
  network_boundary?: string | null;
  compliance_notes?: string | null;
  requester_email?: string | null;
  data_classification?: "internal" | "restricted" | "external" | null;
  requested_capacity?: string | null;
  requested_sla?: string | null;
  notes?: string | null;
  contract_meta?: ControlPlaneContractMeta;
};

export type ControlPlaneWorkspaceDedicatedEnvironmentSaveRequest = {
  enabled?: boolean | null;
  deployment_model?: "single_tenant" | "pooled_with_isolation";
  target_region?: string | null;
  isolation_summary?: string | null;
  network_boundary?: string | null;
  compliance_notes?: string | null;
  requester_email?: string | null;
  data_classification?: "internal" | "restricted" | "external" | null;
  requested_capacity?: string | null;
  requested_sla?: string | null;
  notes?: string | null;
};

export type ControlPlaneWorkspaceAuditExportViewModel =
  | {
      ok: true;
      blob: Blob;
      filename: string;
      format: "json" | "jsonl";
      content_type: string | null;
      contract_meta: ControlPlaneContractMeta;
    }
  | {
      ok: false;
      blob: null;
      filename: null;
      format: "json" | "jsonl";
      content_type: string | null;
      error: ControlPlaneContractIssue;
      contract_meta: ControlPlaneContractMeta;
    };

export type ControlPlaneAdminOverview = {
  summary: {
    organizations_total: number;
    workspaces_total: number;
    active_workspaces_total: number;
    users_total: number;
    paid_subscriptions_total: number;
    past_due_subscriptions_total: number;
  };
  plan_distribution: Array<{
    plan_code: string;
    workspace_count: number;
  }>;
  feature_rollout: {
    sso_enabled_workspaces: number;
    audit_export_enabled_workspaces: number;
    dedicated_environment_enabled_workspaces: number;
  };
  delivery_governance?: ControlPlaneDeliveryGovernance;
  recent_delivery_workspaces?: ControlPlaneAdminDeliveryWorkspace[];
  attention_workspaces?: ControlPlaneAdminAttentionWorkspace[];
  attention_summary?: ControlPlaneAdminAttentionSummary;
  attention_organizations?: ControlPlaneAdminAttentionOrganization[];
  week8_readiness?: ControlPlaneAdminWeek8Readiness;
  week8_readiness_workspaces?: ControlPlaneAdminWeek8ReadinessWorkspace[];
  recent_workspaces: Array<{
    workspace_id: string;
    slug: string;
    display_name: string;
    organization_display_name: string;
    plan_code: string;
    status: string;
    created_at: string;
  }>;
  updated_at: string;
  contract_meta?: ControlPlaneContractMeta;
};

export type ControlPlaneDeliveryGovernance = {
  tracked_workspaces_total?: number;
  untracked_workspaces_total?: number;
  verification: ControlPlaneDeliveryStatusCounts;
  go_live: ControlPlaneDeliveryStatusCounts;
};

export type ControlPlaneDeliveryStatusCounts = {
  pending: number;
  in_progress: number;
  complete: number;
};

export type ControlPlaneAdminDeliveryUpdateKind =
  | "verification"
  | "go_live"
  | "verification_completed"
  | "go_live_completed"
  | "evidence_only";

export type ControlPlaneAdminDeliveryWorkspace = {
  workspace_id: string;
  slug: string;
  display_name: string;
  organization_id: string;
  organization_display_name: string;
  latest_demo_run_id?: string | null;
  verification_status: ControlPlaneDeliveryTrackStatus | null;
  go_live_status: ControlPlaneDeliveryTrackStatus | null;
  next_action_surface: "verification" | "go_live";
  updated_at: string | null;
  owner_display_name: string | null;
  owner_email: string | null;
  notes_summary: string | null;
  evidence_count: number;
  recent_track_key?: "verification" | "go_live" | null;
  recent_update_kind: ControlPlaneAdminDeliveryUpdateKind | null;
};

export type ControlPlaneAdminAttentionWorkspace = {
  workspace_id: string;
  slug: string;
  display_name: string;
  organization_id: string;
  organization_display_name: string;
  latest_demo_run_id?: string | null;
  verification_status: ControlPlaneDeliveryTrackStatus | null;
  go_live_status: ControlPlaneDeliveryTrackStatus | null;
  updated_at: string | null;
  next_action_surface: "verification" | "go_live";
};

export type ControlPlaneAdminAttentionSummary = {
  total: number;
  verification_total: number;
  go_live_total: number;
  in_progress_total: number;
  pending_total: number;
};

export type ControlPlaneAdminAttentionOrganization = {
  organization_id: string;
  organization_display_name: string;
  workspaces_total: number;
  verification_total: number;
  go_live_total: number;
  in_progress_total: number;
  pending_total: number;
  latest_update_at: string | null;
};

export type ControlPlaneAdminWeek8Readiness = {
  total: number;
  baseline_ready_total: number;
  credentials_ready_total: number;
  demo_run_succeeded_total: number;
  billing_warning_total: number;
  mock_go_live_ready_total: number;
};

export type ControlPlaneAdminWeek8ReadinessFocus =
  | "baseline"
  | "credentials"
  | "demo_run"
  | "billing_warning"
  | "go_live_ready";

export type ControlPlaneAdminWeek8ReadinessWorkspace = {
  workspace_id: string;
  slug: string;
  display_name: string;
  organization_id: string;
  organization_display_name: string;
  latest_demo_run_id?: string | null;
  baseline_ready: boolean;
  credentials_ready: boolean;
  demo_run_succeeded: boolean;
  billing_warning: boolean;
  mock_go_live_ready: boolean;
  next_action_surface: "onboarding" | "settings" | "verification" | "go_live";
  updated_at: string | null;
};

export type ControlPlaneDeliveryEvidenceLink = {
  label: string;
  url: string;
};

export type ControlPlaneDeliveryTrackStatus = "pending" | "in_progress" | "complete";

export type ControlPlaneDeliveryTrackSection = {
  status: ControlPlaneDeliveryTrackStatus;
  owner_user_id: string | null;
  notes: string | null;
  evidence_links: ControlPlaneDeliveryEvidenceLink[];
  updated_at: string;
};

export type ControlPlaneWorkspaceDeliveryTrack = {
  workspace_id: string;
  verification: ControlPlaneDeliveryTrackSection;
  go_live: ControlPlaneDeliveryTrackSection;
  contract_meta?: ControlPlaneContractMeta;
};

export type ControlPlaneDeliveryTrackSectionInput = {
  status: ControlPlaneDeliveryTrackStatus;
  owner_user_id: string | null;
  notes: string | null;
  evidence_links: ControlPlaneDeliveryEvidenceLink[];
};

export type ControlPlaneWorkspaceDeliveryTrackUpsert = {
  workspace_id?: string;
  verification: ControlPlaneDeliveryTrackSectionInput;
  go_live: ControlPlaneDeliveryTrackSectionInput;
};

export type ControlPlaneWorkspaceUsageMetric = {
  used: number;
  limit: number | null;
  remaining: number | null;
  over_limit: boolean;
};

export type ControlPlaneWorkspaceUsageSummary = {
  period_start: string;
  period_end: string;
  metrics: Record<string, ControlPlaneWorkspaceUsageMetric>;
};

export type ControlPlaneWorkspaceOnboardingState = {
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
  latest_demo_run_hint?: {
    status_label: string;
    is_terminal: boolean;
    needs_attention: boolean;
    suggested_action: string | null;
  } | null;
  next_actions: string[];
  blockers?: Array<{
    code: string;
    severity?: "blocking" | "warning";
    message: string;
    surface?:
      | "onboarding"
      | "members"
      | "service_accounts"
      | "service-accounts"
      | "api_keys"
      | "api-keys"
      | "playground"
      | "verification"
      | "usage"
      | "settings"
      | "go_live"
      | "go-live"
      | null;
    retryable?: boolean;
  }>;
  recommended_next?: {
    surface:
      | "onboarding"
      | "members"
      | "service_accounts"
      | "service-accounts"
      | "api_keys"
      | "api-keys"
      | "playground"
      | "verification"
      | "usage"
      | "settings"
      | "go_live"
      | "go-live";
    action: string;
    reason: string;
  } | null;
  recommended_next_surface?:
    | "onboarding"
    | "members"
    | "service_accounts"
    | "service-accounts"
    | "api_keys"
    | "api-keys"
    | "playground"
    | "verification"
    | "usage"
    | "settings"
    | "go_live"
    | "go-live"
    | null;
  recommended_next_action?: string | null;
  recommended_next_reason?: string | null;
  delivery_guidance?: {
    verification_status: ControlPlaneDeliveryTrackStatus;
    go_live_status: ControlPlaneDeliveryTrackStatus;
    next_surface: "onboarding" | "verification" | "go_live" | "go-live";
    summary: string;
    updated_at: string | null;
  } | null;
};

export type ControlPlaneWorkspaceCreateResult = {
  workspace: ControlPlaneWorkspace;
  plan: ControlPlanePricingPlan | null;
};

export type ControlPlaneWorkspaceBootstrapResult = {
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
  providers: ControlPlaneToolProvider[];
  policies: ControlPlanePolicy[];
  next_actions: string[];
};

export type ControlPlaneWorkspaceDetail = {
  workspace: ControlPlaneWorkspace;
  plan: ControlPlanePricingPlan | null;
  subscription: ControlPlaneWorkspaceSubscription | null;
  billing_summary: ControlPlaneWorkspaceBillingSummary;
  billing_providers: ControlPlaneWorkspaceBillingProviders;
  usage: ControlPlaneWorkspaceUsageSummary;
  onboarding: ControlPlaneWorkspaceOnboardingState;
  members: Array<{
    user_id: string;
    email: string;
    display_name: string | null;
    role: string;
    status: string;
    joined_at: string | null;
  }>;
};

export type ControlPlaneSession = {
  user: {
    user_id: string;
    email: string;
    display_name?: string | null;
    auth_provider: string;
    auth_subject: string;
    status?: string;
    last_login_at?: string | null;
  };
  workspaces: ControlPlaneWorkspaceListItem[];
};

export type ControlPlaneApiKey = {
  api_key_id: string;
  key_prefix: string;
  status: string;
  scope: string[];
  service_account_id: string | null;
  service_account_name: string | null;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export type ControlPlaneApiKeyCreateResult = {
  api_key: ControlPlaneApiKey;
  secret_key: string | null;
};

export type ControlPlaneApiKeyRotateResult = {
  previous_api_key: ControlPlaneApiKey;
  api_key: ControlPlaneApiKey;
  secret_key: string | null;
  rotated_from_api_key_id: string;
};

export type ControlPlaneServiceAccount = {
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
};

export type ControlPlaneServiceAccountCreateResult = {
  service_account: ControlPlaneServiceAccount;
};

export type ControlPlaneWorkspaceMember = {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  status: string;
  joined_at: string | null;
};

export type ControlPlaneWorkspaceInvitation = {
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
};

export type ControlPlaneWorkspaceInvitationCreateResult = {
  invitation: ControlPlaneWorkspaceInvitation;
  invite_token: string | null;
};

export type ControlPlaneWorkspaceInvitationAcceptResult = {
  invitation: ControlPlaneWorkspaceInvitation;
  workspace: {
    workspace_id: string;
    organization_id: string;
    organization_slug: string;
    organization_display_name: string;
    slug: string;
    display_name: string;
  };
  membership: {
    role: string;
    status: string;
    joined_at: string | null;
  };
};

export type ControlPlaneRunCreateRequest = {
  input: {
    kind: "user_instruction" | "structured_payload";
    text?: string;
    payload?: Record<string, unknown>;
  };
  entry_agent_id?: string;
  context?: Record<string, unknown>;
  policy_context?: {
    risk_tier?: string;
    labels?: string[];
  };
  options?: {
    async?: boolean;
    priority?: "low" | "normal" | "high";
  };
};

export type ControlPlaneRunCreateResult = {
  run_id: string;
  status: string;
  workflow_status: string;
  coordinator_id: string;
  trace_id: string;
  created_at: string;
};

export type ControlPlaneRunDetail = {
  run_id: string;
  tenant_id: string;
  status: string;
  workflow_status: string;
  entry_agent_id: string | null;
  current_step_id: string | null;
  pending_approval_id: string | null;
  trace_id: string;
  coordinator_state: {
    run_id: string;
    status: string;
    last_sequence_no: number;
    pending_approval_id: string | null;
    current_step_id: string | null;
  } | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type ControlPlaneRunGraph = {
  run: {
    run_id: string;
    status: string;
  };
  steps: Array<{
    step_id: string;
    run_id: string;
    sequence_no: number;
    step_type: string;
    actor_type: string;
    actor_ref: string | null;
    status: string;
    started_at: string;
    ended_at: string | null;
    metadata_json: string;
  }>;
  approvals: Array<{
    approval_id: string;
    run_id: string;
    step_id: string;
    policy_id: string;
    status: string;
    requested_by: string;
    decision_by: string | null;
    created_at: string;
    decided_at: string | null;
  }>;
  artifacts: Array<{
    artifact_id: string;
    run_id: string;
    step_id: string | null;
    artifact_type: string;
    mime_type: string;
    created_at: string;
  }>;
  page_info: {
    next_cursor: string | null;
  };
};

export type ControlPlaneRunAuditEvent = {
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
};

export type ControlPlaneRunArtifact = {
  artifact_id: string;
  run_id: string;
  step_id: string | null;
  artifact_type: string;
  mime_type: string;
  r2_key: string;
  sha256: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type ControlPlaneRunEvents = {
  run: {
    run_id: string;
    status: string;
  };
  items: ControlPlaneRunAuditEvent[];
  page_info: {
    next_cursor: string | null;
  };
};

export type ControlPlaneRunArtifacts = {
  run: {
    run_id: string;
    status: string;
  };
  items: ControlPlaneRunArtifact[];
  page_info: {
    next_cursor: string | null;
  };
};
