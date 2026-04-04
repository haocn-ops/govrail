"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildVerificationChecklistHandoffHref } from "@/components/verification/week8-verification-checklist";
import type { ControlPlaneWorkspaceBootstrapResult, ControlPlaneWorkspaceOnboardingState } from "@/lib/control-plane-types";
import {
  bootstrapWorkspace,
  createWorkspace,
  fetchCurrentWorkspace,
  isControlPlaneRequestError,
} from "@/services/control-plane";

function normalizeSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "workspace";
}

type WorkspaceContextSource = "metadata" | "env-fallback" | "preview-fallback";

type WorkspaceContextResponse = {
  data?: {
    source?: WorkspaceContextSource;
    source_detail?: {
      label?: string;
      is_fallback?: boolean;
      local_only?: boolean;
      warning?: string | null;
    };
  };
};

type WorkspaceContextSourceState = {
  source: WorkspaceContextSource;
  label: string;
  isFallback: boolean;
  localOnly: boolean;
  warning: string | null;
};

async function fetchWorkspaceContextSource(): Promise<WorkspaceContextSourceState | null> {
  try {
    const response = await fetch("/api/workspace-context", {
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as WorkspaceContextResponse;
    const source = payload.data?.source;
    if (source !== "metadata" && source !== "env-fallback" && source !== "preview-fallback") {
      return null;
    }
    const detail = payload.data?.source_detail;
    return {
      source,
      label:
        typeof detail?.label === "string" && detail.label.trim() !== ""
          ? detail.label.trim()
          : source,
      isFallback: detail?.is_fallback === true || source !== "metadata",
      localOnly: detail?.local_only === true,
      warning: typeof detail?.warning === "string" && detail.warning.trim() !== "" ? detail.warning.trim() : null,
    };
  } catch {
    return null;
  }
}

async function selectWorkspaceContext(workspace: {
  workspace_id: string;
  slug: string;
}): Promise<void> {
  try {
    await fetch("/api/workspace-context", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: workspace.workspace_id,
        workspace_slug: workspace.slug,
      }),
    });
  } catch {
    // Keep the onboarding flow resilient even if the context switch probe fails.
  }
}

function getActionableErrorMessage(error: unknown, fallback: string): string {
  if (isControlPlaneRequestError(error)) {
    const reason = error.message?.trim() || fallback;
    const code = error.code?.trim();
    return code ? `${reason} (code: ${code})` : reason;
  }
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return fallback;
}

function formatUsageMetricLabel(key: string): string {
  switch (key) {
    case "runs_created":
      return "Runs created";
    case "active_tool_providers":
      return "Tool providers";
    case "artifact_storage_bytes":
      return "Artifact storage";
    case "artifact_egress_bytes":
      return "Artifact egress";
    default:
      return key.replaceAll("_", " ");
  }
}

function formatUsageMetricValue(key: string, value: number): string {
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

function formatUsageWindowDate(value?: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString();
}

type OnboardingSource = "admin-attention" | "admin-readiness" | "onboarding";

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

type OnboardingGuide = {
  surface: OnboardingSurface;
  label: string;
  reason: string;
};

type OnboardingBlocker = NonNullable<ControlPlaneWorkspaceOnboardingState["blockers"]>[number];

type RecoveryLane = {
  title: string;
  body: string;
  primaryLabel: string;
  primarySurface: OnboardingSurface;
  secondaryLabel: string;
  secondarySurface: OnboardingSurface;
};

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

function normalizeBlockerSurface(surface?: OnboardingBlocker["surface"] | null): OnboardingSurface {
  if (!surface) {
    return "onboarding";
  }
  return surface;
}

function getGuideFromState(onboardingState: ControlPlaneWorkspaceOnboardingState | null): OnboardingGuide {
  if (onboardingState?.recommended_next_surface) {
    return {
      surface: onboardingState.recommended_next_surface,
      label: onboardingState.recommended_next_action ?? "Continue onboarding",
      reason:
        onboardingState.recommended_next_reason ??
        "This next surface is recommended by the current onboarding state.",
    };
  }

  if (onboardingState?.checklist.baseline_ready !== true) {
    return {
      surface: "onboarding",
      label: "Bootstrap baseline",
      reason: "Baseline providers and policies must be ready before credentials and first run.",
    };
  }
  if (onboardingState?.checklist.service_account_created !== true) {
    return {
      surface: "service_accounts",
      label: "Create a service account",
      reason: "Service account is still missing for the first controlled run.",
    };
  }
  if (onboardingState?.checklist.api_key_created !== true) {
    return {
      surface: "api_keys",
      label: "Create an API key",
      reason: "A `runs:write` API key is required before Playground demo run.",
    };
  }
  if (onboardingState?.checklist.demo_run_created !== true) {
    return {
      surface: "playground",
      label: "Run first demo in Playground",
      reason: "Credentials are ready; run a first real trace to continue onboarding.",
    };
  }
  if (onboardingState?.checklist.demo_run_succeeded !== true) {
    return {
      surface: "playground",
      label: "Confirm demo completion",
      reason: "A demo run exists but has not succeeded yet.",
    };
  }
  return {
    surface: "verification",
    label: "Capture verification evidence",
    reason: "Onboarding demo succeeded. Capture evidence before go-live rehearsal.",
  };
}

function getOnboardingBlockers(onboardingState: ControlPlaneWorkspaceOnboardingState | null): string[] {
  if (onboardingState?.blockers && onboardingState.blockers.length > 0) {
    return onboardingState.blockers.map((item) => item.message);
  }

  const blockers: string[] = [];
  if (!onboardingState?.checklist.workspace_created) {
    blockers.push("Workspace is not created in a persistent SaaS context yet.");
  }
  if (!onboardingState?.checklist.baseline_ready) {
    blockers.push("Baseline providers and policies are not bootstrapped.");
  }
  if (!onboardingState?.checklist.service_account_created) {
    blockers.push("Service account is missing.");
  }
  if (!onboardingState?.checklist.api_key_created) {
    blockers.push("API key is missing.");
  }
  if (onboardingState?.checklist.demo_run_created && !onboardingState?.checklist.demo_run_succeeded) {
    blockers.push("Demo run exists but has not succeeded yet.");
  }
  return blockers;
}

function getRecoveryLane(args: {
  primaryBlockingIssue: OnboardingBlocker | null;
  primaryWarningIssue: OnboardingBlocker | null;
  latestDemoRunHint: ControlPlaneWorkspaceOnboardingState["latest_demo_run_hint"] | null;
  onboardingGuide: OnboardingGuide;
  onboardingState: ControlPlaneWorkspaceOnboardingState | null;
}): RecoveryLane {
  if (args.primaryBlockingIssue) {
    return {
      title: "Resolve the primary blocker",
      body: args.primaryBlockingIssue.message,
      primaryLabel:
        normalizeBlockerSurface(args.primaryBlockingIssue.surface) === "playground"
          ? "Retry the demo lane"
          : "Open the blocking surface",
      primarySurface: normalizeBlockerSurface(args.primaryBlockingIssue.surface),
      secondaryLabel: "Review verification evidence path",
      secondarySurface: "verification",
    };
  }

  if (args.latestDemoRunHint?.needs_attention) {
    return {
      title: args.latestDemoRunHint.is_terminal ? "Recover the first demo run" : "Monitor the first demo run",
      body:
        args.latestDemoRunHint.suggested_action ??
        "Stay on the demo lane until the run is healthy, then continue into verification evidence capture.",
      primaryLabel: args.latestDemoRunHint.is_terminal ? "Retry in Playground" : "Inspect Playground status",
      primarySurface: "playground",
      secondaryLabel: "Review verification checklist",
      secondarySurface: "verification",
    };
  }

  if (args.primaryWarningIssue) {
    return {
      title: "Close the remaining readiness warning",
      body: args.primaryWarningIssue.message,
      primaryLabel: "Open the warning surface",
      primarySurface: normalizeBlockerSurface(args.primaryWarningIssue.surface),
      secondaryLabel: "Review rollback prep in Settings",
      secondarySurface: "settings",
    };
  }

  if (args.onboardingState?.checklist.demo_run_succeeded) {
    if (args.onboardingState.delivery_guidance?.verification_status !== "complete") {
      return {
        title: "Capture first-demo evidence",
        body:
          args.onboardingState.delivery_guidance?.summary ??
          "Demo succeeded. Capture the trace and evidence before moving further down the launch lane.",
        primaryLabel: "Open verification evidence lane",
        primarySurface: "verification",
        secondaryLabel: "Review rollback prep in Settings",
        secondarySurface: "settings",
      };
    }

    if (args.onboardingState.delivery_guidance?.go_live_status !== "complete") {
      return {
        title: "Advance into go-live rehearsal",
        body:
          args.onboardingState.delivery_guidance?.summary ??
          "Verification is complete. Rehearse go-live and assign rollback ownership before cutover.",
        primaryLabel: "Open go-live drill",
        primarySurface: "go-live",
        secondaryLabel: "Review rollback prep in Settings",
        secondarySurface: "settings",
      };
    }
  }

  return {
    title: "Follow the guided onboarding lane",
    body: args.onboardingGuide.reason,
    primaryLabel: args.onboardingGuide.label,
    primarySurface: args.onboardingGuide.surface,
    secondaryLabel: "Review rollback prep in Settings",
    secondarySurface: "settings",
  };
}

export function WorkspaceOnboardingWizard({
  workspaceSlug,
  source = "onboarding",
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlugInput, setWorkspaceSlugInput] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [createdWorkspace, setCreatedWorkspace] = useState<{
    workspace_id: string;
    slug: string;
    display_name: string;
    tenant_id: string;
  } | null>(null);
  const [bootstrapResult, setBootstrapResult] = useState<ControlPlaneWorkspaceBootstrapResult | null>(null);

  const workspaceQuery = useQuery({
    queryKey: ["workspace-settings", workspaceSlug],
    queryFn: fetchCurrentWorkspace,
  });
  const contextSourceQuery = useQuery({
    queryKey: ["workspace-context-source"],
    queryFn: fetchWorkspaceContextSource,
  });
  const persistedWorkspace =
    workspaceQuery.data?.workspace &&
    workspaceQuery.data.workspace.organization.organization_id !== "org_preview"
      ? {
          workspace_id: workspaceQuery.data.workspace.workspace_id,
          slug: workspaceQuery.data.workspace.slug,
          display_name: workspaceQuery.data.workspace.display_name,
          tenant_id: workspaceQuery.data.workspace.tenant_id,
        }
      : null;
  const activeWorkspace = createdWorkspace ?? persistedWorkspace;
  const onboardingState = workspaceQuery.data?.onboarding ?? null;
  const usageSummary = workspaceQuery.data?.usage ?? null;
  const billingSummary = workspaceQuery.data?.billing_summary ?? null;
  const bootstrapSummary = bootstrapResult?.summary ?? onboardingState?.summary ?? null;
  const nextActions = bootstrapResult?.next_actions ?? onboardingState?.next_actions ?? [];
  const onboardingGuide = getGuideFromState(onboardingState);
  const onboardingBlockers = getOnboardingBlockers(onboardingState);
  const blockers: Array<{
    code: string;
    severity: "blocking" | "warning";
    message: string;
    surface: OnboardingSurface | null;
    retryable?: boolean;
  }> = (onboardingState?.blockers ?? []).map((item) => ({
    code: item.code,
    severity: item.severity === "warning" ? "warning" : "blocking",
    message: item.message,
    surface: item.surface ?? null,
    retryable: item.retryable,
  }));
  const primaryBlockingIssue = blockers.find((item) => item.severity === "blocking") ?? null;
  const primaryWarningIssue = blockers.find((item) => item.severity === "warning") ?? null;
  const recommendedNext: {
    surface: OnboardingSurface;
    action: string;
    reason: string;
  } = onboardingState?.recommended_next
    ? {
        surface: onboardingState.recommended_next.surface,
        action: onboardingState.recommended_next.action,
        reason: onboardingState.recommended_next.reason,
      }
    : {
        surface: onboardingGuide.surface,
        action: onboardingGuide.label,
        reason: onboardingGuide.reason,
      };

  const createMutation = useMutation({
    mutationFn: async () => {
      const currentWorkspace = workspaceQuery.data?.workspace;
      if (!currentWorkspace) {
        throw new Error("Current workspace context is unavailable");
      }

      const slug = normalizeSlug(workspaceSlugInput);
      const displayName = workspaceName.trim() || slug;

      return createWorkspace({
        organization_id: currentWorkspace.organization.organization_id,
        slug,
        display_name: displayName,
        plan_id: currentWorkspace.plan_id,
        data_region: currentWorkspace.data_region,
      });
    },
    onSuccess: async (result) => {
      const nextWorkspace = {
        workspace_id: result.workspace.workspace_id,
        slug: result.workspace.slug,
        display_name: result.workspace.display_name,
        tenant_id: result.workspace.tenant_id,
      };
      setCreatedWorkspace(nextWorkspace);
      setBootstrapResult(null);

      await selectWorkspaceContext(nextWorkspace);

      await queryClient.invalidateQueries();
      router.refresh();
    },
  });

  const bootstrapMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspace) {
        throw new Error("Create a workspace before bootstrapping");
      }

      return bootstrapWorkspace(activeWorkspace.workspace_id);
    },
    onSuccess: async (result) => {
      setBootstrapResult(result);
      await queryClient.invalidateQueries();
      router.refresh();
    },
  });

  const stepOneComplete = activeWorkspace !== null;
  const stepTwoComplete = bootstrapResult !== null || onboardingState?.checklist.baseline_ready === true;
  const serviceAccountReady = onboardingState?.checklist.service_account_created === true;
  const apiKeyReady = onboardingState?.checklist.api_key_created === true;
  const stepThreeReady = stepTwoComplete && serviceAccountReady && apiKeyReady;
  const stepThreeComplete = onboardingState?.checklist.demo_run_succeeded === true;
  const latestDemoRun = onboardingState?.latest_demo_run ?? null;
  const latestDemoRunHint = onboardingState?.latest_demo_run_hint ?? null;
  const deliveryGuidance = onboardingState?.delivery_guidance ?? null;
  const recoveryLane = getRecoveryLane({
    primaryBlockingIssue,
    primaryWarningIssue,
    latestDemoRunHint,
    onboardingGuide,
    onboardingState,
  });
  const firstDemoStatusText = stepThreeComplete
    ? "First demo run succeeded"
    : onboardingState?.checklist.demo_run_created
    ? "Demo run in progress"
    : stepThreeReady
    ? "Baseline + credentials ready"
    : "Behind on prerequisites";
  const firstDemoStatusVariant = stepThreeComplete
    ? "strong"
    : onboardingState?.checklist.demo_run_created
    ? "default"
    : stepThreeReady
    ? "default"
    : "subtle";
  const normalizedSource: OnboardingSource =
    source === "admin-attention" || source === "admin-readiness" || source === "onboarding"
      ? source
      : "onboarding";
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
  };
  const onboardingGuideHref = buildVerificationChecklistHandoffHref({
    pathname: toSurfacePath(onboardingGuide.surface),
    ...handoffHrefArgs,
  });
  const recommendedNextHref = buildVerificationChecklistHandoffHref({
    pathname: toSurfacePath(recommendedNext.surface),
    ...handoffHrefArgs,
  });
  const verificationChecklistHref = buildVerificationChecklistHandoffHref({
    pathname: "/verification?surface=verification",
    ...handoffHrefArgs,
  });
  const sessionCheckpointHref = buildVerificationChecklistHandoffHref({
    pathname: "/session",
    ...handoffHrefArgs,
  });
  const usageCheckpointHref = buildVerificationChecklistHandoffHref({
    pathname: "/usage",
    ...handoffHrefArgs,
  });
  const settingsBillingHref = buildVerificationChecklistHandoffHref({
    pathname: "/settings?intent=manage-plan",
    ...handoffHrefArgs,
  });
  const goLiveDrillHref = buildVerificationChecklistHandoffHref({
    pathname: "/go-live?surface=go_live",
    ...handoffHrefArgs,
  });
  const expandedNextActions = [...nextActions.map((action) => action)];
  const contextSource = contextSourceQuery.data;
  const showContextNotice = contextSource?.isFallback === true;
  const usageHighlights =
    usageSummary && Object.keys(usageSummary.metrics).length > 0
      ? Object.entries(usageSummary.metrics)
          .slice()
          .sort((left, right) => Number(right[1].over_limit) - Number(left[1].over_limit))
          .slice(0, 3)
      : [];
  const hasUsagePressure = usageHighlights.some(([, metric]) => metric.over_limit);
  const contextNoticeBody =
    contextSource?.warning ??
    "Workspace context is running in fallback mode. Treat this as local/demo state instead of production identity state.";
  const createErrorMessage = createMutation.isError
    ? getActionableErrorMessage(
        createMutation.error,
        "Workspace creation failed. Check organization access and slug uniqueness, then retry.",
      )
    : null;
  const bootstrapErrorMessage = bootstrapMutation.isError
    ? getActionableErrorMessage(
        bootstrapMutation.error,
        "Bootstrap failed. Check workspace permissions and retry.",
      )
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Onboarding"
        title="Launch and onboard a workspace"
        description="Create a workspace, seed the baseline provider and policy bundle, then track the first operational actions until the first demo flow is ready."
        badge={<Badge variant="strong">{onboardingState?.status ?? "Week 5"}</Badge>}
      />
      {showContextNotice ? (
        <Card>
          <CardHeader>
            <CardTitle>Workspace context notice</CardTitle>
            <CardDescription>
              Onboarding remains available, but context is not coming from a production-safe metadata session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <p>{contextNoticeBody}</p>
            <p>
              Current source: <span className="font-medium text-foreground">{contextSource?.label}</span>
            </p>
            <p>
              Mode:{" "}
              <span className="font-medium text-foreground">
                {contextSource?.localOnly ? "non-production fallback" : "fallback"}
              </span>
            </p>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Step 0. Confirm session and launch context</CardTitle>
          <CardDescription>
            Treat session, workspace, and plan posture as the first onboarding checkpoint before mutating anything.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            This wizard is still a manual launch hub. Before creating a workspace, bootstrapping baseline, or issuing
            credentials, confirm the active session context and decide whether current plan posture leaves room for the
            first run.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={sessionCheckpointHref}>
              <Button size="sm" variant="secondary">Open session checkpoint</Button>
            </Link>
            <Link href={usageCheckpointHref}>
              <Button size="sm" variant="ghost">Review usage pressure</Button>
            </Link>
            <Link href={settingsBillingHref}>
              <Button size="sm" variant="ghost">Review plan and billing lane</Button>
            </Link>
          </div>
          <p className="text-xs text-muted">
            Nothing here auto-provisions a customer workspace end-to-end. The wizard helps sequence the work, but the
            operator still owns each launch decision and evidence handoff.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Step 1. Create workspace</CardTitle>
            <CardDescription>Create a workspace, then keep using this page as the persistent onboarding hub for that workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Workspace name"
                value={workspaceName}
                onChange={(event) => {
                  const nextName = event.currentTarget.value;
                  setWorkspaceName(nextName);
                  if (!slugManuallyEdited) {
                    setWorkspaceSlugInput(normalizeSlug(nextName));
                  }
                }}
              />
              <Input
                placeholder="Workspace slug"
                value={workspaceSlugInput}
                onChange={(event) => {
                  setSlugManuallyEdited(true);
                  setWorkspaceSlugInput(event.currentTarget.value);
                }}
              />
            </div>
            {!slugManuallyEdited ? (
              <p className="text-xs text-muted">
                Slug is auto-suggested from the workspace name until you edit it manually.
              </p>
            ) : null}
            <Button
              disabled={createMutation.isPending || workspaceQuery.isLoading || workspaceQuery.isError}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Creating workspace..." : "Create workspace"}
            </Button>
            {createErrorMessage ? (
              <p className="text-xs text-muted">{createErrorMessage}</p>
            ) : null}
            {activeWorkspace ? (
              <div className="rounded-2xl border border-border bg-background p-4 text-sm">
                <p className="font-medium text-foreground">{activeWorkspace.display_name}</p>
                <p className="mt-1 text-xs text-muted">
                  {activeWorkspace.slug} · {activeWorkspace.workspace_id}
                </p>
                <p className="mt-1 text-xs text-muted">Tenant: {activeWorkspace.tenant_id}</p>
              </div>
            ) : null}
            <p className="text-xs text-muted">
              After creation, return to the session checkpoint if the new workspace or tenant binding looks wrong
              before continuing with bootstrap or credentials.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
            <CardDescription>Each step unlocks the next one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-2xl border border-border bg-background p-4">
              <div>
                <p className="font-medium text-foreground">Workspace skeleton</p>
                <p className="mt-1 text-xs text-muted">Organization mapping and tenant binding</p>
              </div>
              <Badge variant={stepOneComplete ? "strong" : "subtle"}>{stepOneComplete ? "Done" : "Pending"}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border bg-background p-4">
              <div>
                <p className="font-medium text-foreground">Baseline governance bundle</p>
                <p className="mt-1 text-xs text-muted">Bootstrap providers and policies for first-run safety</p>
              </div>
              <Badge variant={stepTwoComplete ? "strong" : "subtle"}>{stepTwoComplete ? "Done" : "Locked"}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border bg-background p-4">
              <div>
                <p className="font-medium text-foreground">First operational actions</p>
                <p className="mt-1 text-xs text-muted">Service account, API key, and first demo run</p>
              </div>
              <Badge variant={stepThreeComplete ? "strong" : stepThreeReady ? "default" : "subtle"}>
                {stepThreeComplete ? "Ready" : stepThreeReady ? "In progress" : "Waiting"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Step 2. Bootstrap baseline</CardTitle>
            <CardDescription>Seed the minimum provider and policy deck for a safe first demo run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="secondary"
              disabled={!activeWorkspace || bootstrapMutation.isPending || stepTwoComplete}
              onClick={() => bootstrapMutation.mutate()}
            >
              {stepTwoComplete ? "Baseline ready" : bootstrapMutation.isPending ? "Bootstrapping..." : "Bootstrap baseline"}
            </Button>
            <p className="text-xs text-muted">
              This creates a small, deterministic seed set based on the workspace id, so re-running does not create duplicates.
            </p>
            <p className="text-xs text-muted">
              Baseline bootstrap is still a guided operator step. It does not send support requests or complete the
              rest of onboarding automatically after providers/policies land.
            </p>
            {bootstrapErrorMessage ? (
              <p className="text-xs text-muted">{bootstrapErrorMessage}</p>
            ) : null}
            {bootstrapSummary ? (
              <div className="space-y-3 rounded-2xl border border-border bg-background p-4 text-sm">
                <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Persisted bootstrap summary</p>
                  <p className="mt-1">
                    The counts below come from the persisted workspace onboarding summary, so they survive refresh and
                    keep Members, Onboarding, Usage, and Verification aligned on the same baseline story.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.15em] text-muted">Providers</p>
                    <p className="mt-1 font-medium text-foreground">{bootstrapSummary.providers_total}</p>
                    <p className="mt-1 text-xs text-muted">
                      {bootstrapSummary.providers_created} created · {bootstrapSummary.providers_existing} existing
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.15em] text-muted">Policies</p>
                    <p className="mt-1 font-medium text-foreground">{bootstrapSummary.policies_total}</p>
                    <p className="mt-1 text-xs text-muted">
                      {bootstrapSummary.policies_created} created · {bootstrapSummary.policies_existing} existing
                    </p>
                  </div>
                </div>
                {bootstrapResult ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {bootstrapResult.providers.map((provider) => (
                        <Badge key={provider.tool_provider_id} variant="subtle">
                          {provider.name}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {bootstrapResult.policies.map((policy) => (
                        <Badge key={policy.policy_id} variant="subtle">
                          {policy.decision}: {policy.scope.tool_name ?? policy.policy_id}
                        </Badge>
                      ))}
                    </div>
                  </>
                ) : null}
                {nextActions.length > 0 ? (
                  <div className="rounded-2xl border border-border/70 bg-card p-3 text-xs text-muted">
                    <p className="text-[0.65rem] uppercase tracking-[0.25em] text-muted">Next actions</p>
                    <ul className="mt-2 space-y-1 text-xs text-foreground">
                      {expandedNextActions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Step 3. Next actions</CardTitle>
            <CardDescription>Turn baseline setup into a first demo-ready workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm">
              <p className="font-medium text-foreground">Guided lane</p>
              <p className="mt-1 text-xs text-muted">
                Use the same workspace context for the full first-run path: invite the first operator or approver if
                needed, create one service account, mint one `runs:write` API key, run the first demo in Playground,
                then capture evidence in Verification.
              </p>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Recommended next step</p>
                <p className="mt-1 text-sm font-medium text-foreground">{recommendedNext.action}</p>
                <p className="mt-1 text-xs text-muted">{recommendedNext.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={recommendedNext.surface === onboardingGuide.surface ? onboardingGuideHref : recommendedNextHref}>
                    <Button size="sm" variant="secondary">
                      {recommendedNext.action}
                    </Button>
                  </Link>
                  <Link href={buildVerificationChecklistHandoffHref({ pathname: "/playground", ...handoffHrefArgs })}>
                    <Button size="sm" variant="ghost">Open Playground and execute the first demo flow</Button>
                  </Link>
                </div>
              </div>
              {blockers.length > 0 ? (
                <div className="rounded-xl border border-border bg-background p-3 text-xs">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Current blockers</p>
                  <div className="mt-2 space-y-2">
                    {blockers.map((blocker) => (
                      <div key={blocker.code} className="rounded-xl border border-border/70 bg-card p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-foreground">{blocker.message}</p>
                          <Badge variant={blocker.severity === "blocking" ? "default" : "subtle"}>
                            {blocker.severity === "blocking" ? "Blocking" : "Warning"}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={buildVerificationChecklistHandoffHref({
                              pathname: toSurfacePath(normalizeBlockerSurface(blocker.surface)),
                              ...handoffHrefArgs,
                            })}
                          >
                            <Button size="sm" variant="ghost">
                              Open {normalizeBlockerSurface(blocker.surface).replaceAll("_", " ")}
                            </Button>
                          </Link>
                          {blocker.retryable ? (
                            <Link href={buildVerificationChecklistHandoffHref({ pathname: "/playground", ...handoffHrefArgs })}>
                              <Button size="sm" variant="ghost">Retry in Playground</Button>
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : onboardingBlockers.length > 0 ? (
                <div className="rounded-xl border border-border bg-background p-3 text-xs">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Current blockers</p>
                  <ul className="mt-2 space-y-1 text-foreground">
                    {onboardingBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-border bg-background p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">Plan and usage awareness</p>
                  <p className="mt-1 text-xs text-muted">
                    Before sending the first governed run, confirm that plan posture and current-period usage still
                    support the lane you are about to exercise.
                  </p>
                </div>
                {billingSummary?.status_label ? (
                  <Badge variant={hasUsagePressure ? "default" : "subtle"}>{billingSummary.status_label}</Badge>
                ) : null}
              </div>
              {usageHighlights.length > 0 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {usageHighlights.map(([key, metric]) => (
                    <div key={key} className="rounded-xl border border-border bg-card p-3">
                      <p className="text-xs text-muted">{formatUsageMetricLabel(key)}</p>
                      <p className="mt-1 font-medium text-foreground">
                        {formatUsageMetricValue(key, metric.used)}
                        {metric.limit !== null ? ` / ${formatUsageMetricValue(key, metric.limit)}` : " / unlimited"}
                      </p>
                      <Badge className="mt-2" variant={metric.over_limit ? "default" : "subtle"}>
                        {metric.over_limit ? "Needs follow-up" : "Tracked"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">
                  Usage is still empty for this workspace period, which is normal before the first run. Keep this lane
                  in mind so the first run has a clear plan and billing story.
                </p>
              )}
              <div className="mt-3 rounded-xl border border-border bg-background p-3 text-xs text-muted">
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Current usage window</p>
                <p className="mt-1 font-medium text-foreground">
                  {usageSummary ? `${formatUsageWindowDate(usageSummary.period_start)} to ${formatUsageWindowDate(usageSummary.period_end)}` : "-"}
                </p>
                <p className="mt-1">
                  Carry this billing window into verification evidence so plan pressure, onboarding readiness, and
                  upgrade follow-up stay tied to the same period boundary.
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={usageCheckpointHref}>
                  <Button size="sm" variant="ghost">Open usage checkpoint</Button>
                </Link>
                <Link href={settingsBillingHref}>
                  <Button size="sm" variant="ghost">Open settings billing lane</Button>
                </Link>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border bg-background p-4 text-sm">
              <div>
                <p className="font-medium text-foreground">First demo run</p>
                <p className="mt-1 text-xs text-muted">
                  {stepThreeComplete
                    ? "The first onboarding demo run completed successfully."
                    : onboardingState?.checklist.demo_run_created
                    ? "A demo run exists. Inspect the latest run and confirm it completed."
                    : stepThreeReady
                    ? "Service account and API key exist; Playground is now unlocked."
                    : "Finish the baseline, service account, and API key steps before invoking the run."}
                </p>
                {latestDemoRunHint?.suggested_action ? (
                  <p className="mt-1 text-xs text-muted">{latestDemoRunHint.suggested_action}</p>
                ) : null}
              </div>
              <Badge variant={firstDemoStatusVariant}>{firstDemoStatusText}</Badge>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{recoveryLane.title}</p>
                  <p className="mt-1 text-xs text-muted">{recoveryLane.body}</p>
                </div>
                {latestDemoRunHint?.status_label ? (
                  <Badge variant={latestDemoRunHint.needs_attention ? "default" : "strong"}>
                    {latestDemoRunHint.status_label}
                  </Badge>
                ) : null}
              </div>
              {deliveryGuidance?.summary ? (
                <div className="mt-3 rounded-xl border border-border bg-background p-3 text-xs text-muted">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Delivery guidance</p>
                  <p className="mt-1">{deliveryGuidance.summary}</p>
                </div>
              ) : null}
              <div className="mt-3 rounded-xl border border-border bg-background p-3 text-xs text-muted">
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Evidence and rollback prep</p>
                <p className="mt-1">
                  Capture verification evidence before widening rollout, and keep rollback ownership, settings review,
                  and run replay context ready in case the first demo needs another pass.
                </p>
                <p className="mt-2">
                  The clean manual relay is: Playground proves the run, Usage confirms the signal, Verification records
                  the notes, Go-live rehearses the next gate, and Session remains the safe place to re-check context if
                  anything feels off.
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={buildVerificationChecklistHandoffHref({
                    pathname: toSurfacePath(recoveryLane.primarySurface),
                    ...handoffHrefArgs,
                  })}
                >
                  <Button size="sm" variant="secondary">{recoveryLane.primaryLabel}</Button>
                </Link>
                <Link
                  href={buildVerificationChecklistHandoffHref({
                    pathname: toSurfacePath(recoveryLane.secondarySurface),
                    ...handoffHrefArgs,
                  })}
                >
                  <Button size="sm" variant="ghost">{recoveryLane.secondaryLabel}</Button>
                </Link>
                <Link href={verificationChecklistHref}>
                  <Button size="sm" variant="ghost">Capture verification evidence</Button>
                </Link>
                {stepThreeComplete ? (
                  <Link href={goLiveDrillHref}>
                    <Button size="sm" variant="ghost">Open go-live drill</Button>
                  </Link>
                ) : null}
                <Link href={sessionCheckpointHref}>
                  <Button size="sm" variant="ghost">Return to session checkpoint</Button>
                </Link>
              </div>
              <p className="mt-3 text-xs text-muted">Use these actions to continue the guided walkthrough.</p>
            </div>
            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl border border-border bg-background p-4">
                <div>
                  <p className="font-medium text-foreground">Members</p>
                  <p className="mt-1 text-xs text-muted">Invite the first viewer, operator, or approver when the workspace needs shared governance.</p>
                </div>
                <Badge variant="subtle">Optional first</Badge>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-background p-4">
                <div>
                  <p className="font-medium text-foreground">Service account</p>
                  <p className="mt-1 text-xs text-muted">Create one machine identity for the first workload.</p>
                </div>
                <Badge variant={onboardingState?.checklist.service_account_created ? "strong" : "subtle"}>
                  {onboardingState?.summary.service_accounts_total ?? 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-background p-4">
                <div>
                  <p className="font-medium text-foreground">API key</p>
                  <p className="mt-1 text-xs text-muted">Issue and store the first secret for northbound access.</p>
                </div>
                <Badge variant={onboardingState?.checklist.api_key_created ? "strong" : "subtle"}>
                  {onboardingState?.summary.api_keys_total ?? 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-background p-4">
                <div>
                  <p className="font-medium text-foreground">Demo runs</p>
                  <p className="mt-1 text-xs text-muted">Runs started from the onboarding Playground flow.</p>
                </div>
                <Badge variant={onboardingState?.checklist.demo_run_succeeded ? "strong" : onboardingState?.checklist.demo_run_created ? "default" : "subtle"}>
                  {onboardingState?.summary.demo_runs_total ?? 0}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={buildVerificationChecklistHandoffHref({ pathname: "/members", ...handoffHrefArgs })}>
                <Button size="sm" variant="ghost" disabled={!stepOneComplete}>
                  Members
                </Button>
              </Link>
              <Link href={buildVerificationChecklistHandoffHref({ pathname: "/service-accounts", ...handoffHrefArgs })}>
                <Button size="sm" variant="ghost" disabled={!stepTwoComplete}>
                  Service accounts
                </Button>
              </Link>
              <Link href={buildVerificationChecklistHandoffHref({ pathname: "/api-keys", ...handoffHrefArgs })}>
                <Button size="sm" variant="ghost" disabled={!stepTwoComplete}>
                  API keys
                </Button>
              </Link>
              <Link href={buildVerificationChecklistHandoffHref({ pathname: "/playground", ...handoffHrefArgs })}>
                <Button size="sm" variant="ghost" disabled={!stepThreeReady}>
                  Playground
                </Button>
              </Link>
              <Link href={verificationChecklistHref}>
                <Button size="sm" variant="ghost" disabled={!onboardingState?.checklist.demo_run_created}>
                  Verification
                </Button>
              </Link>
            </div>
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
              <p className="text-xs uppercase tracking-[0.15em] text-muted">First-run quickstart</p>
              <ol className="space-y-1 text-xs text-foreground">
                <li>1. If the workspace is shared, invite the first viewer, operator, or approver from Members.</li>
                <li>2. Create a service account scoped to the first workload or external runtime path.</li>
                <li>3. Generate an API key that includes <code>runs:write</code>; store the secret and keep it handy for the first external run.</li>
                <li>4. Use the one-time secret with your agent client or a curl call against <code>POST /api/v1/runs</code>, then return to Playground to inspect or reproduce the same flow in console context.</li>
                <li>5. After the run succeeds, open Verification to capture the evidence before widening scope or moving into go-live rehearsal.</li>
              </ol>
              <p className="text-xs text-muted">
                The first run only needs a simple JSON payload and a bearer key. Playground stays useful as the in-console surface for validating the same path after the external API call succeeds.
              </p>
            </div>
            {latestDemoRun ? (
              <div className="rounded-2xl border border-border bg-background p-4 text-sm">
                <p className="font-medium text-foreground">Latest demo run</p>
                <p className="mt-1 text-xs text-muted">
                  {latestDemoRun.run_id} · {latestDemoRun.status}
                </p>
                {latestDemoRunHint?.status_label ? (
                  <p className="mt-1 text-xs text-muted">{latestDemoRunHint.status_label}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted">Trace: {latestDemoRun.trace_id}</p>
                <p className="mt-1 text-xs text-muted">Created: {new Date(latestDemoRun.created_at).toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted">Updated: {new Date(latestDemoRun.updated_at).toLocaleString()}</p>
                {latestDemoRun.completed_at ? (
                  <p className="mt-1 text-xs text-muted">
                    Completed: {new Date(latestDemoRun.completed_at).toLocaleString()}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted">
              <p>Recommended sequence: members if needed, then service account, API key, Playground, and Verification.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
