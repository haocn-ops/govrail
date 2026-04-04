"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildVerificationChecklistHandoffHref } from "@/components/verification/week8-verification-checklist";
import { buildAdminReturnHref } from "@/lib/handoff-query";
import { fetchCurrentWorkspace } from "@/services/control-plane";

type DrillState = "ready" | "attention" | "pending";

type DrillStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  state: DrillState;
};

type GoLiveSource = "admin-attention" | "admin-readiness" | "onboarding";
type DeliveryContext = "recent_activity";
type RecentTrackKey = "verification" | "go_live";

function stateLabel(state: DrillState): string {
  if (state === "ready") {
    return "Ready";
  }
  if (state === "attention") {
    return "Needs attention";
  }
  return "Pending";
}

function stateVariant(state: DrillState): "strong" | "default" | "subtle" {
  if (state === "ready") {
    return "strong";
  }
  if (state === "attention") {
    return "default";
  }
  return "subtle";
}

function progressLabel(steps: DrillStep[]): string {
  if (steps.length === 0) {
    return "0/0";
  }
  const ready = steps.filter((step) => step.state === "ready").length;
  return `${ready}/${steps.length}`;
}

function normalizeSource(value?: string | null): GoLiveSource | null {
  if (value === "admin-attention" || value === "admin-readiness" || value === "onboarding") {
    return value;
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

export function MockGoLiveDrillPanel({
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
    queryKey: ["mock-go-live-drill", workspaceSlug],
    queryFn: fetchCurrentWorkspace,
  });

  const onboarding = data?.onboarding;
  const billing = data?.billing_summary;
  const usage = data?.usage;
  const plan = data?.plan;
  const metrics = usage?.metrics ?? {};

  const normalizedSource = normalizeSource(source);
  const normalizedRecentTrackKey = normalizeRecentTrackKey(recentTrackKey);
  const buildHref = (pathname: string): string =>
    buildVerificationChecklistHandoffHref({
      pathname,
      source: normalizedSource,
      week8Focus,
      attentionWorkspace,
      attentionOrganization,
      deliveryContext: normalizeDeliveryContext(deliveryContext),
      recentTrackKey: normalizedRecentTrackKey,
      recentUpdateKind,
      evidenceCount,
      recentOwnerLabel,
    });
  const adminReturnHref = buildAdminReturnHref("/admin", {
    source: normalizedSource,
    queueSurface: normalizedRecentTrackKey,
    week8Focus,
    attentionWorkspace: attentionWorkspace ?? workspaceSlug,
    attentionOrganization,
    deliveryContext: normalizeDeliveryContext(deliveryContext),
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel,
  });
  const phases: Array<{ title: string; description: string; steps: DrillStep[] }> = [
    {
      title: "Prepare workspace",
      description: "Confirm the workspace is real, bootstrapped, and has the minimum operator credentials.",
      steps: [
        {
          id: "workspace-selected",
          title: "Workspace context confirmed",
          description: "The selected workspace resolves through SaaS metadata and is ready for drill operations.",
          href: buildHref("/onboarding"),
          state: data?.workspace ? "ready" : "pending",
        },
        {
          id: "baseline-ready",
          title: "Baseline bootstrap complete",
          description: "Provider and policy baseline exists before the rehearsal starts.",
          href: buildHref("/onboarding"),
          state: onboarding?.checklist.baseline_ready ? "ready" : onboarding?.checklist.workspace_created ? "attention" : "pending",
        },
        {
          id: "credentials-ready",
          title: "Credential path verified",
          description: "Service account and API key paths have been prepared for the mock operator flow.",
          href: buildHref("/onboarding"),
          state:
            onboarding?.checklist.service_account_created && onboarding?.checklist.api_key_created
              ? "ready"
              : onboarding?.checklist.service_account_created || onboarding?.checklist.api_key_created
                ? "attention"
                : "pending",
        },
      ],
    },
      {
        title: "Validate billing and feature posture",
        description: "Review whether the workspace can safely stay on its current plan during the drill.",
        steps: [
          {
            id: "billing-reviewed",
            title: "Billing summary reviewed",
            description: "Current provider, subscription status, and plan binding are confirmed through the managed billing surface.",
            href: buildHref("/settings?intent=manage-plan"),
            state: billing ? "ready" : "pending",
          },
          {
            id: "billing-warning-resolved",
            title: "No blocking billing warning",
            description: "Past-due or warning states are either cleared or explicitly tracked before go-live rehearsal.",
            href: buildHref("/settings?intent=resolve-billing"),
            state: !billing ? "pending" : billing.status_tone === "warning" ? "attention" : "ready",
          },
          {
            id: "feature-gates-reviewed",
            title: "Feature-gate posture checked",
            description: "Audit export, SSO, and dedicated environment gating are reviewed via the upgrade intent so feature availability matches the plan.",
            href: buildHref("/settings?intent=upgrade"),
            state: plan?.features ? "ready" : "pending",
          },
      ],
    },
    {
      title: "Execute operator flow",
      description: "Run the same path a pilot customer would exercise during a controlled launch rehearsal.",
      steps: [
        {
          id: "verification-complete",
          title: "Week 8 verification checklist reviewed",
          description: "The structured onboarding, billing, run, and evidence checks have been walked through.",
          href: buildHref("/verification?surface=verification"),
          state: onboarding?.checklist.demo_run_created ? "ready" : "attention",
        },
        {
          id: "demo-run-success",
          title: "Demo run completed successfully",
          description: "At least one run completed and the workspace shows latest demo run evidence.",
          href: buildHref("/playground"),
          state: onboarding?.checklist.demo_run_succeeded ? "ready" : onboarding?.checklist.demo_run_created ? "attention" : "pending",
        },
        {
          id: "usage-pressure-reviewed",
          title: "Usage pressure observed",
          description: "Runs and provider usage can be observed from the billing window during the rehearsal.",
          href: buildHref("/usage"),
          state: typeof metrics.runs_created?.used === "number" && metrics.runs_created.used > 0 ? "ready" : "pending",
        },
      ],
    },
    {
      title: "Capture evidence and handoff",
      description: "Close the drill with exportable evidence and a clean handoff trail.",
      steps: [
        {
          id: "audit-export",
          title: "Audit export checked",
          description: "Audit bundle export path is reviewed through the upgrade intent so export downloads align with the plan change.",
          href: buildHref("/settings?intent=upgrade"),
          state: plan?.features?.audit_export === true ? "ready" : "attention",
        },
        {
          id: "artifact-review",
          title: "Artifacts and logs reviewed",
          description: "Execution artifacts, logs, and resulting outputs are available for drill evidence.",
          href: buildHref("/artifacts"),
          state: onboarding?.checklist.demo_run_created ? "attention" : "pending",
        },
        {
          id: "admin-handoff",
          title: "Admin overview and handoff reviewed",
          description: "Platform snapshot and drill trace are ready to be handed to the next operator.",
          href: adminReturnHref,
          state: "attention",
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Drill framing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {isLoading ? <p className="text-muted">Loading workspace drill context...</p> : null}
          {isError ? <p className="text-muted">Unable to load live drill context, but the guided links remain usable.</p> : null}
          <p className="text-muted">
            This is a rehearsal surface for a pilot customer launch. It does not provision anything automatically; it
            sequences the existing onboarding, billing, run, and evidence surfaces into one operator-facing drill.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref("/verification?surface=verification")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen verification
            </Link>
            <Link
              href={buildHref("/artifacts")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review artifacts
            </Link>
            <Link
              href={buildHref("/usage")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Confirm usage signal
            </Link>
            <Link
              href={adminReturnHref}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
            >
              Return to admin overview
            </Link>
          </div>
          <p className="text-xs text-muted">
            Treat this as an evidence relay: verification establishes readiness, artifacts preserve outputs, usage
            confirms pressure, and the admin view closes the governance loop.
          </p>
        </CardContent>
      </Card>

      {phases.map((phase) => (
        <Card key={phase.title}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>{phase.title}</span>
              <Badge variant="subtle">{progressLabel(phase.steps)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted">{phase.description}</p>
            {phase.steps.map((step) => (
              <div key={step.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{step.title}</p>
                  <Badge variant={stateVariant(step.state)}>{stateLabel(step.state)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">{step.description}</p>
                <Link
                  href={step.href}
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
