import Link from "next/link";

import { AdminFollowUpNotice } from "@/components/admin/admin-follow-up-notice";
import { PageHeader } from "@/components/page-header";
import { WorkspaceUsageDashboard } from "@/components/usage/workspace-usage-dashboard";
import { buildAdminReturnHref, buildHandoffHref, buildVerificationChecklistHandoffHref } from "@/lib/handoff-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function getParam(value?: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

function normalizeHandoffSource(value: string | null): "admin-attention" | "admin-readiness" | "onboarding" | null {
  if (value === "admin-attention" || value === "admin-readiness" || value === "onboarding") {
    return value;
  }
  return null;
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const source = getParam(searchParams?.source);
  const handoffWorkspace = getParam(searchParams?.attention_workspace);
  const handoffOrganization = getParam(searchParams?.attention_organization);
  const week8Focus = getParam(searchParams?.week8_focus);
  const deliveryContext = getParam(searchParams?.delivery_context);
  const recentTrackKey = getParam(searchParams?.recent_track_key);
  const recentUpdateKind = getParam(searchParams?.recent_update_kind);
  const evidenceCountParam = getParam(searchParams?.evidence_count);
  const evidenceCount =
    evidenceCountParam !== null && !Number.isNaN(Number(evidenceCountParam)) ? Number(evidenceCountParam) : null;
  const ownerLabel =
    getParam(searchParams?.recent_owner_label) ?? getParam(searchParams?.recent_owner_display_name);
  const showReadinessHandoff = source === "admin-readiness";
  const showAttentionHandoff = source === "admin-attention";
  const showAdminReturn = showReadinessHandoff || showAttentionHandoff;
  const adminReturnLabel = showAttentionHandoff ? "Return to admin queue" : "Return to admin readiness";
  const handoffSource = normalizeHandoffSource(source);
  const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>[0], "pathname"> = {
    source: handoffSource,
    week8Focus,
    attentionWorkspace: handoffWorkspace,
    attentionOrganization: handoffOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel: ownerLabel,
  };
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
  const adminReturnHref = buildAdminReturnHref("/admin", {
    source: handoffSource,
    queueSurface: recentTrackKey,
    week8Focus,
    attentionWorkspace: handoffWorkspace,
    attentionOrganization: handoffOrganization,
    deliveryContext,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel: ownerLabel,
  });
  const sessionHref = buildHandoffHref("/session", handoffHrefArgs);
  const onboardingHref = buildVerificationChecklistHandoffHref({
    pathname: "/onboarding",
    ...handoffHrefArgs,
  });

  return (
    <div className="space-y-8">
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
            {showAdminReturn ? (
              <Link
                href={adminReturnHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                {adminReturnLabel}
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {showAttentionHandoff ? (
        <AdminFollowUpNotice
          source="admin-attention"
          surface="usage"
          workspaceSlug={workspaceContext.workspace.slug}
          sourceWorkspaceSlug={handoffWorkspace}
          attentionOrganization={handoffOrganization}
          deliveryContext={deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={recentUpdateKind}
          evidenceCount={evidenceCount}
          ownerDisplayName={ownerLabel}
        />
      ) : null}
      {showReadinessHandoff ? (
        <AdminFollowUpNotice
          source="admin-readiness"
          surface="usage"
          workspaceSlug={workspaceContext.workspace.slug}
          sourceWorkspaceSlug={handoffWorkspace}
          week8Focus={week8Focus}
          attentionOrganization={handoffOrganization}
          deliveryContext={deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={recentUpdateKind}
          evidenceCount={evidenceCount}
          ownerDisplayName={ownerLabel}
        />
      ) : null}
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
              href={buildVerificationChecklistHandoffHref({ pathname: "/playground", ...handoffHrefArgs })}
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
            {showAdminReturn ? (
              <Link
                href={adminReturnHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                {adminReturnLabel}
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <WorkspaceUsageDashboard
        workspaceSlug={workspaceContext.workspace.slug}
        source={source}
        week8Focus={week8Focus}
        attentionWorkspace={handoffWorkspace}
        attentionOrganization={handoffOrganization}
        deliveryContext={deliveryContext}
        recentTrackKey={recentTrackKey}
        recentUpdateKind={recentUpdateKind}
        evidenceCount={evidenceCount}
        recentOwnerLabel={ownerLabel}
      />
    </div>
  );
}
