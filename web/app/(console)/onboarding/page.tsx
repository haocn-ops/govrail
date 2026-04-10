import Link from "next/link";

import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { WorkspaceOnboardingWizard } from "@/components/onboarding/workspace-onboarding-wizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildConsoleRunAwareHandoffHref, parseConsoleHandoffState } from "@/lib/console-handoff";
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

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoff = parseConsoleHandoffState(searchParams);
  const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const activeRunId = workspace?.onboarding?.latest_demo_run?.run_id ?? handoff.runId ?? null;
  const runAwareHandoff = { ...handoff, runId: activeRunId };
  const handoffSource = runAwareHandoff.source;
  const buildRunAwareOnboardingHref = (pathname: string): string =>
    buildConsoleRunAwareHandoffHref(pathname, handoff, activeRunId);

  return (
    <div className="space-y-8">
      <ConsoleAdminFollowUp
        handoff={runAwareHandoff}
        surface="onboarding"
        workspaceSlug={workspaceContext.workspace.slug}
      />
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
              href={buildRunAwareOnboardingHref("/session")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Confirm session context
            </Link>
            <Link
              href={buildRunAwareOnboardingHref("/members")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 1: Invite first members
            </Link>
            <Link
              href={buildRunAwareOnboardingHref("/service-accounts")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 2: Create service account
            </Link>
            <Link
              href={buildRunAwareOnboardingHref("/api-keys")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 3: Issue API key
            </Link>
            <Link
              href={buildRunAwareOnboardingHref("/playground")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 4: Run playground demo
            </Link>
            <Link
              href={buildRunAwareOnboardingHref("/usage")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 5: Confirm usage window
            </Link>
            <Link
              href={buildRunAwareOnboardingHref("/verification?surface=verification")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 6: Capture verification evidence
            </Link>
            <Link
              href={buildRunAwareOnboardingHref("/go-live?surface=go_live")}
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
              href={buildRunAwareOnboardingHref("/members")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Open members lane
            </Link>
            <Link
              href={buildRunAwareOnboardingHref("/accept-invitation")}
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
      />
    </div>
  );
}
