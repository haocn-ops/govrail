import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { PageHeader } from "@/components/page-header";
import { ToolProviderList } from "@/components/agents/tool-provider-list";
import { AgentStatusList } from "@/components/dashboard/agent-status-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";
import {
  buildConsoleRunAwareHandoffHref,
  buildConsoleAdminLinkState,
  parseConsoleHandoffState,
} from "@/lib/console-handoff";
import { requestControlPlanePageData } from "@/lib/server-control-plane-page-fetch";
import Link from "next/link";

type WorkspaceDetailResponse = {
  onboarding?: {
    latest_demo_run?: {
      run_id: string;
    } | null;
  };
};

export default async function AgentsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoff = parseConsoleHandoffState(searchParams);
  const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const activeRunId = workspace?.onboarding?.latest_demo_run?.run_id ?? handoff.runId ?? null;
  const runAwareHandoff = { ...handoff, runId: activeRunId };
  const adminLinkState = buildConsoleAdminLinkState({
    handoff: runAwareHandoff,
    workspaceSlug: workspaceContext.workspace.slug,
    runId: activeRunId,
  });

  const governanceLinks = [
    { label: "Reopen Latest export receipt", path: "/settings?intent=upgrade" },
    { label: "Carry proof to verification", path: "/verification?surface=verification" },
    { label: "Align go-live drill", path: "/go-live?surface=go_live" },
  ];

  return (
    <div className="space-y-8">
      <ConsoleAdminFollowUp
        handoff={runAwareHandoff}
        surface="agents"
        workspaceSlug={workspaceContext.workspace.slug}
      />
      <PageHeader
        eyebrow="Agents"
        title="Agent lifecycle management"
        description="Inspect agents, review regional placement, and manage runtime providers with quick activate/disable actions."
      />
      <Card>
        <CardHeader>
          <CardTitle>Governance continuity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Agent provisioning touches the same governance proof chain as deliveries and billing handoffs.
            Reopen the Latest export receipt on <code className="font-mono">/settings?intent=upgrade</code> so the filename,
            filters, and SHA-256 stay tied to this workspace every time you navigate to verification, go-live, or the admin follow-up.
          </p>
          <div className="flex flex-wrap gap-2">
            {governanceLinks.map((link) => (
              <Link
                key={link.label}
                href={buildConsoleRunAwareHandoffHref(link.path, handoff, activeRunId)}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={adminLinkState.adminHref}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
            >
              {adminLinkState.adminLinkLabel}
            </Link>
          </div>
          <p className="text-xs text-muted">
            Navigation-only manual relay: these links keep the workspace context intact but do not automate, impersonate, or
            pre-apply any change on your behalf.
          </p>
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <AgentStatusList />
        <ToolProviderList workspaceSlug={workspaceContext.workspace.slug} />
      </div>
    </div>
  );
}
