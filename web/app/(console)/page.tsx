import { WorkspaceLaunchpad } from "@/components/home/workspace-launchpad";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function getParam(value?: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardPage({
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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace launchpad"
        title="SaaS Workspace Launch Hub"
        description="Use this as the operator-facing launch state machine: confirm session/workspace context, inspect readiness and plan posture, then continue through the right manual lane for this workspace."
        badge={<Badge variant="strong">{workspaceContext.workspace.slug}</Badge>}
      />
      <WorkspaceLaunchpad
        workspaceSlug={workspaceContext.workspace.slug}
        workspaceRole={workspaceContext.workspace.subject_roles ?? null}
        contextSourceLabel={workspaceContext.source_detail.label}
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
    </div>
  );
}
