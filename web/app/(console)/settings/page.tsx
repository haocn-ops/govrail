import Link from "next/link";

import { AdminFollowUpNotice } from "@/components/admin/admin-follow-up-notice";
import { WorkspaceSettingsPanel } from "@/components/settings/workspace-settings-panel";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildHandoffHref } from "@/lib/handoff-query";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

type SettingsIntent = "upgrade" | "manage-plan" | "resolve-billing" | null;

function normalizeIntent(value: string | string[] | undefined): SettingsIntent {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === "upgrade" || candidate === "manage-plan" || candidate === "resolve-billing") {
    return candidate;
  }
  return null;
}

function getParam(value?: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const highlightIntent = normalizeIntent(searchParams?.intent);
  const initialCheckoutSessionId = Array.isArray(searchParams?.checkout_session_id)
    ? searchParams?.checkout_session_id[0] ?? null
    : searchParams?.checkout_session_id ?? null;
  const handoffSource = getParam(searchParams?.source);
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
  const showReadinessHandoff = handoffSource === "admin-readiness";
  const showAttentionHandoff = handoffSource === "admin-attention";
  const handoffArgs = {
    source: handoffSource,
    week8Focus,
    attentionWorkspace: handoffWorkspace,
    attentionOrganization: handoffOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel: ownerLabel,
  };
  const buildSettingsPageHref = (pathname: string) =>
    buildHandoffHref(pathname, handoffArgs, { preserveExistingQuery: true });

  return (
    <div className="space-y-8">
      {showAttentionHandoff ? (
        <AdminFollowUpNotice
          source="admin-attention"
          surface="settings"
          workspaceSlug={workspaceContext.workspace.slug}
          sourceWorkspaceSlug={handoffWorkspace}
          attentionOrganization={handoffOrganization}
          deliveryContext={deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={recentUpdateKind}
          evidenceCount={evidenceCount}
          ownerDisplayName={ownerLabel}
        />
      ) : null}
      {showReadinessHandoff ? (
        <AdminFollowUpNotice
          source="admin-readiness"
          surface="settings"
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
              href={buildSettingsPageHref("/admin")}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
            >
              Return to admin readiness view
            </Link>
          </div>
        </CardContent>
      </Card>

      <WorkspaceSettingsPanel
        workspaceSlug={workspaceContext.workspace.slug}
        highlightIntent={highlightIntent}
        initialCheckoutSessionId={initialCheckoutSessionId}
        source={handoffSource}
        week8Focus={week8Focus}
        attentionWorkspace={handoffWorkspace}
        attentionOrganization={handoffOrganization}
        deliveryContext={deliveryContext}
        recentTrackKey={recentTrackKey}
        recentUpdateKind={recentUpdateKind}
        evidenceCount={evidenceCount}
        recentOwnerLabel={ownerLabel}
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
