import Link from "next/link";

import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { PlaygroundPanel } from "@/components/playground/playground-panel";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildConsoleRunAwareHandoffHref,
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

export default async function PlaygroundPage({
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
  } = handoff;
  const showOnboardingHint = source === "onboarding";
  const buildRunAwarePlaygroundHref = (pathname: string): string =>
    buildConsoleRunAwareHandoffHref(pathname, handoff, activeRunId);
  const settingsPlanHref = buildRunAwarePlaygroundHref("/settings?intent=manage-plan");
  const usageCheckpointHref = buildRunAwarePlaygroundHref("/usage");
  const verificationHref = buildRunAwarePlaygroundHref("/verification?surface=verification");

  return (
    <div className="space-y-8">
      <ConsoleAdminFollowUp
        handoff={runAwareHandoff}
        surface="playground"
        workspaceSlug={workspaceContext.workspace.slug}
      />
      <PageHeader
        eyebrow="Playground"
        title="Prompt, invoke, inspect"
        description="Use a Monaco-backed request editor to create a real run for the selected workspace and inspect the structured control-plane response."
      />
      <Card>
        <CardHeader>
          <CardTitle>Plan-limit checkpoint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Before you create a fresh run, confirm that the current workspace plan still has room for the demo or
            operator flow you are about to exercise. This keeps the run path aligned with Week 6 usage metering and
            Week 7 billing review.
          </p>
          <p className="text-xs text-muted">
            Conservative gating is still manual here: use Usage to inspect current pressure, then use Settings if the
            workspace needs a plan or billing follow-up before more traffic is sent through the control plane.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={usageCheckpointHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review usage pressure
            </Link>
            <Link
              href={settingsPlanHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review plan and billing lane
            </Link>
          </div>
        </CardContent>
      </Card>
      {showOnboardingHint ? (
        <Card>
          <CardHeader>
            <CardTitle>Onboarding first demo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <p>
              This Playground session is part of the onboarding path—submit the first `POST /api/v1/runs` request,
              capture the `run_id`/`trace_id`, then confirm the signal in usage and record evidence in verification.
            </p>
            <p>The evidence lane is manual: run in Playground, verify the usage trace, then attach evidence links.</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={usageCheckpointHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Open usage checkpoint
              </Link>
              <Link
                href={verificationHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Capture verification evidence
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <PlaygroundPanel
        workspaceSlug={workspaceContext.workspace.slug}
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
      <Card>
        <CardHeader>
          <CardTitle>Supported endpoints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 font-mono text-xs text-muted">
          <p>POST /api/v1/runs</p>
          <p>GET /api/v1/runs/{"{run_id}"}</p>
          <p>GET /api/v1/runs/{"{run_id}"}/graph</p>
        </CardContent>
      </Card>
    </div>
  );
}
