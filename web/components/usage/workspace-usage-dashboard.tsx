"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { ControlPlaneAdminDeliveryUpdateKind } from "@/lib/control-plane-types";
import { buildVerificationChecklistHandoffHref } from "@/components/verification/week8-verification-checklist";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchCurrentWorkspace } from "@/services/control-plane";

type UsageSource = "admin-attention" | "admin-readiness" | "onboarding";
type DeliveryContext = "recent_activity";

function normalizeSource(source?: string | null): UsageSource | null {
  if (source === "admin-attention" || source === "admin-readiness" || source === "onboarding") {
    return source;
  }
  return null;
}

function normalizeDeliveryContext(value?: string | null): DeliveryContext | null {
  return value === "recent_activity" ? value : null;
}

function normalizeRecentTrackKey(value?: string | null): "verification" | "go_live" | null {
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
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildMetadataLines(metadata: {
  track?: "verification" | "go_live" | null;
  update?: ControlPlaneAdminDeliveryUpdateKind | null;
  evidence?: number | null;
  ownerLabel?: string | null;
}): string[] {
  const lines: string[] = [];
  if (metadata.ownerLabel) {
    lines.push(`Latest handoff owner: ${metadata.ownerLabel}`);
  }
  if (metadata.track) {
    lines.push(`Recent admin activity touched the ${metadata.track} track`);
  }
  if (metadata.update) {
    if (metadata.update === "evidence_only") {
      lines.push("Evidence links were added in this update");
    } else if (metadata.update.endsWith("_completed")) {
      lines.push("Track was marked complete");
    } else {
      lines.push("Tracking was refreshed");
    }
  }
  if (typeof metadata.evidence === "number") {
    if (metadata.evidence > 0) {
      lines.push(`${metadata.evidence} evidence ${metadata.evidence === 1 ? "link" : "links"} recorded`);
    } else {
      lines.push("No evidence links were recorded yet");
    }
  }
  return lines;
}

type ContextCard = {
  title: string;
  body: string;
  actions?: { label: string; path: string }[];
  metaLines?: string[];
};

function getContextCard(
  source: UsageSource | null,
  metadata: { summaryLines: string[]; onboardingLines?: string[] },
): ContextCard | null {
  if (!source) {
    return null;
  }
  const metaLines = [...metadata.summaryLines, ...(metadata.onboardingLines ?? [])].filter(
    (line): line is string => typeof line === "string" && line.trim() !== "",
  );
  if (source === "admin-readiness") {
    return {
      title: "Admin readiness follow-up",
      body:
        "You arrived here from the Week 8 readiness summary. This dashboard stays read-only for usage pressure—record evidence and keep navigation cues aligned with the originating focus before returning to the admin view.",
      metaLines: metaLines.length > 0 ? metaLines : undefined,
    };
  }
  if (source === "admin-attention") {
    return {
      title: "Admin queue usage follow-up",
      body:
        "You arrived here from an admin follow-up path. Use this page to confirm usage pressure, then carry that same context into verification evidence before returning to the admin queue.",
      actions: [
        { label: "Open playground run", path: "/playground" },
        { label: "Capture verification evidence", path: "/verification?surface=verification" },
        { label: "Review billing + settings", path: "/settings" },
      ],
      metaLines: metaLines.length > 0 ? metaLines : undefined,
    };
  }
  if (source === "onboarding") {
    return {
      title: "Onboarding usage checkpoint",
      body:
        "Now that the playground run is complete, confirm the resulting usage signal here, then record run_id/trace_id evidence in verification. Keep this sequence explicit so the first-demo trail stays auditable.",
      actions: [
        { label: "Back to playground run", path: "/playground" },
        { label: "Capture verification evidence", path: "/verification?surface=verification" },
        { label: "Review billing + features", path: "/settings" },
      ],
      metaLines: metaLines.length > 0 ? metaLines : undefined,
    };
  }
  return null;
}

function getFirstRunCallout(args: {
  onboardingState: {
    checklist: {
      demo_run_created: boolean;
      demo_run_succeeded: boolean;
      service_account_created: boolean;
      api_key_created: boolean;
      baseline_ready: boolean;
    };
    latest_demo_run_hint?: {
      status_label: string;
      is_terminal: boolean;
      needs_attention: boolean;
      suggested_action: string | null;
    } | null;
    delivery_guidance?: {
      verification_status: string;
      go_live_status: string;
      summary: string;
    } | null;
  } | null;
}): { title: string; body: string; metaLines: string[] } {
  const latestDemoRunHint = args.onboardingState?.latest_demo_run_hint ?? null;
  const deliveryGuidance = args.onboardingState?.delivery_guidance ?? null;
  const metaLines = [
    latestDemoRunHint?.status_label,
    latestDemoRunHint?.suggested_action,
    deliveryGuidance?.summary,
  ].filter((line): line is string => typeof line === "string" && line.trim() !== "");

  if (latestDemoRunHint?.needs_attention) {
    return {
      title: latestDemoRunHint.is_terminal ? "Recover the latest demo signal" : "Monitor the latest demo signal",
      body:
        latestDemoRunHint.suggested_action ??
        "Keep the first demo run under observation until it settles, then capture verification evidence.",
      metaLines,
    };
  }

  if (args.onboardingState?.checklist.demo_run_succeeded) {
    return {
      title: "Governed first demo signal",
      body:
        deliveryGuidance?.summary ??
        "A successful first run should leave a usage trace we can point to in the Week 8 checklist. Confirm `billing_summary` shows the assigned plan, run a workspace demo through the Playground, and capture the `run_id`/`trace_id` before moving to verification or API key follow-up.",
      metaLines,
    };
  }

  if (args.onboardingState?.checklist.demo_run_created) {
    return {
      title: "Governed first demo signal",
      body:
        latestDemoRunHint?.status_label ??
        "A demo run exists. Use it as the first governed usage trace, then continue into verification evidence capture.",
      metaLines,
    };
  }

  return {
    title: "Governed first demo signal",
    body:
      "A successful first run should leave a usage trace we can point to in the Week 8 checklist. Confirm `billing_summary` shows the assigned plan, run a workspace demo through the Playground, and capture the `run_id`/`trace_id` before moving to verification or API key follow-up.",
    metaLines,
  };
}

function formatPrice(monthlyPriceCents: number): string {
  if (monthlyPriceCents <= 0) {
    return "Custom / free";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(monthlyPriceCents / 100);
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString();
}

function formatMetricLabel(key: string): string {
  switch (key) {
    case "runs_created":
      return "Runs created";
    case "active_tool_providers":
      return "Active tool providers";
    case "artifact_storage_bytes":
      return "Artifact storage";
    default:
      return key.replaceAll("_", " ");
  }
}

function formatMetricValue(key: string, value: number): string {
  if (key !== "artifact_storage_bytes") {
    return String(value);
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatPercent(used: number, limit: number | null): number {
  if (!limit || limit <= 0) {
    return 0;
  }
  return Math.min(100, (used / limit) * 100);
}

function statusToneClasses(tone?: string): string {
  if (tone === "warning") {
    return "border-amber-500 bg-amber-50/90";
  }
  if (tone === "positive") {
    return "border-emerald-400 bg-emerald-50/70";
  }
  return "border-border bg-background";
}

function statusToneBadgeVariant(tone?: string): "strong" | "default" | "subtle" {
  if (tone === "warning") {
    return "default";
  }
  if (tone === "positive") {
    return "strong";
  }
  return "subtle";
}

function billingActionHelpText(args: {
  availability?: string;
  provider?: string | null;
  selfServeEnabled?: boolean;
}): string {
  const normalizedProvider = (args.provider ?? "").toLowerCase();
  const providerIsMock = normalizedProvider === "mock_checkout" || normalizedProvider === "mock";
  if (providerIsMock) {
    return "Mock checkout is a test-only fallback; rely on Stripe when it is enabled for production self-serve.";
  }
  const provider = (args.provider ?? "").toLowerCase();
  if (args.availability === "ready" && provider === "stripe") {
    return "Self-serve is live through Stripe-hosted checkout and portal flows.";
  }
  if (args.availability === "ready") {
    return "This action is available now for workspace operators in the current billing provider flow.";
  }
  if (args.selfServeEnabled) {
    return "Billing is enabled, but this action is temporarily unavailable. Retry after the provider state refreshes.";
  }
  return "Self-serve billing is not enabled for this workspace yet. Use the configured workspace-managed fallback path.";
}

function isEnabledFeature(value: unknown): boolean {
  return value === true;
}

export function WorkspaceUsageDashboard({
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
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["workspace-usage-dashboard", workspaceSlug],
    queryFn: fetchCurrentWorkspace,
  });

  const normalizedSource = normalizeSource(source);
  const onboardingState = data?.onboarding ?? null;
  const latestDemoRunHint = onboardingState?.latest_demo_run_hint ?? null;
  const deliveryGuidance = onboardingState?.delivery_guidance ?? null;
  const contextCard = getContextCard(normalizedSource, {
    summaryLines: buildMetadataLines({
      track: normalizeRecentTrackKey(recentTrackKey),
      update: normalizeRecentUpdateKind(recentUpdateKind),
      evidence: evidenceCount ?? normalizeEvidenceCount(evidenceCount),
      ownerLabel: recentOwnerLabel,
    }),
    onboardingLines: [latestDemoRunHint?.status_label, latestDemoRunHint?.suggested_action, deliveryGuidance?.summary].filter(
      (line): line is string => typeof line === "string" && line.trim().length > 0,
    ),
  });
  const firstRunCallout = getFirstRunCallout({ onboardingState });
  const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>[0], "pathname"> = {
    source: normalizedSource,
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    deliveryContext: normalizeDeliveryContext(deliveryContext),
    recentTrackKey: normalizeRecentTrackKey(recentTrackKey),
    recentUpdateKind: normalizeRecentUpdateKind(recentUpdateKind),
    evidenceCount,
    recentOwnerLabel,
  };

  const workspace = data?.workspace;
  const plan = data?.plan;
  const billingSummary = data?.billing_summary;
  const usage = data?.usage;
  const metrics = usage ? Object.entries(usage.metrics) : [];
  const overLimitMetrics = metrics.filter(([, metric]) => metric.over_limit);
  const planLimitEntries = Object.entries(plan?.limits ?? {});
  const featureEntries = Object.entries(plan?.features ?? {});
  const enabledFeatures = featureEntries.filter(([, value]) => isEnabledFeature(value));
  const disabledFeatures = featureEntries.filter(([, value]) => !isEnabledFeature(value));
  const overLimitMetricLabels = overLimitMetrics.map(([metric]) => formatMetricLabel(metric));
  const usageWindowLabel = usage ? `${formatDate(usage.period_start)} to ${formatDate(usage.period_end)}` : "-";
  const billingActionHref = billingSummary?.action?.href ?? "/settings?intent=manage-plan";
  const verificationHref = buildVerificationChecklistHandoffHref({
    pathname: "/verification?surface=verification",
    ...handoffHrefArgs,
  });
  const artifactsHref = buildVerificationChecklistHandoffHref({ pathname: "/artifacts", ...handoffHrefArgs });
  const settingsHref = buildVerificationChecklistHandoffHref({ pathname: "/settings", ...handoffHrefArgs });
  const adminHref = buildVerificationChecklistHandoffHref({ pathname: "/admin", ...handoffHrefArgs });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{firstRunCallout.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted">{firstRunCallout.body}</p>
          {firstRunCallout.metaLines.length > 0 ? (
            <div className="space-y-1 rounded-xl border border-border bg-background p-3 text-xs text-muted">
              {firstRunCallout.metaLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/playground", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 1: Run in playground
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/verification?surface=verification", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 3: Capture verification evidence
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/api-keys", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Optional: Review API key scopes
            </Link>
          </div>
          <p className="text-xs text-muted">Step 2 happens on this page: confirm the run appears in usage metrics before documenting evidence.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Evidence relay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted">
            Once usage confirms the first-run signal, carry the same workspace context into verification, artifacts,
            and then back into settings or admin review as needed. This relay stays manual so the evidence trail is
            explicit and reusable during Week 8 readiness review.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={verificationHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Capture verification evidence
            </Link>
            <Link
              href={artifactsHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review artifacts
            </Link>
            <Link
              href={settingsHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review settings posture
            </Link>
            <Link
              href={adminHref}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
            >
              Return to admin overview
            </Link>
          </div>
          <p className="text-xs text-muted">
            Navigation only: this handoff preserves workspace context, but it does not auto-attach evidence or resolve
            billing or rollout issues for you.
          </p>
        </CardContent>
      </Card>
      {contextCard ? (
        <Card>
          <CardHeader>
            <CardTitle>{contextCard.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted">{contextCard.body}</p>
            {contextCard.metaLines?.length ? (
              <div className="space-y-1">
                {contextCard.metaLines.map((line) => (
                  <p key={line} className="text-xs text-muted">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
            {contextCard.actions?.length ? (
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
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Plan limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-xl border border-border bg-background px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted">Current usage window</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{usageWindowLabel}</p>
            <p className="mt-1 text-xs text-muted">
              Carry this billing window into verification evidence when documenting usage pressure, upgrade follow-up,
              or onboarding readiness.
            </p>
          </div>
          {planLimitEntries.length === 0 ? (
            <p className="text-muted text-xs">Plan limits are not available in this workspace.</p>
          ) : (
            <div className="space-y-2">
              {planLimitEntries.map(([metric, limit]) => (
                (() => {
                  const numericLimit = typeof limit === "number" ? limit : null;
                  return (
                    <div
                      key={metric}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                    >
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted">{formatMetricLabel(metric)}</p>
                        <p className="text-sm font-semibold text-foreground">{String(limit ?? "Unlimited")}</p>
                      </div>
                      <p className="text-xs text-muted">
                        {formatPercent(usage?.metrics[metric]?.used ?? 0, numericLimit)}% used
                      </p>
                    </div>
                  );
                })()
              ))}
            </div>
          )}
          <p className="text-xs text-muted">
            {overLimitMetricLabels.length > 0
              ? `Usage ledger shows ${overLimitMetricLabels.join(", ")} exceeding the plan limit. Capture the evidence, then resolve the gap through Settings or the admin lane.`
              : "Usage ledger stays within these limits for now; keep monitoring before the next billing cycle."}
          </p>
          {overLimitMetricLabels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={billingActionHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Resolve plan limits in settings
              </Link>
              <Link
                href={verificationHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Capture over-limit evidence
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Usage metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {metrics.length === 0 ? (
            <p className="text-muted text-xs">No usage metrics available yet.</p>
          ) : (
            <div className="space-y-2">
              {metrics.map(([key, metric]) => (
                <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted">{formatMetricLabel(key)}</p>
                    <p className="text-sm font-semibold text-foreground">{formatMetricValue(key, metric.used)}</p>
                  </div>
                  <div className="text-xs text-muted">
                    {metric.over_limit ? "Over limit" : `${formatPercent(metric.used, metric.limit)}% of limit`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Billing posture and window</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {billingSummary ? (
            <div className={`rounded-2xl border p-4 ${statusToneClasses(billingSummary.status_tone)}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Billing status</p>
                  <p className="mt-1 text-base font-semibold text-foreground">{billingSummary.status_label}</p>
                </div>
                <Badge variant={statusToneBadgeVariant(billingSummary.status_tone)}>
                  {billingSummary.status}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted">{billingSummary.description}</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <p className="text-xs text-muted">Provider: {billingSummary.provider}</p>
                <p className="text-xs text-muted">
                  Plan binding: {billingSummary.plan_display_name ?? "Unassigned"} ({billingSummary.plan_code ?? "-"})
                </p>
                <p className="text-xs text-muted">Current billing window: {usageWindowLabel}</p>
                <p className="text-xs text-muted">
                  Next action: {billingSummary.action ? billingSummary.action.label : "Billing action not available"}
                </p>
                <p className="text-xs text-muted">
                  {billingActionHelpText({
                    availability: billingSummary.action?.availability,
                    provider: billingSummary.provider,
                    selfServeEnabled: billingSummary.self_serve_enabled,
                  })}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-muted text-xs">Billing summary is unavailable for this workspace.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
