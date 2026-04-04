import { AdminFollowUpNotice } from "@/components/admin/admin-follow-up-notice";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { headers } from "next/headers";
import { buildHandoffHref, type HandoffQueryArgs } from "@/lib/handoff-query";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function buildArtifactsHandoffHref(args: HandoffQueryArgs & { pathname: string; runId?: string | null }): string {
  const { pathname, runId, ...query } = args;
  const href = buildHandoffHref(pathname, query, { preserveExistingQuery: true });
  if (!runId) {
    return href;
  }

  const [basePath, rawQuery] = href.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");
  searchParams.set("run_id", runId);
  const finalQuery = searchParams.toString();
  return finalQuery ? `${basePath}?${finalQuery}` : basePath;
}

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

export default async function ArtifactsPage({
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
  const requestedRunId = getParam(searchParams?.run_id) ?? getParam(searchParams?.runId);
  const showAdminAttention = source === "admin-attention";
  const showAdminReadiness = source === "admin-readiness";
  const showAdminReturn = showAdminAttention || showAdminReadiness;
  const adminReturnLabel = showAdminAttention ? "Return to admin queue" : "Return to admin readiness";
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
    runId: requestedRunId,
  };
  const workspace = await requestControlPlane<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const runId = requestedRunId ?? workspace?.onboarding?.latest_demo_run?.run_id ?? null;
  const graph = runId ? await requestControlPlane<RunGraphResponse>(`/api/control-plane/runs/${runId}/graph`) : null;
  const artifacts = (graph?.artifacts ?? [])
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  return (
    <div className="space-y-8">
      {showAdminAttention || showAdminReadiness ? (
        <AdminFollowUpNotice
          source={showAdminAttention ? "admin-attention" : "admin-readiness"}
          surface="artifacts"
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
            <span className="font-medium text-foreground">{runId ?? "the latest onboarding demo run when available"}</span>.
          </p>
          <div className="flex flex-wrap gap-2">
            {evidenceGuidance.links.map((link) => (
              <Link
                key={link.label}
                href={buildArtifactsHandoffHref({ pathname: link.path, ...handoffArgs })}
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
              href={buildArtifactsHandoffHref({ pathname: "/usage", ...handoffArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
            >
              Confirm usage signal
            </Link>
            <Link
              href={buildArtifactsHandoffHref({ pathname: "/settings", ...handoffArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
            >
              Review settings evidence lane
            </Link>
            <Link
              href={buildArtifactsHandoffHref({ pathname: "/verification?surface=verification", ...handoffArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
            >
              Attach verification evidence
            </Link>
            {showAdminReturn ? (
              <Link
                href={buildArtifactsHandoffHref({ pathname: "/admin", ...handoffArgs })}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                {adminReturnLabel}
              </Link>
            ) : null}
          </div>
          <p className="text-xs text-muted">
            A common manual path is: Usage confirms the meter signal, Artifacts confirms the output bundle, Verification
            records the notes, Go-live captures the rehearsal result, then Admin closes the follow-up queue.
          </p>
        </CardContent>
      </Card>
      {!runId ? (
        <Card>
          <CardHeader>
            <CardTitle>No demo run yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <p>This workspace does not have a recorded onboarding demo run, so there are no live artifacts to show.</p>
            <Link
              className="text-foreground underline underline-offset-4"
              href={buildArtifactsHandoffHref({ pathname: "/playground", ...handoffArgs })}
            >
              Start a run in Playground
            </Link>
          </CardContent>
        </Card>
      ) : artifacts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No artifacts for run {runId}</CardTitle>
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
