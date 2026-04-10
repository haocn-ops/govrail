"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { AuditExportReceiptCallout } from "@/components/audit-export-receipt-callout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ControlPlaneDeliveryTrackSection } from "@/lib/control-plane-types";
import { resolveAuditExportReceiptSummary } from "@/lib/audit-export-receipt";
import { buildAdminReturnHref, buildVerificationChecklistHandoffHref } from "@/lib/handoff-query";
import { fetchCurrentWorkspace, fetchWorkspaceDeliveryTrack } from "@/services/control-plane";

type DrillState = "ready" | "attention" | "pending";

type DrillStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  state: DrillState;
};

type GoLiveSource = "admin-attention" | "admin-readiness" | "onboarding";
type DeliveryContext = "recent_activity" | "week8";
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

function drillStateFromDeliverySection(
  section?: Pick<ControlPlaneDeliveryTrackSection, "status"> | null,
): DrillState | null {
  if (!section) {
    return null;
  }
  if (section.status === "complete") {
    return "ready";
  }
  if (section.status === "in_progress") {
    return "attention";
  }
  return "pending";
}

function deliveryStatusLabel(section?: Pick<ControlPlaneDeliveryTrackSection, "status"> | null): string {
  if (!section) {
    return "Not tracked";
  }
  if (section.status === "in_progress") {
    return "In progress";
  }
  if (section.status === "complete") {
    return "Complete";
  }
  return "Pending";
}

function hasDeliverySectionNotes(
  section?: Pick<ControlPlaneDeliveryTrackSection, "notes"> | null,
): boolean {
  return typeof section?.notes === "string" && section.notes.trim().length > 0;
}

function hasDeliverySectionEvidence(
  section?: Pick<ControlPlaneDeliveryTrackSection, "notes" | "evidence_links"> | null,
): boolean {
  return (section?.evidence_links.length ?? 0) > 0 || hasDeliverySectionNotes(section);
}

function goLiveEvidenceSummary(
  section?: Pick<ControlPlaneDeliveryTrackSection, "notes" | "evidence_links"> | null,
): string {
  const evidenceLinkCount = section?.evidence_links.length ?? 0;
  if (evidenceLinkCount > 0) {
    return `${evidenceLinkCount} evidence ${evidenceLinkCount === 1 ? "link" : "links"} recorded`;
  }
  if (hasDeliverySectionNotes(section)) {
    return "Notes recorded, links still missing";
  }
  return "No notes or evidence links recorded";
}

function normalizeSource(value?: string | null): GoLiveSource | null {
  if (value === "admin-attention" || value === "admin-readiness" || value === "onboarding") {
    return value;
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

export function MockGoLiveDrillPanel({
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
    queryKey: ["mock-go-live-drill", workspaceSlug],
    queryFn: fetchCurrentWorkspace,
  });
  const deliveryTrackQueryKey = ["workspace-delivery-track", workspaceSlug];
  const { data: deliveryTrack } = useQuery({
    queryKey: deliveryTrackQueryKey,
    queryFn: fetchWorkspaceDeliveryTrack,
  });

  const onboarding = data?.onboarding;
  const billing = data?.billing_summary;
  const usage = data?.usage;
  const plan = data?.plan;
  const metrics = usage?.metrics ?? {};
  const verificationDelivery = deliveryTrack?.verification ?? null;
  const goLiveDelivery = deliveryTrack?.go_live ?? null;
  const hasGoLiveEvidenceLinks = (goLiveDelivery?.evidence_links.length ?? 0) > 0;
  const hasGoLiveNotes = hasDeliverySectionNotes(goLiveDelivery);
  const hasGoLiveEvidenceRecord = hasDeliverySectionEvidence(goLiveDelivery);
  const latestDemoRun = onboarding?.latest_demo_run ?? null;
  const activeRunId = latestDemoRun?.run_id ?? runId ?? null;

  const normalizedSource = normalizeSource(source);
  const normalizedRecentTrackKey = normalizeRecentTrackKey(recentTrackKey);
  const buildHref = (pathname: string): string =>
    buildVerificationChecklistHandoffHref({
      pathname,
      runId: activeRunId,
      source: normalizedSource,
      week8Focus,
      attentionWorkspace,
      attentionOrganization,
      deliveryContext: normalizeDeliveryContext(deliveryContext),
      recentTrackKey: normalizedRecentTrackKey,
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
    });
  const auditExportReceipt = resolveAuditExportReceiptSummary({
    auditReceiptFilename,
    auditReceiptExportedAt,
    auditReceiptFromDate,
    auditReceiptToDate,
    auditReceiptSha256,
  });
  const adminReturnHref = buildAdminReturnHref("/admin", {
    source: normalizedSource,
    runId: activeRunId,
    queueSurface: normalizedRecentTrackKey,
    week8Focus,
    attentionWorkspace: attentionWorkspace ?? workspaceSlug,
    attentionOrganization,
    deliveryContext: normalizeDeliveryContext(deliveryContext),
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
  });
  const adminReturnLabel =
    normalizedSource === "admin-attention"
      ? "Return to admin queue"
      : normalizedSource === "admin-readiness"
        ? "Return to admin readiness view"
        : "Return to admin overview";
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
          state:
            drillStateFromDeliverySection(verificationDelivery) ??
            (onboarding?.checklist.demo_run_created ? "ready" : "attention"),
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
          state:
            goLiveDelivery?.status === "complete" || hasGoLiveEvidenceLinks
              ? "ready"
              : hasGoLiveNotes || onboarding?.checklist.demo_run_created
                ? "attention"
                : "pending",
        },
        {
          id: "admin-handoff",
          title: "Admin return path reviewed",
          description: "Platform snapshot and drill trace are ready to be handed back through the matching admin follow-up lane.",
          href: adminReturnHref,
          state:
            goLiveDelivery?.status === "complete"
              ? "ready"
              : goLiveDelivery?.status === "in_progress" ||
                  verificationDelivery?.status === "complete" ||
                  hasGoLiveEvidenceRecord
                ? "attention"
                : "pending",
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
              {adminReturnLabel}
            </Link>
          </div>
          <p className="text-xs text-muted">
            Treat this as an evidence relay: verification establishes readiness, artifacts preserve outputs, usage
            confirms pressure, and the admin view closes the governance loop.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-background px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Verification track</p>
              <p className="mt-1 text-xs text-foreground">{deliveryStatusLabel(verificationDelivery)}</p>
            </div>
            <div className="rounded-xl border border-border bg-background px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Go-live track</p>
              <p className="mt-1 text-xs text-foreground">{deliveryStatusLabel(goLiveDelivery)}</p>
            </div>
            <div className="rounded-xl border border-border bg-background px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Go-live evidence</p>
              <p className="mt-1 text-xs text-foreground">{goLiveEvidenceSummary(goLiveDelivery)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit export continuity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted">
            Before closing the drill, reopen the Latest export receipt from /settings and confirm the same filename,
            filters, and SHA-256 noted during verification are referenced in the go-live notes and admin handoff.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref("/settings?intent=upgrade")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen audit export receipt
            </Link>
            <Link
              href={buildHref("/verification?surface=verification")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen verification evidence
            </Link>
            <Link
              href={adminReturnHref}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
            >
              {adminReturnLabel}
            </Link>
          </div>
          <p className="text-xs text-muted">
            Navigation only: these links preserve workspace context, but they do not attach the receipt automatically or
            resolve billing or rollout issues for you.
          </p>
          {auditExportReceipt ? (
            <AuditExportReceiptCallout
              receipt={auditExportReceipt}
              description="Carry the same receipt into go-live notes and the admin handoff so the rehearsal evidence stays aligned with verification."
            />
          ) : null}
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
