import { Bell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

function normalizeRole(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === "") {
    return null;
  }
  return (
    raw
      .split(",")
      .map((role) => role.trim().toLowerCase())
      .find((role) => role.length > 0) ?? null
  );
}

function nextLaneFromRole(raw: string | null | undefined): { label: string; href: string } {
  const role = normalizeRole(raw);
  if (role?.includes("viewer") || role?.includes("auditor")) {
    return { label: "Next lane: verification evidence", href: "/verification?surface=verification" };
  }
  if (role?.includes("operator")) {
    return { label: "Next lane: playground run", href: "/playground" };
  }
  if (role?.includes("approver")) {
    return { label: "Next lane: go-live review", href: "/go-live?surface=go_live" };
  }
  return { label: "Next lane: settings and members", href: "/session" };
}

export async function Topbar() {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const subjectLabel =
    workspaceContext.session_user?.email ??
    workspaceContext.session_user?.auth_subject ??
    workspaceContext.workspace.subject_id ??
    "anonymous";
  const sourceDetail = workspaceContext.source_detail;
  const workspaceCount = workspaceContext.available_workspaces.length;
  const authProvider = workspaceContext.session_user?.auth_provider ?? "local";
  const rolesLabel =
    workspaceContext.workspace.subject_roles
      ?.split(",")
      .map((role) => role.trim())
      .filter((role) => role.length > 0)
      .slice(0, 2)
      .join(", ") ?? "unscoped";
  const nextLane = nextLaneFromRole(workspaceContext.workspace.subject_roles);

  return (
    <header className="pointer-events-none sticky top-0 z-20 border-b border-border bg-background/95 px-5 py-3 backdrop-blur">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="strong" className="px-2.5 py-0.5 text-[11px]">
              {workspaceContext.workspace.display_name}
            </Badge>
            <Badge variant="subtle" className="px-2 py-0.5 text-[11px]">
              session: {subjectLabel}
            </Badge>
            <Badge variant="subtle" className="px-2 py-0.5 text-[11px]">
              provider: {authProvider}
            </Badge>
            <Badge variant="subtle" className="px-2 py-0.5 text-[11px]">
              roles: {rolesLabel}
            </Badge>
            <Badge variant="subtle" className="px-2 py-0.5 text-[11px]">
              tenant: {workspaceContext.workspace.tenant_id}
            </Badge>
            <Badge variant={sourceDetail.is_fallback ? "default" : "subtle"} className="px-2 py-0.5 text-[11px]">
              context: {sourceDetail.label}
            </Badge>
            <Badge
              variant={sourceDetail.session_checkpoint_required ? "default" : "subtle"}
              className="px-2 py-0.5 text-[11px]"
            >
              {sourceDetail.checkpoint_label}
            </Badge>
            {sourceDetail.local_only ? <Badge variant="default">local-only context</Badge> : null}
            <Badge variant="subtle" className="px-2 py-0.5 text-[11px]">workspaces: {workspaceCount}</Badge>
            <div className="hidden">
              {sourceDetail.warning ? (
                <Badge variant="default">review context details on /session</Badge>
              ) : null}
            </div>
          </div>
          <div className="hidden">
            {sourceDetail.session_checkpoint_required ? (
              <div>
                <p>{sourceDetail.checkpoint_label}</p>
                <p>
                  Live metadata is unavailable, so treat this as preview data until the workspace context route on <code className="font-mono">/session</code> confirms a metadata-backed identity and tenant before you follow any guidance.
                </p>
                <a href="/session">review context details on /session</a>
              </div>
            ) : (
              <p>
                Confirm this identity, tenant, and workspace before heading to onboarding, billing, verification, or the
                go-live drill so nothing accidentally runs under the wrong context.
              </p>
            )}
          </div>
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 xl:max-w-md xl:justify-end">
          <a
            href="/session"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition hover:bg-background"
          >
            Session access
          </a>
          <a
            href={nextLane.href}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition hover:bg-background"
          >
            {nextLane.label}
          </a>
          <a
            href="/admin"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition hover:bg-background"
          >
            Admin queue
          </a>
          <button
            type="button"
            className="rounded-lg border border-border bg-card p-2 text-muted transition hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="hidden">
        <p>
          If the badges above show a fallback or local-only source or a session checkpoint requirement, treat that
          context as preview data until you reconfirm metadata-backed identity on <code className="font-mono">/session</code>.
          The next-lane shortcut is guidance only and does not change roles or impersonate another operator.
        </p>
      </div>
    </header>
  );
}
