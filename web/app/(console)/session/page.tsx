import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { SessionAccessPanel } from "@/components/session/session-access-panel";
import { Badge } from "@/components/ui/badge";
import { buildConsoleHandoffHref, parseConsoleHandoffState } from "@/lib/console-handoff";
import { requestControlPlanePageData } from "@/lib/server-control-plane-page-fetch";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type WorkspaceDetailResponse = {
  onboarding?: {
    latest_demo_run?: {
      run_id: string;
    } | null;
  };
};

export default async function SessionPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const accessibleWorkspaceCount = workspaceContext.available_workspaces.length;
  const handoff = parseConsoleHandoffState(searchParams);
  const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const activeRunId = workspace?.onboarding?.latest_demo_run?.run_id ?? handoff.runId ?? null;
  const runAwareHandoff = { ...handoff, runId: activeRunId };
  const source = handoff.source;
  const showAttentionHandoff = source === "admin-attention";
  const showReadinessHandoff = source === "admin-readiness";
  const onboardingHref = buildConsoleHandoffHref("/onboarding", runAwareHandoff);
  const settingsHref = buildConsoleHandoffHref("/settings", runAwareHandoff);
  const membersHref = buildConsoleHandoffHref("/members", runAwareHandoff);
  const usageHref = buildConsoleHandoffHref("/usage", runAwareHandoff);
  const playgroundHref = buildConsoleHandoffHref("/playground", runAwareHandoff);
  const artifactsHref = buildConsoleHandoffHref("/artifacts", runAwareHandoff);
  const verificationHref = buildConsoleHandoffHref("/verification?surface=verification", runAwareHandoff);
  const goLiveHref = buildConsoleHandoffHref("/go-live?surface=go_live", runAwareHandoff);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Session"
        title="Session and workspace access"
        description="Confirm the current SaaS identity, the active workspace context, and which workspaces this console session can reach."
        badge={<Badge variant="strong">{workspaceContext.source_detail.label}</Badge>}
      />
      <Card>
        <CardHeader>
          <CardTitle>Context check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          <p>
            This surface spells out who you are, where you are, and what role/tenant the console is using. Treat it as
            the launch pad before going into onboarding, billing, verification, or the go-live rehearsal so those
            panels see the workspace you expect.
          </p>
          <p className="text-xs text-muted">
            Active workspace: <span className="font-medium text-foreground">{workspaceContext.workspace.slug}</span>{" "}
            · Reachable workspaces:{" "}
            <span className="font-medium text-foreground">{accessibleWorkspaceCount}</span> · Context source:{" "}
            <span className="font-medium text-foreground">{workspaceContext.source_detail.label}</span>
          </p>
          <p className="text-xs text-muted">
            If anything looks off, identity, tenant, workspace, or roles, use the Session access panel below to
            revalidate before continuing.
          </p>
          {showAttentionHandoff ? (
            <p className="text-xs text-muted">
              Admin attention queue handoff is active for this workspace, so preserve the current console context before
              you return to the queue.
            </p>
          ) : null}
          {showReadinessHandoff ? (
            <p className="text-xs text-muted">
              Admin readiness handoff is active for this workspace, so keep this session context aligned before you
              return to the Week 8 readiness view.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Before entering a managed lane</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Treat this page as the Week 3 checkpoint for all managed SaaS follow-up. Confirm the current workspace,
            accessible roles, and context source first, then continue manually into the right lane for the job at hand.
          </p>
          <p className="text-xs text-muted">
            Trusted session guidance: only metadata-backed SaaS session context should be treated as a trusted launch
            point for members, onboarding, usage, verification, or go-live follow-up. If this page is showing
            fallback or local-only context, stop here and re-check the signed-in workspace session before recording
            evidence or changing access.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={onboardingHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Open onboarding
            </Link>
            <Link
              href={settingsHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review settings
            </Link>
            <Link
              href={verificationHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Continue verification
            </Link>
            <Link
              href={goLiveHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review go-live drill
            </Link>
          </div>
          <p className="text-xs text-muted">
            These links only preserve the current console context. They do not impersonate another user, change
            workspace access, or trigger support-side remediation.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Operator checkpoint sequence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Use the same manual sequence each time: 1) confirm identity and role scope, 2) confirm the active
            workspace and tenant, 3) confirm whether fallback/local-only context warnings are present, then 4) continue
            into the next lane that matches the task.
          </p>
          <p className="text-xs text-muted">
            This keeps onboarding, billing, evidence capture, and go-live notes attached to the right workspace without
            pretending the console can auto-correct a wrong context after the fact.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={membersHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review members and access
            </Link>
            <Link
              href={playgroundHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Open operator run lane
            </Link>
            <Link
              href={usageHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review usage window
            </Link>
            <Link
              href={artifactsHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review evidence bundle
            </Link>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Why this page matters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          <p>
            The SaaS plan depends on server-side session resolution instead of trusting arbitrary tenant input from the
            browser. This page is the closest operator-facing checkpoint for that contract: verify identity, workspace,
            tenant, and reachable workspaces here before you create credentials, review billing posture, or attach
            evidence.
          </p>
          <p className="text-xs text-muted">
            If the current context is wrong, stop here and switch workspaces first. That is safer than correcting
            evidence, keys, or go-live notes after they land on the wrong workspace.
          </p>
        </CardContent>
      </Card>
      <SessionAccessPanel workspaceContext={workspaceContext} handoff={runAwareHandoff} />
    </div>
  );
}
