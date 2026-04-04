"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildAdminReturnHref, buildHandoffHref } from "@/lib/handoff-query";
import { fetchCurrentWorkspace } from "@/services/control-plane";

type ChecklistState = "complete" | "in_progress" | "pending";

type ChecklistItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  state: ChecklistState;
};

type VerificationChecklistSource = "admin-readiness" | "admin-attention" | "onboarding";
type DeliveryContext = "recent_activity";
type RecentTrackKey = "verification" | "go_live";

function stateLabel(state: ChecklistState): string {
  if (state === "complete") {
    return "Complete";
  }
  if (state === "in_progress") {
    return "In progress";
  }
  return "Pending";
}

function stateVariant(state: ChecklistState): "strong" | "default" | "subtle" {
  if (state === "complete") {
    return "strong";
  }
  if (state === "in_progress") {
    return "default";
  }
  return "subtle";
}

function sectionProgress(items: ChecklistItem[]): string {
  if (items.length === 0) {
    return "0/0";
  }
  const complete = items.filter((item) => item.state === "complete").length;
  return `${complete}/${items.length}`;
}

function normalizeSource(source?: string | null): VerificationChecklistSource | null {
  if (source === "admin-readiness" || source === "admin-attention" || source === "onboarding") {
    return source;
  }
  return null;
}

function normalizeDeliveryContext(value?: string | null): DeliveryContext | null {
  return value === "recent_activity" ? "recent_activity" : null;
}

function normalizeRecentTrackKey(value?: string | null): RecentTrackKey | null {
  if (value === "verification" || value === "go_live") {
    return value;
  }
  return null;
}

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

export function buildVerificationChecklistHandoffHref(args: {
  pathname: string;
  source?: VerificationChecklistSource | null;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  deliveryContext?: string | null;
  recentTrackKey?: string | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | null;
  recentOwnerLabel?: string | null;
}): string {
  const {
    pathname,
    source,
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel,
  } = args;
  if (!source) {
    return pathname;
  }
  return buildHandoffHref(
    pathname,
    {
      source,
      week8Focus,
      attentionWorkspace,
      attentionOrganization,
      deliveryContext: normalizeDeliveryContext(deliveryContext),
      recentTrackKey: normalizeRecentTrackKey(recentTrackKey),
      recentUpdateKind,
      evidenceCount,
      recentOwnerLabel,
    },
    { preserveExistingQuery: true },
  );
}

function buildSettingsIntentHref(
  intent: string | null,
  source: VerificationChecklistSource | null,
  week8Focus?: string | null,
  attentionWorkspace?: string | null,
  attentionOrganization?: string | null,
  deliveryContext?: DeliveryContext | null,
  recentTrackKey?: RecentTrackKey | null,
  recentUpdateKind?: string | null,
  evidenceCount?: number | null,
  recentOwnerLabel?: string | null,
): string {
  return buildVerificationChecklistHandoffHref({
    pathname: intent ? `/settings?intent=${intent}` : "/settings",
    source,
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel,
  });
}

function buildAdminEvidenceHref(args: {
  source: VerificationChecklistSource | null;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  recentTrackKey?: RecentTrackKey | null;
  deliveryContext?: DeliveryContext | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | null;
  recentOwnerLabel?: string | null;
}): string {
  return buildAdminReturnHref("/admin", {
    source: args.source,
    queueSurface: args.recentTrackKey,
    week8Focus: args.week8Focus,
    attentionWorkspace: args.attentionWorkspace,
    attentionOrganization: args.attentionOrganization,
    deliveryContext: args.deliveryContext,
    recentUpdateKind: args.recentUpdateKind,
    evidenceCount: args.evidenceCount,
    recentOwnerLabel: args.recentOwnerLabel,
  });
}

export function Week8VerificationChecklist({
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
    queryKey: ["week8-verification", workspaceSlug],
    queryFn: fetchCurrentWorkspace,
  });

  const normalizedSource = normalizeSource(source);
  const normalizedDeliveryContext = normalizeDeliveryContext(deliveryContext);
  const normalizedRecentTrackKey = normalizeRecentTrackKey(recentTrackKey);
  const normalizedRecentUpdateKind = normalizeRecentUpdateKind(recentUpdateKind);
  const isOnboardingFlow = normalizedSource === "onboarding";
  const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>[0], "pathname"> = {
    source: normalizedSource,
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    deliveryContext: normalizedDeliveryContext,
    recentTrackKey: normalizedRecentTrackKey,
    recentUpdateKind: normalizedRecentUpdateKind,
    evidenceCount,
    recentOwnerLabel,
  };

  const onboardingGuidanceItems = [
    {
      id: "onboarding-guidance-api-keys",
      label: "Create your first API key",
      description: "Finish the workspace service account and key setup so you can authenticate playground runs.",
      href: buildVerificationChecklistHandoffHref({ pathname: "/api-keys", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel }),
    },
    {
      id: "onboarding-guidance-playground",
      label: "Run a demo request in Playground",
      description: "Send a request with the same workspace context to observe the request/response trace manually.",
      href: buildVerificationChecklistHandoffHref({ pathname: "/playground", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel }),
    },
    {
      id: "onboarding-guidance-verification",
      label: "Return with evidence to verification",
      description: "Capture the run trace and mark the checklist items here to close the first-demo loop.",
      href: buildVerificationChecklistHandoffHref({ pathname: "/verification?surface=verification", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel }),
    },
  ];

  const onboarding = data?.onboarding;
  const billing = data?.billing_summary;
  const plan = data?.plan;
  const usage = data?.usage;
  const metrics = usage?.metrics ?? {};
  const demoRunSucceeded = onboarding?.checklist.demo_run_succeeded === true;
  const latestDemoRun = onboarding?.latest_demo_run ?? null;
  const latestDemoRunHint = onboarding?.latest_demo_run_hint ?? null;
  const deliveryGuidance = onboarding?.delivery_guidance ?? null;
  const verificationStatus = deliveryGuidance?.verification_status ?? "pending";
  const goLiveStatus = deliveryGuidance?.go_live_status ?? "pending";
  const verificationIncomplete = verificationStatus !== "complete";
  const demoRunStatus =
    latestDemoRun?.status?.toLowerCase() ?? null;
  const demoRunFailed = demoRunStatus
    ? ["failed", "error", "cancelled", "canceled", "terminated", "timed_out", "timeout"].includes(demoRunStatus)
    : false;
  const demoRunInProgress = demoRunStatus
    ? ["pending", "queued", "running", "in_progress"].includes(demoRunStatus)
    : false;
  const primarySurface = demoRunFailed || demoRunInProgress
    ? "/playground"
    : verificationIncomplete
      ? "/verification?surface=verification"
      : "/go-live?surface=go_live";
  const primaryLabel = demoRunFailed
    ? "Retry first demo"
    : demoRunInProgress
      ? "Monitor the run"
      : verificationIncomplete
        ? "Capture verification evidence"
        : "Finalize go-live drill";

  const onboardingItems: ChecklistItem[] = [
    {
      id: "onboarding-workspace",
      label: "Workspace created and selected",
      description: "Workspace can be loaded via SaaS metadata context.",
      href: buildVerificationChecklistHandoffHref({ pathname: "/onboarding", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel }),
      state: data?.workspace ? "complete" : "pending",
    },
    {
      id: "onboarding-baseline",
      label: "Baseline bootstrap completed",
      description: "Provider and policy baseline seeded for safe first-run.",
      href: buildVerificationChecklistHandoffHref({ pathname: "/onboarding", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel }),
      state: onboarding?.checklist.baseline_ready ? "complete" : onboarding?.checklist.workspace_created ? "in_progress" : "pending",
    },
    {
      id: "onboarding-credentials",
      label: "Service account and API key prepared",
      description: "At least one service account and key path verified.",
      href: buildVerificationChecklistHandoffHref({ pathname: "/onboarding", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel }),
      state:
        onboarding?.checklist.service_account_created && onboarding?.checklist.api_key_created
          ? "complete"
          : onboarding?.checklist.service_account_created || onboarding?.checklist.api_key_created
          ? "in_progress"
          : "pending",
    },
  ];

  const billingItems: ChecklistItem[] = [
    {
      id: "billing-status",
      label: "Billing posture reviewed",
      description: "Current status, provider, and upgrade path reviewed via the managed billing surface.",
      href: buildSettingsIntentHref("manage-plan", normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, normalizedDeliveryContext, normalizedRecentTrackKey, normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel),
      state: billing ? "complete" : "pending",
    },
    {
      id: "billing-warning",
      label: "No unresolved billing warning",
      description: "Past due or warning statuses are either resolved or tracked.",
      href: buildVerificationChecklistHandoffHref({ pathname: "/settings?intent=resolve-billing", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel }),
      state: !billing ? "pending" : billing.status_tone === "warning" ? "in_progress" : "complete",
    },
    {
      id: "billing-usage",
      label: "Usage and plan pressure checked",
      description: "Billing window and limit pressure reviewed before go-live.",
      href: buildVerificationChecklistHandoffHref({ pathname: "/usage", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel }),
      state: usage ? "complete" : "pending",
    },
  ];

  const runFlowItems: ChecklistItem[] = [
    {
      id: "run-demo-created",
      label: "Demo run created",
      description: "A first run has been submitted from onboarding or playground.",
      href: buildVerificationChecklistHandoffHref({ pathname: "/onboarding", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel }),
      state: onboarding?.checklist.demo_run_created ? "complete" : "pending",
    },
    {
      id: "run-demo-succeeded",
      label: "Demo run succeeded",
      description: "At least one run completed successfully in workspace context.",
      href: buildVerificationChecklistHandoffHref({ pathname: "/onboarding", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel }),
      state: onboarding?.checklist.demo_run_succeeded ? "complete" : onboarding?.checklist.demo_run_created ? "in_progress" : "pending",
    },
    {
      id: "run-playground",
      label: "Run flow validated in playground",
      description: "Request/response path reviewed for the selected workspace.",
      href: buildVerificationChecklistHandoffHref({ pathname: "/playground", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel }),
      state: onboarding?.checklist.demo_run_created ? "in_progress" : "pending",
    },
  ];

  const evidenceItems: ChecklistItem[] = [
    {
      id: "evidence-usage",
      label: "Usage evidence captured",
      description: "Runs and active-provider metrics can be observed in usage dashboard.",
      href: buildVerificationChecklistHandoffHref({ pathname: "/usage", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel }),
      state: typeof metrics.runs_created?.used === "number" && metrics.runs_created.used > 0 ? "complete" : "pending",
    },
    {
      id: "evidence-feature-gates",
      label: "Feature-gate posture reviewed",
      description: "Verify SSO, audit export, and dedicated environment gating through the upgrade intent so the feature set matches the new plan.",
      href: buildSettingsIntentHref(
        "upgrade",
        normalizedSource,
        week8Focus,
        attentionWorkspace,
        attentionOrganization,
        normalizedDeliveryContext,
        normalizedRecentTrackKey,
        normalizedRecentUpdateKind,
        evidenceCount,
        recentOwnerLabel,
      ),
      state: plan?.features ? "complete" : "pending",
    },
    {
      id: "evidence-artifacts",
      label: "Artifacts and audit evidence reviewed",
      description: "Artifacts, audit payloads, and exported evidence can be traced back to the same workspace handoff.",
      href: buildVerificationChecklistHandoffHref({
        pathname: "/artifacts",
        source: normalizedSource,
        week8Focus,
        attentionWorkspace,
        attentionOrganization,
        deliveryContext: normalizedDeliveryContext,
        recentTrackKey: normalizedRecentTrackKey,
        recentUpdateKind: normalizedRecentUpdateKind,
        evidenceCount,
        recentOwnerLabel,
      }),
      state: latestDemoRun ? "in_progress" : "pending",
    },
    {
      id: "evidence-admin",
      label: "Platform snapshot reviewed",
      description: "Admin overview reviewed with latest rollout and plan distribution.",
      href: buildAdminEvidenceHref({
        source: normalizedSource,
        week8Focus,
        attentionWorkspace: attentionWorkspace ?? workspaceSlug,
        attentionOrganization,
        recentTrackKey: normalizedRecentTrackKey,
        deliveryContext: normalizedDeliveryContext,
        recentUpdateKind: normalizedRecentUpdateKind,
        evidenceCount,
        recentOwnerLabel,
      }),
      state: "in_progress",
    },
    {
      id: "evidence-go-live-drill",
      label: "Mock go-live drill staged",
      description: "Rehearsal phases and handoff evidence path reviewed in the go-live drill page.",
      href: buildVerificationChecklistHandoffHref({ pathname: "/go-live?surface=go_live", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel }),
      state: demoRunSucceeded ? "in_progress" : "pending",
    },
  ];

  const sections: Array<{ title: string; description: string; items: ChecklistItem[] }> = [
    {
      title: "Onboarding",
      description: "Workspace creation, baseline bootstrap, and credentials readiness.",
      items: onboardingItems,
    },
    {
      title: "Billing",
      description: "Billing posture and usage pressure checks before launch.",
      items: billingItems,
    },
    {
      title: "Run flow",
      description: "First run path validation from creation to success.",
      items: runFlowItems,
    },
    {
      title: "Evidence capture",
      description: "Operational evidence checkpoints for Week 8 handoff.",
      items: evidenceItems,
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Week 8 checklist status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {isLoading ? <p className="text-muted">Loading workspace verification context...</p> : null}
          {isError ? <p className="text-muted">Unable to load live status, checklist still provides guided links.</p> : null}
          <p className="text-muted">
            Use this checklist as a shared readiness surface for onboarding, billing posture, first run validation,
            and evidence collection before a mock go-live drill.
          </p>
        </CardContent>
      </Card>

      {latestDemoRun ? (
        <Card>
          <CardHeader>
            <CardTitle>Latest demo run context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted">
              Run <span className="font-medium text-foreground">{latestDemoRun.run_id}</span> · status{" "}
              <span className="font-medium text-foreground">{latestDemoRun.status}</span> · trace{" "}
              <span className="font-medium text-foreground">{latestDemoRun.trace_id}</span>
            </p>
            {latestDemoRunHint?.status_label ? (
              <p className="text-xs text-muted">Hint: {latestDemoRunHint.status_label}</p>
            ) : null}
            {deliveryGuidance?.summary ? (
              <p className="text-xs text-muted">Delivery: {deliveryGuidance.summary}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildVerificationChecklistHandoffHref({ pathname: primarySurface, ...handoffHrefArgs })}
                className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                {primaryLabel}
              </Link>
              {demoRunSucceeded && verificationIncomplete ? (
                <Link
                  href={buildVerificationChecklistHandoffHref({
                    pathname: "/usage",
                    ...handoffHrefArgs,
                  })}
                  className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                >
                  Collect usage evidence
                </Link>
              ) : null}
              {latestDemoRun ? (
                <Link
                  href={buildVerificationChecklistHandoffHref({
                    pathname: "/artifacts",
                    ...handoffHrefArgs,
                  })}
                  className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                >
                  Review artifacts
                </Link>
              ) : null}
              {goLiveStatus === "complete" ? (
                <Link
                  href={buildVerificationChecklistHandoffHref({
                    pathname: "/go-live?surface=go_live",
                    ...handoffHrefArgs,
                  })}
                  className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                >
                  Lock go-live drill
                </Link>
              ) : null}
            </div>
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted">
              <p className="font-medium text-foreground">Rollback prep</p>
              <p className="mt-1">
                Review controlled rollback guidance before widening scope, especially if the demo run needed recovery.
              </p>
              <Link
                href={buildVerificationChecklistHandoffHref({ pathname: "/settings?intent=rollback", ...handoffHrefArgs })}
                className="mt-2 inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                Review rollback guidance
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isOnboardingFlow ? (
        <Card>
          <CardHeader>
            <CardTitle>First-demo lane guidance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted">
              This verification surface is part of the onboarding lane, so these links preserve <code>source=onboarding</code> while you move from
              first key creation to the playground demo and back here for the final checklist evidence. Each step stays navigation-only—no automation, support,
              or impersonation is implied.
            </p>
            <div className="space-y-2">
              {onboardingGuidanceItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex flex-col gap-1">
                    <p className="font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted">{item.description}</p>
                  </div>
                  <Link
                    href={item.href}
                    className="mt-3 inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                  >
                    Continue the ordered walkthrough
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Next steps for go-live readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            After ticking the Week 8 checklist, keep the same workspace context and use this page as the launch pad
            for the mock go-live drill. Record the run trace in{" "}
            <Link href={buildVerificationChecklistHandoffHref({ pathname: "/usage", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel })}>Usage</Link>, verify handoff
            notes in the delivery tracking panel on this page, inspect supporting bundles in{" "}
            <Link href={buildVerificationChecklistHandoffHref({ pathname: "/artifacts", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel })}>Artifacts</Link>, and then open the{" "}
            <Link href={buildVerificationChecklistHandoffHref({ pathname: "/go-live?surface=go_live", source: normalizedSource, week8Focus, attentionWorkspace, attentionOrganization, deliveryContext: normalizedDeliveryContext, recentTrackKey: normalizedRecentTrackKey, recentUpdateKind: normalizedRecentUpdateKind, evidenceCount, recentOwnerLabel })}>Go-live drill</Link> to
            rehearse the full flow. Each link simply switches context back to the workspace and carries the readiness
            focus along.
          </p>
        </CardContent>
      </Card>

      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>{section.title}</span>
              <Badge variant="subtle">{sectionProgress(section.items)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted">{section.description}</p>
            {section.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{item.label}</p>
                  <Badge variant={stateVariant(item.state)}>{stateLabel(item.state)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">{item.description}</p>
                <Link
                  href={item.href}
                  className="mt-3 inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                >
                  Open related surface
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
