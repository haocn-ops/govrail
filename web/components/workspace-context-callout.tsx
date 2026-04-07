import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkspaceContextSourceDetail } from "@/lib/workspace-context";

export const WORKSPACE_CONTEXT_CALLOUT_SURFACES = ["settings", "usage", "verification", "go-live"] as const;

export type WorkspaceContextCalloutSurface = (typeof WORKSPACE_CONTEXT_CALLOUT_SURFACES)[number];

type WorkspaceContextCalloutProps = {
  surface: WorkspaceContextCalloutSurface;
  sourceDetail: WorkspaceContextSourceDetail;
  workspaceSlug: string;
  sessionHref?: string;
};

function surfaceTitle(surface: WorkspaceContextCalloutSurface): string {
  if (surface === "settings") {
    return "Settings context checkpoint";
  }
  if (surface === "usage") {
    return "Usage context checkpoint";
  }
  if (surface === "verification") {
    return "Verification context checkpoint";
  }
  return "Go-live context checkpoint";
}

function surfaceGuidance(surface: WorkspaceContextCalloutSurface): string {
  if (surface === "settings") {
    return "Confirm workspace identity before billing follow-up, SSO readiness, or dedicated-environment governance updates.";
  }
  if (surface === "usage") {
    return "Confirm workspace identity before recording usage pressure, quota evidence, or plan-limit remediation cues that will later be relayed into verification, settings, and admin notes.";
  }
  if (surface === "verification") {
    return "Confirm workspace identity before attaching verification notes, checklist evidence, or rollout readiness commentary.";
  }
  return "Confirm workspace identity before running mock go-live drill notes, reusing the same audit export evidence thread, and handing readiness status back to admin.";
}

export function WorkspaceContextCallout({
  surface,
  sourceDetail,
  workspaceSlug,
  sessionHref = "/session",
}: WorkspaceContextCalloutProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{surfaceTitle(surface)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted">
        <p>
          Active workspace: <span className="font-medium text-foreground">{workspaceSlug}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={sourceDetail.is_fallback ? "default" : "subtle"}>
            context: {sourceDetail.label}
          </Badge>
          {sourceDetail.warning ? <Badge variant="default">fallback warning</Badge> : null}
          {sourceDetail.local_only ? <Badge variant="default">local-only context</Badge> : null}
        </div>
        <p>{surfaceGuidance(surface)}</p>
        {sourceDetail.warning ? (
          <p className="text-xs text-muted">
            {sourceDetail.warning}
          </p>
        ) : null}
        {(sourceDetail.is_fallback || sourceDetail.local_only) && (
          <p className="text-xs text-muted">
            Live metadata is unavailable. Treat this as preview data until you reconfirm metadata-backed identity and
            tenant on <code className="font-mono">/session</code>.
          </p>
        )}
        <div>
          <Link
            href={sessionHref}
            className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
          >
            Review workspace context on /session
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
