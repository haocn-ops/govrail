import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import {
  buildConsoleAdminLinkState,
  buildConsoleRunAwareHandoffHref,
  parseConsoleHandoffState,
} from "@/lib/console-handoff";
import { requestControlPlanePageData } from "@/lib/server-control-plane-page-fetch";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

const evidenceGuidance = {
  body:
    "Artifacts bundle execution evidence, logs, and audit payloads that support the verification checklist and mock go-live drill. This page does not change admin state; it only helps you carry the same workspace handoff into the next evidence surface.",
  links: [
    { label: "Confirm usage signal", path: "/usage" },
    { label: "Continue to verification", path: "/verification?surface=verification" },
    { label: "Inspect go-live drill", path: "/go-live?surface=go_live" },
    { label: "Review logs", path: "/logs" },
    { label: "Inspect settings handoff", path: "/settings" },
  ],
};

function getParam(value?: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

type WorkspaceDetailResponse = {
  onboarding?: {
    latest_demo_run?: {
      run_id: string;
    } | null;
  };
};

type RunArtifact = {
  artifact_id: string;
  run_id: string;
  step_id: string | null;
  artifact_type: string;
  mime_type: string;
  created_at: string;
};

type RunGraphResponse = {
  artifacts: RunArtifact[];
};

export default async function ArtifactsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoff = parseConsoleHandoffState(searchParams);
  const {
    source,
    attentionWorkspace,
    attentionOrganization,
    week8Focus,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel,
    recentOwnerDisplayName,
    recentOwnerEmail,
  } = handoff;
  const requestedRunId = getParam(searchParams?.run_id) ?? getParam(searchParams?.runId);
  const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const activeRunId = requestedRunId ?? workspace?.onboarding?.latest_demo_run?.run_id ?? handoff.runId ?? null;
  const runAwareHandoff = { ...handoff, runId: activeRunId };
  const graph = activeRunId
    ? await requestControlPlanePageData<RunGraphResponse>(`/api/control-plane/runs/${activeRunId}/graph`)
    : null;
  const artifacts = (graph?.artifacts ?? [])
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const adminLinkState = buildConsoleAdminLinkState({
    handoff: runAwareHandoff,
    workspaceSlug: workspaceContext.workspace.slug,
    runId: activeRunId,
  });
  const adminHref = adminLinkState.adminHref;
  const adminHandoffActionsHref = "#artifacts-admin-handoff";

  return (
    <div className="space-y-8">
      <ConsoleAdminFollowUp
        handoff={runAwareHandoff}
        surface="artifacts"
        workspaceSlug={workspaceContext.workspace.slug}
        ownerDisplayName={recentOwnerDisplayName ?? recentOwnerLabel}
      />
      <PageHeader
        eyebrow="Artifacts"
        title="Generated output and evidence"
        description="Review persisted bundles, workflow outputs, and audit payloads for traceable agent execution."
      />
      <Card>
        <CardHeader>
          <CardTitle>Evidence context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>{evidenceGuidance.body}</p>
          <p>
            Showing artifacts for{" "}
            <span className="font-medium text-foreground">
              {activeRunId ?? "the latest onboarding demo run when available"}
            </span>.
          </p>
          <div className="flex flex-wrap gap-2">
            {evidenceGuidance.links.map((link) => (
              <Link
                key={link.label}
                href={buildConsoleRunAwareHandoffHref(link.path, runAwareHandoff, activeRunId)}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Audit export continuity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Artifacts finalize the evidence relay. Reopen the Latest export receipt from{" "}
            <code className="font-mono">/settings?intent=upgrade</code> so the filename, filters, and SHA-256 stay
            referenced across verification, go-live, and the{" "}
            <Link href={adminHandoffActionsHref}>returned admin handoff</Link> while you inspect bundles here.
          </p>
          <p className="text-xs text-muted">
            Navigation-only manual relay: these links preserve the workspace context but do not automatically attach the
            receipt or close rollout steps for you.
          </p>
          <div id="artifacts-admin-handoff" className="flex flex-wrap gap-2">
            <Link
              href={buildConsoleRunAwareHandoffHref("/settings?intent=upgrade", runAwareHandoff, activeRunId)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background/60"
            >
              Reopen audit export receipt
            </Link>
            <Link
              href={buildConsoleRunAwareHandoffHref(
                "/verification?surface=verification",
                runAwareHandoff,
                activeRunId,
              )}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background/60"
            >
              Confirm verification evidence
            </Link>
            <Link
              href={buildConsoleRunAwareHandoffHref("/go-live?surface=go_live", runAwareHandoff, activeRunId)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background/60"
            >
              Reopen go-live drill
            </Link>
            {adminLinkState.showAdminReturn ? (
              <Link
                href={adminHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background/60"
              >
                {adminLinkState.adminLinkLabel}
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Enterprise evidence lane</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            This artifacts view also supports enterprise readiness evidence: use it together with audit export,
            verification notes, and the mock go-live drill so plan-gated features like audit export, SSO readiness, and
            dedicated-environment planning can all point back to the same workspace timeline.
          </p>
          <p className="text-xs text-muted">
            The handoff is still manual. Download or inspect evidence in Settings, confirm the relevant verification
            note, then return to admin readiness with the same workspace context if this review started there.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildConsoleRunAwareHandoffHref("/usage", runAwareHandoff, activeRunId)}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
            >
              Confirm usage signal
            </Link>
            <Link
              href={buildConsoleRunAwareHandoffHref("/settings?intent=manage-plan", runAwareHandoff, activeRunId)}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
            >
              Review settings evidence lane
            </Link>
            <Link
              href={buildConsoleRunAwareHandoffHref(
                "/verification?surface=verification",
                runAwareHandoff,
                activeRunId,
              )}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
            >
              Attach verification evidence
            </Link>
            {adminLinkState.showAdminReturn ? (
              <Link
                href={adminHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                {adminLinkState.adminLinkLabel}
              </Link>
            ) : null}
          </div>
          <p className="text-xs text-muted">
            A common manual path is: Usage confirms the meter signal, Artifacts confirms the output bundle, Verification
            records the notes, Go-live captures the rehearsal result, then Admin closes the follow-up queue.
          </p>
        </CardContent>
      </Card>
      {!activeRunId ? (
        <Card>
          <CardHeader>
            <CardTitle>No demo run yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <p>This workspace does not have a recorded onboarding demo run, so there are no live artifacts to show.</p>
            <Link
              className="text-foreground underline underline-offset-4"
              href={buildConsoleRunAwareHandoffHref("/playground", runAwareHandoff, activeRunId)}
            >
              Start a run in Playground
            </Link>
          </CardContent>
        </Card>
      ) : artifacts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No artifacts for run {activeRunId}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <p>The run exists, but no artifacts have been persisted yet.</p>
            <p>Check Tasks and Logs for in-flight state, then refresh after the workflow finishes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {artifacts.map((artifact) => (
            <Card key={artifact.artifact_id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">{artifact.artifact_id}</CardTitle>
                  <Badge variant="subtle">{artifact.artifact_type}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted">
                <p>Run: {artifact.run_id}</p>
                <p>Step: {artifact.step_id ?? "-"}</p>
                <p>MIME: {artifact.mime_type}</p>
                <p>Created: {new Date(artifact.created_at).toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
