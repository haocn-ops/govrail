import { previewPolicies, previewToolProviders } from "@/lib/control-plane-preview";
import type {
  ControlPlaneAdminOverview,
  ControlPlaneApiKey,
  ControlPlaneApiKeyCreateResult,
  ControlPlaneApiKeyRotateResult,
  ControlPlaneContractIssue,
  ControlPlaneContractMeta,
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
  ControlPlaneWorkspaceDedicatedEnvironmentSaveRequest,
  ControlPlaneWorkspaceDedicatedEnvironmentReadiness,
  ControlPlaneWorkspaceAuditExportViewModel,
  ControlPlaneWorkspaceDetail,
  ControlPlaneWorkspaceInvitation,
  ControlPlaneWorkspaceInvitationAcceptResult,
  ControlPlaneWorkspaceInvitationCreateResult,
  ControlPlaneWorkspaceMember,
  ControlPlaneWorkspaceOnboardingState,
  ControlPlaneWorkspaceSsoSaveRequest,
  ControlPlaneWorkspaceSsoProtocol,
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

function nowIsoUtc(): string {
  return new Date().toISOString();
}

function toContractIssue(error: unknown, fallbackMessage: string): ControlPlaneContractIssue {
  if (error instanceof ControlPlaneRequestError) {
    return {
      code: error.code,
      message: error.message || fallbackMessage,
      status: error.status,
      retryable: error.status >= 500 || error.status === 429,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: "request_failed",
      message: error.message || fallbackMessage,
      status: null,
      retryable: true,
      details: {},
    };
  }

  return {
    code: "request_failed",
    message: fallbackMessage,
    status: null,
    retryable: true,
    details: {},
  };
}

function buildEnterpriseFallbackMeta(
  source: ControlPlaneContractMeta["source"],
  error: unknown,
  fallbackMessage: string,
): ControlPlaneContractMeta {
  return {
    source,
    normalized_at: nowIsoUtc(),
    issue: toContractIssue(error, fallbackMessage),
  };
}

function getEnterpriseFallbackUpgradeHref(error: unknown, fallbackHref: string): string {
  if (error instanceof ControlPlaneRequestError) {
    const upgradeHref = error.details?.["upgrade_href"];
    if (typeof upgradeHref === "string") {
      return upgradeHref;
    }
  }
  return fallbackHref;
}

function getEnterpriseFallbackPlanCode(error: unknown): string | null {
  if (error instanceof ControlPlaneRequestError) {
    const planCode = error.details?.["plan_code"];
    if (typeof planCode === "string") {
      return planCode;
    }
  }
  return null;
}

function normalizeSsoReadiness(
  input: Partial<ControlPlaneWorkspaceSsoReadiness>,
  meta: ControlPlaneWorkspaceSsoReadiness["contract_meta"],
): ControlPlaneWorkspaceSsoReadiness {
  const supportedProtocols: ControlPlaneWorkspaceSsoProtocol[] = (input.supported_protocols ?? []).filter(
    (protocol): protocol is ControlPlaneWorkspaceSsoProtocol => protocol === "oidc" || protocol === "saml",
  );
  const emailDomains = [
    ...(Array.isArray(input.email_domains)
      ? input.email_domains.filter((domain): domain is string => typeof domain === "string" && domain.trim() !== "")
      : []),
    ...(typeof input.email_domain === "string" && input.email_domain.trim() !== "" ? [input.email_domain] : []),
  ].filter((domain, index, values) => values.indexOf(domain) === index);
  return {
    feature: "sso",
    feature_enabled: input.feature_enabled === true,
    enabled: input.enabled ?? input.feature_enabled === true,
    configured: input.configured ?? input.status === "configured",
    configuration_state: input.configuration_state ?? (input.status === "configured" ? "configured" : "not_configured"),
    availability_status: input.availability_status ?? "available",
    delivery_status: input.delivery_status ?? "staged",
    readiness_version: input.readiness_version ?? "2026-04",
    status: input.status ?? "staged",
    provider_type: input.provider_type ?? null,
    connection_mode: "workspace",
    supported_protocols: supportedProtocols.length > 0 ? supportedProtocols : ["oidc", "saml"],
    next_steps: input.next_steps?.length ? input.next_steps : ["Review workspace SSO readiness and continue setup."],
    upgrade_href: input.upgrade_href ?? null,
    plan_code: input.plan_code ?? null,
    configured_at: input.configured_at ?? null,
    issuer_url: input.issuer_url ?? null,
    metadata_url: input.metadata_url ?? null,
    entrypoint_url: input.entrypoint_url ?? null,
    email_domain: input.email_domain ?? null,
    email_domains: emailDomains,
    client_id: input.client_id ?? null,
    audience: input.audience ?? null,
    signing_certificate: input.signing_certificate ?? null,
    notes: input.notes ?? null,
    contract_meta: meta,
  };
}

function normalizeDedicatedEnvironmentReadiness(
  input: Partial<ControlPlaneWorkspaceDedicatedEnvironmentReadiness>,
  meta: ControlPlaneWorkspaceDedicatedEnvironmentReadiness["contract_meta"],
): ControlPlaneWorkspaceDedicatedEnvironmentReadiness {
  return {
    feature: "dedicated_environment",
    feature_enabled: input.feature_enabled === true,
    enabled: input.enabled ?? input.feature_enabled === true,
    configured: input.configured ?? input.status === "configured",
    configuration_state: input.configuration_state ?? (input.status === "configured" ? "configured" : "not_configured"),
    availability_status: input.availability_status ?? "available",
    delivery_status: input.delivery_status ?? "staged",
    readiness_version: input.readiness_version ?? "2026-04",
    status: input.status ?? "staged",
    deployment_model: input.deployment_model ?? "single_tenant",
    target_region: input.target_region ?? null,
    isolation_summary:
      input.isolation_summary ??
      "Dedicated compute and isolation readiness are being prepared for this workspace.",
    next_steps: input.next_steps?.length
      ? input.next_steps
      : ["Review dedicated environment readiness and continue deployment planning."],
    upgrade_href: input.upgrade_href ?? null,
    plan_code: input.plan_code ?? null,
    configured_at: input.configured_at ?? null,
    network_boundary: input.network_boundary ?? null,
    compliance_notes: input.compliance_notes ?? null,
    requester_email: input.requester_email ?? null,
    data_classification: input.data_classification ?? null,
    requested_capacity: input.requested_capacity ?? null,
    requested_sla: input.requested_sla ?? null,
    notes: input.notes ?? null,
    contract_meta: meta,
  };
}

type OnboardingSurface =
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

function normalizeOnboardingSurface(surface: OnboardingSurface | null | undefined):
  | "onboarding"
  | "members"
  | "service_accounts"
  | "api_keys"
  | "playground"
  | "verification"
  | "usage"
  | "settings"
  | "go_live"
  | null {
  if (!surface) {
    return null;
  }
  if (surface === "service-accounts") {
    return "service_accounts";
  }
  if (surface === "api-keys") {
    return "api_keys";
  }
  if (surface === "go-live") {
    return "go_live";
  }
  return surface;
}

function normalizeDeliveryNextSurface(
  surface: OnboardingSurface | null | undefined,
): "onboarding" | "verification" | "go_live" | null {
  const normalized = normalizeOnboardingSurface(surface);
  if (normalized === "onboarding" || normalized === "verification" || normalized === "go_live") {
    return normalized;
  }
  return null;
}

function normalizeOnboardingState(
  onboarding: ControlPlaneWorkspaceOnboardingState,
): ControlPlaneWorkspaceOnboardingState {
  const recommendedSurface = normalizeOnboardingSurface(
    onboarding.recommended_next?.surface ?? onboarding.recommended_next_surface,
  );
  const recommendedAction = onboarding.recommended_next?.action ?? onboarding.recommended_next_action ?? null;
  const recommendedReason = onboarding.recommended_next?.reason ?? onboarding.recommended_next_reason ?? null;

  return {
    ...onboarding,
    blockers: onboarding.blockers?.map((blocker) => ({
      ...blocker,
      surface: normalizeOnboardingSurface(blocker.surface),
    })),
    recommended_next: onboarding.recommended_next
      ? {
          ...onboarding.recommended_next,
          surface: normalizeOnboardingSurface(onboarding.recommended_next.surface) ?? "onboarding",
        }
      : null,
    recommended_next_surface: recommendedSurface,
    recommended_next_action: recommendedAction,
    recommended_next_reason: recommendedReason,
    delivery_guidance: onboarding.delivery_guidance
      ? {
          ...onboarding.delivery_guidance,
          next_surface: normalizeDeliveryNextSurface(onboarding.delivery_guidance.next_surface) ?? "onboarding",
        }
      : null,
  };
}

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

type PostJsonOptions = {
  fallbackMessage?: string;
  fallbackCode?: string;
};

async function postJson<T>(path: string, input?: unknown, options?: PostJsonOptions): Promise<T> {
  const response = await fetch(path, {
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
      payload.error?.message ?? options?.fallbackMessage ?? `Control plane request failed with status ${response.status}`,
      payload.error?.code ?? options?.fallbackCode ?? "request_failed",
      payload.error?.details ?? {},
    );
  }

  const payload = (await response.json()) as JsonEnvelope<T>;
  return payload.data;
}

type ToolProviderApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
};

export type PlanLimitState = {
  scope: string;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  planId: string | null;
  planCode: string | null;
  upgradeHref: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  message: string;
} | null;

function parsePlanLimitError(payload: ToolProviderApiErrorPayload): PlanLimitState {
  if (payload.error?.code !== "plan_limit_exceeded") {
    return null;
  }
  const details = payload.error.details ?? {};
  const toStringValue = (value: unknown): string | null =>
    typeof value === "string" && value.trim() !== "" ? value : null;
  const toNumberValue = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    scope: toStringValue(details.scope) ?? "workspace_limit",
    used: toNumberValue(details.used),
    limit: toNumberValue(details.limit),
    remaining: toNumberValue(details.remaining),
    planId: toStringValue(details.plan_id),
    planCode: toStringValue(details.plan_code),
    upgradeHref: toStringValue(details.upgrade_href),
    periodStart: toStringValue(details.period_start),
    periodEnd: toStringValue(details.period_end),
    message: payload.error.message ?? "Workspace reached the current plan limit.",
  };
}

type ToolProviderMutationResult<T> = {
  data: T;
  planLimit: PlanLimitState;
};

async function postToolProviderJson<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<ToolProviderMutationResult<T>> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as { data: T } | ToolProviderApiErrorPayload;
  const planLimit = parsePlanLimitError(payload as ToolProviderApiErrorPayload);

  if (!response.ok) {
    const envelope = payload as ToolProviderApiErrorPayload;
    throw Object.assign(
      new ControlPlaneRequestError(
        response.status,
        envelope.error?.message ?? `Control plane request failed with status ${response.status}`,
        envelope.error?.code ?? "request_failed",
        envelope.error?.details ?? {},
      ),
      { planLimit },
    );
  }

  return {
    data: (payload as { data: T }).data,
    planLimit,
  };
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

export async function createToolProvider(
  input: {
    name: string;
    provider_type: ControlPlaneToolProvider["provider_type"];
    endpoint_url: string;
    status?: ControlPlaneToolProvider["status"];
  },
): Promise<ToolProviderMutationResult<ControlPlaneToolProvider>> {
  return postToolProviderJson<ControlPlaneToolProvider>("/api/control-plane/tool-providers", {
    ...input,
    status: input.status ?? "active",
  });
}

export async function updateToolProviderStatus(
  providerId: string,
  status: ControlPlaneToolProvider["status"],
): Promise<ToolProviderMutationResult<ControlPlaneToolProvider>> {
  if (status === "active") {
    return postToolProviderJson<ControlPlaneToolProvider>(`/api/control-plane/tool-providers/${providerId}`, {
      status: "active",
    });
  }
  return postToolProviderJson<ControlPlaneToolProvider>(
    `/api/control-plane/tool-providers/${providerId}/disable`,
    {},
  );
}

export async function fetchCurrentWorkspace(): Promise<ControlPlaneWorkspaceDetail> {
  const detail = await request<ControlPlaneWorkspaceDetail>("/api/control-plane/workspace");
  return {
    ...detail,
    onboarding: normalizeOnboardingState(detail.onboarding),
  };
}

export async function fetchWorkspaceDeliveryTrack(): Promise<ControlPlaneWorkspaceDeliveryTrack> {
  const track = await request<ControlPlaneWorkspaceDeliveryTrack>("/api/control-plane/workspace/delivery");
  return {
    ...track,
    contract_meta: track.contract_meta ?? {
      source: "live",
      normalized_at: nowIsoUtc(),
      issue: null,
    },
  };
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
  return {
    ...payload.data,
    contract_meta: payload.data.contract_meta ?? {
      source: "live",
      normalized_at: nowIsoUtc(),
      issue: null,
    },
  };
}

export async function fetchAdminOverview(): Promise<ControlPlaneAdminOverview> {
  const normalizeAdminOverviewContract = (
    overview: ControlPlaneAdminOverview,
  ): ControlPlaneAdminOverview => ({
    ...overview,
    contract_meta: overview.contract_meta ?? {
      source: "live",
      normalized_at: nowIsoUtc(),
      issue: null,
    },
  });

  try {
    return normalizeAdminOverviewContract(
      await request<ControlPlaneAdminOverview>("/api/control-plane/admin/overview"),
    );
  } catch (error) {
    if (!(error instanceof ControlPlaneRequestError)) {
      throw error;
    }

    if ((error.status === 503 && error.code === "control_plane_base_missing") || error.status === 404) {
      const now = new Date().toISOString();
      const source: ControlPlaneContractMeta["source"] =
        error.code === "control_plane_base_missing"
          ? "fallback_control_plane_unavailable"
          : "fallback_error";
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
        contract_meta: buildEnterpriseFallbackMeta(
          source,
          error,
          "Admin overview is showing preview fallback data until the live control-plane summary is available.",
        ),
      };
    }

    throw error;
  }
}

export async function createBillingCheckoutSession(input: {
  target_plan_id?: string;
  billing_interval?: "monthly" | "yearly";
}): Promise<ControlPlaneWorkspaceBillingCheckoutSessionDetail> {
  return postJson<ControlPlaneWorkspaceBillingCheckoutSessionDetail>(
    "/api/control-plane/workspace/billing/checkout-sessions",
    input,
  );
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
  return postJson<ControlPlaneWorkspaceBillingCheckoutSessionCompleteResult>(
    `/api/control-plane/workspace/billing/checkout-sessions/${sessionId}/complete`,
  );
}

export async function cancelBillingSubscription(): Promise<ControlPlaneWorkspaceBillingSubscriptionResult> {
  return postJson<ControlPlaneWorkspaceBillingSubscriptionResult>(
    "/api/control-plane/workspace/billing/subscription/cancel",
  );
}

export async function resumeBillingSubscription(): Promise<ControlPlaneWorkspaceBillingSubscriptionResult> {
  return postJson<ControlPlaneWorkspaceBillingSubscriptionResult>(
    "/api/control-plane/workspace/billing/subscription/resume",
  );
}

export async function createBillingPortalSession(input?: {
  return_url?: string;
}): Promise<ControlPlaneWorkspaceBillingPortalSession> {
  return postJson<ControlPlaneWorkspaceBillingPortalSession>(
    "/api/control-plane/workspace/billing/portal-sessions",
    input,
  );
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
  const result = await downloadWorkspaceAuditExportViewModel(input);
  if (!result.ok) {
    throw new ControlPlaneRequestError(
      result.error.status ?? 500,
      result.error.message,
      result.error.code,
      result.error.details,
    );
  }
  return {
    blob: result.blob,
    filename: result.filename,
  };
}

export async function downloadWorkspaceAuditExportViewModel(input?: {
  format?: "json" | "jsonl";
  from?: string;
  to?: string;
}): Promise<ControlPlaneWorkspaceAuditExportViewModel> {
  const format = input?.format === "json" ? "json" : "jsonl";
  const params = new URLSearchParams();
  if (input?.format) {
    params.set("format", format);
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
    const issue: ControlPlaneContractIssue = {
      code: payload.error?.code ?? "request_failed",
      message: payload.error?.message ?? `Control plane request failed with status ${response.status}`,
      status: response.status,
      retryable: response.status >= 500 || response.status === 429,
      details: payload.error?.details ?? {},
    };
    return {
      ok: false,
      blob: null,
      filename: null,
      format,
      content_type: response.headers.get("content-type"),
      error: issue,
      contract_meta: {
        source:
          issue.code === "workspace_feature_unavailable"
            ? "fallback_feature_gate"
            : issue.code === "control_plane_base_missing"
              ? "fallback_control_plane_unavailable"
              : "fallback_error",
        normalized_at: nowIsoUtc(),
        issue,
      },
    };
  }

  const defaultName = input?.format === "json" ? "workspace-audit-export.json" : "workspace-audit-export.jsonl";
  return {
    ok: true,
    blob: await response.blob(),
    filename: extractDownloadFileName(response.headers, defaultName),
    format,
    content_type: response.headers.get("content-type"),
    contract_meta: {
      source: "live",
      normalized_at: nowIsoUtc(),
      issue: null,
    },
  };
}

export async function fetchWorkspaceSsoReadiness(): Promise<ControlPlaneWorkspaceSsoReadiness> {
  try {
    const response = await request<ControlPlaneWorkspaceSsoReadiness>("/api/control-plane/workspace/sso");
    return normalizeSsoReadiness(response, {
      source: "live",
      normalized_at: nowIsoUtc(),
      issue: null,
    });
  } catch (error) {
    if (error instanceof ControlPlaneRequestError && error.status === 409 && error.code === "workspace_feature_unavailable") {
      const fallbackUpgradeHref = getEnterpriseFallbackUpgradeHref(error, "/settings?intent=upgrade");
      const fallbackPlanCode = getEnterpriseFallbackPlanCode(error);
      return normalizeSsoReadiness(
        {
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
          upgrade_href: fallbackUpgradeHref,
          plan_code: fallbackPlanCode,
        },
        buildEnterpriseFallbackMeta(
          "fallback_feature_gate",
          error,
          "SSO is not available on the current workspace plan.",
        ),
      );
    }

    if (error instanceof ControlPlaneRequestError && error.status === 503 && error.code === "control_plane_base_missing") {
      const fallbackUpgradeHref = getEnterpriseFallbackUpgradeHref(error, "/settings?intent=upgrade");
      const fallbackPlanCode = getEnterpriseFallbackPlanCode(error);
      return normalizeSsoReadiness(
        {
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
          upgrade_href: fallbackUpgradeHref,
          plan_code: fallbackPlanCode,
        },
        buildEnterpriseFallbackMeta(
          "fallback_control_plane_unavailable",
          error,
          "Control plane base URL is not configured.",
        ),
      );
    }

    return normalizeSsoReadiness(
      {
        feature: "sso",
        feature_enabled: false,
        status: "staged",
        provider_type: null,
        connection_mode: "workspace",
        supported_protocols: ["oidc", "saml"],
        next_steps: [
          "Retry the SSO readiness request.",
          "If the issue persists, verify control-plane health and workspace access.",
        ],
        upgrade_href: "/settings?intent=upgrade",
        plan_code: null,
      },
      buildEnterpriseFallbackMeta(
        "fallback_error",
        error,
        "SSO readiness could not be loaded.",
      ),
    );
  }
}

export async function saveWorkspaceSsoReadiness(
  input: ControlPlaneWorkspaceSsoSaveRequest,
): Promise<ControlPlaneWorkspaceSsoReadiness> {
  const response = await postJson<ControlPlaneWorkspaceSsoReadiness>(
    "/api/control-plane/workspace/sso",
    input,
  );
  return normalizeSsoReadiness(response, {
    source: "live",
    normalized_at: nowIsoUtc(),
    issue: null,
  });
}

export async function fetchWorkspaceDedicatedEnvironmentReadiness(): Promise<ControlPlaneWorkspaceDedicatedEnvironmentReadiness> {
  try {
    const response = await request<ControlPlaneWorkspaceDedicatedEnvironmentReadiness>(
      "/api/control-plane/workspace/dedicated-environment",
    );
    return normalizeDedicatedEnvironmentReadiness(response, {
      source: "live",
      normalized_at: nowIsoUtc(),
      issue: null,
    });
  } catch (error) {
    if (error instanceof ControlPlaneRequestError && error.status === 409 && error.code === "workspace_feature_unavailable") {
      const fallbackUpgradeHref = getEnterpriseFallbackUpgradeHref(error, "/settings?intent=upgrade");
      const fallbackPlanCode = getEnterpriseFallbackPlanCode(error);
      return normalizeDedicatedEnvironmentReadiness(
        {
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
          upgrade_href: fallbackUpgradeHref,
          plan_code: fallbackPlanCode,
        },
        buildEnterpriseFallbackMeta(
          "fallback_feature_gate",
          error,
          "Dedicated environment is not available on the current workspace plan.",
        ),
      );
    }

    if (error instanceof ControlPlaneRequestError && error.status === 503 && error.code === "control_plane_base_missing") {
      const fallbackUpgradeHref = getEnterpriseFallbackUpgradeHref(error, "/settings?intent=upgrade");
      const fallbackPlanCode = getEnterpriseFallbackPlanCode(error);
      return normalizeDedicatedEnvironmentReadiness(
        {
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
          upgrade_href: fallbackUpgradeHref,
          plan_code: fallbackPlanCode,
        },
        buildEnterpriseFallbackMeta(
          "fallback_control_plane_unavailable",
          error,
          "Control plane base URL is not configured.",
        ),
      );
    }

    return normalizeDedicatedEnvironmentReadiness(
      {
        feature: "dedicated_environment",
        feature_enabled: false,
        status: "staged",
        deployment_model: "single_tenant",
        target_region: null,
        isolation_summary: "Dedicated environment readiness could not be loaded.",
        next_steps: [
          "Retry the dedicated environment readiness request.",
          "If the issue persists, verify control-plane health and workspace access.",
        ],
        upgrade_href: "/settings?intent=upgrade",
        plan_code: null,
      },
      buildEnterpriseFallbackMeta(
        "fallback_error",
        error,
        "Dedicated environment readiness could not be loaded.",
      ),
    );
  }
}

export async function saveWorkspaceDedicatedEnvironmentReadiness(
  input: ControlPlaneWorkspaceDedicatedEnvironmentSaveRequest,
): Promise<ControlPlaneWorkspaceDedicatedEnvironmentReadiness> {
  const response = await postJson<ControlPlaneWorkspaceDedicatedEnvironmentReadiness>(
    "/api/control-plane/workspace/dedicated-environment",
    input,
  );
  return normalizeDedicatedEnvironmentReadiness(response, {
    source: "live",
    normalized_at: nowIsoUtc(),
    issue: null,
  });
}

export async function fetchSession(): Promise<ControlPlaneSession> {
  return request<ControlPlaneSession>("/api/control-plane/me");
}

export async function createRun(input: ControlPlaneRunCreateRequest): Promise<ControlPlaneRunCreateResult> {
  return postJson<ControlPlaneRunCreateResult>("/api/control-plane/runs", input);
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
  return postJson<ControlPlaneWorkspaceCreateResult>(
    "/api/control-plane/workspaces",
    {
      workspace_id: workspaceId,
      organization_id: input.organization_id,
      slug: input.slug,
      display_name: input.display_name,
      tenant_id: tenantId,
      plan_id: input.plan_id,
      data_region: input.data_region,
    },
    {
      fallbackMessage: "Workspace creation failed. Check slug uniqueness and organization access, then retry.",
      fallbackCode: "workspace_create_failed",
    },
  );
}

export async function bootstrapWorkspace(workspaceId: string): Promise<ControlPlaneWorkspaceBootstrapResult> {
  return postJson<ControlPlaneWorkspaceBootstrapResult>(
    `/api/control-plane/workspaces/${workspaceId}/bootstrap`,
    undefined,
    {
      fallbackMessage: "Workspace bootstrap failed. Verify permissions and workspace state before retrying.",
      fallbackCode: "workspace_bootstrap_failed",
    },
  );
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
  return postJson<ControlPlaneApiKeyCreateResult>("/api/control-plane/api-keys", input);
}

export async function revokeApiKey(apiKeyId: string): Promise<ControlPlaneApiKey> {
  return postJson<ControlPlaneApiKey>(`/api/control-plane/api-keys/${apiKeyId}/revoke`);
}

export async function rotateApiKey(
  apiKeyId: string,
  input: {
    service_account_id?: string;
    scope?: string[];
    expires_at?: string | null;
  } = {},
): Promise<ControlPlaneApiKeyRotateResult> {
  return postJson<ControlPlaneApiKeyRotateResult>(`/api/control-plane/api-keys/${apiKeyId}/rotate`, input);
}

export async function fetchWorkspaceMembers(): Promise<ControlPlaneWorkspaceMember[]> {
  try {
    const payload = await request<ListEnvelope<ControlPlaneWorkspaceMember>>("/api/control-plane/members");
    return payload.items;
  } catch {
    return [];
  }
}

export type WorkspaceMembersViewModel = {
  items: ControlPlaneWorkspaceMember[];
  contract: {
    source:
      | "live"
      | "workspace_context_not_metadata"
      | "fallback_feature_gate"
      | "fallback_control_plane_unavailable"
      | "fallback_error";
    code: string | null;
    message: string;
    status: number | null;
    retryable: boolean;
    details: Record<string, unknown>;
  };
};

export async function fetchWorkspaceMembersViewModel(): Promise<WorkspaceMembersViewModel> {
  try {
    const payload = await request<ListEnvelope<ControlPlaneWorkspaceMember>>("/api/control-plane/members");
    return {
      items: payload.items,
      contract: {
        source: "live",
        code: null,
        message: "Members list loaded from live workspace context.",
        status: 200,
        retryable: false,
        details: {},
      },
    };
  } catch (error) {
    if (
      error instanceof ControlPlaneRequestError &&
      error.status === 412 &&
      error.code === "workspace_context_not_metadata"
    ) {
      return {
        items: [],
        contract: {
          source: "workspace_context_not_metadata",
          code: error.code,
          message:
            error.message ||
            "Members list is blocked because the current workspace context is not metadata-backed.",
          status: error.status,
          retryable: false,
          details: error.details,
        },
      };
    }

    if (
      error instanceof ControlPlaneRequestError &&
      error.status === 409 &&
      error.code === "workspace_feature_unavailable"
    ) {
      return {
        items: [],
        contract: {
          source: "fallback_feature_gate",
          code: error.code,
          message: error.message || "Members list is not available on the current workspace plan.",
          status: error.status,
          retryable: false,
          details: error.details,
        },
      };
    }

    if (
      error instanceof ControlPlaneRequestError &&
      error.status === 503 &&
      error.code === "control_plane_base_missing"
    ) {
      return {
        items: [],
        contract: {
          source: "fallback_control_plane_unavailable",
          code: error.code,
          message: error.message || "Members list is unavailable because control-plane base URL is not configured.",
          status: error.status,
          retryable: true,
          details: error.details,
        },
      };
    }

    const issue = toContractIssue(error, "Members list is temporarily unavailable.");
    return {
      items: [],
      contract: {
        source: "fallback_error",
        code: issue.code,
        message: issue.message,
        status: issue.status,
        retryable: issue.retryable,
        details: issue.details,
      },
    };
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
  return postJson<ControlPlaneServiceAccountCreateResult>("/api/control-plane/service-accounts", input);
}

export async function disableServiceAccount(serviceAccountId: string): Promise<ControlPlaneServiceAccount> {
  return postJson<ControlPlaneServiceAccount>(`/api/control-plane/service-accounts/${serviceAccountId}/disable`);
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
  return postJson<ControlPlaneWorkspaceInvitationCreateResult>("/api/control-plane/invitations", input);
}

export async function revokeWorkspaceInvitation(
  invitationId: string,
): Promise<ControlPlaneWorkspaceInvitation> {
  return postJson<ControlPlaneWorkspaceInvitation>(`/api/control-plane/invitations/${invitationId}/revoke`);
}

export async function acceptWorkspaceInvitation(
  inviteToken: string,
): Promise<ControlPlaneWorkspaceInvitationAcceptResult> {
  return postJson<ControlPlaneWorkspaceInvitationAcceptResult>("/api/control-plane/invitations/accept", {
    invite_token: inviteToken,
  });
}
