"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { buildVerificationChecklistHandoffHref } from "@/components/verification/week8-verification-checklist";
import type { ControlPlaneRunCreateRequest } from "@/lib/control-plane-types";
import {
  ControlPlaneRequestError,
  createRun,
  fetchCurrentWorkspace,
  fetchRun,
  fetchRunGraph,
  isControlPlaneRequestError,
} from "@/services/control-plane";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <Textarea className="min-h-[320px]" defaultValue="" />,
});

type PlaygroundSource = "onboarding" | "admin-readiness" | "admin-attention";
type DeliveryContext = "recent_activity";
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

function normalizeSource(source: string | null | undefined): PlaygroundSource | null {
  if (source === "onboarding" || source === "admin-readiness" || source === "admin-attention") {
    return source;
  }
  return null;
}

function normalizeDeliveryContext(value?: string | null): DeliveryContext | null {
  return value === "recent_activity" ? "recent_activity" : null;
}

function normalizeRecentTrackKey(value?: string | null): "verification" | "go_live" | null {
  if (value === "verification" || value === "go_live") {
    return value;
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

function getPlaygroundGuide(args: {
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
  } | null;
  latestDemoRunHint?: {
    status_label: string;
    is_terminal: boolean;
    needs_attention: boolean;
    suggested_action: string | null;
  } | null;
  deliveryGuidance?: {
    verification_status: string;
    go_live_status: string;
    summary: string;
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

  if (args.latestDemoRunHint?.needs_attention) {
    return {
      body:
        args.latestDemoRunHint.suggested_action ??
        "Keep Playground focused on the current demo run until it settles, then continue to verification evidence capture.",
      actionLabel: args.latestDemoRunHint.is_terminal ? "Retry Playground run" : "Inspect Playground status",
      actionSurface: "playground",
      blockers,
    };
  }
  if (args.onboarding?.recommended_next_surface && args.onboarding.recommended_next_surface !== "playground") {
    return {
      body:
        args.onboarding.recommended_next_reason ??
        "Playground is no longer the primary blocker. Continue with the recommended onboarding surface.",
      actionLabel: args.onboarding.recommended_next_action ?? "Continue onboarding",
      actionSurface: args.onboarding.recommended_next_surface,
      blockers,
    };
  }
  if (args.onboarding?.checklist.demo_run_succeeded === true) {
    if (args.deliveryGuidance?.verification_status !== "complete") {
      return {
        body:
          args.deliveryGuidance?.summary ??
          "Demo run succeeded. Continue to Verification and capture evidence before go-live rehearsal.",
        actionLabel: "Open Verification",
        actionSurface: "verification",
        blockers,
      };
    }
    if (args.deliveryGuidance?.go_live_status !== "complete") {
      return {
        body:
          args.deliveryGuidance?.summary ??
          "Verification is complete. Continue into the go-live drill and keep the delivery track updated.",
        actionLabel: "Open go-live drill",
        actionSurface: "go-live",
        blockers,
      };
    }
    return {
      body:
        args.deliveryGuidance?.summary ??
        "Demo run succeeded. Verification and go-live guidance are both available from this Playground handoff lane.",
      actionLabel: "Open Verification",
      actionSurface: "verification",
      blockers,
    };
  }
  return {
    body: "Use this surface to create or confirm the first successful demo run, then capture evidence.",
    actionLabel: "Capture verification evidence",
    actionSurface: "verification",
    blockers,
  };
}

function buildDefaultRequest(
  workspaceSlug: string,
  source: PlaygroundSource | null,
): ControlPlaneRunCreateRequest {
  return {
    input: {
      kind: "user_instruction",
      text:
        source === "admin-readiness"
          ? "Summarize the current workspace readiness posture and recommend the next operator action."
          : source === "admin-attention"
            ? "Summarize the latest workspace delivery follow-up and recommend the next operator action."
            : "Summarize the current approval queue and recommend the next operator action.",
    },
    entry_agent_id: "catalog_router",
    context: {
      source_app: "web_console",
      onboarding_flow: "workspace_first_demo",
      workspace_slug: workspaceSlug,
      conversation_id: `onboarding-${workspaceSlug}`,
    },
    policy_context: {
      risk_tier: "default",
      labels: ["onboarding", "demo"],
    },
    options: {
      async: true,
      priority: "normal",
    },
  };
}

function buildInitialResponse(source: PlaygroundSource | null): string {
  if (source === "admin-readiness") {
    return "Invoke a run to capture a real readiness follow-up trace, then use the returned ids for verification and admin handoff evidence.";
  }
  if (source === "admin-attention") {
    return "Invoke a run to capture a governed follow-up trace, then carry the ids back into verification, usage, or admin queue review.";
  }
  return "Invoke a run to inspect the queued response, trace id, and first-run metadata.";
}

function describeRecentDeliverySummary(args: {
  recentTrackKey?: string | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | null;
  recentOwnerLabel?: string | null;
}): string {
  const parts = [
    args.recentTrackKey ? `${args.recentTrackKey} track` : null,
    args.recentUpdateKind ? args.recentUpdateKind.replaceAll("_", " ") : null,
    typeof args.evidenceCount === "number"
      ? `${args.evidenceCount} evidence ${args.evidenceCount === 1 ? "item" : "items"}`
      : null,
    args.recentOwnerLabel ? `owner ${args.recentOwnerLabel}` : null,
  ].filter(Boolean);
  return parts.length ? ` Latest admin context: ${parts.join(" · ")}.` : "";
}

function getContextCardContent(args: {
  source: PlaygroundSource | null;
  recentTrackKey?: string | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | null;
  recentOwnerLabel?: string | null;
  latestDemoRunHint?: {
    status_label: string;
    is_terminal: boolean;
    needs_attention: boolean;
    suggested_action: string | null;
  } | null;
  deliveryGuidance?: {
    verification_status: string;
    go_live_status: string;
    summary: string;
  } | null;
}): { title: string; body: string; metaLines?: string[] } | null {
  const extra = describeRecentDeliverySummary(args);
  const metaLines = [
    args.latestDemoRunHint?.status_label,
    args.latestDemoRunHint?.suggested_action,
    args.deliveryGuidance?.summary,
  ].filter((line): line is string => typeof line === "string" && line.trim() !== "");
  if (args.source === "onboarding") {
    return {
      title: "Onboarding first demo",
      body:
        "This workspace was sent here to create the first real run. Keep the payload simple, confirm the run queues successfully, then carry the returned ids into verification or API key follow-up."
        + extra,
      metaLines: metaLines.length > 0 ? metaLines : undefined,
    };
  }
  if (args.source === "admin-readiness") {
    return {
      title: "Admin readiness follow-up",
      body:
        "You arrived from the Week 8 readiness lane. This page does not automate remediation; it only helps you produce a real run, inspect the response, and gather evidence before returning to readiness review."
        + extra,
      metaLines: metaLines.length > 0 ? metaLines : undefined,
    };
  }
  if (args.source === "admin-attention") {
    return {
      title: "Admin queue run follow-up",
      body:
        "You arrived from an admin follow-up path. Use this page to produce or inspect a governed run as supporting evidence, then continue manually into verification, usage, or settings."
        + extra,
      metaLines: metaLines.length > 0 ? metaLines : undefined,
    };
  }
  return null;
}

function getFirstRunTip(args: {
  source: PlaygroundSource | null;
  latestDemoRunHint: {
    status_label: string;
    is_terminal: boolean;
    needs_attention: boolean;
    suggested_action: string | null;
  } | null;
  deliveryGuidance: {
    verification_status: string;
    go_live_status: string;
    summary: string;
  } | null;
}): string {
  if (args.latestDemoRunHint?.needs_attention && args.latestDemoRunHint.suggested_action) {
    return args.latestDemoRunHint.suggested_action;
  }
  if (args.source === "admin-readiness") {
    return "Use a narrow request that proves this workspace can queue a governed run. Keep `input.kind` as `user_instruction`, preserve `POST /api/v1/runs`, and avoid broad payload changes until the first response succeeds.";
  }
  if (args.source === "admin-attention") {
    return "Use a narrow request that supports the current admin follow-up. The goal here is to create concrete run evidence, not to automate any remediation.";
  }
  if (args.deliveryGuidance?.summary) {
    return `${args.deliveryGuidance.summary} Keep \`input.kind\` as \`user_instruction\` for onboarding.`;
  }
  return "Keep `input.kind` as `user_instruction` for onboarding. You can adjust `entry_agent_id`, labels, and context metadata, but the request must still match `POST /api/v1/runs`.";
}

function getWhatToLookFor(source: PlaygroundSource | null): string {
  if (source === "admin-readiness") {
    return "A healthy follow-up returns `run_id`, `trace_id`, `status`, and `workflow_status`. Use those ids as concrete readiness evidence, then continue into verification or return to the admin review lane.";
  }
  if (source === "admin-attention") {
    return "A healthy follow-up returns `run_id`, `trace_id`, `status`, and `workflow_status`. Use those ids as queue evidence and carry them back into verification, usage, or settings.";
  }
  return "A successful first-run response returns `run_id`, `trace_id`, `status`, and `workflow_status`. Use those ids for logs, replay, and verification follow-up.";
}

function format(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

type PlanLimitNotice = {
  message: string;
  scope: string | null;
  used: number | null;
  limit: number | null;
  periodStart: string | null;
  periodEnd: string | null;
};

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function formatMetricLabel(scope: string | null): string {
  if (scope === "runs_created") {
    return "monthly runs";
  }
  if (scope === "active_tool_providers") {
    return "active providers";
  }
  return "workspace quota";
}

function formatDateLabel(value: string | null): string {
  if (!value) {
    return "";
  }
  return new Date(value).toLocaleDateString();
}

function getPlanLimitNotice(error: unknown): PlanLimitNotice | null {
  if (!isControlPlaneRequestError(error) || error.code !== "plan_limit_exceeded") {
    return null;
  }

  return {
    message: error.message,
    scope: readString(error.details.scope),
    used: readNumber(error.details.used),
    limit: readNumber(error.details.limit),
    periodStart: readString(error.details.period_start),
    periodEnd: readString(error.details.period_end),
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ControlPlaneRequestError) {
    return error.message;
  }
  return error instanceof Error ? error.message : "Unknown error";
}

export function PlaygroundPanel({
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
  const normalizedSource = normalizeSource(source);
  const normalizedDeliveryContext = normalizeDeliveryContext(deliveryContext);
  const normalizedRecentTrackKey = normalizeRecentTrackKey(recentTrackKey);
  const workspaceQuery = useQuery({
    queryKey: ["workspace-onboarding-state", workspaceSlug],
    queryFn: fetchCurrentWorkspace,
  });
  const onboardingState = workspaceQuery.data?.onboarding ?? null;
  const latestDemoRunHint = onboardingState?.latest_demo_run_hint ?? null;
  const deliveryGuidance = onboardingState?.delivery_guidance ?? null;
  const contextCard = getContextCardContent({
    source: normalizedSource,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel,
    latestDemoRunHint,
    deliveryGuidance,
  });
  const onboardingGuide = getPlaygroundGuide({
    onboarding: onboardingState,
    latestDemoRunHint,
    deliveryGuidance,
  });
  const latestDemoRun = onboardingState?.latest_demo_run ?? null;
  const [requestBody, setRequestBody] = useState<string>(
    format(buildDefaultRequest(workspaceSlug, normalizedSource)),
  );
  const [responseBody, setResponseBody] = useState<string>(buildInitialResponse(normalizedSource));
  const [statusMessage, setStatusMessage] = useState<string>("Ready for first demo run");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [planLimitNotice, setPlanLimitNotice] = useState<PlanLimitNotice | null>(null);
  const planLimitPeriodLabel =
    planLimitNotice?.periodStart || planLimitNotice?.periodEnd
      ? `${formatDateLabel(planLimitNotice?.periodStart ?? null)} to ${formatDateLabel(planLimitNotice?.periodEnd ?? null)}`
      : "the current billing period";
  const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>[0], "pathname"> = {
    source: normalizedSource,
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    deliveryContext: normalizedDeliveryContext,
    recentTrackKey: normalizedRecentTrackKey,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel,
  };
  const usageHref = buildVerificationChecklistHandoffHref({ pathname: "/usage", ...handoffHrefArgs });
  const settingsHref = buildVerificationChecklistHandoffHref({
    pathname: "/settings?intent=manage-plan",
    ...handoffHrefArgs,
  });
  const serviceAccountsHref = buildVerificationChecklistHandoffHref({
    pathname: "/service-accounts",
    ...handoffHrefArgs,
  });
  const apiKeysHref = buildVerificationChecklistHandoffHref({ pathname: "/api-keys", ...handoffHrefArgs });
  const verificationHref = buildVerificationChecklistHandoffHref({
    pathname: "/verification?surface=verification",
    ...handoffHrefArgs,
  });
  const demoFailedStatuses = new Set([
    "failed",
    "error",
    "terminated",
    "cancelled",
    "canceled",
    "timed_out",
    "timeout",
  ]);
  const demoRunningStatuses = new Set(["pending", "queued", "running", "in_progress"]);
  const normalizedDemoStatus = latestDemoRun?.status?.toLowerCase() ?? "";
  const demoRunSucceeded = onboardingState?.checklist.demo_run_succeeded ?? false;
  const demoRunCreated = onboardingState?.checklist.demo_run_created ?? false;
  const demoRunFailed = latestDemoRun ? demoFailedStatuses.has(normalizedDemoStatus) : false;
  const demoRunInProgress = latestDemoRun
    ? demoRunningStatuses.has(normalizedDemoStatus) || (demoRunCreated && !demoRunSucceeded && !demoRunFailed)
    : false;

  const invokeMutation = useMutation({
    mutationFn: async (input: ControlPlaneRunCreateRequest) => createRun(input),
    onSuccess: async (result) => {
      const [run, graph] = await Promise.allSettled([fetchRun(result.run_id), fetchRunGraph(result.run_id)]);
      setResponseBody(
        format({
          queued: result,
          run: run.status === "fulfilled" ? run.value : null,
          graph_summary:
            graph.status === "fulfilled"
              ? {
                  steps: graph.value.steps.length,
                  approvals: graph.value.approvals.length,
                  artifacts: graph.value.artifacts.length,
                }
              : null,
        }),
      );
      setStatusMessage(`Run queued: ${result.run_id}`);
      setErrorMessage(null);
      setPlanLimitNotice(null);
    },
    onError: (error) => {
      setStatusMessage("Invoke failed");
      setErrorMessage(getErrorMessage(error));
      setPlanLimitNotice(getPlanLimitNotice(error));
      setResponseBody(
        format({
          error: {
            message: getErrorMessage(error),
            code: isControlPlaneRequestError(error) ? error.code : "unknown_error",
            details: isControlPlaneRequestError(error) ? error.details : {},
          },
        }),
      );
    },
  });

  async function invokeRun(): Promise<void> {
    let parsed: ControlPlaneRunCreateRequest;
    try {
      parsed = JSON.parse(requestBody) as ControlPlaneRunCreateRequest;
    } catch (error) {
      setErrorMessage(`Invalid JSON: ${error instanceof Error ? error.message : "Unable to parse request"}`);
      setStatusMessage("Broken request");
      return;
    }

    setStatusMessage("Invoking run...");
    setErrorMessage(null);
    setPlanLimitNotice(null);
    setResponseBody("Waiting for control plane response...");
    await invokeMutation.mutateAsync(parsed);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Request</CardTitle>
            <p className="mt-1 text-xs text-muted">{statusMessage}</p>
          </div>
          <Button size="sm" onClick={() => void invokeRun()} disabled={invokeMutation.isPending}>
            {invokeMutation.isPending ? "Invoking..." : "Invoke"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {contextCard ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 text-xs text-sky-950">
              <p className="font-medium text-sky-950">{contextCard.title}</p>
              <p className="mt-1">{contextCard.body}</p>
              {contextCard.metaLines?.length ? (
                <div className="mt-2 space-y-1">
                  {contextCard.metaLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-950">
            <p className="font-medium text-amber-950">Preflight reminder</p>
            <p className="mt-1 text-amber-900">
              Before you invoke a run, reconfirm key scope, plan boundary, usage pressure, and any manual billing
              review that keeps delivery approved. This check is still a human step; there is no automated block in
              place yet.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={serviceAccountsHref}
                className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950 transition hover:bg-amber-100/60"
              >
                Review service account
              </Link>
              <Link
                href={apiKeysHref}
                className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950 transition hover:bg-amber-100/60"
              >
                Check API key scope
              </Link>
              <Link
                href={usageHref}
                className="inline-flex items-center justify-center rounded-xl border border-amber-950 px-3 py-2 font-medium text-amber-950 transition hover:bg-amber-100"
              >
                Review usage pressure
              </Link>
              <Link
                href={settingsHref}
                className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950 transition hover:bg-amber-100/60"
              >
                Confirm plan and billing
              </Link>
              <Link
                href={verificationHref}
                className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950 transition hover:bg-amber-100/60"
              >
                Prepare verification handoff
              </Link>
            </div>
          </div>
          <MonacoEditor
            height="360px"
            theme="vs-dark"
            defaultLanguage="json"
            value={requestBody}
            onChange={(value) => setRequestBody(value ?? "")}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
            }}
          />
          {errorMessage ? <p className="text-xs text-red-500">{errorMessage}</p> : null}
          {planLimitNotice ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 text-xs text-amber-950">
              <p className="font-medium text-amber-950">Plan limit reached</p>
              <p className="mt-1">
                {planLimitNotice.message} This workspace has used {planLimitNotice.used ?? "?"} of{" "}
                {planLimitNotice.limit ?? "?"} {formatMetricLabel(planLimitNotice.scope)} for {planLimitPeriodLabel}.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={usageHref}
                  className="inline-flex items-center justify-center rounded-xl border border-amber-950 px-3 py-2 font-medium text-amber-950 transition hover:bg-amber-100"
                >
                  Review usage
                </Link>
                <Link
                  href={settingsHref}
                  className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950 transition hover:bg-amber-100/60"
                >
                  Check plan and limits
                </Link>
              </div>
            </div>
          ) : null}
          <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted">
            <p className="font-medium text-foreground">First-run tip</p>
            <p className="mt-1">{getFirstRunTip({ source: normalizedSource, latestDemoRunHint, deliveryGuidance })}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={serviceAccountsHref}
                className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 font-medium text-foreground transition hover:bg-muted/60"
              >
                Review service accounts
              </Link>
              <Link
                href={apiKeysHref}
                className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 font-medium text-foreground transition hover:bg-muted/60"
              >
                Check API key scope
              </Link>
              <Link
                href={verificationHref}
                className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 font-medium text-foreground transition hover:bg-muted/60"
              >
                Open verification
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted">
            <p className="font-medium text-foreground">Onboarding handoff</p>
            <p className="mt-1">{onboardingGuide.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={buildVerificationChecklistHandoffHref({ pathname: toSurfacePath(onboardingGuide.actionSurface), ...handoffHrefArgs })}
                className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 font-medium text-foreground transition hover:bg-muted/60"
              >
                {onboardingGuide.actionLabel}
              </Link>
            </div>
            {onboardingGuide.blockers.length > 0 ? (
              <div className="mt-3 space-y-1">
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-muted">Current blockers</p>
                {onboardingGuide.blockers.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>First-demo recovery</CardTitle>
          <CardDescription>Recover from failed/demo-in-progress states and keep evidence flowing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted">
            {demoRunFailed
              ? "Latest demo run failed. Retry it while keeping the current Playground payload, then capture evidence once the trace succeeds."
              : demoRunInProgress
                ? "A demo run is underway. Keep monitoring the trace and hold off on verification until it completes."
                : demoRunSucceeded
                  ? "First demo run succeeded. Continue capturing verification evidence or advance the go-live rehearsal."
                  : "No demo run yet. Submit the payload above and keep this lane ready for instant verification handoff."}
          </p>
          {latestDemoRun ? (
            <div className="rounded-xl border border-border/70 bg-background p-3 text-xs text-muted">
              <p className="font-medium text-foreground">Latest demo run summary</p>
              <p className="mt-1">
                {latestDemoRun.run_id} · {latestDemoRun.status} · trace {latestDemoRun.trace_id}
              </p>
              {latestDemoRunHint?.status_label ? <p className="mt-1">{latestDemoRunHint.status_label}</p> : null}
              {latestDemoRunHint?.suggested_action ? <p className="mt-1">{latestDemoRunHint.suggested_action}</p> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {demoRunFailed ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={invokeMutation.isPending}
                onClick={() => void invokeRun()}
              >
                {invokeMutation.isPending ? "Retrying..." : "Retry Playground run"}
              </Button>
            ) : (
              <Link
                href={buildVerificationChecklistHandoffHref({ pathname: "/playground", ...handoffHrefArgs })}
                className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                {demoRunInProgress
                  ? "Monitor Playground run"
                  : demoRunSucceeded
                    ? "Return to Playground"
                    : "Start Playground run"}
              </Link>
            )}
            {demoRunFailed ? (
              <>
                <Link
                  href={buildVerificationChecklistHandoffHref({
                    pathname: "/verification?surface=verification",
                    ...handoffHrefArgs,
                  })}
                  className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
                >
                  Capture verification evidence
                </Link>
                <Link
                  href={buildVerificationChecklistHandoffHref({ pathname: "/usage", ...handoffHrefArgs })}
                  className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
                >
                  Review usage trace
                </Link>
                <Link
                  href={buildVerificationChecklistHandoffHref({ pathname: "/settings?intent=rollback", ...handoffHrefArgs })}
                  className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
                >
                  Review rollback prep
                </Link>
              </>
            ) : null}
            {demoRunInProgress ? (
              <Link
                href={buildVerificationChecklistHandoffHref({
                  pathname: "/verification?surface=verification",
                  ...handoffHrefArgs,
                })}
                className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                Review verification checklist
              </Link>
            ) : null}
            {demoRunSucceeded ? (
              <>
                <Link
                  href={buildVerificationChecklistHandoffHref({
                    pathname: "/verification?surface=verification",
                    ...handoffHrefArgs,
                  })}
                  className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
                >
                  Continue verification
                </Link>
                <Link
                  href={buildVerificationChecklistHandoffHref({
                    pathname: "/go-live?surface=go_live",
                    ...handoffHrefArgs,
                  })}
                  className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
                >
                  Start go-live rehearsal
                </Link>
              </>
            ) : null}
          </div>
          {deliveryGuidance ? (
            <div className="rounded-xl border border-border/70 bg-background p-3 text-xs text-muted">
              <p className="font-medium text-foreground">Delivery guidance</p>
              <p>
                Verification: {deliveryGuidance.verification_status}; go-live: {deliveryGuidance.go_live_status}.
              </p>
              <p>{deliveryGuidance.summary}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Response</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea className="min-h-[360px] font-mono text-xs" value={responseBody} readOnly />
          <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted">
            <p className="font-medium text-foreground">What to look for</p>
            <p className="mt-1">{getWhatToLookFor(normalizedSource)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
