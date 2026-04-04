import Link from "next/link";

import { AdminFollowUpNotice } from "@/components/admin/admin-follow-up-notice";
import { WorkspaceOnboardingWizard } from "@/components/onboarding/workspace-onboarding-wizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildHandoffHref } from "@/lib/handoff-query";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function getParam(value?: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoffSource = getParam(searchParams?.source);
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
  const ownerEmail = getParam(searchParams?.recent_owner_email);
  const showAttentionHandoff = handoffSource === "admin-attention";
  const showReadinessHandoff = handoffSource === "admin-readiness";
  const handoffArgs = {
    source: handoffSource,
    week8Focus,
    attentionWorkspace: handoffWorkspace,
    attentionOrganization: handoffOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel: ownerLabel ?? ownerEmail,
  };

  return (
    <div className="space-y-8">
      {showAttentionHandoff ? (
        <AdminFollowUpNotice
          source="admin-attention"
          surface="onboarding"
          workspaceSlug={workspaceContext.workspace.slug}
          sourceWorkspaceSlug={handoffWorkspace}
          attentionOrganization={handoffOrganization}
          deliveryContext={deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={recentUpdateKind}
          evidenceCount={evidenceCount}
          ownerDisplayName={ownerLabel}
          ownerEmail={ownerEmail}
        />
      ) : null}
      {showReadinessHandoff ? (
        <AdminFollowUpNotice
          source="admin-readiness"
          surface="onboarding"
          workspaceSlug={workspaceContext.workspace.slug}
          sourceWorkspaceSlug={handoffWorkspace}
          week8Focus={week8Focus}
          attentionOrganization={handoffOrganization}
          deliveryContext={deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={recentUpdateKind}
          evidenceCount={evidenceCount}
          ownerDisplayName={ownerLabel}
          ownerEmail={ownerEmail}
        />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Launch lane context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            This onboarding lane is the manual workspace launch hub for Week 5 and Week 8 readiness. It helps you
            create the workspace, bootstrap the baseline, issue credentials, run the first demo, and hand evidence
            into verification without implying support automation.
          </p>
          <p>
            Current workspace: <span className="font-medium text-foreground">{workspaceContext.workspace.slug}</span>
            {" "}· Context source: <span className="font-medium text-foreground">{workspaceContext.source_detail.label}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHandoffHref("/session", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Confirm session context
            </Link>
            <Link
              href={buildHandoffHref("/members", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 1: Invite first members
            </Link>
            <Link
              href={buildHandoffHref("/service-accounts", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 2: Create service account
            </Link>
            <Link
              href={buildHandoffHref("/api-keys", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 3: Issue API key
            </Link>
            <Link
              href={buildHandoffHref("/playground", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 4: Run playground demo
            </Link>
            <Link
              href={buildHandoffHref("/usage", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 5: Confirm usage window
            </Link>
            <Link
              href={buildHandoffHref("/verification?surface=verification", handoffArgs, { preserveExistingQuery: true })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 6: Capture verification evidence
            </Link>
            <Link
              href={buildHandoffHref("/go-live?surface=go_live", handoffArgs, { preserveExistingQuery: true })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 7: Rehearse go-live
            </Link>
          </div>
          <p className="text-xs text-muted">
            This sequence is still navigation-only across the console. Each surface keeps the same workspace handoff,
            but inviting, credential issuance, running, and evidence capture are all manual operator steps.
          </p>
          <p className="text-xs text-muted">
            Trusted session reminder: if the active identity or workspace context looks off, go back to{" "}
            <code>/session</code> before continuing into members, onboarding state mutation, usage evidence, or Week 8
            verification/go-live follow-up.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invite-to-accept path</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          <p>
            Week 5 onboarding starts with inviting the first reviewer, operator, and approver. Use the Members panel to create a one-time token, share it off-band, and then have the recipient redeem it at <code>/accept-invitation</code> before switching into this workspace context.
          </p>
          <p className="text-xs text-muted">
            After acceptance the new member can follow the role lane (viewer → verification, operator → playground, approver → go-live) while you keep dashboarding onboarding, billing, verification, and go-live evidence manually.
          </p>
          <p className="text-xs text-muted">
            Pending invitations reserve seats even before redemption, so members and onboarding readiness can be
            blocked by seat pressure before the invitee reaches usage or verification.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHandoffHref("/members", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Open members lane
            </Link>
            <Link
              href={buildHandoffHref("/accept-invitation", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Open accept-invitation
            </Link>
          </div>
        </CardContent>
      </Card>
      <WorkspaceOnboardingWizard
        workspaceSlug={workspaceContext.workspace.slug}
        source={handoffSource}
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
