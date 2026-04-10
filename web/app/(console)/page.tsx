import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { WorkspaceLaunchpad } from "@/components/home/workspace-launchpad";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildConsoleAdminLinkState,
  buildConsoleRunAwareHandoffHref,
  parseConsoleHandoffState,
} from "@/lib/console-handoff";
import { requestControlPlanePageData } from "@/lib/server-control-plane-page-fetch";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";
import Link from "next/link";

export const dynamic = "force-dynamic";

type WorkspaceDetailResponse = {
  onboarding?: {
    latest_demo_run?: {
      run_id: string;
    } | null;
  };
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoff = parseConsoleHandoffState(searchParams);
  const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const activeRunId = workspace?.onboarding?.latest_demo_run?.run_id ?? handoff.runId ?? null;
  const runAwareHandoff = { ...handoff, runId: activeRunId };
  const {
    source,
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
  } = runAwareHandoff;
  const adminLinkState = buildConsoleAdminLinkState({
    handoff: runAwareHandoff,
    workspaceSlug: workspaceContext.workspace.slug,
    runId: activeRunId,
  });

  const governanceLinks = [
    { label: "Reopen Latest export receipt", path: "/settings?intent=upgrade" },
    { label: "Carry proof to verification", path: "/verification?surface=verification" },
    { label: "Align go-live drill", path: "/go-live?surface=go_live" },
  ];

  return (
    <div className="space-y-8">
      <ConsoleAdminFollowUp
        handoff={runAwareHandoff}
        surface="launchpad"
        workspaceSlug={workspaceContext.workspace.slug}
      />
      <Card>
        <CardHeader>
          <CardTitle>Audit export continuity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            The launchpad is still part of the navigation-only audit-export relay: reopen the Latest export receipt
            from <code className="font-mono">/settings?intent=upgrade</code>, capture the filename, filters, and SHA-256, and
            keep that note attached as you move to verification, go-live, or the admin follow-up loop.
          </p>
          <p className="text-xs text-muted">
            These CTAs keep the workspace context, but they do not automate follow-up, impersonate another user, or change
            readiness records on your behalf.
          </p>
          <div className="flex flex-wrap gap-2">
            {governanceLinks.map((link) => (
              <Link
                key={link.label}
                href={buildConsoleRunAwareHandoffHref(link.path, runAwareHandoff, activeRunId)}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={adminLinkState.adminHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              {adminLinkState.adminLinkLabel}
            </Link>
          </div>
        </CardContent>
      </Card>
      <PageHeader
        eyebrow="Workspace launchpad"
        title="SaaS Workspace Launch Hub"
        description="Use this as the operator-facing launch state machine: confirm session/workspace context, inspect readiness and plan posture, then continue through the right manual lane for this workspace."
        badge={<Badge variant="strong">{workspaceContext.workspace.slug}</Badge>}
      />
      <WorkspaceLaunchpad
        workspaceSlug={workspaceContext.workspace.slug}
        workspaceRole={workspaceContext.workspace.subject_roles ?? null}
        contextSourceLabel={workspaceContext.source_detail.label}
        source={source}
        week8Focus={week8Focus}
        attentionWorkspace={attentionWorkspace}
        attentionOrganization={attentionOrganization}
        deliveryContext={deliveryContext}
        recentTrackKey={recentTrackKey}
        recentUpdateKind={recentUpdateKind}
        evidenceCount={evidenceCount}
        recentOwnerLabel={recentOwnerLabel}
        recentOwnerDisplayName={recentOwnerDisplayName}
        recentOwnerEmail={recentOwnerEmail}
      />
    </div>
  );
}
