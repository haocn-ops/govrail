import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { PolicyMatrix } from "@/components/egress/policy-matrix";
import { PageHeader } from "@/components/page-header";
import {
  buildConsoleRunAwareHandoffHref,
  buildConsoleAdminLinkState,
  parseConsoleHandoffState,
} from "@/lib/console-handoff";
import { requestControlPlanePageData } from "@/lib/server-control-plane-page-fetch";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

type WorkspaceDetailResponse = {
  onboarding?: {
    latest_demo_run?: {
      run_id: string;
    } | null;
  };
};

export default async function EgressPage({
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
  });

  return (
    <div className="space-y-8">
      <ConsoleAdminFollowUp
        handoff={runAwareHandoff}
        surface="egress"
        workspaceSlug={workspaceContext.workspace.slug}
      />
      <PageHeader
        eyebrow="Egress"
        title="Outbound permission control"
        description="Review which destinations are allowed, denied, or routed through approval-required policy."
      />
      <Card>
        <CardHeader>
          <CardTitle>Audit export continuity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Egress is part of the audit-export evidence relay. Reopen the Latest export receipt from{" "}
            <code className="font-mono">/settings?intent=upgrade</code>, keep the same filename, filters, and SHA-256,
            and carry that proof into verification, go-live, and the admin follow-up surface while you review outbound
            destinations.
          </p>
          <p className="text-xs text-muted">
            Navigation-only manual relay: this card keeps the workspace context stitched together but does not automate,
            impersonate, or change workspace state on your behalf.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildConsoleRunAwareHandoffHref("/settings?intent=upgrade", handoff, activeRunId)}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
            >
              Reopen audit export receipt
            </Link>
            <Link
              href={buildConsoleRunAwareHandoffHref("/verification?surface=verification", handoff, activeRunId)}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
            >
              Continue verification evidence
            </Link>
            <Link
              href={buildConsoleRunAwareHandoffHref("/go-live?surface=go_live", handoff, activeRunId)}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
            >
              Reopen go-live drill
            </Link>
            {adminLinkState.showAdminReturn ? (
              <Link
                href={adminLinkState.adminHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                {adminLinkState.adminLinkLabel}
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <PolicyMatrix workspaceSlug={workspaceContext.workspace.slug} />
    </div>
  );
}
