"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ControlPlaneRequestError,
  fetchApiKeys,
  fetchCurrentWorkspace,
  revokeApiKey,
  rotateApiKey,
} from "@/services/control-plane";
import type { ControlPlaneAdminDeliveryUpdateKind } from "@/lib/control-plane-types";
import { buildVerificationChecklistHandoffHref } from "@/lib/handoff-query";

function formatScope(scope: string[]): string {
  if (scope.length === 0) {
    return "legacy full access (compat)";
  }
  return scope.join(", ");
}

function formatTime(value: string | null): string {
  if (!value) {
    return "never";
  }
  return new Date(value).toLocaleString();
}

function toDateTimeLocalValue(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function normalizeScope(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

type ApiKeysSource = "admin-attention" | "admin-readiness" | "onboarding";
type DeliveryContext = "recent_activity" | "week8";
type RecentTrackKey = "verification" | "go_live";
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

function normalizeSource(source?: string | null): ApiKeysSource | null {
  if (source === "admin-attention" || source === "admin-readiness" || source === "onboarding") {
    return source;
  }
  return null;
}

function normalizeDeliveryContext(value?: string | null): DeliveryContext | null {
  return value === "recent_activity" || value === "week8" ? value : null;
}

function normalizeRecentTrackKey(value?: string | null): RecentTrackKey | null {
  if (value === "verification" || value === "go_live") {
    return value;
  }
  return null;
}

function normalizeRecentUpdateKind(value?: string | null): ControlPlaneAdminDeliveryUpdateKind | null {
  if (
    value === "verification" ||
    value === "go_live" ||
    value === "verification_completed" ||
    value === "go_live_completed" ||
    value === "evidence_only"
  ) {
    return value;
  }
  return null;
}

function normalizeEvidenceCount(value?: number | string | null): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function describeRecentDeliverySummary(args: {
  recentTrackKey?: RecentTrackKey | null;
  recentUpdateKind?: ControlPlaneAdminDeliveryUpdateKind | null;
  evidenceCount?: number | null;
  recentOwnerLabel?: string | null;
  recentOwnerDisplayName?: string | null;
  recentOwnerEmail?: string | null;
}): string {
  const ownerSummary =
    args.recentOwnerDisplayName && args.recentOwnerEmail
      ? `${args.recentOwnerDisplayName} <${args.recentOwnerEmail}>`
      : args.recentOwnerDisplayName ?? args.recentOwnerEmail ?? args.recentOwnerLabel ?? null;
  const parts = [
    args.recentTrackKey ? `${args.recentTrackKey} track` : null,
    args.recentUpdateKind ? args.recentUpdateKind.replaceAll("_", " ") : null,
    typeof args.evidenceCount === "number"
      ? `${args.evidenceCount} evidence ${args.evidenceCount === 1 ? "item" : "items"}`
      : null,
    ownerSummary ? `owner ${ownerSummary}` : null,
  ].filter(Boolean);
  return parts.length ? `Latest admin context: ${parts.join(" · ")}.` : "";
}

function formatApiKeyActionError(error: unknown): string {
  if (error instanceof ControlPlaneRequestError) {
    if (error.code === "api_key_limit_reached") {
      return `API key limits have been reached (code ${error.code}). ${error.message}`;
    }
    return `API key action failed: ${error.message ?? error.code ?? "unknown error"}`;
  }
  return "API key action failed. Check workspace permissions.";
}

function toSurfacePath(surface: OnboardingSurface): string {
  if (surface === "service_accounts" || surface === "service-accounts") {
    return "/service-accounts";
  }
  if (surface === "api_keys" || surface === "api-keys") {
    return "/api-keys";
  }
  if (surface === "verification") {
    return "/verification?surface=verification";
  }
  if (surface === "go_live" || surface === "go-live") {
    return "/go-live?surface=go_live";
  }
  return `/${surface}`;
}

function getApiKeysGuide(args: {
  onboarding?: {
    checklist: {
      baseline_ready: boolean;
      service_account_created: boolean;
      api_key_created: boolean;
      demo_run_created: boolean;
      demo_run_succeeded: boolean;
    };
    blockers?: Array<{ message: string }> | null;
    recommended_next_surface?: OnboardingSurface | null;
    recommended_next_action?: string | null;
    recommended_next_reason?: string | null;
    summary?: {
      api_keys_total: number;
      active_api_keys_total: number;
    } | null;
  } | null;
}): { body: string; actionLabel: string; actionSurface: OnboardingSurface; blockers: string[] } {
  const blockers =
    args.onboarding?.blockers && args.onboarding.blockers.length > 0
      ? args.onboarding.blockers.map((item) => item.message)
      : [
          args.onboarding?.checklist.baseline_ready ? null : "Baseline bootstrap is not complete yet.",
          args.onboarding?.checklist.service_account_created ? null : "Service account is still missing.",
          args.onboarding?.checklist.api_key_created ? null : "API key is still missing.",
          args.onboarding?.checklist.demo_run_created && !args.onboarding.checklist.demo_run_succeeded
            ? "Demo run exists but has not succeeded yet."
            : null,
        ].filter((item): item is string => item !== null);
  const apiKeysTotal = args.onboarding?.summary?.api_keys_total ?? 0;
  const activeApiKeys = args.onboarding?.summary?.active_api_keys_total ?? 0;
  const historicalOnly = apiKeysTotal > 0 && activeApiKeys === 0;
  const coverage =
    apiKeysTotal > 0
      ? activeApiKeys >= apiKeysTotal
        ? `${activeApiKeys} active`
        : `${activeApiKeys} active · ${Math.max(apiKeysTotal - activeApiKeys, 0)} historical`
      : null;
  const coverageLine = coverage ? ` Current coverage: ${coverage}.` : "";

  if (args.onboarding?.recommended_next_surface && args.onboarding.recommended_next_surface !== "api_keys") {
    return {
      body:
        `${args.onboarding.recommended_next_reason ??
          "API key setup is no longer the primary blocker. Continue with recommended onboarding surface."}${coverageLine}`,
      actionLabel: args.onboarding.recommended_next_action ?? "Continue onboarding",
      actionSurface: args.onboarding.recommended_next_surface,
      blockers,
    };
  }
  if (args.onboarding?.checklist.demo_run_succeeded !== true) {
    return {
      body: historicalOnly
        ? `Only revoked or historical API keys remain. Issue a new active key before you treat Playground as ready.${coverageLine}`
        : `After key setup, invoke Playground to create or confirm the first successful demo run.${coverageLine}`,
      actionLabel: "Open Playground",
      actionSurface: "playground",
      blockers,
    };
  }
  return {
    body: "Demo run has succeeded. Move to verification and record onboarding evidence.",
    actionLabel: "Open Verification",
    actionSurface: "verification",
    blockers,
  };
}


type RotateFormState = {
  serviceAccountId: string;
  scope: string;
  expiresAt: string;
};

function buildInitialRotateState(key: {
  service_account_id: string | null;
  scope: string[];
  expires_at: string | null;
}): RotateFormState {
  return {
    serviceAccountId: key.service_account_id ?? "",
    scope: key.scope.join(", "),
    expiresAt: toDateTimeLocalValue(key.expires_at),
  };
}

function apiKeyStatusVariant(status: string): "strong" | "default" | "subtle" {
  if (status === "active") {
    return "strong";
  }
  if (status === "revoked") {
    return "subtle";
  }
  return "default";
}

function apiKeyStatusSummary(status: string): string {
  if (status === "active") {
    return "This key can still back a governed workspace flow, so keep scope and evidence follow-up aligned.";
  }
  if (status === "revoked") {
    return "This key is historical only. Keep any prior run evidence, but do not rely on it for new workspace traffic.";
  }
  return "This key needs manual review before it is treated as safe for further workspace follow-up.";
}

function apiKeyNextLane(status: string, scope: string[]): string {
  if (status !== "active") {
    return "Next lane: verification, artifacts, or audit review for historical evidence.";
  }
  if (scope.includes("runs:write")) {
    return "Next lane: Playground -> Usage -> Verification.";
  }
  return "Next lane: confirm scope intent, then continue through the matching manual workspace surface.";
}

export function ApiKeysPanel({
  workspaceSlug,
  source,
  week8Focus,
  attentionWorkspace,
  attentionOrganization,
  deliveryContext,
  recentTrackKey,
  recentUpdateKind,
  evidenceCount,
  recentOwnerLabel,
  recentOwnerDisplayName,
  recentOwnerEmail,
}: {
  workspaceSlug: string;
  source?: string | null;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  deliveryContext?: string | null;
  recentTrackKey?: string | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | null;
  recentOwnerLabel?: string | null;
  recentOwnerDisplayName?: string | null;
  recentOwnerEmail?: string | null;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["workspace-api-keys", workspaceSlug],
    queryFn: fetchApiKeys,
  });
  const workspaceQuery = useQuery({
    queryKey: ["workspace-onboarding-state", workspaceSlug],
    queryFn: fetchCurrentWorkspace,
  });

  const keys = data ?? [];
  const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [rotateForms, setRotateForms] = useState<Record<string, RotateFormState>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const normalizedSource = normalizeSource(source);
  const normalizedDeliveryContext = normalizeDeliveryContext(deliveryContext);
  const normalizedRecentTrackKey = normalizeRecentTrackKey(recentTrackKey);
  const normalizedRecentUpdateKind = normalizeRecentUpdateKind(recentUpdateKind);
  const normalizedEvidenceCount = normalizeEvidenceCount(evidenceCount);
  const latestDemoRun = workspaceQuery.data?.onboarding?.latest_demo_run ?? null;
  const activeRunId = latestDemoRun?.run_id ?? null;
  const metadataDescription =
    normalizedDeliveryContext === "recent_activity"
      ? describeRecentDeliverySummary({
          recentTrackKey: normalizedRecentTrackKey,
          recentUpdateKind: normalizedRecentUpdateKind,
          evidenceCount: normalizedEvidenceCount,
          recentOwnerLabel,
          recentOwnerDisplayName,
          recentOwnerEmail,
        })
      : "";
  const handoffHrefArgs = {
    source: normalizedSource,
    runId: activeRunId,
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    deliveryContext: normalizedDeliveryContext,
    recentTrackKey: normalizedRecentTrackKey,
    recentUpdateKind: normalizedRecentUpdateKind,
    evidenceCount: normalizedEvidenceCount,
    recentOwnerLabel,
    recentOwnerDisplayName,
    recentOwnerEmail,
  };
  const serviceAccountsHref = buildVerificationChecklistHandoffHref({ pathname: "/service-accounts", ...handoffHrefArgs });
  const playgroundHref = buildVerificationChecklistHandoffHref({ pathname: "/playground", ...handoffHrefArgs });
  const verificationHref = buildVerificationChecklistHandoffHref({
    pathname: "/verification?surface=verification",
    ...handoffHrefArgs,
  });
  const onboardingGuide = getApiKeysGuide({
    onboarding: workspaceQuery.data?.onboarding ?? null,
  });
  const onboardingGuideHref = buildVerificationChecklistHandoffHref({
    pathname: toSurfacePath(onboardingGuide.actionSurface),
    ...handoffHrefArgs,
  });

  const revokeMutation = useMutation({
    onMutate: () => {
      setActionError(null);
    },
    mutationFn: revokeApiKey,
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({
        queryKey: ["workspace-api-keys", workspaceSlug],
      });
    },
    onError: (error: unknown) => {
      setActionError(formatApiKeyActionError(error));
    },
  });

  const rotateMutation = useMutation({
    onMutate: () => {
      setActionError(null);
    },
    mutationFn: async (input: {
      apiKeyId: string;
      serviceAccountId?: string;
      scope?: string[];
      expiresAt?: string | null;
    }) =>
      rotateApiKey(input.apiKeyId, {
        service_account_id: input.serviceAccountId,
        scope: input.scope,
        expires_at: input.expiresAt ?? null,
      }),
    onSuccess: async (result, variables) => {
      setRevealedSecrets((current) => ({
        ...current,
        [result.api_key.api_key_id]: result.secret_key ?? "",
      }));
      setExpandedKeyId(null);
      setRotateForms((current) => {
        const next = { ...current };
        delete next[variables.apiKeyId];
        return next;
      });
      await queryClient.invalidateQueries({
        queryKey: ["workspace-api-keys", workspaceSlug],
      });
      setActionError(null);
    },
    onError: (error: unknown) => {
      setActionError(formatApiKeyActionError(error));
    },
  });

  const sortedKeys = useMemo(
    () =>
      [...keys].sort((left, right) => {
        if (left.status === right.status) {
          return right.created_at.localeCompare(left.created_at);
        }
        if (left.status === "active") {
          return -1;
        }
        if (right.status === "active") {
          return 1;
        }
        return left.status.localeCompare(right.status);
      }),
    [keys],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Existing keys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted">Loading API keys...</p> : null}
        {isError ? <p className="text-sm text-muted">API keys endpoint unavailable, showing fallback state.</p> : null}
        {actionError ? <p className="text-xs text-red-600">{actionError}</p> : null}
        {!isLoading && sortedKeys.length === 0 ? (
          <p className="text-sm text-muted">No API keys found for this workspace yet.</p>
        ) : null}

        <Card className="rounded-2xl border border-border bg-background p-4">
          <p className="font-medium text-foreground">Audit export continuity</p>
          <p className="mt-1 text-xs text-muted">
            After you pair an API key with a service account, reopen the Latest export receipt in
            <code className="font-mono">/settings?intent=upgrade</code>, capture the filename, filters, and SHA-256, and carry that same proof through
            verification, the go-live drill, and the eventual admin handoff.
          </p>
          <p className="mt-1 text-xs text-muted">
            Navigation-only manual relay: these links preserve the workspace context but do not automatically attach the audit export or finish rollout steps for you.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/settings?intent=upgrade", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen audit export receipt
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/verification?surface=verification", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Capture verification evidence
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/go-live?surface=go_live", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen go-live drill
            </Link>
          </div>
        </Card>
        <Card className="rounded-2xl border border-border bg-background p-4">
          <p className="font-medium text-foreground">First-run governance path</p>
          <p className="mt-1 text-xs text-muted">
            Pair the key with a workspace service account, then use `/playground` to submit the first `runs:write` request. Capture the `run_id` and reference it in `/usage` or `/verification` so the Week 8 checklist sees the trace.
          </p>
          <p className="mt-1 text-xs text-muted">
            Once the demo evidence looks clean, rehearse the go-live drill or confirm verification evidence before bouncing back to admin readiness; this keeps the entire chain auditable.
          </p>
          <p className="mt-1 text-xs text-muted">
            When you need replay, cancel, approval, A2A send/cancel, or MCP calls, incrementally add the matching scopes (`runs:manage`, `approvals:write`, `a2a:write`, `mcp:call`) for the same key or rotate to a new one.
            Keep the scope list narrow—each permission should align with a real workflow.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={serviceAccountsHref}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review service accounts
            </Link>
            <Link
              href={playgroundHref}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Run a verification demo
            </Link>
            <Link
              href={verificationHref}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Capture Week 8 evidence
            </Link>
          </div>
        </Card>
        <Card className="rounded-2xl border border-border bg-card p-4 text-sm">
          <CardHeader>
            <CardTitle className="text-sm">Status semantics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted">
            <p>
              `active` means the key can still participate in a governed workspace flow. `revoked` means the key is
              historical only and should not back new traffic. Any other state should be treated as manual-review
              territory before it is used again.
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border bg-card p-4 text-sm">
          <CardHeader>
            <CardTitle className="text-sm">Onboarding handoff</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted">
            <p>{onboardingGuide.body}</p>
            <Link
              href={onboardingGuideHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              {onboardingGuide.actionLabel}
            </Link>
            {onboardingGuide.blockers.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Current blockers</p>
                {onboardingGuide.blockers.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {metadataDescription ? (
          <Card className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">
            <CardHeader>
              <CardTitle className="text-xs uppercase tracking-[0.15em] text-muted">Admin context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted">
              <p>{metadataDescription}</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={verificationHref}
                  className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
                >
                  Continue to verification
                </Link>
                <Link
                  href={serviceAccountsHref}
                  className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
                >
                  Review service accounts
                </Link>
                <Link
                  href={playgroundHref}
                  className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
                >
                  Run a governance demo
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {sortedKeys.map((key) => {
          const rotateForm = rotateForms[key.api_key_id] ?? buildInitialRotateState(key);
          const revealedSecret = revealedSecrets[key.api_key_id];
          const isRotateOpen = expandedKeyId === key.api_key_id;
          const isRevoked = key.status === "revoked";
          const isActive = key.status === "active";

          return (
            <div key={key.api_key_id} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{key.key_prefix}</p>
                  <p className="mt-1 text-xs text-muted">Key ID: {key.api_key_id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={apiKeyStatusVariant(key.status)}>{key.status}</Badge>
                </div>
              </div>

              <p className="mt-2 text-sm text-muted">{formatScope(key.scope)}</p>
              <p className="mt-1 text-xs text-muted">{apiKeyStatusSummary(key.status)}</p>
              <p className="mt-1 text-xs text-muted">{apiKeyNextLane(key.status, key.scope)}</p>
              <p className="mt-1 text-xs text-muted">
                Service account: {key.service_account_name ?? key.service_account_id ?? "workspace default"}
              </p>
              <p className="mt-3 text-xs text-muted">Created: {formatTime(key.created_at)}</p>
              <p className="mt-1 text-xs text-muted">Last used: {formatTime(key.last_used_at)}</p>
              <p className="mt-1 text-xs text-muted">Expires: {formatTime(key.expires_at)}</p>
              {isRevoked ? <p className="mt-1 text-xs text-muted">Revoked: {formatTime(key.revoked_at)}</p> : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!isActive || revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(key.api_key_id)}
                >
                  {revokeMutation.isPending ? "Revoking..." : "Revoke"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!isActive}
                  onClick={() => {
                    setRotateForms((current) => ({
                      ...current,
                      [key.api_key_id]: current[key.api_key_id] ?? buildInitialRotateState(key),
                    }));
                    setExpandedKeyId((current) => (current === key.api_key_id ? null : key.api_key_id));
                  }}
                >
                  {isRotateOpen ? "Hide rotate form" : "Rotate"}
                </Button>
              </div>

              {isRotateOpen ? (
                <div className="mt-4 space-y-3 rounded-2xl border border-border/80 bg-card p-4">
                  <p className="text-xs uppercase tracking-[0.15em] text-muted">Rotate key</p>
                  <Input
                    placeholder="Service account ID (optional)"
                    value={rotateForm.serviceAccountId}
                    onChange={(event) =>
                      setRotateForms((current) => ({
                        ...current,
                        [key.api_key_id]: {
                          ...rotateForm,
                          serviceAccountId: event.currentTarget.value,
                        },
                      }))
                    }
                  />
                  <Input
                    placeholder="Scopes, comma separated (for example: runs:write, runs:manage)"
                    value={rotateForm.scope}
                    onChange={(event) =>
                      setRotateForms((current) => ({
                        ...current,
                        [key.api_key_id]: {
                          ...rotateForm,
                          scope: event.currentTarget.value,
                        },
                      }))
                    }
                  />
                  <Input
                    type="datetime-local"
                    value={rotateForm.expiresAt}
                    onChange={(event) =>
                      setRotateForms((current) => ({
                        ...current,
                        [key.api_key_id]: {
                          ...rotateForm,
                          expiresAt: event.currentTarget.value,
                        },
                      }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={rotateMutation.isPending}
                      onClick={() =>
                        rotateMutation.mutate({
                          apiKeyId: key.api_key_id,
                          serviceAccountId: rotateForm.serviceAccountId.trim() || undefined,
                          scope: normalizeScope(rotateForm.scope),
                          expiresAt: rotateForm.expiresAt
                            ? new Date(rotateForm.expiresAt).toISOString()
                            : null,
                        })
                      }
                    >
                      {rotateMutation.isPending ? "Rotating..." : "Rotate and reveal new secret"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setExpandedKeyId(null)}>
                      Cancel
                    </Button>
                  </div>
                  <p className="text-xs text-muted">
                    Rotation creates a replacement key and revokes the current one immediately. Use `runs:write` for
                    the first demo flow, and add `runs:manage` only if the key also needs replay or cancel actions.
                  </p>
                </div>
              ) : null}

              {revealedSecret ? (
                <div className="mt-4 rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs uppercase tracking-[0.15em] text-muted">New one-time secret</p>
                  <p className="mt-2 break-all font-mono text-sm text-foreground">{revealedSecret}</p>
                </div>
              ) : null}
            </div>
          );
        })}

      </CardContent>
    </Card>
  );
}
