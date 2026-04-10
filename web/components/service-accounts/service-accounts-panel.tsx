"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildVerificationChecklistHandoffHref } from "@/lib/handoff-query";
import { ControlPlaneRequestError, disableServiceAccount, fetchCurrentWorkspace, fetchServiceAccounts } from "@/services/control-plane";

type HandoffSource = "admin-attention" | "admin-readiness" | "onboarding";
type HandoffQuery = {
  source?: HandoffSource | null;
  runId?: string | null;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  deliveryContext?: string | null;
  recentTrackKey?: "verification" | "go_live" | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | null;
  recentOwnerLabel?: string | null;
  recentOwnerDisplayName?: string | null;
  recentOwnerEmail?: string | null;
};
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

function buildContextLines(params: {
  ownerLabel?: string | null;
  ownerDisplayName?: string | null;
  ownerEmail?: string | null;
  recentTrackKey?: "verification" | "go_live" | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | null;
}): string[] {
  const lines: string[] = [];
  const ownerSummary =
    params.ownerDisplayName && params.ownerEmail
      ? `${params.ownerDisplayName} <${params.ownerEmail}>`
      : params.ownerDisplayName ?? params.ownerEmail ?? params.ownerLabel ?? null;
  if (ownerSummary) {
    lines.push(`Latest handoff owner: ${ownerSummary}`);
  }
  if (params.recentTrackKey) {
    const label = params.recentTrackKey === "go_live" ? "go-live" : "verification";
    lines.push(`Recent delivery tracked the ${label} surface`);
  }
  if (params.recentUpdateKind) {
    const phrase = params.recentUpdateKind.replaceAll("_", " ");
    lines.push(`Delivery update noted: ${phrase}`);
  }
  if (typeof params.evidenceCount === "number") {
    lines.push(
      params.evidenceCount > 0
        ? `${params.evidenceCount} evidence ${params.evidenceCount === 1 ? "link" : "links"} recorded`
        : "No evidence links yet",
    );
  }
  return lines;
}

function getContextCard(source: HandoffSource | null, lines: string[]): { title: string; body: string; actions: Array<{ label: string; path: string }>; metaLines?: string[] } | null {
  if (!source) {
    return null;
  }
  if (source === "admin-readiness") {
    return {
      title: "Admin readiness follow-up",
      body:
        "You followed the Week 8 readiness focus. Keep this page navigation-only while confirming service accounts, billing, or verification evidence before returning to the admin snapshot.",
      actions: [
        { label: "Return to verification", path: "/verification?surface=verification" },
        { label: "Continue to playground", path: "/playground" },
      ],
      metaLines: lines.length ? lines : undefined,
    };
  }
  if (source === "admin-attention") {
    return {
      title: "Admin queue follow-up",
      body: "You’re tracking a workspace in the admin attention queue. Review service accounts then manually continue into the pending verification, usage, or API key surfaces before returning to the queue.",
      actions: [
        { label: "Open verification", path: "/verification?surface=verification" },
        { label: "Inspect API keys", path: "/api-keys" },
      ],
      metaLines: lines.length ? lines : undefined,
    };
  }
  if (source === "onboarding") {
    return {
      title: "Onboarding guidance",
      body:
        "You arrived here via onboarding. Create the first service account, keep the scope narrow, and then use the workspace playground and verification pages to capture the evidence trace.",
      actions: [
        { label: "Run a playground demo", path: "/playground" },
        { label: "Capture verification evidence", path: "/verification?surface=verification" },
      ],
      metaLines: lines.length ? lines : undefined,
    };
  }
  return null;
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

function credentialCoverage(active?: number | null, total?: number | null): string | null {
  if (total == null || total <= 0) {
    return null;
  }
  const act = active ?? 0;
  const historical = Math.max(total - act, 0);
  if (historical <= 0) {
    return `${act} active`;
  }
  return `${act} active · ${historical} historical`;
}

function coverageNote(value: string | null): string {
  return value ? ` Current coverage: ${value}.` : "";
}

function hasHistoricalOnly(total?: number | null, active?: number | null): boolean {
  if (total == null || active == null) {
    return false;
  }
  return total > 0 && active === 0;
}

function getServiceAccountsGuide(args: {
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
      service_accounts_total: number;
      active_service_accounts_total: number;
    } | null;
  } | null;
}): { title: string; body: string; actionLabel: string; actionSurface: OnboardingSurface; blockers: string[] } {
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
  const coverage = credentialCoverage(
    args.onboarding?.summary?.active_service_accounts_total ?? null,
    args.onboarding?.summary?.service_accounts_total ?? null,
  );
  const coverageLine = coverage ? coverageNote(coverage) : "";
  const historicalOnly = hasHistoricalOnly(
    args.onboarding?.summary?.service_accounts_total ?? null,
    args.onboarding?.summary?.active_service_accounts_total ?? null,
  );

  if (args.onboarding?.recommended_next_surface && args.onboarding.recommended_next_surface !== "service_accounts") {
    return {
      title: "Onboarding handoff",
      body:
        `${args.onboarding.recommended_next_reason ??
          "Service account step is done or not the critical blocker. Continue with the recommended next surface."}${coverageLine}`,
      actionLabel: args.onboarding.recommended_next_action ?? "Continue onboarding",
      actionSurface: args.onboarding.recommended_next_surface,
      blockers,
    };
  }

  if (args.onboarding?.checklist.api_key_created !== true) {
    return {
      title: "Onboarding handoff",
      body:
        `After creating a service account, mint a first API key to unlock Playground demo runs.${coverageLine}`,
      actionLabel: "Create API key",
      actionSurface: "api_keys",
      blockers,
    };
  }
  if (args.onboarding?.checklist.demo_run_succeeded !== true) {
    return {
      title: "Onboarding handoff",
      body: historicalOnly
        ? `Only historical or disabled service accounts remain. Create a new active machine identity before you treat Playground as ready.${coverageLine}`
        : `Credentials are ready. Use Playground to create or confirm the first successful demo run.${coverageLine}`,
      actionLabel: "Run first demo",
      actionSurface: "playground",
      blockers,
    };
  }
  return {
    title: "Onboarding handoff",
    body: "First demo has succeeded. Capture verification evidence to close the onboarding loop.",
    actionLabel: "Capture verification evidence",
    actionSurface: "verification",
    blockers,
  };
}

function formatServiceAccountDisableError(error: unknown): string {
  if (error instanceof ControlPlaneRequestError) {
    if (error.message) {
      return `Service account disable failed: ${error.message}`;
    }
    return `Service account disable failed (${error.code}).`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Service account disable failed. Check workspace permissions and retry.";
}

type ServiceAccountsPanelProps = {
  workspaceSlug: string;
  source?: HandoffSource | string | null;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  deliveryContext?: string | null;
  recentTrackKey?: "verification" | "go_live" | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | null;
  recentOwnerLabel?: string | null;
  recentOwnerDisplayName?: string | null;
  recentOwnerEmail?: string | null;
};

function formatTime(value: string | null): string {
  if (!value) {
    return "never";
  }

  return new Date(value).toLocaleString();
}

function serviceAccountStatusVariant(status: string): "strong" | "default" | "subtle" {
  if (status === "active") {
    return "strong";
  }
  if (status === "disabled") {
    return "subtle";
  }
  return "default";
}

function serviceAccountStatusSummary(status: string): string {
  if (status === "active") {
    return "This identity can still back key issuance and governed runtime attachment for the workspace.";
  }
  if (status === "disabled") {
    return "This identity is historical or intentionally stopped. Existing keys may still need separate manual review.";
  }
  return "This identity needs manual review before it is treated as ready for another workspace lane.";
}

function serviceAccountNextLane(status: string): string {
  if (status === "active") {
    return "Next lane: issue or review API keys, then continue through Playground, Usage, and Verification.";
  }
  if (status === "disabled") {
    return "Next lane: review surviving API keys and keep only the historical evidence you still need.";
  }
  return "Next lane: confirm identity intent and continue through the matching manual workspace surface.";
}

export function ServiceAccountsPanel({
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
}: ServiceAccountsPanelProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["workspace-service-accounts", workspaceSlug],
    queryFn: fetchServiceAccounts,
  });
  const workspaceQuery = useQuery({
    queryKey: ["workspace-onboarding-state", workspaceSlug],
    queryFn: fetchCurrentWorkspace,
  });

  const serviceAccounts = data ?? [];
  const [actionError, setActionError] = useState<string | null>(null);
  const disableMutation = useMutation({
    onMutate: () => {
      setActionError(null);
    },
    mutationFn: (serviceAccountId: string) => disableServiceAccount(serviceAccountId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace-service-accounts", workspaceSlug],
      });
      setActionError(null);
    },
    onError: (error: unknown) => {
      setActionError(formatServiceAccountDisableError(error));
    },
  });

  const normalizedSource: HandoffSource | null =
    source === "admin-attention" || source === "admin-readiness" || source === "onboarding"
      ? source
      : null;
  const metadataLines = buildContextLines({
    ownerLabel: recentOwnerLabel,
    ownerDisplayName: recentOwnerDisplayName,
    ownerEmail: recentOwnerEmail,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
  });
  const contextCard = getContextCard(normalizedSource, metadataLines);
  const latestDemoRun = workspaceQuery.data?.onboarding?.latest_demo_run ?? null;
  const activeRunId = latestDemoRun?.run_id ?? null;
  const handoffHrefArgs: HandoffQuery = {
    source: normalizedSource,
    runId: activeRunId,
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
  };
  const onboardingGuide = getServiceAccountsGuide({
    onboarding: workspaceQuery.data?.onboarding ?? null,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Service accounts</CardTitle>
        <CardDescription>Machine identities used to bind API keys and runtime traffic.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted">
          The first service account usually backs your onboarding demo or any workspace-scoped runtime call. Pair it with
          an API key scoped to `runs:write`; add approvals, cancel/replay, A2A, or MCP scopes later as needed.
        </p>
          {contextCard ? (
            <Card className="rounded-2xl border border-border bg-background p-4">
              <CardHeader>
                <CardTitle>{contextCard.title}</CardTitle>
              </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted">{contextCard.body}</p>
              {contextCard.metaLines ? (
                <div className="space-y-1 text-[0.65rem] text-muted">
                  {contextCard.metaLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {contextCard.actions.map((action) => (
                  <Link
                    key={action.label}
                    href={buildVerificationChecklistHandoffHref({ pathname: action.path, ...handoffHrefArgs })}
                    className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            <p className="text-xs text-muted">
              These links preserve the admin handoff navigation context without impersonation, automation, or support tooling.
            </p>
          </CardContent>
        </Card>
        ) : null}
        <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted">
          <p className="font-medium text-foreground">Audit export continuity</p>
          <p className="mt-1">
            Governance roles should reopen the Latest export receipt from <code className="font-mono">/settings?intent=upgrade</code> to keep the filename, filters, and SHA-256 attached to verification, go-live, and the return to admin oversight.
          </p>
          <p className="mt-1">
            This is a navigation-only manual relay; these links maintain the workspace context but do not automatically attach the receipt or finalize rollout steps for you.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={buildVerificationChecklistHandoffHref({
                pathname: "/settings?intent=upgrade",
                ...handoffHrefArgs,
              })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen audit export receipt
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({
                pathname: "/verification?surface=verification",
                ...handoffHrefArgs,
              })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Capture verification evidence
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({
                pathname: "/go-live?surface=go_live",
                ...handoffHrefArgs,
              })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen go-live drill
            </Link>
          </div>
        </div>
        <Card className="rounded-2xl border border-border bg-card p-4">
          <CardHeader>
            <CardTitle>{onboardingGuide.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted">{onboardingGuide.body}</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildVerificationChecklistHandoffHref({ pathname: toSurfacePath(onboardingGuide.actionSurface), ...handoffHrefArgs })}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                {onboardingGuide.actionLabel}
              </Link>
            </div>
            {onboardingGuide.blockers.length > 0 ? (
              <div className="space-y-1 text-xs text-muted">
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Current blockers</p>
                {onboardingGuide.blockers.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
        <p className="text-sm text-muted">
          Use the governance path below to keep the evidence trace connected—service accounts, api keys, and playground runs all stay within the same navigation context.
        </p>
        {isLoading ? <p className="text-sm text-muted">Loading service accounts...</p> : null}
        {isError ? (
          <p className="text-sm text-muted">Service accounts endpoint unavailable, showing fallback state.</p>
        ) : null}
        {!isLoading && serviceAccounts.length === 0 ? (
          <p className="text-sm text-muted">No service accounts found for this workspace yet.</p>
        ) : null}
        <Card className="rounded-2xl border border-border bg-background p-4">
          <p className="font-medium text-foreground">First-run governance path</p>
          <p className="mt-1 text-xs text-muted">
            Pair the key with a workspace service account, then use `/playground` to submit the first `runs:write` request. Capture the `run_id` and reference it in `/usage` or `/verification` so the Week 8 checklist can see the trace.
          </p>
          <p className="mt-1 text-xs text-muted">
            When usage metrics look healthy, capture verification evidence and rehearse the go-live drill so the evidence path stays intact before you return to the admin lane.
          </p>
          <p className="mt-1 text-xs text-muted">
            When you need replay, cancel, approval, A2A send/cancel, or MCP calls, incrementally add the matching scopes (`runs:manage`, `approvals:write`, `a2a:write`, `mcp:call`) for the same key or rotate to a new one. Keep the scope list narrow—each permission should align with a real workflow.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/service-accounts", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review service accounts
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/playground", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Run a verification demo
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({
                pathname: "/verification?surface=verification",
                ...handoffHrefArgs,
              })}
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
              `active` means the service account can still participate in the governed credential path. `disabled`
              means the identity should be treated as stopped or historical, with any surviving keys reviewed
              separately. Any other state should be handled as manual-review territory.
            </p>
          </CardContent>
        </Card>

        {serviceAccounts.map((serviceAccount) => (
          <div
            key={serviceAccount.service_account_id}
            className="rounded-2xl border border-border bg-background p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{serviceAccount.name}</p>
                <p className="mt-1 text-xs text-muted">{serviceAccount.service_account_id}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="subtle">{serviceAccount.role}</Badge>
                <Badge variant={serviceAccountStatusVariant(serviceAccount.status)}>
                  {serviceAccount.status}
                </Badge>
              </div>
            </div>
            {serviceAccount.description ? (
              <p className="mt-2 text-sm text-muted">{serviceAccount.description}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted">{serviceAccountStatusSummary(serviceAccount.status)}</p>
            <p className="mt-1 text-xs text-muted">{serviceAccountNextLane(serviceAccount.status)}</p>
            {serviceAccount.status === "active" ? (
              <p className="mt-2 text-xs text-muted">
                Disabling this identity blocks future key issuance and new runtime attachment, but does not auto-revoke
                existing API keys that were already created under it.
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted">
                This identity is disabled. Existing historical keys may still need separate revocation if they should
                stop working immediately.
              </p>
            )}
            <p className="mt-3 text-xs text-muted">Created: {formatTime(serviceAccount.created_at)}</p>
            <p className="mt-1 text-xs text-muted">Last used: {formatTime(serviceAccount.last_used_at)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  serviceAccount.status !== "active" ||
                  (disableMutation.isPending &&
                    disableMutation.variables === serviceAccount.service_account_id)
                }
                onClick={() => disableMutation.mutate(serviceAccount.service_account_id)}
              >
                {disableMutation.isPending && disableMutation.variables === serviceAccount.service_account_id
                  ? "Disabling…"
                  : "Disable"}
              </Button>
            </div>
          </div>
        ))}
        {actionError ? <p className="text-xs text-red-600">{actionError}</p> : null}
      </CardContent>
    </Card>
  );
}
