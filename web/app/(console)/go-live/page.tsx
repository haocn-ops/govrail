import Link from "next/link";

import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { WorkspaceContextSurfaceNotice } from "@/components/console/workspace-context-surface-notice";
import { WorkspaceDeliveryTrackPanel } from "@/components/delivery/workspace-delivery-track-panel";
import { MockGoLiveDrillPanel } from "@/components/go-live/mock-go-live-drill-panel";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildConsoleAdminReturnHref,
  buildConsoleAdminReturnState,
  buildConsoleRunAwareHandoffHref,
  buildRecentDeliveryDescription,
  buildRecentDeliveryMetadata,
  parseConsoleHandoffState,
} from "@/lib/console-handoff";
import { requestControlPlanePageData } from "@/lib/server-control-plane-page-fetch";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

type WorkspaceDetailResponse = {
  onboarding?: {
    latest_demo_run?: {
      run_id: string;
    } | null;
  };
};

export default async function GoLivePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoff = parseConsoleHandoffState(searchParams);
  const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const activeRunId = workspace?.onboarding?.latest_demo_run?.run_id ?? handoff.runId ?? null;
  const runAwareHandoff = { ...handoff, runId: activeRunId };
  const goLiveMetadata = buildRecentDeliveryMetadata(handoff);
  const recentTrackKey = goLiveMetadata.recentTrackKey;
  const recentUpdateKind = goLiveMetadata.recentUpdateKind;
  const recentEvidenceCount = goLiveMetadata.recentEvidenceCount;
  const recentOwnerLabel = handoff.recentOwnerLabel;
  const recentOwnerDisplayName = handoff.recentOwnerDisplayName;
  const recentOwnerEmail = handoff.recentOwnerEmail;
  const adminReturnState = buildConsoleAdminReturnState({
    source: handoff.source,
    surface: handoff.surface,
    expectedSurface: "go_live",
    recentTrackKey: handoff.recentTrackKey,
  });
  const goLiveDeliveryDescription = buildRecentDeliveryDescription(
    "Track go-live drill status, experiments, and evidence references for this workspace.",
    goLiveMetadata,
  );
  const verificationHref = buildConsoleRunAwareHandoffHref("/verification?surface=verification", handoff, activeRunId);
  const usageHref = buildConsoleRunAwareHandoffHref("/usage", handoff, activeRunId);
  const billingSettingsHref = buildConsoleRunAwareHandoffHref("/settings?intent=manage-plan", handoff, activeRunId);
  const upgradeSettingsHref = buildConsoleRunAwareHandoffHref("/settings?intent=upgrade", handoff, activeRunId);
  const playgroundHref = buildConsoleRunAwareHandoffHref("/playground", handoff, activeRunId);
  const artifactsHref = buildConsoleRunAwareHandoffHref("/artifacts", handoff, activeRunId);
  const adminReturnHref = buildConsoleAdminReturnHref({
    pathname: "/admin",
    handoff: runAwareHandoff,
    workspaceSlug: workspaceContext.workspace.slug,
    queueSurface: adminReturnState.adminQueueSurface,
  });
  const followUpSource =
    adminReturnState.showAttentionHandoff
      ? "admin-attention"
      : adminReturnState.showReadinessHandoff
        ? "admin-readiness"
        : null;
  const adminHref = adminReturnState.showAdminReturn ? adminReturnHref : "/admin";
  const adminLinkLabel = adminReturnState.showAdminReturn ? adminReturnState.adminReturnLabel : "Admin overview";
  const deliveryTrackHref = "#go-live-delivery-track";

  return (
    <div className="space-y-8">
      <WorkspaceContextSurfaceNotice
        workspaceSlug={workspaceContext.workspace.slug}
        sourceDetail={workspaceContext.source_detail}
        surfaceLabel="Go-live drill"
        sessionHref={buildConsoleRunAwareHandoffHref("/session", handoff, activeRunId)}
      />
      <ConsoleAdminFollowUp
        handoff={runAwareHandoff}
        payload={
          followUpSource
            ? {
                source: followUpSource,
                week8Focus: handoff.week8Focus,
                attentionOrganization: handoff.attentionOrganization,
                deliveryContext: handoff.deliveryContext,
                recentTrackKey,
                recentUpdateKind,
                evidenceCount: recentEvidenceCount,
                ownerDisplayName: recentOwnerDisplayName,
                ownerEmail: recentOwnerEmail,
              }
            : null
        }
        surface="go_live"
        workspaceSlug={workspaceContext.workspace.slug}
      />
      <PageHeader
        eyebrow="Go-live"
        title="Mock go-live drill"
        description="Run a staged rehearsal using existing onboarding, billing, run, and evidence surfaces. This page guides a mock drill only and does not trigger automation."
      />
      <Card>
        <CardHeader>
          <CardTitle>Session-aware drill lane</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Rehearse the drill inside the active workspace session for{" "}
            <span className="font-medium text-foreground">{workspaceContext.workspace.slug}</span>. Current context
            source: <span className="font-medium text-foreground">{workspaceContext.source_detail.label}</span>.
          </p>
          <p>
            This lane stays manual: revisit verification evidence, confirm usage pressure and billing posture, then log
            drill notes here. Navigation context is preserved across surfaces, but no step is executed automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={verificationHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen verification evidence
            </Link>
            <Link
              href={usageHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Confirm usage posture
            </Link>
            <Link
              href={billingSettingsHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review billing + settings
            </Link>
            <Link
              href={playgroundHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Revisit playground run
            </Link>
            <Link
              href={artifactsHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Inspect artifacts evidence
            </Link>
            {adminReturnState.showAdminReturn ? (
              <Link
                href={adminReturnHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                {adminReturnState.adminReturnLabel}
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Governance recap</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Use this drill surface once the verification checklist, billing posture, and usage pressure have been
            reviewed. Keep the same workspace context, capture evidence in{" "}
            <Link href={verificationHref}>Verification</Link>, collect the usage trace via <Link href={usageHref}>Usage</Link>, inspect the concrete bundle in{" "}
            <Link href={artifactsHref}>Artifacts</Link>, and record the experiment notes in the{" "}
            <Link href={deliveryTrackHref}>delivery tracker here</Link> before ending the loop in{" "}
            <Link href={adminHref}>{adminLinkLabel}</Link>. These links only steer the
            navigation; they do not impersonate the admin or automate any step.
          </p>
          <p className="text-xs text-muted">
            After downloading the latest audit export receipt/evidence note (filename, filters, SHA-256) through the
            <Link href={upgradeSettingsHref}> Settings upgrade intent</Link>, copy that note into Verification's evidence lane
            (<Link href={verificationHref}>explicit verification surface</Link>) and into the go-live drill entries so the
            governance trail remains manually stitched across these navigation-only surfaces.
          </p>
        </CardContent>
      </Card>
      <MockGoLiveDrillPanel
        workspaceSlug={workspaceContext.workspace.slug}
        source={handoff.source}
        runId={activeRunId}
        week8Focus={handoff.week8Focus}
        attentionWorkspace={handoff.attentionWorkspace}
        attentionOrganization={handoff.attentionOrganization}
        deliveryContext={handoff.deliveryContext}
        recentTrackKey={recentTrackKey}
        recentUpdateKind={recentUpdateKind}
        evidenceCount={recentEvidenceCount}
        recentOwnerLabel={recentOwnerLabel}
        recentOwnerDisplayName={recentOwnerDisplayName}
        recentOwnerEmail={recentOwnerEmail}
        auditReceiptFilename={handoff.auditReceiptFilename}
        auditReceiptExportedAt={handoff.auditReceiptExportedAt}
        auditReceiptFromDate={handoff.auditReceiptFromDate}
        auditReceiptToDate={handoff.auditReceiptToDate}
        auditReceiptSha256={handoff.auditReceiptSha256}
      />
      <div id="go-live-delivery-track">
        <WorkspaceDeliveryTrackPanel
          workspaceSlug={workspaceContext.workspace.slug}
          sectionKey="go_live"
          title="Go-live delivery notes"
          description={goLiveDeliveryDescription}
          source={handoff.source}
          surface="go_live"
          runId={activeRunId}
          week8Focus={handoff.week8Focus}
          attentionWorkspace={handoff.attentionWorkspace}
          attentionOrganization={handoff.attentionOrganization}
          deliveryContext={handoff.deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={recentUpdateKind}
          evidenceCount={recentEvidenceCount}
          recentOwnerLabel={recentOwnerLabel}
          recentOwnerDisplayName={recentOwnerDisplayName}
          recentOwnerEmail={recentOwnerEmail}
          auditReceiptFilename={handoff.auditReceiptFilename}
          auditReceiptExportedAt={handoff.auditReceiptExportedAt}
          auditReceiptFromDate={handoff.auditReceiptFromDate}
          auditReceiptToDate={handoff.auditReceiptToDate}
          auditReceiptSha256={handoff.auditReceiptSha256}
        />
      </div>
    </div>
  );
}
