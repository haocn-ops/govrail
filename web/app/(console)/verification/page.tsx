import Link from "next/link";

import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { WorkspaceContextSurfaceNotice } from "@/components/console/workspace-context-surface-notice";
import { WorkspaceDeliveryTrackPanel } from "@/components/delivery/workspace-delivery-track-panel";
import { PageHeader } from "@/components/page-header";
import { Week8VerificationChecklist } from "@/components/verification/week8-verification-checklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildConsoleAdminReturnHref,
  buildConsoleAdminReturnState,
  buildConsoleRunAwareHandoffHref,
  buildConsoleVerificationChecklistHandoffArgs,
  buildRecentDeliveryDescription,
  buildRecentDeliveryMetadata,
  parseConsoleHandoffState,
} from "@/lib/console-handoff";
import { buildVerificationChecklistHandoffHref } from "@/lib/handoff-query";
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

export default async function VerificationPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoff = parseConsoleHandoffState(searchParams);
  const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const activeRunId = workspace?.onboarding?.latest_demo_run?.run_id ?? handoff.runId ?? null;
  const runAwareHandoff = { ...handoff, runId: activeRunId };
  const recentDeliveryMetadata = buildRecentDeliveryMetadata(handoff);
  const verificationDeliveryBase =
    "Persist the current verification status, owner, notes, and evidence references for this workspace.";
  const verificationDeliveryDescription = buildRecentDeliveryDescription(
    verificationDeliveryBase,
    recentDeliveryMetadata,
  );
  const adminReturnState = buildConsoleAdminReturnState({
    source: handoff.source,
    surface: handoff.surface,
    expectedSurface: "verification",
    recentTrackKey: handoff.recentTrackKey,
  });
  const handoffHrefArgs = buildConsoleVerificationChecklistHandoffArgs(runAwareHandoff);
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

  return (
    <div className="space-y-8">
      <WorkspaceContextSurfaceNotice
        workspaceSlug={workspaceContext.workspace.slug}
        sourceDetail={workspaceContext.source_detail}
        surfaceLabel="Verification"
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
                recentTrackKey: handoff.recentTrackKey,
                recentUpdateKind: handoff.recentUpdateKind,
                evidenceCount: handoff.evidenceCount,
                ownerDisplayName: handoff.recentOwnerDisplayName,
                ownerEmail: handoff.recentOwnerEmail,
              }
            : null
        }
        surface="verification"
        workspaceSlug={workspaceContext.workspace.slug}
      />
      <PageHeader
        eyebrow="Verification"
        title="Week 8 launch checklist"
        description="Walk through onboarding, billing posture, first-run validation, and evidence capture before treating a workspace as ready for a mock go-live drill."
      />
      <Card>
        <CardHeader>
          <CardTitle>Verification evidence lane</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Keep verification grounded in the current workspace session:{" "}
            <span className="font-medium text-foreground">{workspaceContext.workspace.slug}</span> via{" "}
            <span className="font-medium text-foreground">{workspaceContext.source_detail.label}</span>. This page is
            the manual point where onboarding, billing posture, first-run evidence, and go-live preparation are tied
            into one audit trail.
          </p>
          <p>
            Use the links below to revisit the original run context, confirm the usage signal, review settings and
            billing posture, then continue into the mock go-live rehearsal. Nothing here triggers automation or changes
            identity.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/playground", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review playground run
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/usage", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Confirm usage signal
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/settings?intent=manage-plan", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review settings + billing
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/artifacts", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review artifacts evidence
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/go-live?surface=go_live", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Continue to go-live drill
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
      <Week8VerificationChecklist
        workspaceSlug={workspaceContext.workspace.slug}
        source={handoff.source}
        runId={activeRunId}
        week8Focus={handoff.week8Focus}
        attentionWorkspace={handoff.attentionWorkspace}
        attentionOrganization={handoff.attentionOrganization}
        deliveryContext={handoff.deliveryContext}
        recentTrackKey={handoff.recentTrackKey}
        recentUpdateKind={handoff.recentUpdateKind}
        evidenceCount={handoff.evidenceCount}
        recentOwnerLabel={handoff.recentOwnerLabel}
        recentOwnerDisplayName={handoff.recentOwnerDisplayName}
        recentOwnerEmail={handoff.recentOwnerEmail}
        auditReceiptFilename={handoff.auditReceiptFilename}
        auditReceiptExportedAt={handoff.auditReceiptExportedAt}
        auditReceiptFromDate={handoff.auditReceiptFromDate}
        auditReceiptToDate={handoff.auditReceiptToDate}
        auditReceiptSha256={handoff.auditReceiptSha256}
      />
      <div id="verification-delivery-track">
        <WorkspaceDeliveryTrackPanel
          workspaceSlug={workspaceContext.workspace.slug}
          sectionKey="verification"
          title="Verification delivery notes"
          description={verificationDeliveryDescription}
          source={handoff.source}
          surface="verification"
          runId={activeRunId}
          week8Focus={handoff.week8Focus}
          attentionWorkspace={handoff.attentionWorkspace}
          attentionOrganization={handoff.attentionOrganization}
          deliveryContext={handoff.deliveryContext}
          recentTrackKey={handoff.recentTrackKey}
          recentUpdateKind={handoff.recentUpdateKind}
          evidenceCount={handoff.evidenceCount}
          recentOwnerLabel={handoff.recentOwnerLabel}
          recentOwnerDisplayName={handoff.recentOwnerDisplayName}
          recentOwnerEmail={handoff.recentOwnerEmail}
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
