import Link from "next/link";

import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { LogStream } from "@/components/logs/log-stream";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildConsoleAdminLinkState,
  buildConsoleRunAwareHandoffHref,
  parseConsoleHandoffState,
} from "@/lib/console-handoff";
import { requestControlPlanePageData } from "@/lib/server-control-plane-page-fetch";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function getParam(value?: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

const evidenceGuidance = {
  body:
    "Logs provide the operator trace that pairs with stored artifacts and checklist evidence. Treat this view as navigation context only: review the stream, then carry the same workspace handoff into the next evidence surface.",
  links: [
    { label: "Review artifacts", path: "/artifacts" },
    { label: "Capture verification evidence", path: "/verification?surface=verification" },
    { label: "Continue the go-live drill", path: "/go-live?surface=go_live" },
    { label: "Review settings handoff", path: "/settings" },
  ],
};

const auditExportCallout = {
  title: "Audit export continuity",
  body:
    "Reopen the Latest export receipt on /settings?intent=upgrade, copy the filename, filters, and SHA-256, and keep that evidence note with you when you move through verification, go-live, and admin so every surface references the identical export.",
  footnote:
    "This is a navigation-only manual relay; open the receipt manually, keep the filename/filters/SHA-256 handy, and keep returning to verification, go-live, and admin before closing the admin readiness loop.",
};

type WorkspaceDetailResponse = {
  onboarding?: {
    latest_demo_run?: {
      run_id: string;
    } | null;
  };
};

export default async function LogsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoff = parseConsoleHandoffState(searchParams);
  const requestedRunId = getParam(searchParams?.run_id) ?? getParam(searchParams?.runId);
  const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const activeRunId = requestedRunId ?? workspace?.onboarding?.latest_demo_run?.run_id ?? handoff.runId ?? null;
  const runAwareHandoff = { ...handoff, runId: activeRunId };
  const adminLinkState = buildConsoleAdminLinkState({
    handoff: runAwareHandoff,
    workspaceSlug: workspaceContext.workspace.slug,
    runId: activeRunId,
  });
  const adminHref = adminLinkState.adminHref;
  const adminReturnActionsHref = "#logs-admin-return-actions";
  const auditExportLinks = [
    { label: "Reopen Latest export receipt", path: "/settings?intent=upgrade" },
    { label: "Carry proof to verification", path: "/verification?surface=verification" },
    { label: "Align go-live drill", path: "/go-live?surface=go_live" },
  ];

  return (
    <div className="space-y-8">
      <ConsoleAdminFollowUp
        handoff={runAwareHandoff}
        surface="logs"
        workspaceSlug={workspaceContext.workspace.slug}
      />
      <PageHeader
        eyebrow="Logs"
        title="Realtime and historical logs"
        description="Inspect workflow, approval, proxy, and dispatch traces for the current workspace before you save evidence elsewhere."
      />
      <Card>
        <CardHeader>
          <CardTitle>{auditExportCallout.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>{auditExportCallout.body}</p>
          <p>
            Use the <Link href={adminReturnActionsHref}>admin return action below</Link> once the log evidence is ready
            to hand back.
          </p>
          <div id="logs-admin-return-actions" className="flex flex-wrap gap-2">
            {auditExportLinks.map((link) => (
              <Link
                key={link.label}
                href={buildConsoleRunAwareHandoffHref(link.path, runAwareHandoff, activeRunId)}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                {link.label}
              </Link>
            ))}
            {adminLinkState.showAdminReturn ? (
              <Link
                key={adminLinkState.adminLinkLabel}
                href={adminHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                {adminLinkState.adminLinkLabel}
              </Link>
            ) : null}
          </div>
          <p className="text-xs text-muted">{auditExportCallout.footnote}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Evidence context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>{evidenceGuidance.body}</p>
          <p>
            Current workspace: <span className="font-medium text-foreground">{workspaceContext.workspace.slug}</span>
            {handoff.attentionWorkspace ? (
              <>
                {" "}
                · Requested from admin: <span className="font-medium text-foreground">{handoff.attentionWorkspace}</span>
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {evidenceGuidance.links.map((link) => (
              <Link
                key={link.label}
                href={buildConsoleRunAwareHandoffHref(link.path, runAwareHandoff, activeRunId)}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Live stream</CardTitle>
          <Badge variant="subtle">tailing</Badge>
        </CardHeader>
        <CardContent>
          <LogStream runId={activeRunId} />
        </CardContent>
      </Card>
    </div>
  );
}
