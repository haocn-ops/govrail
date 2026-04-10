"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { ReadinessTile } from "@/components/home/readiness-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildAdminReturnHref, buildVerificationChecklistHandoffHref, resolveAdminQueueSurface } from "@/lib/handoff-query";
import { fetchCurrentWorkspace, fetchWorkspaceDeliveryTrack } from "@/services/control-plane";

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

type LaunchpadSource = "admin-attention" | "admin-readiness" | "onboarding";

function normalizeRecentUpdateKind(value?: string | null): string | null {
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

function toneFromState(isReady: boolean, isInProgress = false): "ready" | "in_progress" | "blocked" {
  if (isReady) {
    return "ready";
  }
  if (isInProgress) {
    return "in_progress";
  }
  return "blocked";
}

function formatPlanLabel(planCode?: string | null, planDisplayName?: string | null): string {
  if (planDisplayName) {
    return `${planDisplayName} (${planCode ?? "custom"})`;
  }
  return planCode ?? "Unassigned";
}

function formatDateLabel(value?: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString();
}

function formatDeliveryStatusLabel(value?: "pending" | "in_progress" | "complete" | null): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "in_progress") {
    return "In progress";
  }
  if (value === "complete") {
    return "Complete";
  }
  return "Pending";
}

function formatMetricLabel(key: string): string {
  switch (key) {
    case "runs_created":
      return "Runs created";
    case "active_tool_providers":
      return "Tool providers";
    case "artifact_storage_bytes":
      return "Artifact storage";
    case "artifact_egress_bytes":
      return "Artifact egress";
    case "approval_decisions":
      return "Approval decisions";
    case "replays_created":
      return "Replays";
    default:
      return key.replaceAll("_", " ");
  }
}

function formatMetricValue(key: string, value: number): string {
  if (key.includes("_bytes")) {
    if (value >= 1024 * 1024 * 1024) {
      return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    if (value >= 1024 * 1024) {
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (value >= 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }
  }
  return String(value);
}

const nextStepLinks: Array<{ label: string; surface: OnboardingSurface }> = [
  { label: "Onboarding", surface: "onboarding" },
  { label: "Members", surface: "members" },
  { label: "Service accounts", surface: "service-accounts" },
  { label: "API keys", surface: "api-keys" },
  { label: "Playground", surface: "playground" },
  { label: "Usage", surface: "usage" },
  { label: "Settings", surface: "settings" },
  { label: "Verification", surface: "verification" },
  { label: "Go-live", surface: "go-live" },
];

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

type OnboardingStatusSummary = {
  service_accounts_total: number;
  active_service_accounts_total: number;
  api_keys_total: number;
  active_api_keys_total: number;
};

function hasHistoricalOnly(total?: number, active?: number): boolean {
  if (typeof total !== "number" || typeof active !== "number") {
    return false;
  }
  return total > 0 && active === 0;
}

function getRecommendedNextStep(args: {
  onboardingStatus?: {
    checklist: {
      baseline_ready: boolean;
      service_account_created: boolean;
      api_key_created: boolean;
      demo_run_created: boolean;
      demo_run_succeeded: boolean;
    };
    recommended_next_surface?: OnboardingSurface | null;
    recommended_next_action?: string | null;
    recommended_next_reason?: string | null;
    summary?: OnboardingStatusSummary | null;
  } | null;
}): { surface: OnboardingSurface; action: string; reason: string } {
  if (args.onboardingStatus?.recommended_next_surface) {
    return {
      surface: args.onboardingStatus.recommended_next_surface,
      action: args.onboardingStatus.recommended_next_action ?? "Continue onboarding",
      reason:
        args.onboardingStatus.recommended_next_reason ??
        "This step is recommended directly by onboarding state.",
    };
  }

  if (args.onboardingStatus?.checklist.baseline_ready !== true) {
    return {
      surface: "onboarding",
      action: "Bootstrap baseline",
      reason: "Bootstrap providers and policies before credential setup.",
    };
  }
  const serviceAccountsTotal = args.onboardingStatus?.summary?.service_accounts_total ?? 0;
  const activeServiceAccounts = args.onboardingStatus?.summary?.active_service_accounts_total ?? 0;
  if (args.onboardingStatus?.checklist.service_account_created !== true) {
    return {
      surface: "service_accounts",
      action: "Create service account",
      reason: args.onboardingStatus?.summary && hasHistoricalOnly(serviceAccountsTotal, activeServiceAccounts)
        ? "Only historical or disabled service accounts remain. Create a new active machine identity for the first governed API path."
        : "Service account is required for first governed API path.",
    };
  }
  const apiKeysTotal = args.onboardingStatus?.summary?.api_keys_total ?? 0;
  const activeApiKeys = args.onboardingStatus?.summary?.active_api_keys_total ?? 0;
  if (args.onboardingStatus?.checklist.api_key_created !== true) {
    return {
      surface: "api_keys",
      action: "Create API key",
      reason: args.onboardingStatus?.summary && hasHistoricalOnly(apiKeysTotal, activeApiKeys)
        ? "Only revoked or historical API keys remain. Issue a new active key for the first governed run."
        : "Create a narrow key (for example `runs:write`) for the first run.",
    };
  }
  if (args.onboardingStatus?.checklist.demo_run_succeeded !== true) {
    return {
      surface: "playground",
      action: args.onboardingStatus?.checklist.demo_run_created ? "Validate demo completion" : "Run first demo",
      reason: "Use Playground to create or confirm first-run evidence.",
    };
  }
  return {
    surface: "verification",
    action: "Capture verification evidence",
    reason: "Demo succeeded; store evidence before go-live rehearsal.",
  };
}

function getBlockers(args: {
  onboardingStatus?: {
    checklist: {
      baseline_ready: boolean;
      service_account_created: boolean;
      api_key_created: boolean;
      demo_run_created: boolean;
      demo_run_succeeded: boolean;
    };
    blockers?: Array<{ message: string }> | null;
  } | null;
}): string[] {
  if (args.onboardingStatus?.blockers && args.onboardingStatus.blockers.length > 0) {
    return args.onboardingStatus.blockers.map((item) => item.message);
  }
  const blockers: string[] = [];
  if (args.onboardingStatus?.checklist.baseline_ready !== true) {
    blockers.push("Baseline providers and policies are not ready.");
  }
  if (args.onboardingStatus?.checklist.service_account_created !== true) {
    blockers.push("Service account is missing.");
  }
  if (args.onboardingStatus?.checklist.api_key_created !== true) {
    blockers.push("API key is missing.");
  }
  if (args.onboardingStatus?.checklist.demo_run_created && !args.onboardingStatus.checklist.demo_run_succeeded) {
    blockers.push("Demo run exists but has not succeeded.");
  }
  return blockers;
}

function filterTextLines(lines: Array<string | null | undefined>): string[] {
  return lines.filter((line): line is string => typeof line === "string" && line.trim() !== "");
}

function normalizeRole(roleValue?: string | null): string | null {
  if (!roleValue) {
    return null;
  }
  const firstToken = roleValue
    .split(/[,|/]/)
    .map((token) => token.trim().toLowerCase())
    .find((token) => token.length > 0);
  if (!firstToken) {
    return null;
  }
  if (firstToken.includes("owner")) {
    return "owner";
  }
  if (firstToken.includes("admin")) {
    return "admin";
  }
  if (firstToken.includes("approver")) {
    return "approver";
  }
  if (firstToken.includes("operator")) {
    return "operator";
  }
  if (firstToken.includes("auditor")) {
    return "auditor";
  }
  if (firstToken.includes("viewer") || firstToken.includes("read")) {
    return "viewer";
  }
  return firstToken;
}

function roleGuidance(args: {
  role?: string | null;
  fallbackSurface: OnboardingSurface;
}): {
  roleLabel: string;
  surface: OnboardingSurface;
  action: string;
  reason: string;
  secondarySurface: OnboardingSurface;
  secondaryAction: string;
} {
  const normalizedRole = normalizeRole(args.role);
  if (normalizedRole === "viewer" || normalizedRole === "auditor") {
    return {
      roleLabel: normalizedRole,
      surface: "verification",
      action: "Review verification evidence",
      reason: "Read-only roles can validate posture and evidence trails before handing off.",
      secondarySurface: "usage",
      secondaryAction: "Inspect usage posture",
    };
  }
  if (normalizedRole === "operator") {
    return {
      roleLabel: normalizedRole,
      surface: "playground",
      action: "Run or validate first governed flow",
      reason: "Operator lanes usually focus on execution evidence and run health.",
      secondarySurface: "verification",
      secondaryAction: "Capture verification evidence",
    };
  }
  if (normalizedRole === "approver") {
    return {
      roleLabel: normalizedRole,
      surface: "go-live",
      action: "Review go-live checklist",
      reason: "Approver lanes are best aligned to final readiness and release gating review.",
      secondarySurface: "verification",
      secondaryAction: "Cross-check verification records",
    };
  }
  if (normalizedRole === "admin" || normalizedRole === "owner") {
    return {
      roleLabel: normalizedRole,
      surface: "settings",
      action: "Confirm workspace governance settings",
      reason: "Admin lanes should confirm policy, billing posture, and rollout safeguards first.",
      secondarySurface: "members",
      secondaryAction: "Review member access",
    };
  }
  return {
    roleLabel: normalizedRole ?? "unscoped",
    surface: args.fallbackSurface,
    action: "Continue recommended launch lane",
    reason: "Role scope is not explicit; use onboarding guidance as the default path.",
    secondarySurface: "settings",
    secondaryAction: "Review workspace settings",
  };
}

export function WorkspaceLaunchpad({
  workspaceSlug,
  workspaceRole,
  contextSourceLabel,
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
  workspaceRole?: string | null;
  contextSourceLabel?: string;
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
  const workspaceQuery = useQuery({
    queryKey: ["home-launchpad-workspace", workspaceSlug],
    queryFn: fetchCurrentWorkspace,
  });

  const deliveryQuery = useQuery({
    queryKey: ["home-launchpad-delivery", workspaceSlug],
    queryFn: fetchWorkspaceDeliveryTrack,
  });

  const workspace = workspaceQuery.data?.workspace;
  const plan = workspaceQuery.data?.plan;
  const onboarding = workspaceQuery.data?.onboarding;
  const billing = workspaceQuery.data?.billing_summary;
  const usage = workspaceQuery.data?.usage;
  const delivery = deliveryQuery.data;
  const latestDemoRun = onboarding?.latest_demo_run ?? null;
  const activeRunId = latestDemoRun?.run_id ?? null;

  const onboardingReady = onboarding?.checklist.baseline_ready === true;
  const credentialsReady =
    onboarding?.checklist.service_account_created === true &&
    onboarding?.checklist.api_key_created === true;
  const demoRunCreated = onboarding?.checklist.demo_run_created === true;
  const demoRunReady = onboarding?.checklist.demo_run_succeeded === true;
  const latestDemoRunHint = onboarding?.latest_demo_run_hint ?? null;
  const deliveryGuidance = onboarding?.delivery_guidance ?? null;
  const billingReady = billing?.status_tone !== "warning";
  const verificationReady = delivery?.verification.status === "complete";
  const goLiveReady = delivery?.go_live.status === "complete";
  const mockGoLiveReadinessReady = goLiveReady || (verificationReady && demoRunReady && billingReady);
  const recommendedNextStep = getRecommendedNextStep({ onboardingStatus: onboarding });
  const roleAwareStep = roleGuidance({
    role: workspaceRole,
    fallbackSurface: recommendedNextStep.surface,
  });
  const onboardingBlockers = getBlockers({ onboardingStatus: onboarding });
  const onboardingRecoveryTitle = latestDemoRunHint?.needs_attention
    ? latestDemoRunHint.is_terminal
      ? "Recover the first demo run"
      : "Monitor the first demo run"
    : onboarding?.checklist.demo_run_succeeded === true
      ? "Capture first-demo evidence"
      : "Follow the guided onboarding lane";
  const onboardingRecoveryBody = latestDemoRunHint?.needs_attention
    ? latestDemoRunHint.suggested_action ??
      "Keep the demo lane active until the run is healthy, then continue into verification evidence capture."
    : onboarding?.checklist.demo_run_succeeded === true
      ? deliveryGuidance?.summary ?? "Demo succeeded. Capture verification evidence before go-live rehearsal."
      : recommendedNextStep.reason;
  const onboardingRecoveryPrimary =
    latestDemoRunHint?.needs_attention && latestDemoRunHint.is_terminal
      ? { label: "Retry in Playground", surface: "playground" as OnboardingSurface }
      : latestDemoRunHint?.needs_attention
        ? { label: "Inspect Playground status", surface: "playground" as OnboardingSurface }
        : onboarding?.checklist.demo_run_succeeded === true
          ? { label: "Open verification evidence lane", surface: "verification" as OnboardingSurface }
          : { label: recommendedNextStep.action, surface: recommendedNextStep.surface };
  const onboardingRecoverySecondary =
    latestDemoRunHint?.needs_attention || onboarding?.checklist.demo_run_succeeded === true
      ? { label: "Review verification checklist", surface: "verification" as OnboardingSurface }
      : { label: "Review rollback prep in Settings", surface: "settings" as OnboardingSurface };
  const onboardingRecoveryMetaLines = filterTextLines([
    latestDemoRunHint?.status_label,
    latestDemoRunHint?.suggested_action,
    deliveryGuidance?.summary,
  ]);
  const usageEntries = usage ? Object.entries(usage.metrics) : [];
  const usageHighlights =
    usageEntries.length > 0
      ? usageEntries
          .slice()
          .sort((left, right) => Number(right[1].over_limit) - Number(left[1].over_limit))
          .slice(0, 3)
      : [];
  const hasUsagePressure = usageEntries.some(([, metric]) => metric.over_limit);
  const normalizedSource: LaunchpadSource | null =
    source === "admin-attention" || source === "admin-readiness" || source === "onboarding" ? source : null;
  const showAdminAttention = normalizedSource === "admin-attention";
  const showAdminReadiness = normalizedSource === "admin-readiness";
  const adminReturnLabel = showAdminAttention ? "Return to admin queue" : "Return to admin readiness view";
  const adminReturnHref =
    showAdminAttention || showAdminReadiness
      ? buildAdminReturnHref("/admin", {
          source: normalizedSource,
          runId: activeRunId,
          queueSurface: showAdminAttention ? resolveAdminQueueSurface(recentTrackKey) : null,
          week8Focus,
          attentionWorkspace: attentionWorkspace ?? workspaceSlug,
          attentionOrganization,
          deliveryContext,
          recentUpdateKind: normalizeRecentUpdateKind(recentUpdateKind),
          evidenceCount,
          recentOwnerLabel,
          recentOwnerDisplayName,
          recentOwnerEmail,
        })
      : null;
  const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>[0], "pathname"> = {
    source: normalizedSource,
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
  const adminReturnActionsHref = "#launchpad-admin-return-actions";

  function buildLaunchpadHref(pathname: string): string {
    return buildVerificationChecklistHandoffHref({ pathname, ...handoffHrefArgs, runId: activeRunId });
  }

  return (
    <div className="space-y-8">
      {showAdminAttention || showAdminReadiness ? (
        <Card>
          <CardHeader>
            <CardTitle>{showAdminAttention ? "Admin attention follow-up" : "Admin readiness follow-up"}</CardTitle>
            <CardDescription>
              {showAdminAttention
                ? "This launchpad was opened from the admin attention queue. Use it to keep the workspace follow-up in the same governance context, then return to the filtered queue view."
                : "This launchpad was opened from the Week 8 readiness view. Keep the same readiness focus while you move through session, usage, verification, and go-live follow-up, then return to the filtered admin view."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <p>
              This remains navigation-only context. It does not impersonate a member, trigger support automation, or
              auto-resolve readiness issues for you.
            </p>
            <p>
              Use the <Link href={adminReturnActionsHref}>admin return action below</Link> after you finish the
              launchpad follow-up on this workspace.
            </p>
            <div id="launchpad-admin-return-actions" className="flex flex-wrap gap-2">
              {adminReturnHref ? (
                <Link
                  href={adminReturnHref}
                  className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
                >
                  {adminReturnLabel}
                </Link>
              ) : null}
              <Link
                href={buildLaunchpadHref("/verification?surface=verification")}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Open verification lane
              </Link>
              <Link
                href={buildLaunchpadHref("/go-live?surface=go_live")}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Open go-live lane
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Workspace launch summary</span>
            <Badge variant="subtle">{workspaceSlug}</Badge>
          </CardTitle>
          <CardDescription>
            This launchpad is a navigation hub for manual governance follow-up. It does not impersonate users and does
            not trigger support automation.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-muted">Workspace</p>
            <p className="mt-1 font-medium text-foreground">{workspace?.display_name ?? workspaceSlug}</p>
            <p className="mt-1 text-xs text-muted">{workspace?.workspace_id ?? "Loading workspace id..."}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-muted">Organization</p>
            <p className="mt-1 font-medium text-foreground">{workspace?.organization.display_name ?? "Loading..."}</p>
            <p className="mt-1 text-xs text-muted">{workspace?.organization.slug ?? "-"}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-muted">Plan</p>
            <p className="mt-1 font-medium text-foreground">
              {formatPlanLabel(billing?.plan_code ?? plan?.code, billing?.plan_display_name ?? plan?.display_name)}
            </p>
            <p className="mt-1 text-xs text-muted">Billing status: {billing?.status_label ?? "Loading..."}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-muted">Updated</p>
            <p className="mt-1 font-medium text-foreground">{formatDateLabel(workspace?.updated_at)}</p>
            <p className="mt-1 text-xs text-muted">
              Delivery: {delivery ? "loaded" : deliveryQuery.isError ? "unavailable" : "loading"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ReadinessTile
          title="Onboarding baseline"
          detail={
            onboardingReady
              ? "Baseline provider/policy bundle is ready."
              : "Bootstrap baseline before moving to credential steps."
          }
          meta={contextSourceLabel ? `Context source: ${contextSourceLabel}` : undefined}
          hint="Source: onboarding checklist baseline flag."
          tone={toneFromState(onboardingReady)}
        />
        <ReadinessTile
          title="Credentials"
          detail={
            credentialsReady
              ? "Service account and API key are both present."
              : "Create at least one service account and one API key."
          }
          meta={workspaceRole ? `Role scope: ${workspaceRole}` : "Role scope: not provided"}
          hint="Source: onboarding checklist credential flags."
          tone={toneFromState(credentialsReady)}
        />
        <ReadinessTile
          title="Demo run"
          detail={
            demoRunReady
              ? "At least one onboarding demo run succeeded."
              : demoRunCreated
              ? "A demo run exists; validate completion in Playground."
              : "Run a first demo flow to produce run/trace evidence."
          }
          meta={latestDemoRunHint?.status_label ?? undefined}
          hint="Source: onboarding run checklist and latest demo state."
          tone={toneFromState(demoRunReady, demoRunCreated)}
        />
        <ReadinessTile
          title="Billing posture"
          detail={
            billingReady
              ? "Billing posture is not currently warning."
              : "Billing warning is active. Resolve in Settings before go-live."
          }
          meta={billing?.status_label ? `Status: ${billing.status_label}` : undefined}
          hint="Source: workspace billing summary tone/status."
          tone={toneFromState(billingReady)}
        />
        <ReadinessTile
          title="Mock go-live readiness"
          detail={
            mockGoLiveReadinessReady
              ? "Verification and prerequisite posture support mock go-live rehearsal."
              : "Complete verification and clear billing/demo prerequisites first."
          }
          meta={
            formatDeliveryStatusLabel(delivery?.go_live.status) ??
            formatDeliveryStatusLabel(delivery?.verification.status)
          }
          hint="Source: delivery track plus onboarding/billing status."
          tone={toneFromState(mockGoLiveReadinessReady, verificationReady || demoRunReady)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Onboarding recovery lane</CardTitle>
          <CardDescription>
            Keep the latest demo run, verification evidence, and go-live rehearsal aligned with the current onboarding
            state.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="font-medium text-foreground">{onboardingRecoveryTitle}</p>
          <p className="text-xs text-muted">{onboardingRecoveryBody}</p>
          {onboardingRecoveryMetaLines.length > 0 ? (
            <div className="space-y-1 rounded-2xl border border-border bg-background p-3 text-xs text-muted">
              {onboardingRecoveryMetaLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildLaunchpadHref(toSurfacePath(onboardingRecoveryPrimary.surface))}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
            >
              {onboardingRecoveryPrimary.label}
            </Link>
            <Link
              href={buildLaunchpadHref(toSurfacePath(onboardingRecoverySecondary.surface))}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
            >
              {onboardingRecoverySecondary.label}
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Manual launch state machine</CardTitle>
            <CardDescription>
              Follow one operator-owned lane from session confirmation through evidence relay.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Step 0</p>
                <p className="mt-2 font-medium text-foreground">Confirm session and workspace context</p>
                <p className="mt-1 text-xs text-muted">
                  Verify the active identity, workspace, tenant, and context source before touching onboarding,
                  billing, or evidence surfaces.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Step 1</p>
                <p className="mt-2 font-medium text-foreground">Bootstrap baseline and credentials</p>
                <p className="mt-1 text-xs text-muted">
                  Keep provider/policy setup, service accounts, and API keys attached to the same workspace story.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Step 2</p>
                <p className="mt-2 font-medium text-foreground">Run the first governed flow</p>
                <p className="mt-1 text-xs text-muted">
                  Create a real run, then confirm the usage signal before widening scope or inviting more pressure.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Step 3</p>
                <p className="mt-2 font-medium text-foreground">Relay evidence and rehearse go-live</p>
                <p className="mt-1 text-xs text-muted">
                  Capture verification notes, review settings when needed, rehearse mock go-live, then return to the
                  right queue or readiness focus manually.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
            <Link
                href={buildLaunchpadHref("/session")}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                Step 0: confirm session context
              </Link>
              <Link
                href={buildLaunchpadHref(toSurfacePath(recommendedNextStep.surface))}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Step 1: {recommendedNextStep.action}
              </Link>
              <Link
                href={buildLaunchpadHref("/usage")}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Step 2: confirm usage signal
              </Link>
              <Link
                href={buildLaunchpadHref("/verification?surface=verification")}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Step 3: relay evidence
              </Link>
            </div>
            <p className="text-xs text-muted">
              This hub is still navigation-only. It does not provision on your behalf, send invitations, or enforce
              plan gates automatically.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan and usage checkpoint</CardTitle>
            <CardDescription>
              Keep Week 6 plan posture visible before the first run or before widening scope.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted">
              {hasUsagePressure
                ? "One or more current-period metrics are already over limit. Resolve the plan or billing posture before you widen onboarding or keep pushing the go-live lane."
                : usageHighlights.length > 0
                  ? "Current-period usage is visible. Treat this as a manual checkpoint before creating more credentials or sending more operator traffic."
                  : "Usage has not accumulated yet for the current period. Keep this checkpoint in the loop so the first governed run has a clear billing and plan story."}
            </p>
            {usageHighlights.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {usageHighlights.map(([key, metric]) => (
                  <div key={key} className="rounded-2xl border border-border bg-background p-3">
                    <p className="text-xs text-muted">{formatMetricLabel(key)}</p>
                    <p className="mt-1 font-medium text-foreground">
                      {formatMetricValue(key, metric.used)}
                      {metric.limit !== null ? ` / ${formatMetricValue(key, metric.limit)}` : " / unlimited"}
                    </p>
                    <Badge className="mt-2" variant={metric.over_limit ? "default" : "subtle"}>
                      {metric.over_limit ? "Needs plan follow-up" : "Tracked"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildLaunchpadHref("/usage")}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                Review usage dashboard
              </Link>
              <Link
                href={buildLaunchpadHref("/settings?intent=manage-plan")}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Review plan and billing lane
              </Link>
              <Link
                href={buildLaunchpadHref("/session")}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Return to session checkpoint
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recommended next step</CardTitle>
          <CardDescription>
            Use this as your primary handoff target, then continue with the rest of the navigation surfaces.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border bg-background p-4 text-sm">
            <p className="font-medium text-foreground">{recommendedNextStep.action}</p>
            <p className="mt-1 text-xs text-muted">{recommendedNextStep.reason}</p>
            <div className="mt-3">
              <Link
                href={buildLaunchpadHref(toSurfacePath(recommendedNextStep.surface))}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                Open {recommendedNextStep.surface.replaceAll("_", " ")}
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4 text-sm">
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Role/session-aware lane</p>
            <p className="mt-2 font-medium text-foreground">{roleAwareStep.action}</p>
            <p className="mt-1 text-xs text-muted">{roleAwareStep.reason}</p>
            <p className="mt-2 text-xs text-muted">
              Role: {roleAwareStep.roleLabel}
              {contextSourceLabel ? ` · Context source: ${contextSourceLabel}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={buildLaunchpadHref(toSurfacePath(roleAwareStep.surface))}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                Open {roleAwareStep.surface.replaceAll("_", " ")}
              </Link>
              <Link
                href={buildLaunchpadHref(toSurfacePath(roleAwareStep.secondarySurface))}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                {roleAwareStep.secondaryAction}
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4 text-sm">
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Session/context checkpoint</p>
            <p className="mt-2 font-medium text-foreground">Confirm the active workspace session before deeper changes</p>
            <p className="mt-1 text-xs text-muted">
              Week 3 depends on session-backed workspace routing. Check identity, roles, and accessible workspaces
              before onboarding, billing review, verification updates, or the mock go-live drill.
            </p>
            <p className="mt-2 text-xs text-muted">
              {workspaceRole ? `Current role scope: ${workspaceRole}` : "Current role scope is not explicit yet"}
              {contextSourceLabel ? ` · Context source: ${contextSourceLabel}` : ""}
            </p>
            <p className="mt-2 text-xs text-muted">
              Trusted session guidance still applies here: only carry this lane forward if the session page confirms a
              metadata-backed workspace context for the same workspace you plan to onboard, measure in usage, and cite
              in verification or go-live evidence.
            </p>
            <p className="mt-2 text-xs text-muted">
              Returning to Session is the safe fallback whenever a workspace feels off. That is cheaper than cleaning
              up keys, billing actions, or evidence attached to the wrong tenant later.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={buildLaunchpadHref("/session")}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                Return to session checkpoint
              </Link>
              <Link
                href={buildLaunchpadHref("/members")}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                Review member access
              </Link>
            </div>
          </div>
          {onboardingBlockers.length > 0 ? (
            <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted">
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Current blockers</p>
              <ul className="mt-2 space-y-1 text-foreground">
                {onboardingBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs uppercase tracking-[0.15em] text-muted">All launch surfaces</p>
          <div className="flex flex-wrap gap-2">
            {nextStepLinks.map((entry) => (
              <Link
                key={entry.label}
                href={buildLaunchpadHref(toSurfacePath(entry.surface))}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                {entry.label}
              </Link>
            ))}
          </div>
          {(workspaceQuery.isLoading || deliveryQuery.isLoading) && (
            <p className="text-xs text-muted">Loading workspace and delivery context...</p>
          )}
          {(workspaceQuery.isError || deliveryQuery.isError) && (
            <p className="text-xs text-muted">
              Some launchpad signals are temporarily unavailable. You can still navigate manually to complete checks.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
