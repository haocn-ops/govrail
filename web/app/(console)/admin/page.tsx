import { AdminOverviewPanel } from "@/components/admin/admin-overview-panel";
import { WorkspaceContextSurfaceNotice } from "@/components/console/workspace-context-surface-notice";
import { PageHeader } from "@/components/page-header";
import type { ControlPlaneAdminWeek8ReadinessFocus } from "@/lib/control-plane-types";
import {
  getConsoleParam,
  parseConsoleHandoffState,
  resolveAdminQueueSurface,
  resolveConsoleWeek8Focus,
} from "@/lib/console-handoff";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoff = parseConsoleHandoffState(searchParams);
  const requestedSurface = resolveAdminQueueSurface(getConsoleParam(searchParams?.queue_surface));
  const normalizedSurface = requestedSurface ?? (getConsoleParam(searchParams?.queue_surface) === "all" ? "all" : undefined);
  const queueReturned = getConsoleParam(searchParams?.queue_returned) === "1";
  const readinessReturned = getConsoleParam(searchParams?.readiness_returned) === "1";
  const normalizedReadinessFocus: ControlPlaneAdminWeek8ReadinessFocus | undefined = resolveConsoleWeek8Focus(
    handoff.week8Focus,
  );

  return (
    <div className="space-y-8">
      <WorkspaceContextSurfaceNotice
        workspaceSlug={workspaceContext.workspace.slug}
        sourceDetail={workspaceContext.source_detail}
        surfaceLabel="Admin overview"
      />
      <PageHeader
        eyebrow="Admin"
        title="SaaS admin overview"
        description="Platform-level snapshot for organizations, workspace growth, plan distribution, and enterprise feature rollout posture, with Week 8 readiness focus, attention queue navigation, and return-state governance surfaced."
      />
      <AdminOverviewPanel
        initialSurfaceFilter={normalizedSurface}
        initialReadinessFocus={normalizedReadinessFocus}
        attentionWorkspaceSlug={handoff.attentionWorkspace}
        attentionOrganizationId={handoff.attentionOrganization}
        queueReturned={queueReturned}
        readinessReturned={readinessReturned}
        preferPreviewScaffolding={
          workspaceContext.source_detail.is_fallback || workspaceContext.source_detail.local_only
        }
      />
    </div>
  );
}
