import Link from "next/link";

import { AdminFollowUpNotice } from "@/components/admin/admin-follow-up-notice";
import { CreateInvitationForm } from "@/components/members/create-invitation-form";
import { InvitationsPanel } from "@/components/members/invitations-panel";
import { MembersPanel } from "@/components/members/members-panel";
import { PageHeader } from "@/components/page-header";
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

export default async function MembersPage({
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
  const showOnboardingFlow = source === "onboarding";
  const showReadinessHandoff = source === "admin-readiness";
  const showAttentionHandoff = source === "admin-attention";
  const handoffArgs = {
    source,
    week8Focus,
    attentionWorkspace: handoffWorkspace,
    attentionOrganization: handoffOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel: ownerLabel,
  };

  return (
    <div className="space-y-8">
      {showAttentionHandoff ? (
        <AdminFollowUpNotice
          source="admin-attention"
          surface="members"
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
          surface="members"
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
        eyebrow="Members"
        title="Workspace access"
        description="Review member roles, seat reservation pressure, and onboarding posture for the selected workspace."
      />
      {showOnboardingFlow ? (
        <Card>
          <CardHeader>
            <CardTitle>Onboarding context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted">
            <p>
              This workspace is in the onboarding lane. Invite at least one viewer, one operator, and one approver to
              cover audit, run, and legal gates before extending ever-broader access. Viewers keep verification evidence
              readable, operators run the first demos, and approvers close the Week 8 checklist. Continue with service
              account creation and then issue your first API key before stepping into the playground.
            </p>
            <p>
              Keep the trust boundary explicit: the invitee should redeem from their own trusted SaaS session, confirm
              the active workspace on <code>/session</code>, then continue into onboarding, usage, and verification with
              the same workspace context.
            </p>
            <p className="text-xs text-foreground">
              Next: create a service account, issue an API key, then run in the playground to capture the trace for verification.
            </p>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>First-team guidance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted">
            Start your workspace governance by inviting at least one viewer (for audit and verification), one operator (for run/integration tasks), and, if approvals are required, a legal/approver role. Spread these roles out so the first run and billing checks can be validated without overloading a single inbox. Keep the workspace owner slot for the person managing plans and billing actions.
          </p>
          <p className="text-xs text-muted">
            Once the first members accept via <code>/accept-invitation</code> and complete onboarding, each membership is tied to a workspace and a role; you can adjust the role later if operational needs change.
          </p>
          <p className="text-xs text-muted">
            Pending invitations reserve member seats before acceptance, so seat pressure can show up here before a new
            teammate ever reaches onboarding or usage follow-up.
          </p>
          <p className="text-xs text-muted">
            In this slice the invitation handoff is self-serve: create the invite here, copy the one-time token, and share it through your existing channel. Delivery itself is not automated inside the product yet.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Manual onboarding handoff</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          <p>
            Walk the newcomer through this manual lane: 1) generate the one-time token in this form, 2) send it through your own channel, 3) invitee redeems at <code>/accept-invitation</code>, 4) they switch into the workspace, then 5) follow the per-role action lane to continue onboarding, billing, verification, or go-live.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              href={buildHandoffHref("/accept-invitation", handoffArgs)}
            >
              Open accept-invitation
            </Link>
            <Link
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              href={buildHandoffHref("/session", handoffArgs)}
            >
              Confirm session context
            </Link>
            <Link
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              href={buildHandoffHref("/onboarding", handoffArgs)}
            >
              Continue onboarding lane
            </Link>
            <Link
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              href={buildHandoffHref("/usage", handoffArgs)}
            >
              Review usage window
            </Link>
            <Link
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              href={buildHandoffHref("/verification?surface=verification", handoffArgs, { preserveExistingQuery: true })}
            >
              Capture verification evidence
            </Link>
          </div>
          <p className="text-xs text-muted">
            None of the steps here send email or impersonate another user; they keep everything manual but trackable in the workspace context.
          </p>
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <MembersPanel workspaceSlug={workspaceContext.workspace.slug} />

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Invite member</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted">
                <p className="font-medium text-foreground">Self-serve invite lane</p>
                <p className="mt-1">
                  Create the invite, hand off the one-time token, then let the recipient redeem it in their own browser session. After redemption, they can switch directly into this workspace and continue along the role lane that fits them.
                </p>
                <p className="mt-2">
                  Trusted session reminder: invite redemption should happen from the recipient&apos;s authenticated SaaS
                  session, not from a borrowed browser or fallback-only local context.
                </p>
              </div>
              <CreateInvitationForm workspaceSlug={workspaceContext.workspace.slug} handoffArgs={handoffArgs} />
              <p className="text-xs text-muted">
                Invitations create pending access records first, reserve a seat immediately, then convert into memberships after acceptance.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
                  href={buildHandoffHref("/accept-invitation", handoffArgs)}
                >
                  Open accept-invitation page
                </Link>
                {showOnboardingFlow ? (
                  <Link
                    className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
                    href={buildHandoffHref("/service-accounts", handoffArgs)}
                  >
                    Next: service accounts
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <InvitationsPanel workspaceSlug={workspaceContext.workspace.slug} handoffArgs={handoffArgs} />
        </div>
      </div>
    </div>
  );
}
