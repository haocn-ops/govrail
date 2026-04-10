import Link from "next/link";

import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { PageHeader } from "@/components/page-header";
import { RecentTasks } from "@/components/dashboard/recent-tasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildConsoleAdminLinkState,
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

type RunDetailResponse = {
  run_id: string;
  status: string;
  workflow_status: string;
  trace_id: string;
  updated_at: string;
};

function getParam(value?: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoff = parseConsoleHandoffState(searchParams);
  const requestedRunId = getParam(searchParams?.run_id) ?? getParam(searchParams?.runId);
  const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const runId = requestedRunId ?? workspace?.onboarding?.latest_demo_run?.run_id ?? null;
  const runAwareHandoff = { ...handoff, runId };
  const run = runId
    ? await requestControlPlanePageData<RunDetailResponse>(`/api/control-plane/runs/${runId}`)
    : null;
  const adminLinkState = buildConsoleAdminLinkState({
    handoff: runAwareHandoff,
    workspaceSlug: workspaceContext.workspace.slug,
    runId,
  });
  const adminHref = adminLinkState.adminHref;
  const adminFollowUpActionsHref = "#tasks-admin-follow-up";

  return (
    <div className="space-y-8">
      <ConsoleAdminFollowUp
        handoff={runAwareHandoff}
        surface="tasks"
        workspaceSlug={workspaceContext.workspace.slug}
      />
      <PageHeader
        eyebrow="Tasks"
        title="Execution tracking"
        description="Follow run state, approval gates, outbound dispatch, and replay status from queued to completed."
      />
      <Card>
        <CardHeader>
          <CardTitle>Audit export continuity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Task tracking is part of the same navigation-only audit-export relay. Reopen the Latest export receipt from{" "}
            <code className="font-mono">/settings?intent=upgrade</code>, keep the filename, filters, and SHA-256 in
            view, and carry that proof through verification, go-live, and the{" "}
            <Link href={adminFollowUpActionsHref}>admin follow-up loop</Link> while you inspect run state here.
          </p>
          <p className="text-xs text-muted">
            Manual relay only: these links preserve workspace and run context, but they do not automate remediation,
            impersonate another operator, or attach evidence for you.
          </p>
          <div id="tasks-admin-follow-up" className="flex flex-wrap gap-2">
            <Link
              href={buildConsoleRunAwareHandoffHref("/settings?intent=upgrade", runAwareHandoff, runId)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen audit export receipt
            </Link>
            <Link
              href={buildConsoleRunAwareHandoffHref(
                "/verification?surface=verification",
                runAwareHandoff,
                runId,
              )}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Continue verification evidence
            </Link>
            <Link
              href={buildConsoleRunAwareHandoffHref("/go-live?surface=go_live", runAwareHandoff, runId)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen go-live drill
            </Link>
            {adminLinkState.showAdminReturn ? (
              <Link
                href={adminHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                {adminLinkState.adminLinkLabel}
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <RecentTasks runId={runId} />
        <Card>
          <CardHeader>
            <CardTitle>Live run context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            {run ? (
              <>
                <p>
                  Workspace <span className="font-medium text-foreground">{workspaceContext.workspace.slug}</span> is currently tracking demo run{" "}
                  <span className="font-medium text-foreground">{run.run_id}</span>.
                </p>
                <p>
                  Status: <span className="font-medium text-foreground">{run.status}</span> · Workflow:{" "}
                  <span className="font-medium text-foreground">{run.workflow_status}</span>
                </p>
                <p>
                  Trace: <span className="font-medium text-foreground">{run.trace_id}</span>
                </p>
                <p>Last update: {new Date(run.updated_at).toLocaleString()}</p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    className="text-foreground underline underline-offset-4"
                    href={buildConsoleRunAwareHandoffHref("/logs", runAwareHandoff, run.run_id)}
                  >
                    Review logs
                  </Link>
                  <Link
                    className="text-foreground underline underline-offset-4"
                    href={buildConsoleRunAwareHandoffHref("/artifacts", runAwareHandoff, run.run_id)}
                  >
                    Review artifacts
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p>No demo run has been recorded for this workspace yet.</p>
                <p>Create one run in Playground first, then this page will show live task transitions and statuses.</p>
                <Link
                  className="text-foreground underline underline-offset-4"
                  href={buildConsoleRunAwareHandoffHref("/playground", runAwareHandoff, null)}
                >
                  Open Playground
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
