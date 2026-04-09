import { Bell, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
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
    <header className="sticky top-0 z-20 border-b border-border bg-background px-6 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input className="pl-10" placeholder="Search workspace or run" />
            </div>
            <div className="min-w-0 flex-1">
              <WorkspaceSwitcher
                currentWorkspaceSlug={workspaceContext.workspace.slug}
                workspaces={workspaceContext.available_workspaces}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="strong">{workspaceContext.workspace.display_name}</Badge>
            <Badge variant="subtle">session: {subjectLabel}</Badge>
            <Badge variant="subtle">provider: {authProvider}</Badge>
            <Badge variant="subtle">roles: {rolesLabel}</Badge>
            <Badge variant="subtle">tenant: {workspaceContext.workspace.tenant_id}</Badge>
            <Badge variant={sourceDetail.is_fallback ? "default" : "subtle"}>
              context: {sourceDetail.label}
            </Badge>
            <Badge variant={sourceDetail.session_checkpoint_required ? "default" : "subtle"}>
              {sourceDetail.checkpoint_label}
            </Badge>
            {sourceDetail.local_only ? <Badge variant="default">local-only context</Badge> : null}
            <Badge variant="subtle">workspaces: {workspaceCount}</Badge>
            <div className="hidden">
              {sourceDetail.warning ? (
                <Badge variant="default">review context details on /session</Badge>
              ) : null}
            </div>
          </div>
          {sourceDetail.session_checkpoint_required ? (
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{sourceDetail.checkpoint_label}</p>
                  <p className="text-xs leading-5 text-muted">
                    Live metadata is unavailable, so treat this as preview data until the workspace context route on <code className="font-mono">/session</code> confirms a metadata-backed identity and tenant before you follow any guidance.
                  </p>
                </div>
                <a
                  href="/session"
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-card"
                >
                  review context details on /session
                </a>
              </div>
            </div>
          ) : (
            <p className="text-xs leading-5 text-muted">
              Confirm this identity, tenant, and workspace before heading to onboarding, billing, verification, or the
              go-live drill so nothing accidentally runs under the wrong context.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:max-w-md xl:justify-end">
          <a
            href="/session"
            className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-background"
          >
            Session access
          </a>
          <a
            href={nextLane.href}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-background"
          >
            {nextLane.label}
          </a>
          <a
            href="/admin"
            className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-background"
          >
            Admin queue
          </a>
          <button
            type="button"
            className="rounded-xl border border-border bg-card p-2 text-muted transition hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-muted">
        If the badges above show a fallback or local-only source or a session checkpoint requirement, treat that
        context as preview data until you reconfirm metadata-backed identity on <code className="font-mono">/session</code>.
        The next-lane shortcut is guidance only and does not change roles or impersonate another operator.
      </p>
    </header>
  );
}
