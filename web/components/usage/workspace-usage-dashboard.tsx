"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AuditExportReceiptCallout } from "@/components/audit-export-receipt-callout";
import { Button } from "@/components/ui/button";
import type {
  ControlPlaneAdminDeliveryUpdateKind,
  ControlPlaneWorkspaceDeliveryTrack,
  ControlPlaneWorkspaceDeliveryTrackUpsert,
} from "@/lib/control-plane-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveAuditExportReceiptSummary } from "@/lib/audit-export-receipt";
import { buildAdminReturnHref, buildVerificationChecklistHandoffHref } from "@/lib/handoff-query";
import {
  fetchCurrentWorkspace,
  fetchWorkspaceDeliveryTrack,
  saveWorkspaceDeliveryTrack,
} from "@/services/control-plane";

type UsageSource = "admin-attention" | "admin-readiness" | "onboarding";
type DeliveryContext = "recent_activity" | "week8";

function normalizeSource(source?: string | null): UsageSource | null {
  if (source === "admin-attention" || source === "admin-readiness" || source === "onboarding") {
    return source;
  }
  return null;
}

function normalizeDeliveryContext(value?: string | null): DeliveryContext | null {
  return value === "recent_activity" || value === "week8" ? value : null;
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
  ownerDisplayName?: string | null;
  ownerEmail?: string | null;
}): string[] {
  const lines: string[] = [];
  const ownerSummary = metadata.ownerDisplayName ?? metadata.ownerEmail ?? metadata.ownerLabel ?? null;
  if (ownerSummary) {
    lines.push(`Latest handoff owner: ${ownerSummary}`);
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

function formatTrackLabel(track?: "verification" | "go_live" | null): string {
  return track === "go_live" ? "go-live" : "verification";
}

function buildPlanLimitFollowUpSummary(args: {
  overLimitMetricLabels: string[];
  recentTrackKey?: "verification" | "go_live" | null;
  recentUpdateKind?: ControlPlaneAdminDeliveryUpdateKind | null;
  evidenceCount?: number | null;
}): string | null {
  if (args.overLimitMetricLabels.length === 0 || !args.recentTrackKey) {
    return null;
  }

  if ((args.evidenceCount ?? 0) > 0) {
    return `${
      args.evidenceCount
    } evidence ${
      args.evidenceCount === 1 ? "link was" : "links were"
    } already recorded on the ${formatTrackLabel(args.recentTrackKey)} track. Re-check whether the plan gap is resolved before returning to admin.`;
  }

  if (
    args.recentUpdateKind === "verification" ||
    args.recentUpdateKind === "go_live" ||
    args.recentUpdateKind === "verification_completed" ||
    args.recentUpdateKind === "go_live_completed" ||
    args.recentUpdateKind === "evidence_only"
  ) {
    return `Recent admin activity already touched the ${formatTrackLabel(args.recentTrackKey)} track. Re-check whether the plan gap is resolved before returning to admin.`;
  }

  return null;
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
        { label: "Review billing + settings", path: "/settings?intent=manage-plan" },
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
        { label: "Review billing + features", path: "/settings?intent=manage-plan" },
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
  selfServeReasonCode?: string | null;
}): string {
  if (args.selfServeReasonCode === "billing_self_serve_not_configured") {
    return "Contract: billing_self_serve_not_configured. Configure Stripe-backed self-serve before operators rely on in-product upgrade, portal, or renewal recovery.";
  }
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

function formatSelfServeSetupNotice(reasonCode?: string | null): string | null {
  if (reasonCode !== "billing_self_serve_not_configured") {
    return null;
  }
  return "Stripe-backed production self-serve is not configured for this workspace yet. This dashboard can still carry evidence into verification and settings, but operators should not expect in-product upgrade or portal flows until Stripe is enabled.";
}

function isEnabledFeature(value: unknown): boolean {
  return value === true;
}

const USAGE_PLAN_GAP_NOTE_PREFIX = "Usage plan gap acknowledged:";

function buildDeliveryTrackSectionInput(
  section?: ControlPlaneWorkspaceDeliveryTrack["verification"],
): ControlPlaneWorkspaceDeliveryTrackUpsert["verification"] {
  return {
    status: section?.status ?? "pending",
    owner_user_id: section?.owner_user_id ?? null,
    notes: section?.notes ?? null,
    evidence_links: section?.evidence_links ?? [],
  };
}

function buildUsagePlanGapNote(args: {
  overLimitMetricLabels: string[];
  usageWindowLabel: string;
}): string {
  return `${USAGE_PLAN_GAP_NOTE_PREFIX} ${args.overLimitMetricLabels.join(", ")} exceeded the current plan limit during ${args.usageWindowLabel}. Review Settings follow-up and keep verification evidence aligned with this usage window.`;
}

function mergeUsagePlanGapNote(existingNotes: string | null | undefined, planGapNote: string): string {
  const trimmed = existingNotes?.trim() ?? "";
  if (!trimmed) {
    return planGapNote;
  }
  if (trimmed.includes(planGapNote)) {
    return trimmed;
  }
  return `${trimmed}\n\n${planGapNote}`;
}

export function WorkspaceUsageDashboard({
  workspaceSlug,
  source,
  runId,
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
  auditReceiptFilename,
  auditReceiptExportedAt,
  auditReceiptFromDate,
  auditReceiptToDate,
  auditReceiptSha256,
}: {
  workspaceSlug: string;
  source?: string | null;
  runId?: string | null;
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
  auditReceiptFilename?: string | null;
  auditReceiptExportedAt?: string | null;
  auditReceiptFromDate?: string | null;
  auditReceiptToDate?: string | null;
  auditReceiptSha256?: string | null;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["workspace-usage-dashboard", workspaceSlug],
    queryFn: fetchCurrentWorkspace,
  });
  const queryClient = useQueryClient();
  const deliveryTrackQueryKey = ["workspace-delivery-track", workspaceSlug];
  const { data: deliveryTrack } = useQuery({
    queryKey: deliveryTrackQueryKey,
    queryFn: fetchWorkspaceDeliveryTrack,
  });

  const normalizedSource = normalizeSource(source);
  const normalizedRecentTrackKey = normalizeRecentTrackKey(recentTrackKey);
  const normalizedRecentUpdateKind = normalizeRecentUpdateKind(recentUpdateKind);
  const normalizedEvidenceCount = normalizeEvidenceCount(evidenceCount);
  const onboardingState = data?.onboarding ?? null;
  const latestDemoRun = onboardingState?.latest_demo_run ?? null;
  const activeRunId = latestDemoRun?.run_id ?? runId ?? null;
  const latestDemoRunHint = onboardingState?.latest_demo_run_hint ?? null;
  const deliveryGuidance = onboardingState?.delivery_guidance ?? null;
  const contextCard = getContextCard(normalizedSource, {
    summaryLines: buildMetadataLines({
      track: normalizedRecentTrackKey,
      update: normalizedRecentUpdateKind,
      evidence: normalizedEvidenceCount,
      ownerLabel: recentOwnerLabel,
      ownerDisplayName: recentOwnerDisplayName,
      ownerEmail: recentOwnerEmail,
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
    recentTrackKey: normalizedRecentTrackKey,
    recentUpdateKind: normalizedRecentUpdateKind,
    evidenceCount: normalizedEvidenceCount,
    recentOwnerLabel,
    recentOwnerDisplayName,
    recentOwnerEmail,
    auditReceiptFilename,
    auditReceiptExportedAt,
    auditReceiptFromDate,
    auditReceiptToDate,
    auditReceiptSha256,
  };
  const buildRunAwareUsageHref = (pathname: string): string =>
    buildVerificationChecklistHandoffHref({ pathname, ...handoffHrefArgs, runId: activeRunId });
  const auditExportReceipt = resolveAuditExportReceiptSummary({
    auditReceiptFilename,
    auditReceiptExportedAt,
    auditReceiptFromDate,
    auditReceiptToDate,
    auditReceiptSha256,
  });

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
  const planLimitFollowUpSummary = buildPlanLimitFollowUpSummary({
    overLimitMetricLabels,
    recentTrackKey: normalizedRecentTrackKey,
    recentUpdateKind: normalizedRecentUpdateKind,
    evidenceCount: normalizedEvidenceCount,
  });
  const planLimitEvidenceActionLabel =
    normalizedRecentUpdateKind === "evidence_only" || (normalizedEvidenceCount ?? 0) > 0
      ? "Refresh over-limit evidence"
      : "Capture over-limit evidence";
  const usageWindowLabel = usage ? `${formatDate(usage.period_start)} to ${formatDate(usage.period_end)}` : "-";
  const billingActionHref = billingSummary?.action?.href ?? "/settings?intent=manage-plan";
  const verificationHref = buildRunAwareUsageHref("/verification?surface=verification");
  const artifactsHref = buildRunAwareUsageHref("/artifacts");
  const settingsHref = buildRunAwareUsageHref("/settings?intent=manage-plan");
  const settingsUpgradeHref = buildRunAwareUsageHref("/settings?intent=upgrade");
  const verificationDelivery = deliveryTrack?.verification;
  const goLiveDelivery = deliveryTrack?.go_live;
  const usagePlanGapNote =
    overLimitMetricLabels.length > 0
      ? buildUsagePlanGapNote({
          overLimitMetricLabels,
          usageWindowLabel,
        })
      : null;
  const usagePlanGapAcknowledged =
    typeof verificationDelivery?.notes === "string" &&
    verificationDelivery.notes.includes(USAGE_PLAN_GAP_NOTE_PREFIX);
  const adminHref = buildAdminReturnHref("/admin", {
    source: normalizedSource,
    runId: activeRunId,
    queueSurface: normalizedRecentTrackKey,
    week8Focus,
    attentionWorkspace: attentionWorkspace ?? workspaceSlug,
    attentionOrganization,
    deliveryContext: normalizeDeliveryContext(deliveryContext),
    recentTrackKey: normalizedRecentTrackKey,
    recentUpdateKind: normalizedRecentUpdateKind,
    evidenceCount: normalizedEvidenceCount,
    recentOwnerLabel,
    recentOwnerDisplayName,
    recentOwnerEmail,
    auditReceiptFilename,
    auditReceiptExportedAt,
    auditReceiptFromDate,
    auditReceiptToDate,
    auditReceiptSha256,
  });
  const adminReturnLabel =
    normalizedSource === "admin-attention"
      ? "Return to admin queue"
      : normalizedSource === "admin-readiness"
        ? "Return to admin readiness view"
        : "Return to admin overview";
  const adminReturnActionsHref = "#usage-admin-return-actions";
  const selfServeSetupNotice = formatSelfServeSetupNotice(billingSummary?.self_serve_reason_code ?? null);
  const [planGapNotice, setPlanGapNotice] = useState<string | null>(null);
  const [planGapError, setPlanGapError] = useState<string | null>(null);
  const acknowledgePlanGapMutation = useMutation({
    mutationFn: async () => {
      if (!usagePlanGapNote) {
        throw new Error("No over-limit usage gap is available to acknowledge.");
      }
      const payload: ControlPlaneWorkspaceDeliveryTrackUpsert = {
        verification: {
          ...buildDeliveryTrackSectionInput(verificationDelivery),
          status: verificationDelivery?.status === "complete" ? "complete" : "in_progress",
          notes: mergeUsagePlanGapNote(verificationDelivery?.notes, usagePlanGapNote),
        },
        go_live: buildDeliveryTrackSectionInput(goLiveDelivery),
      };
      return saveWorkspaceDeliveryTrack(payload);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(deliveryTrackQueryKey, updated);
      setPlanGapError(null);
      setPlanGapNotice("Usage plan gap recorded in verification delivery track.");
    },
    onError: (error) => {
      setPlanGapNotice(null);
      setPlanGapError(error instanceof Error ? error.message : "Unable to record usage plan gap.");
    },
  });

  const handleAcknowledgePlanGap = () => {
    setPlanGapNotice(null);
    setPlanGapError(null);
    acknowledgePlanGapMutation.mutate();
  };

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
              href={buildRunAwareUsageHref("/playground")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 1: Run in playground
            </Link>
            <Link
              href={verificationHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 3: Capture verification evidence
            </Link>
            <Link
              href={buildRunAwareUsageHref("/api-keys")}
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
            and then back into settings or <Link href={adminReturnActionsHref}>admin review as needed</Link>. This
            relay stays manual so the evidence trail is explicit and reusable during Week 8 readiness review.
          </p>
          <div id="usage-admin-return-actions" className="flex flex-wrap gap-2">
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
              {adminReturnLabel}
            </Link>
          </div>
          <p className="text-xs text-muted">
            Navigation only: this handoff preserves workspace context, but it does not auto-attach evidence or resolve
            billing or rollout issues for you.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Audit export continuity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted">
            Usage verifies the run, but the same Latest export receipt (filename, filters, SHA-256) from /settings
            needs to show up again in verification and the admin handoff so every lane keeps one shared evidence thread.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={settingsUpgradeHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen audit export receipt
            </Link>
            <Link
              href={verificationHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen verification evidence
            </Link>
            <Link
              href={adminHref}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
            >
              {adminReturnLabel}
            </Link>
          </div>
          <p className="text-xs text-muted">
            Navigation-only manual relay: these links preserve workspace context but do not auto-attach the receipt or
            resolve rollout issues for you.
          </p>
          {auditExportReceipt ? (
            <AuditExportReceiptCallout
              receipt={auditExportReceipt}
              title="Audit export continuity"
              description="Carry the same receipt through usage, verification, go-live, and admin follow-up so every surface cites one shared evidence thread."
            />
          ) : null}
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
                    href={buildRunAwareUsageHref(action.path)}
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
          {planLimitFollowUpSummary ? (
            <div className="rounded-xl border border-border bg-background px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted">Existing follow-up</p>
              <p className="mt-1 text-xs text-muted">{planLimitFollowUpSummary}</p>
            </div>
          ) : null}
          {usagePlanGapAcknowledged ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted">Verification sync</p>
              <p className="mt-1 text-xs text-muted">
                Verification delivery notes already include this usage plan gap. Refresh the evidence or return to
                admin when the remediation path is confirmed.
              </p>
            </div>
          ) : null}
          {planGapNotice ? <p className="text-xs text-muted">{planGapNotice}</p> : null}
          {planGapError ? <p className="text-xs text-muted">{planGapError}</p> : null}
          {overLimitMetricLabels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAcknowledgePlanGap}
                disabled={
                  acknowledgePlanGapMutation.isPending || !usagePlanGapNote || usagePlanGapAcknowledged
                }
              >
                {usagePlanGapAcknowledged
                  ? "Plan gap recorded"
                  : acknowledgePlanGapMutation.isPending
                    ? "Recording..."
                    : "Record plan gap in verification track"}
              </Button>
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
                {planLimitEvidenceActionLabel}
              </Link>
              {normalizedSource ? (
                <Link
                  href={adminHref}
                  className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
                >
                  {adminReturnLabel}
                </Link>
              ) : null}
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
              {selfServeSetupNotice ? (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-900">
                  <p className="font-medium">Self-serve provider setup required</p>
                  <p className="mt-1">{selfServeSetupNotice}</p>
                  <p className="mt-1 font-mono">billing_self_serve_not_configured</p>
                </div>
              ) : null}
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
                    selfServeReasonCode: billingSummary.self_serve_reason_code ?? null,
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
