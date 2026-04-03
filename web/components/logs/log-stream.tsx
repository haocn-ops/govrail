"use client";

import { useQuery } from "@tanstack/react-query";

import type { ControlPlaneRunAuditEvent } from "@/lib/control-plane-types";
import { fetchCurrentWorkspace, fetchRun, fetchRunEvents } from "@/services/control-plane";

function formatEventLine(event: ControlPlaneRunAuditEvent): string {
  const when = new Date(event.created_at).toLocaleTimeString();
  const actor = event.actor.ref ? `${event.actor.type}:${event.actor.ref}` : event.actor.type;
  return `[${when}] ${event.event_type} · ${actor}`;
}

function formatTraceId(traceId?: string | null): string {
  if (!traceId) {
    return "-";
  }
  if (traceId.length <= 20) {
    return traceId;
  }
  return `${traceId.slice(0, 8)}...${traceId.slice(-8)}`;
}

export function LogStream({ runId }: { runId?: string | null }) {
  const workspaceQuery = useQuery({
    queryKey: ["logs-workspace"],
    queryFn: fetchCurrentWorkspace,
  });

  const demoRunId = workspaceQuery.data?.onboarding.latest_demo_run?.run_id ?? null;
  const selectedRunId = runId ?? demoRunId;

  const runQuery = useQuery({
    queryKey: ["logs-run-detail", selectedRunId],
    queryFn: () => fetchRun(selectedRunId as string),
    enabled: Boolean(selectedRunId),
    refetchInterval: 15_000,
  });

  const eventsQuery = useQuery({
    queryKey: ["logs-run-events", selectedRunId],
    queryFn: () => fetchRunEvents(selectedRunId as string, { page_size: 50 }),
    enabled: Boolean(selectedRunId),
    refetchInterval: 15_000,
  });

  if (!selectedRunId) {
    return (
      <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted">
        <p className="font-medium text-foreground">No run bound to this log stream yet.</p>
        <p className="mt-2">
          Create a first demo run in <span className="font-medium text-foreground">/playground</span>, then come back
          to inspect live audit events.
        </p>
      </div>
    );
  }

  if (workspaceQuery.isLoading || runQuery.isLoading || eventsQuery.isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted">
        Loading live run events for <span className="font-medium text-foreground">{selectedRunId}</span>...
      </div>
    );
  }

  if (workspaceQuery.isError || runQuery.isError || eventsQuery.isError) {
    return (
      <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted">
        <p className="font-medium text-foreground">Live log stream is temporarily unavailable.</p>
        <p className="mt-2">
          Check control-plane connectivity and confirm the run events route is enabled, then refresh this page.
        </p>
      </div>
    );
  }

  const traceId = runQuery.data?.trace_id ?? workspaceQuery.data?.onboarding.latest_demo_run?.trace_id ?? null;
  const events = eventsQuery.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-2xl border border-border bg-background p-4 text-xs text-muted sm:grid-cols-3">
        <div>
          <p>Run</p>
          <p className="mt-1 font-medium text-foreground">{selectedRunId}</p>
        </div>
        <div>
          <p>Trace</p>
          <p className="mt-1 font-medium text-foreground">{formatTraceId(traceId)}</p>
        </div>
        <div>
          <p>Status</p>
          <p className="mt-1 font-medium text-foreground">{runQuery.data?.status ?? eventsQuery.data?.run.status ?? "-"}</p>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted">
          <p className="font-medium text-foreground">No audit events yet for this run.</p>
          <p className="mt-2">Wait for the workflow to advance, or trigger another run from /playground.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-background p-4 font-mono text-xs leading-6 text-foreground">
          {events.map((event) => (
            <p key={event.event_id}>{formatEventLine(event)}</p>
          ))}
        </div>
      )}
    </div>
  );
}
