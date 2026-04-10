import Link from "next/link";

import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { WorkspaceContextSurfaceNotice } from "@/components/console/workspace-context-surface-notice";
import { WorkspaceSettingsPanel } from "@/components/settings/workspace-settings-panel";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildConsoleAdminReturnHref,
  buildConsoleAdminReturnState,
  buildConsoleRunAwareHandoffHref,
  parseConsoleHandoffState,
} from "@/lib/console-handoff";
import { requestControlPlanePageData } from "@/lib/server-control-plane-page-fetch";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

type SettingsIntent = "upgrade" | "manage-plan" | "resolve-billing" | "rollback" | null;
type WorkspaceDetailResponse = {
  onboarding?: {
    latest_demo_run?: {
      run_id: string;
    } | null;
  };
};

export const dynamic = "force-dynamic";

function normalizeIntent(value: string | string[] | undefined): SettingsIntent {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    candidate === "upgrade" ||
    candidate === "manage-plan" ||
    candidate === "resolve-billing" ||
    candidate === "rollback"
  ) {
    return candidate;
  }
  return null;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoff = parseConsoleHandoffState(searchParams);
  const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const activeRunId = workspace?.onboarding?.latest_demo_run?.run_id ?? handoff.runId ?? null;
  const runAwareHandoff = { ...handoff, runId: activeRunId };
  const highlightIntent = normalizeIntent(searchParams?.intent);
  const initialCheckoutSessionId = Array.isArray(searchParams?.checkout_session_id)
    ? searchParams?.checkout_session_id[0] ?? null
    : searchParams?.checkout_session_id ?? null;
  const adminReturnState = buildConsoleAdminReturnState({
    source: handoff.source,
    surface: handoff.surface,
    expectedSurface: "verification",
    recentTrackKey: handoff.recentTrackKey,
  });
  const adminReturnHref = buildConsoleAdminReturnHref({
    pathname: "/admin",
    handoff: runAwareHandoff,
    workspaceSlug: workspaceContext.workspace.slug,
    queueSurface: adminReturnState.adminQueueSurface,
  });
  const buildSettingsPageHref = (pathname: string) =>
    buildConsoleRunAwareHandoffHref(pathname, handoff, activeRunId);
  const adminHref = adminReturnState.showAdminReturn ? adminReturnHref : "/admin";
  const adminLinkLabel = adminReturnState.showAdminReturn ? adminReturnState.adminReturnLabel : "Admin overview";

  return (
    <div className="space-y-8">
      <WorkspaceContextSurfaceNotice
        workspaceSlug={workspaceContext.workspace.slug}
        sourceDetail={workspaceContext.source_detail}
        surfaceLabel="Settings"
        sessionHref={buildSettingsPageHref("/session")}
      />
      <ConsoleAdminFollowUp
        handoff={runAwareHandoff}
        surface="settings"
        workspaceSlug={workspaceContext.workspace.slug}
        ownerDisplayName={runAwareHandoff.recentOwnerDisplayName ?? runAwareHandoff.recentOwnerLabel}
        ownerEmail={runAwareHandoff.recentOwnerEmail}
      />
      <PageHeader
        eyebrow="Settings"
        title="Workspace configuration"
        description="Review workspace tenancy, self-serve billing follow-up, subscription status, and retention defaults while keeping the verification/go-live/admin-readiness governance lane connected."
      />
      <Card>
        <CardHeader>
          <CardTitle>Enterprise evidence lane</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Use Settings as the manual governance surface for self-serve billing follow-up, portal-return status,
            audit export, SSO readiness, and dedicated-environment planning. This page helps you review what the
            current workspace is entitled to, then carry the same evidence trail into verification, go-live, or admin
            readiness.
          </p>
          <p className="text-xs text-muted">
            These controls only preserve workspace handoff context and surface billing/status cues. They do not open
            support workflows, trigger automatic remediation, or impersonate another role.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildSettingsPageHref("/usage")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review usage pressure
            </Link>
            <Link
              href={buildSettingsPageHref("/verification?surface=verification")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Capture verification evidence
            </Link>
            <Link
              href={buildSettingsPageHref("/go-live?surface=go_live")}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Rehearse go-live readiness
            </Link>
            <Link
              href={adminHref}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
            >
              {adminLinkLabel}
            </Link>
          </div>
        </CardContent>
      </Card>

      <WorkspaceSettingsPanel
        workspaceSlug={workspaceContext.workspace.slug}
        highlightIntent={highlightIntent}
        initialCheckoutSessionId={initialCheckoutSessionId}
        runId={activeRunId}
        source={handoff.source}
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

      <Card>
        <CardHeader>
          <CardTitle>Observability and retention</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>Structured audit events retain the original trace and request identifiers.</p>
          <p>Hot retention should follow the active workspace plan and downstream compliance obligations.</p>
          <p>Workspace context now drives tenant routing, so operator review should happen against the selected workspace before deploy or replay actions.</p>
        </CardContent>
      </Card>
    </div>
  );
}
