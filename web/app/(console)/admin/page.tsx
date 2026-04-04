import { AdminOverviewPanel } from "@/components/admin/admin-overview-panel";
import { PageHeader } from "@/components/page-header";
import type { ControlPlaneAdminWeek8ReadinessFocus } from "@/lib/control-plane-types";

export const dynamic = "force-dynamic";

function getParam(value?: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

export default function AdminPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const requestedSurface = getParam(searchParams?.queue_surface);
  const normalizedSurface =
    requestedSurface === "verification" || requestedSurface === "go_live" || requestedSurface === "all"
      ? requestedSurface
      : undefined;
  const attentionWorkspace = getParam(searchParams?.attention_workspace);
  const attentionOrganization = getParam(searchParams?.attention_organization);
  const queueReturned = getParam(searchParams?.queue_returned) === "1";
  const readinessReturned = getParam(searchParams?.readiness_returned) === "1";
  const requestedReadinessFocus = getParam(searchParams?.week8_focus);
  const normalizedReadinessFocus: ControlPlaneAdminWeek8ReadinessFocus | undefined =
    requestedReadinessFocus === "baseline" ||
    requestedReadinessFocus === "credentials" ||
    requestedReadinessFocus === "demo_run" ||
    requestedReadinessFocus === "billing_warning" ||
    requestedReadinessFocus === "go_live_ready"
      ? requestedReadinessFocus
      : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="SaaS admin overview"
        description="Platform-level snapshot for organizations, workspace growth, plan distribution, and enterprise feature rollout posture, with Week 8 readiness focus, attention queue navigation, and return-state governance surfaced."
      />
      <AdminOverviewPanel
        initialSurfaceFilter={normalizedSurface}
        initialReadinessFocus={normalizedReadinessFocus}
        attentionWorkspaceSlug={attentionWorkspace}
        attentionOrganizationId={attentionOrganization}
        queueReturned={queueReturned}
        readinessReturned={readinessReturned}
      />
    </div>
  );
}
