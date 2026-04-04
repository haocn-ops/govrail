import Link from "next/link";

import { AdminFollowUpNotice } from "@/components/admin/admin-follow-up-notice";
import { PlaygroundPanel } from "@/components/playground/playground-panel";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildHandoffHref, buildVerificationChecklistHandoffHref } from "@/lib/handoff-query";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function getParam(value?: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

function normalizeHandoffSource(value: string | null): "admin-attention" | "admin-readiness" | "onboarding" | null {
  if (value === "admin-attention" || value === "admin-readiness" || value === "onboarding") {
    return value;
  }
  return null;
}

export default async function PlaygroundPage({
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
  const showReadinessHandoff = source === "admin-readiness";
  const showAttentionHandoff = source === "admin-attention";
  const showOnboardingHint = source === "onboarding";
  const handoffSource = normalizeHandoffSource(source);
  const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>[0], "pathname"> = {
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
  const settingsPlanHref = buildHandoffHref("/settings?intent=manage-plan", {
    source,
    week8Focus,
    attentionWorkspace: handoffWorkspace,
    attentionOrganization: handoffOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel: ownerLabel,
  });
  const usageCheckpointHref = buildVerificationChecklistHandoffHref({ pathname: "/usage", ...handoffHrefArgs });

  return (
    <div className="space-y-8">
      {showAttentionHandoff ? (
        <AdminFollowUpNotice
          source="admin-attention"
          surface="playground"
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
          surface="playground"
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
                href={buildVerificationChecklistHandoffHref({ pathname: "/usage", ...handoffHrefArgs })}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Open usage checkpoint
              </Link>
              <Link
                href={buildVerificationChecklistHandoffHref({ pathname: "/verification?surface=verification", ...handoffHrefArgs })}
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
