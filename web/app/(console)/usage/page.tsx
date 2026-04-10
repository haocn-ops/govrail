import Link from "next/link";

import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { WorkspaceContextSurfaceNotice } from "@/components/console/workspace-context-surface-notice";
import { PageHeader } from "@/components/page-header";
import { WorkspaceUsageDashboard } from "@/components/usage/workspace-usage-dashboard";
import { buildVerificationChecklistHandoffHref } from "@/lib/handoff-query";
import { requestControlPlanePageData } from "@/lib/server-control-plane-page-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildConsoleAdminReturnHref,
  buildConsoleHandoffHref,
  buildConsoleVerificationChecklistHandoffArgs,
  buildConsoleAdminReturnState,
  parseConsoleHandoffState,
} from "@/lib/console-handoff";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

type WorkspaceDetailResponse = {
  onboarding?: {
    latest_demo_run?: {
      run_id: string;
    } | null;
  };
};

export default async function UsagePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoff = parseConsoleHandoffState(searchParams);
  const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const activeRunId = workspace?.onboarding?.latest_demo_run?.run_id ?? handoff.runId ?? null;
  const runAwareHandoff = { ...handoff, runId: activeRunId };
  const adminReturnState = buildConsoleAdminReturnState({
    source: handoff.source,
    surface: handoff.surface,
    expectedSurface: "verification",
    recentTrackKey: handoff.recentTrackKey,
  });
  const handoffHrefArgs = buildConsoleVerificationChecklistHandoffArgs(runAwareHandoff);
  const buildRunAwareUsagePageHref = (pathname: string): string =>
    buildVerificationChecklistHandoffHref({ pathname, ...handoffHrefArgs, runId: activeRunId });
  const settingsPlanHref = buildVerificationChecklistHandoffHref({
    pathname: "/settings?intent=manage-plan",
    ...handoffHrefArgs,
  });
  const settingsBillingHref = buildVerificationChecklistHandoffHref({
    pathname: "/settings?intent=resolve-billing",
    ...handoffHrefArgs,
  });
  const artifactsEvidenceHref = buildVerificationChecklistHandoffHref({
    pathname: "/artifacts",
    ...handoffHrefArgs,
  });
  const verificationEvidenceHref = buildVerificationChecklistHandoffHref({
    pathname: "/verification?surface=verification",
    ...handoffHrefArgs,
  });
  const goLiveHref = buildVerificationChecklistHandoffHref({
    pathname: "/go-live?surface=go_live",
    ...handoffHrefArgs,
  });
  const adminReturnHref = buildConsoleAdminReturnHref({
    pathname: "/admin",
    handoff: runAwareHandoff,
    workspaceSlug: workspaceContext.workspace.slug,
    queueSurface: adminReturnState.adminQueueSurface,
  });
  const sessionHref = buildConsoleHandoffHref("/session", runAwareHandoff);
  const onboardingHref = buildRunAwareUsagePageHref("/onboarding");
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
        surfaceLabel="Usage"
        sessionHref={sessionHref}
      />
      <Card>
        <CardHeader>
          <CardTitle>Plan limit governance lane</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            The usage ledger below keeps each plan limit visible. Before hitting a quota, confirm the current
            limit, usage pressure, and upgrade posture so you don’t accidentally throttle a critical run or block the
            admin readiness flow.
          </p>
          <p className="text-xs text-muted">
            Plan limit enforcement is manual in this slice: you review the usage ledger, decide whether the current plan
            still fits, and navigate to billing or admin readiness surfaces to apply the change. There is no automation
            or impersonation involved.
          </p>
          <p className="text-xs text-muted">
            Trusted session reminder: if the current usage window or plan posture looks attached to the wrong
            workspace, return to <code>/session</code> before you record verification evidence or trigger billing
            follow-up.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={sessionHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Re-check session context
            </Link>
            <Link
              href={settingsPlanHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review plan limits in Settings
            </Link>
            <Link
              href={settingsBillingHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Resolve billing warning
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
                ownerDisplayName: handoff.recentOwnerDisplayName ?? handoff.recentOwnerLabel,
                ownerEmail: handoff.recentOwnerEmail,
              }
            : null
        }
        surface="usage"
        workspaceSlug={workspaceContext.workspace.slug}
      />
      <PageHeader
        eyebrow="Usage"
        title="Workspace usage and plan posture"
        description="Track billing posture, current plan usage pressure, and the next upgrade action before limits block critical operator flows."
      />
      <Card>
        <CardHeader>
          <CardTitle>First demo evidence lane</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Keep this handoff explicit: run or rerun the demo in Playground, confirm the resulting signal in usage,
            then capture the same run context in verification evidence.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={onboardingHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Return to onboarding summary
            </Link>
            <Link
              href={buildRunAwareUsagePageHref("/playground")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Go to playground run
            </Link>
            <Link
              href={verificationEvidenceHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Go to verification evidence
            </Link>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Evidence loop follow-through</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Treat Usage as one stop in the Week 8 evidence loop: confirm the meter signal here, inspect the attached
            artifacts for the same run, attach or refresh verification notes, then continue to the mock go-live drill
            before returning to admin readiness if that was your entry point.
          </p>
          <p className="text-xs text-muted">
            These links are navigation-only. They preserve workspace context across the evidence surfaces, but they do
            not automate attachment, review, or remediation for you.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={artifactsEvidenceHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review artifacts evidence
            </Link>
            <Link
              href={verificationEvidenceHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Refresh verification notes
            </Link>
            <Link
              href={goLiveHref}
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
      <WorkspaceUsageDashboard
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
    </div>
  );
}
