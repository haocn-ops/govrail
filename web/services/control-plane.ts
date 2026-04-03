import { previewPolicies, previewToolProviders } from "@/lib/control-plane-preview";
import type {
  ControlPlaneAdminOverview,
  ControlPlaneApiKey,
  ControlPlaneApiKeyCreateResult,
  ControlPlaneApiKeyRotateResult,
  ControlPlaneHealth,
  ControlPlanePolicy,
  ControlPlaneRunDetail,
  ControlPlaneRunEvents,
  ControlPlaneRunGraph,
  ControlPlaneRunArtifacts,
  ControlPlaneRunCreateRequest,
  ControlPlaneRunCreateResult,
  ControlPlaneServiceAccount,
  ControlPlaneServiceAccountCreateResult,
  ControlPlaneSession,
  ControlPlaneToolProvider,
  ControlPlaneWorkspaceBillingCheckoutSessionCompleteResult,
  ControlPlaneWorkspaceBillingCheckoutSessionDetail,
  ControlPlaneWorkspaceBillingPortalSession,
  ControlPlaneWorkspaceBillingSubscriptionResult,
  ControlPlaneWorkspaceBootstrapResult,
  ControlPlaneWorkspaceCreateResult,
  ControlPlaneWorkspaceDedicatedEnvironmentReadiness,
  ControlPlaneWorkspaceDetail,
  ControlPlaneWorkspaceInvitation,
  ControlPlaneWorkspaceInvitationAcceptResult,
  ControlPlaneWorkspaceInvitationCreateResult,
  ControlPlaneWorkspaceMember,
  ControlPlaneWorkspaceSsoReadiness,
  ControlPlaneWorkspaceDeliveryTrack,
  ControlPlaneWorkspaceDeliveryTrackUpsert,
} from "@/lib/control-plane-types";

type JsonEnvelope<T> = {
  data: T;
  meta: {
    request_id: string;
    trace_id: string;
  };
};

type ListEnvelope<T> = {
  items: T[];
  page_info: {
    next_cursor: string | null;
  };
};

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
};

export class ControlPlaneRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = "request_failed",
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function isControlPlaneRequestError(error: unknown): error is ControlPlaneRequestError {
  return error instanceof ControlPlaneRequestError;
}

async function readErrorEnvelope(response: Response): Promise<ErrorEnvelope> {
  try {
    return (await response.json()) as ErrorEnvelope;
  } catch {
    return {};
  }
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: {
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await readErrorEnvelope(response);
    throw new ControlPlaneRequestError(
      response.status,
      payload.error?.message ?? `Control plane request failed with status ${response.status}`,
      payload.error?.code ?? "request_failed",
      payload.error?.details ?? {},
    );
  }

  const payload = (await response.json()) as JsonEnvelope<T>;
  return payload.data;
}

export async function fetchHealth(): Promise<ControlPlaneHealth> {
  try {
    return await request<ControlPlaneHealth>("/api/control-plane/health");
  } catch {
    return {
      ok: true,
      service: "govrail-control-plane",
      version: "local-preview",
      now: new Date().toISOString(),
    };
  }
}

export async function fetchPolicies(): Promise<ControlPlanePolicy[]> {
  try {
    const payload = await request<ListEnvelope<ControlPlanePolicy>>("/api/control-plane/policies");
    return payload.items;
  } catch {
    return previewPolicies;
  }
}

export async function fetchToolProviders(): Promise<ControlPlaneToolProvider[]> {
  try {
    const payload = await request<ListEnvelope<ControlPlaneToolProvider>>("/api/control-plane/tool-providers");
    return payload.items;
  } catch {
    return previewToolProviders;
  }
}

export async function fetchCurrentWorkspace(): Promise<ControlPlaneWorkspaceDetail> {
  return request<ControlPlaneWorkspaceDetail>("/api/control-plane/workspace");
}

export async function fetchWorkspaceDeliveryTrack(): Promise<ControlPlaneWorkspaceDeliveryTrack> {
  return request<ControlPlaneWorkspaceDeliveryTrack>("/api/control-plane/workspace/delivery");
}

export async function saveWorkspaceDeliveryTrack(
  input: ControlPlaneWorkspaceDeliveryTrackUpsert,
): Promise<ControlPlaneWorkspaceDeliveryTrack> {
  const response = await fetch("/api/control-plane/workspace/delivery", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = await readErrorEnvelope(response);
    throw new ControlPlaneRequestError(
      response.status,
      payload.error?.message ?? `Control plane request failed with status ${response.status}`,
      payload.error?.code ?? "request_failed",
      payload.error?.details ?? {},
    );
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneWorkspaceDeliveryTrack>;
  return payload.data;
}

export async function fetchAdminOverview(): Promise<ControlPlaneAdminOverview> {
  try {
    return await request<ControlPlaneAdminOverview>("/api/control-plane/admin/overview");
  } catch (error) {
    if (!(error instanceof ControlPlaneRequestError)) {
      throw error;
    }

    if (
      (error.status === 503 && error.code === "control_plane_base_missing") ||
      error.status === 404
    ) {
      const now = new Date().toISOString();
      return {
        summary: {
          organizations_total: 1,
          workspaces_total: 1,
          active_workspaces_total: 1,
          users_total: 1,
          paid_subscriptions_total: 0,
          past_due_subscriptions_total: 0,
        },
        plan_distribution: [
          {
            plan_code: "free",
            workspace_count: 1,
          },
        ],
        feature_rollout: {
          sso_enabled_workspaces: 0,
          audit_export_enabled_workspaces: 0,
          dedicated_environment_enabled_workspaces: 0,
        },
        recent_workspaces: [
          {
            workspace_id: "ws_preview",
            slug: "preview",
            display_name: "Preview Workspace",
            organization_display_name: "Preview Organization",
            plan_code: "free",
            status: "active",
            created_at: now,
          },
        ],
        week8_readiness: {
          total: 1,
          baseline_ready_total: 0,
          credentials_ready_total: 0,
          demo_run_succeeded_total: 0,
          billing_warning_total: 0,
          mock_go_live_ready_total: 0,
        },
        week8_readiness_workspaces: [
          {
            workspace_id: "ws_preview",
            slug: "preview",
            display_name: "Preview Workspace",
            organization_id: "org_preview",
            organization_display_name: "Preview Organization",
            baseline_ready: false,
            credentials_ready: false,
            demo_run_succeeded: false,
            billing_warning: false,
            mock_go_live_ready: false,
            next_action_surface: "onboarding",
            updated_at: now,
          },
        ],
        updated_at: now,
      };
    }

    throw error;
  }
}

export async function createBillingCheckoutSession(input: {
  target_plan_id?: string;
  billing_interval?: "monthly" | "yearly";
}): Promise<ControlPlaneWorkspaceBillingCheckoutSessionDetail> {
  const response = await fetch("/api/control-plane/workspace/billing/checkout-sessions", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = await readErrorEnvelope(response);
    throw new ControlPlaneRequestError(
      response.status,
      payload.error?.message ?? `Control plane request failed with status ${response.status}`,
      payload.error?.code ?? "request_failed",
      payload.error?.details ?? {},
    );
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneWorkspaceBillingCheckoutSessionDetail>;
  return payload.data;
}

export async function fetchBillingCheckoutSession(
  sessionId: string,
): Promise<ControlPlaneWorkspaceBillingCheckoutSessionDetail> {
  return request<ControlPlaneWorkspaceBillingCheckoutSessionDetail>(
    `/api/control-plane/workspace/billing/checkout-sessions/${sessionId}`,
  );
}

export async function completeBillingCheckoutSession(
  sessionId: string,
): Promise<ControlPlaneWorkspaceBillingCheckoutSessionCompleteResult> {
  const response = await fetch(`/api/control-plane/workspace/billing/checkout-sessions/${sessionId}/complete`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const payload = await readErrorEnvelope(response);
    throw new ControlPlaneRequestError(
      response.status,
      payload.error?.message ?? `Control plane request failed with status ${response.status}`,
      payload.error?.code ?? "request_failed",
      payload.error?.details ?? {},
    );
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneWorkspaceBillingCheckoutSessionCompleteResult>;
  return payload.data;
}

export async function cancelBillingSubscription(): Promise<ControlPlaneWorkspaceBillingSubscriptionResult> {
  const response = await fetch("/api/control-plane/workspace/billing/subscription/cancel", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const payload = await readErrorEnvelope(response);
    throw new ControlPlaneRequestError(
      response.status,
      payload.error?.message ?? `Control plane request failed with status ${response.status}`,
      payload.error?.code ?? "request_failed",
      payload.error?.details ?? {},
    );
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneWorkspaceBillingSubscriptionResult>;
  return payload.data;
}

export async function resumeBillingSubscription(): Promise<ControlPlaneWorkspaceBillingSubscriptionResult> {
  const response = await fetch("/api/control-plane/workspace/billing/subscription/resume", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const payload = await readErrorEnvelope(response);
    throw new ControlPlaneRequestError(
      response.status,
      payload.error?.message ?? `Control plane request failed with status ${response.status}`,
      payload.error?.code ?? "request_failed",
      payload.error?.details ?? {},
    );
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneWorkspaceBillingSubscriptionResult>;
  return payload.data;
}

export async function createBillingPortalSession(input?: {
  return_url?: string;
}): Promise<ControlPlaneWorkspaceBillingPortalSession> {
  const response = await fetch("/api/control-plane/workspace/billing/portal-sessions", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(input ?? {}),
  });

  if (!response.ok) {
    const payload = await readErrorEnvelope(response);
    throw new ControlPlaneRequestError(
      response.status,
      payload.error?.message ?? `Control plane request failed with status ${response.status}`,
      payload.error?.code ?? "request_failed",
      payload.error?.details ?? {},
    );
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneWorkspaceBillingPortalSession>;
  return payload.data;
}

function extractDownloadFileName(headers: Headers, fallback: string): string {
  const contentDisposition = headers.get("content-disposition");
  if (!contentDisposition) {
    return fallback;
  }

  const utf8NameMatch = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8NameMatch?.[1]) {
    try {
      return decodeURIComponent(utf8NameMatch[1]);
    } catch {
      return utf8NameMatch[1];
    }
  }

  const fileNameMatch = contentDisposition.match(/filename\s*=\s*\"?([^\";]+)\"?/i);
  return fileNameMatch?.[1]?.trim() || fallback;
}

export async function downloadWorkspaceAuditExport(input?: {
  format?: "json" | "jsonl";
  from?: string;
  to?: string;
}): Promise<{
  blob: Blob;
  filename: string;
}> {
  const params = new URLSearchParams();
  if (input?.format) {
    params.set("format", input.format);
  }
  if (input?.from) {
    params.set("from", input.from);
  }
  if (input?.to) {
    params.set("to", input.to);
  }
  const query = params.toString();
  const url = query
    ? `/api/control-plane/workspace/audit-events/export?${query}`
    : "/api/control-plane/workspace/audit-events/export";
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/x-ndjson,application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await readErrorEnvelope(response);
    throw new ControlPlaneRequestError(
      response.status,
      payload.error?.message ?? `Control plane request failed with status ${response.status}`,
      payload.error?.code ?? "request_failed",
      payload.error?.details ?? {},
    );
  }

  const defaultName = input?.format === "json" ? "workspace-audit-export.json" : "workspace-audit-export.jsonl";
  return {
    blob: await response.blob(),
    filename: extractDownloadFileName(response.headers, defaultName),
  };
}

export async function fetchWorkspaceSsoReadiness(): Promise<ControlPlaneWorkspaceSsoReadiness> {
  try {
    return await request<ControlPlaneWorkspaceSsoReadiness>("/api/control-plane/workspace/sso");
  } catch (error) {
    if (!(error instanceof ControlPlaneRequestError)) {
      throw error;
    }

    if (error.status === 409 && error.code === "workspace_feature_unavailable") {
      return {
        feature: "sso",
        feature_enabled: false,
        status: "staged",
        provider_type: null,
        connection_mode: "workspace",
        supported_protocols: ["oidc", "saml"],
        next_steps: [
          "Upgrade to a plan with SSO support.",
          "Choose OIDC or SAML as the connection protocol.",
          "Configure identity provider metadata and domain mapping.",
        ],
        upgrade_href: typeof error.details.upgrade_href === "string" ? error.details.upgrade_href : "/settings?intent=upgrade",
        plan_code: typeof error.details.plan_code === "string" ? error.details.plan_code : null,
      };
    }

    if (error.status === 503 && error.code === "control_plane_base_missing") {
      return {
        feature: "sso",
        feature_enabled: false,
        status: "staged",
        provider_type: null,
        connection_mode: "workspace",
        supported_protocols: ["oidc", "saml"],
        next_steps: [
          "Set CONTROL_PLANE_BASE_URL to enable live SSO readiness checks.",
          "Upgrade to a plan with SSO support.",
        ],
        upgrade_href: "/settings?intent=upgrade",
        plan_code: null,
      };
    }

    throw error;
  }
}

export async function fetchWorkspaceDedicatedEnvironmentReadiness(): Promise<ControlPlaneWorkspaceDedicatedEnvironmentReadiness> {
  try {
    return await request<ControlPlaneWorkspaceDedicatedEnvironmentReadiness>(
      "/api/control-plane/workspace/dedicated-environment",
    );
  } catch (error) {
    if (!(error instanceof ControlPlaneRequestError)) {
      throw error;
    }

    if (error.status === 409 && error.code === "workspace_feature_unavailable") {
      return {
        feature: "dedicated_environment",
        feature_enabled: false,
        status: "staged",
        deployment_model: "single_tenant",
        target_region: null,
        isolation_summary: "Dedicated compute and data-plane isolation are staged until the workspace plan enables this feature.",
        next_steps: [
          "Upgrade to a plan with dedicated environment support.",
          "Confirm region and compliance boundaries for the target deployment.",
          "Review network and access isolation requirements before provisioning.",
        ],
        upgrade_href: typeof error.details.upgrade_href === "string" ? error.details.upgrade_href : "/settings?intent=upgrade",
        plan_code: typeof error.details.plan_code === "string" ? error.details.plan_code : null,
      };
    }

    if (error.status === 503 && error.code === "control_plane_base_missing") {
      return {
        feature: "dedicated_environment",
        feature_enabled: false,
        status: "staged",
        deployment_model: "single_tenant",
        target_region: null,
        isolation_summary: "Set CONTROL_PLANE_BASE_URL to load live dedicated environment readiness.",
        next_steps: [
          "Set CONTROL_PLANE_BASE_URL to enable live readiness checks.",
          "Upgrade to a plan with dedicated environment support.",
        ],
        upgrade_href: "/settings?intent=upgrade",
        plan_code: null,
      };
    }

    throw error;
  }
}

export async function fetchSession(): Promise<ControlPlaneSession> {
  return request<ControlPlaneSession>("/api/control-plane/me");
}

export async function createRun(input: ControlPlaneRunCreateRequest): Promise<ControlPlaneRunCreateResult> {
  const response = await fetch("/api/control-plane/runs", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = await readErrorEnvelope(response);
    throw new ControlPlaneRequestError(
      response.status,
      payload.error?.message ?? `Control plane request failed with status ${response.status}`,
      payload.error?.code ?? "request_failed",
      payload.error?.details ?? {},
    );
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneRunCreateResult>;
  return payload.data;
}

export async function fetchRun(runId: string): Promise<ControlPlaneRunDetail> {
  return request<ControlPlaneRunDetail>(`/api/control-plane/runs/${runId}`);
}

export async function fetchRunGraph(runId: string): Promise<ControlPlaneRunGraph> {
  return request<ControlPlaneRunGraph>(`/api/control-plane/runs/${runId}/graph`);
}

export async function fetchRunEvents(
  runId: string,
  query?: {
    page_size?: number;
    cursor?: string;
  },
): Promise<ControlPlaneRunEvents> {
  const searchParams = new URLSearchParams();
  if (typeof query?.page_size === "number" && Number.isFinite(query.page_size) && query.page_size > 0) {
    searchParams.set("page_size", String(Math.floor(query.page_size)));
  }
  if (query?.cursor) {
    searchParams.set("cursor", query.cursor);
  }
  const suffix = searchParams.toString();
  const path = suffix ? `/api/control-plane/runs/${runId}/events?${suffix}` : `/api/control-plane/runs/${runId}/events`;
  return request<ControlPlaneRunEvents>(path);
}

export async function fetchRunArtifacts(
  runId: string,
  query?: {
    page_size?: number;
    cursor?: string;
  },
): Promise<ControlPlaneRunArtifacts> {
  const searchParams = new URLSearchParams();
  if (typeof query?.page_size === "number" && Number.isFinite(query.page_size) && query.page_size > 0) {
    searchParams.set("page_size", String(Math.floor(query.page_size)));
  }
  if (query?.cursor) {
    searchParams.set("cursor", query.cursor);
  }
  const suffix = searchParams.toString();
  const path = suffix
    ? `/api/control-plane/runs/${runId}/artifacts?${suffix}`
    : `/api/control-plane/runs/${runId}/artifacts`;
  return request<ControlPlaneRunArtifacts>(path);
}

export async function createWorkspace(input: {
  organization_id: string;
  slug: string;
  display_name: string;
  plan_id?: string;
  data_region?: string;
}): Promise<ControlPlaneWorkspaceCreateResult> {
  const slugBase = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const suffix = crypto.randomUUID().split("-")[0];
  const workspaceId = `ws_${slugBase.replace(/-/g, "_")}_${suffix}`;
  const tenantId = `tenant_${slugBase.replace(/-/g, "_")}_${suffix}`;

  const response = await fetch("/api/control-plane/workspaces", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      workspace_id: workspaceId,
      organization_id: input.organization_id,
      slug: input.slug,
      display_name: input.display_name,
      tenant_id: tenantId,
      plan_id: input.plan_id,
      data_region: input.data_region,
    }),
  });

  if (!response.ok) {
    const payload = await readErrorEnvelope(response);
    throw new ControlPlaneRequestError(
      response.status,
      payload.error?.message ?? "Workspace creation failed. Check slug uniqueness and organization access, then retry.",
      payload.error?.code ?? "workspace_create_failed",
      payload.error?.details ?? {},
    );
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneWorkspaceCreateResult>;
  return payload.data;
}

export async function bootstrapWorkspace(workspaceId: string): Promise<ControlPlaneWorkspaceBootstrapResult> {
  const response = await fetch(`/api/control-plane/workspaces/${workspaceId}/bootstrap`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const payload = await readErrorEnvelope(response);
    throw new ControlPlaneRequestError(
      response.status,
      payload.error?.message ?? "Workspace bootstrap failed. Verify permissions and workspace state before retrying.",
      payload.error?.code ?? "workspace_bootstrap_failed",
      payload.error?.details ?? {},
    );
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneWorkspaceBootstrapResult>;
  return payload.data;
}

export async function fetchApiKeys(): Promise<ControlPlaneApiKey[]> {
  try {
    const payload = await request<ListEnvelope<ControlPlaneApiKey>>("/api/control-plane/api-keys");
    return payload.items;
  } catch {
    return [];
  }
}

export async function createApiKey(input: {
  service_account_id?: string;
  scope?: string[];
  expires_at?: string | null;
}): Promise<ControlPlaneApiKeyCreateResult> {
  const response = await fetch("/api/control-plane/api-keys", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Control plane request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneApiKeyCreateResult>;
  return payload.data;
}

export async function revokeApiKey(apiKeyId: string): Promise<ControlPlaneApiKey> {
  const response = await fetch(`/api/control-plane/api-keys/${apiKeyId}/revoke`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Control plane request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneApiKey>;
  return payload.data;
}

export async function rotateApiKey(
  apiKeyId: string,
  input: {
    service_account_id?: string;
    scope?: string[];
    expires_at?: string | null;
  } = {},
): Promise<ControlPlaneApiKeyRotateResult> {
  const response = await fetch(`/api/control-plane/api-keys/${apiKeyId}/rotate`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Control plane request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneApiKeyRotateResult>;
  return payload.data;
}

export async function fetchWorkspaceMembers(): Promise<ControlPlaneWorkspaceMember[]> {
  try {
    const payload = await request<ListEnvelope<ControlPlaneWorkspaceMember>>("/api/control-plane/members");
    return payload.items;
  } catch {
    return [];
  }
}

export async function fetchServiceAccounts(): Promise<ControlPlaneServiceAccount[]> {
  try {
    const payload = await request<ListEnvelope<ControlPlaneServiceAccount>>("/api/control-plane/service-accounts");
    return payload.items;
  } catch {
    return [];
  }
}

export async function createServiceAccount(input: {
  name: string;
  description?: string | null;
  role?: string;
}): Promise<ControlPlaneServiceAccountCreateResult> {
  const response = await fetch("/api/control-plane/service-accounts", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Control plane request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneServiceAccountCreateResult>;
  return payload.data;
}

export async function disableServiceAccount(serviceAccountId: string): Promise<ControlPlaneServiceAccount> {
  const response = await fetch(`/api/control-plane/service-accounts/${serviceAccountId}/disable`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Control plane request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneServiceAccount>;
  return payload.data;
}

export async function fetchWorkspaceInvitations(): Promise<ControlPlaneWorkspaceInvitation[]> {
  try {
    const payload = await request<ListEnvelope<ControlPlaneWorkspaceInvitation>>("/api/control-plane/invitations");
    return payload.items;
  } catch {
    return [];
  }
}

export async function createWorkspaceInvitation(input: {
  email: string;
  role?: string;
  expires_at?: string | null;
}): Promise<ControlPlaneWorkspaceInvitationCreateResult> {
  const response = await fetch("/api/control-plane/invitations", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Control plane request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneWorkspaceInvitationCreateResult>;
  return payload.data;
}

export async function revokeWorkspaceInvitation(
  invitationId: string,
): Promise<ControlPlaneWorkspaceInvitation> {
  const response = await fetch(`/api/control-plane/invitations/${invitationId}/revoke`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Control plane request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneWorkspaceInvitation>;
  return payload.data;
}

export async function acceptWorkspaceInvitation(
  inviteToken: string,
): Promise<ControlPlaneWorkspaceInvitationAcceptResult> {
  const response = await fetch("/api/control-plane/invitations/accept", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      invite_token: inviteToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Control plane request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as JsonEnvelope<ControlPlaneWorkspaceInvitationAcceptResult>;
  return payload.data;
}
