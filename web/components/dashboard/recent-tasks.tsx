import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requestControlPlanePageData } from "@/lib/server-control-plane-page-fetch";

function statusVariant(status: string): "strong" | "subtle" | "default" {
  const normalized = status.toLowerCase();
  if (normalized === "completed" || normalized === "succeeded" || normalized === "success") return "strong";
  if (
    normalized === "running" ||
    normalized === "in_progress" ||
    normalized === "waiting_approval" ||
    normalized === "queued"
  ) {
    return "subtle";
  }
  return "default";
}

type RunGraphStep = {
  step_id: string;
  sequence_no: number;
  step_type: string;
  actor_type: string;
  actor_ref: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
};

type RunGraphResponse = {
  steps: RunGraphStep[];
};

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) {
    return "Running";
  }
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "-";
  }

  const totalSeconds = Math.round((end - start) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

type RecentTasksProps = {
  runId?: string | null;
};

export async function RecentTasks({ runId }: RecentTasksProps) {
  if (!runId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Tasks</CardTitle>
          <CardDescription>No demo run is available for this workspace yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          <p>Create a first run in Playground to populate live task evidence.</p>
          <Link className="text-foreground underline underline-offset-4" href="/playground">
            Open Playground
          </Link>
        </CardContent>
      </Card>
    );
  }

  const graph = await requestControlPlanePageData<RunGraphResponse>(`/api/control-plane/runs/${runId}/graph`);
  const rows = (graph?.steps ?? []).slice().sort((a, b) => b.sequence_no - a.sequence_no).slice(0, 12);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Tasks</CardTitle>
        <CardDescription>Live execution steps for run {runId}.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            This run has no recorded steps yet. Recheck after the workflow advances.
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.2em] text-muted">
              <tr>
                <th className="pb-3 font-medium">Task</th>
                <th className="pb-3 font-medium">Agent</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Duration</th>
                <th className="pb-3 font-medium">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((step) => (
                <tr key={step.step_id}>
                  <td className="py-4 font-medium text-foreground">{step.step_id}</td>
                  <td className="py-4 text-muted">{step.actor_ref ?? step.actor_type}</td>
                  <td className="py-4">
                    <Badge variant={statusVariant(step.status)}>{step.status}</Badge>
                  </td>
                  <td className="py-4 text-muted">{formatDuration(step.started_at, step.ended_at)}</td>
                  <td className="py-4 text-muted">{new Date(step.started_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
