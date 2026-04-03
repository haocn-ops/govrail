import { headers } from "next/headers";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { RecentTasks } from "@/components/dashboard/recent-tasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function getBaseUrl(): string {
  const requestHeaders = headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  if (!host) {
    return "";
  }
  return `${proto}://${host}`;
}

async function requestControlPlane<T>(path: string): Promise<T | null> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      cookie: headers().get("cookie") ?? "",
    },
  });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { data?: T };
  return payload.data ?? null;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const requestedRunId = getParam(searchParams?.run_id) ?? getParam(searchParams?.runId);
  const workspace = await requestControlPlane<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const runId = requestedRunId ?? workspace?.onboarding?.latest_demo_run?.run_id ?? null;
  const run = runId
    ? await requestControlPlane<RunDetailResponse>(`/api/control-plane/runs/${runId}`)
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Tasks"
        title="Execution tracking"
        description="Follow run state, approval gates, outbound dispatch, and replay status from queued to completed."
      />
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
                  <Link className="text-foreground underline underline-offset-4" href={`/logs?run_id=${encodeURIComponent(run.run_id)}`}>
                    Review logs
                  </Link>
                  <Link
                    className="text-foreground underline underline-offset-4"
                    href={`/artifacts?run_id=${encodeURIComponent(run.run_id)}`}
                  >
                    Review artifacts
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p>No demo run has been recorded for this workspace yet.</p>
                <p>Create one run in Playground first, then this page will show live task transitions and statuses.</p>
                <Link className="text-foreground underline underline-offset-4" href="/playground">
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
