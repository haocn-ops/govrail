import Link from "next/link";

import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { CreateInvitationForm } from "@/components/members/create-invitation-form";
import { InvitationsPanel } from "@/components/members/invitations-panel";
import { MembersPanel } from "@/components/members/members-panel";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildConsoleHandoffHref, parseConsoleHandoffState } from "@/lib/console-handoff";
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

export default async function MembersPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoff = parseConsoleHandoffState(searchParams);
  const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const activeRunId = workspace?.onboarding?.latest_demo_run?.run_id ?? handoff.runId ?? null;
  const runAwareHandoff = { ...handoff, runId: activeRunId };
  const source = handoff.source;
  const showOnboardingFlow = source === "onboarding";

  return (
    <div className="space-y-8">
      <ConsoleAdminFollowUp
        handoff={runAwareHandoff}
        surface="members"
        workspaceSlug={workspaceContext.workspace.slug}
      />
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
              href={buildConsoleHandoffHref("/accept-invitation", runAwareHandoff)}
            >
              Open accept-invitation
            </Link>
            <Link
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              href={buildConsoleHandoffHref("/session", runAwareHandoff)}
            >
              Confirm session context
            </Link>
            <Link
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              href={buildConsoleHandoffHref("/onboarding", runAwareHandoff)}
            >
              Continue onboarding lane
            </Link>
            <Link
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              href={buildConsoleHandoffHref("/usage", runAwareHandoff)}
            >
              Review usage window
            </Link>
            <Link
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              href={buildConsoleHandoffHref("/verification?surface=verification", runAwareHandoff)}
            >
              Capture verification evidence
            </Link>
            <Link
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              href={buildConsoleHandoffHref("/playground", runAwareHandoff)}
            >
              Run a demo in Playground
            </Link>
            <Link
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              href={buildConsoleHandoffHref("/go-live?surface=go_live", runAwareHandoff)}
            >
              Review go-live drill
            </Link>
          </div>
          <p className="text-xs text-muted">
            None of the steps here send email or impersonate another user; they keep everything manual but trackable in the workspace context.
          </p>
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <MembersPanel workspaceSlug={workspaceContext.workspace.slug} handoff={runAwareHandoff} />

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
              <CreateInvitationForm workspaceSlug={workspaceContext.workspace.slug} handoffArgs={runAwareHandoff} />
              <p className="text-xs text-muted">
                Invitations create pending access records first, reserve a seat immediately, then convert into memberships after acceptance.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
                  href={buildConsoleHandoffHref("/accept-invitation", runAwareHandoff)}
                >
                  Open accept-invitation page
                </Link>
                {showOnboardingFlow ? (
                  <Link
                    className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
                    href={buildConsoleHandoffHref("/service-accounts", runAwareHandoff)}
                  >
                    Next: service accounts
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <InvitationsPanel workspaceSlug={workspaceContext.workspace.slug} handoffArgs={runAwareHandoff} />
        </div>
      </div>
    </div>
  );
}
