import Link from "next/link";

import { WorkspaceContextCallout } from "@/components/workspace-context-callout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkspaceContextSourceDetail } from "@/lib/workspace-context";

export function WorkspaceContextSurfaceNotice({
  workspaceSlug,
  sourceDetail,
  surfaceLabel,
  sessionHref = "/session",
}: {
  workspaceSlug: string;
  sourceDetail: WorkspaceContextSourceDetail;
  surfaceLabel: string;
  sessionHref?: string;
}) {
  if (surfaceLabel === "Settings") {
    return (
      <WorkspaceContextCallout
        surface="settings"
        sourceDetail={sourceDetail}
        workspaceSlug={workspaceSlug}
        sessionHref={sessionHref}
      />
    );
  }

  if (surfaceLabel === "Usage") {
    return (
      <WorkspaceContextCallout
        surface="usage"
        sourceDetail={sourceDetail}
        workspaceSlug={workspaceSlug}
        sessionHref={sessionHref}
      />
    );
  }

  if (surfaceLabel === "Verification") {
    return (
      <WorkspaceContextCallout
        surface="verification"
        sourceDetail={sourceDetail}
        workspaceSlug={workspaceSlug}
        sessionHref={sessionHref}
      />
    );
  }

  if (surfaceLabel === "Go-live drill") {
    return (
      <WorkspaceContextCallout
        surface="go-live"
        sourceDetail={sourceDetail}
        workspaceSlug={workspaceSlug}
        sessionHref={sessionHref}
      />
    );
  }

  const isFallback = sourceDetail.is_fallback || sourceDetail.local_only;

  return (
    <Card className="bg-card/90">
      <CardHeader className="gap-4 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <CardTitle>Workspace session checkpoint</CardTitle>
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">{surfaceLabel}</span> is running against workspace{" "}
            <span className="font-medium text-foreground">{workspaceSlug}</span>. Reconfirm the active session before
            you treat any billing, evidence, readiness, or governance detail on this surface as authoritative.
          </p>
        </div>
        <Link
          href={sessionHref}
          className="inline-flex h-9 shrink-0 items-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-card"
        >
          Re-check session context
        </Link>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-sm text-muted">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="strong">{workspaceSlug}</Badge>
          <Badge variant={isFallback ? "default" : "subtle"}>{sourceDetail.label}</Badge>
          {sourceDetail.local_only ? <Badge variant="default">Local-only context</Badge> : null}
        </div>
        {isFallback ? (
          <p>
            This surface is using fallback or local-preview workspace context. Treat the current state as preview-only
            until <code>/session</code> confirms a metadata-backed identity and tenant for this workspace.
          </p>
        ) : (
          <p>
            This surface is using metadata-backed SaaS context. If the workspace, tenant, or operator identity looks
            wrong, stop here and re-open <code>/session</code> before continuing.
          </p>
        )}
        {sourceDetail.warning ? <p className="text-xs text-muted">{sourceDetail.warning}</p> : null}
      </CardContent>
    </Card>
  );
}
