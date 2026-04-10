"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkspaceContext } from "@/lib/workspace-context";
import { fetchSession } from "@/services/control-plane";
import { buildConsoleHandoffHref, type ConsoleHandoffState } from "@/lib/console-handoff";

type SessionAccessPanelProps = {
  workspaceContext: WorkspaceContext;
  handoff: ConsoleHandoffState;
};

type SessionLane = {
  title: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};

type ContextRisk = {
  label: string;
  detail: string;
  tone: "strong" | "default" | "subtle";
};

function summarizeRole(raw: string | null | undefined): string {
  if (!raw || raw.trim() === "") {
    return "unscoped";
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .join(", ");
}

function normalizeRole(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === "") {
    return null;
  }
  return (
    raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .find((item) => item.length > 0) ?? null
  );
}

function roleAwareLane(raw: string | null | undefined): SessionLane {
  const role = normalizeRole(raw);
  if (role?.includes("viewer") || role?.includes("auditor")) {
    return {
      title: "Evidence review lane",
      description: "Read-only roles should confirm the workspace context first, then review verification evidence and related artifacts.",
      primaryLabel: "Open verification",
      primaryHref: "/verification?surface=verification",
      secondaryLabel: "Review artifacts",
      secondaryHref: "/artifacts",
    };
  }
  if (role?.includes("operator")) {
    return {
      title: "First-run operator lane",
      description: "Operator roles usually continue into Playground, then Usage, and only after that attach the same run context in Verification.",
      primaryLabel: "Open Playground",
      primaryHref: "/playground",
      secondaryLabel: "Review usage",
      secondaryHref: "/usage",
    };
  }
  if (role?.includes("approver")) {
    return {
      title: "Release gating lane",
      description: "Approver roles should validate the verification trail and then review the mock go-live drill before sign-off.",
      primaryLabel: "Open verification",
      primaryHref: "/verification?surface=verification",
      secondaryLabel: "Review go-live drill",
      secondaryHref: "/go-live?surface=go_live",
    };
  }
  return {
    title: "Workspace governance lane",
    description: "Owner and admin roles should confirm identity, workspace scope, and tenant first, then move into members, settings, and credential readiness.",
    primaryLabel: "Review members",
    primaryHref: "/members",
    secondaryLabel: "Open settings",
    secondaryHref: "/settings",
  };
}

function getContextRisks(args: {
  currentWorkspaceSlug: string;
  accessibleWorkspaceSlugs: string[];
  sourceWarning?: string | null;
  isFallback: boolean;
  localOnly: boolean;
}): ContextRisk[] {
  const risks: ContextRisk[] = [];
  if (!args.accessibleWorkspaceSlugs.includes(args.currentWorkspaceSlug)) {
    risks.push({
      label: "Workspace mismatch",
      detail:
        "The current workspace is not present in the reachable workspace list. Recheck the switcher and session source before continuing.",
      tone: "default",
    });
  }
  if (args.sourceWarning) {
    risks.push({
      label: "Context warning",
      detail: args.sourceWarning,
      tone: "default",
    });
  }
  if (args.localOnly) {
    risks.push({
      label: "Local-only context",
      detail:
        "This session context is local-only, so treat it as a manual preview checkpoint rather than a fully metadata-backed access proof.",
      tone: "default",
    });
  } else if (args.isFallback) {
    risks.push({
      label: "Fallback source",
      detail:
        "Workspace context is using a fallback source. Confirm identity and workspace carefully before creating credentials or attaching evidence.",
      tone: "default",
    });
  }
  if (risks.length === 0) {
    risks.push({
      label: "Context aligned",
      detail:
        "Identity, workspace reachability, and session source look consistent enough to continue into the next manual lane.",
      tone: "strong",
    });
  }
  return risks;
}

export function SessionAccessPanel({ workspaceContext, handoff }: SessionAccessPanelProps) {
  const sessionQuery = useQuery({
    queryKey: ["session-access"],
    queryFn: fetchSession,
  });

  const settingsAuditExportHref = buildConsoleHandoffHref("/settings?intent=upgrade", handoff);
  const settingsManagePlanHref = buildConsoleHandoffHref("/settings?intent=manage-plan", handoff);
  const verificationEvidenceHref = buildConsoleHandoffHref("/verification?surface=verification", handoff);
  const goLiveLaneHref = buildConsoleHandoffHref("/go-live?surface=go_live", handoff);

  const sessionUser = sessionQuery.data?.user ?? workspaceContext.session_user;
  const accessibleWorkspaces =
    sessionQuery.data?.workspaces?.length && sessionQuery.data.workspaces.length > 0
      ? sessionQuery.data.workspaces
      : workspaceContext.available_workspaces.map((workspace) => ({
          workspace_id: workspace.workspace_id,
          slug: workspace.slug,
          display_name: workspace.display_name,
          membership_role: summarizeRole(workspace.subject_roles),
        }));
  const currentRoleSummary = summarizeRole(workspaceContext.workspace.subject_roles);
  const lane = roleAwareLane(workspaceContext.workspace.subject_roles);
  const lanePrimaryHref = buildConsoleHandoffHref(lane.primaryHref, handoff);
  const laneSecondaryHref = buildConsoleHandoffHref(lane.secondaryHref, handoff);
  const accessibleWorkspaceSlugs = accessibleWorkspaces.map((workspace) => workspace.slug);
  const contextRisks = getContextRisks({
    currentWorkspaceSlug: workspaceContext.workspace.slug,
    accessibleWorkspaceSlugs,
    sourceWarning: workspaceContext.source_detail.warning,
    isFallback: workspaceContext.source_detail.is_fallback,
    localOnly: workspaceContext.source_detail.local_only,
  });
  const currentWorkspaceReachable = accessibleWorkspaceSlugs.includes(workspaceContext.workspace.slug);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card>
        <CardHeader>
          <CardTitle>Session identity</CardTitle>
          <CardDescription>
            This view shows the identity and workspace context currently active in the console.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-2 rounded-2xl border border-border bg-background p-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.15em] text-muted">Workspace context control</p>
              <p className="text-xs text-muted">
                Use workspace switching here on the session surface, then continue into onboarding, billing,
                verification, or go-live once the context looks correct.
              </p>
            </div>
            <WorkspaceSwitcher
              currentWorkspaceSlug={workspaceContext.workspace.slug}
              workspaces={workspaceContext.available_workspaces}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-muted">User</p>
              <p className="mt-1 font-medium text-foreground">
                {sessionUser?.email ?? workspaceContext.workspace.subject_id ?? "anonymous"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {sessionUser?.user_id ?? workspaceContext.workspace.subject_id ?? "local-user"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-muted">Auth provider</p>
              <p className="mt-1 font-medium text-foreground">
                {sessionUser?.auth_provider ?? "workspace_context"}
              </p>
              <p className="mt-1 text-xs text-muted">
                Subject: {sessionUser?.auth_subject ?? workspaceContext.workspace.subject_id ?? "n/a"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-muted">Current workspace</p>
              <p className="mt-1 font-medium text-foreground">{workspaceContext.workspace.display_name}</p>
              <p className="mt-1 text-xs text-muted">
                {workspaceContext.workspace.slug} · {workspaceContext.workspace.workspace_id}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-muted">Tenant</p>
              <p className="mt-1 font-medium text-foreground">{workspaceContext.workspace.tenant_id}</p>
              <p className="mt-1 text-xs text-muted">
                Roles: {summarizeRole(workspaceContext.workspace.subject_roles)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={workspaceContext.source_detail.is_fallback ? "default" : "strong"}>
                {workspaceContext.source_detail.label}
              </Badge>
              <Badge variant="subtle">Accessible workspaces: {accessibleWorkspaces.length}</Badge>
              <Badge variant="subtle">Role scope: {currentRoleSummary}</Badge>
            </div>
            <p className="mt-3 text-xs text-muted">
              {workspaceContext.source_detail.warning ??
                "Workspace context is coming from SaaS metadata. This is the closest view to the eventual production-safe session model."}
            </p>
            <p className="mt-2 text-xs text-muted">
              This page is only a visibility surface. It does not impersonate another user, change roles, or open support automation.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted">
            <p className="font-medium text-foreground">Manual context checklist</p>
            <p className="mt-1">
              1) confirm identity and role scope, 2) confirm the active workspace and tenant, 3) confirm the context
              source is the one you expect, then 4) continue into onboarding, billing, verification, or go-live.
            </p>
            <p className="mt-2">
              If any of those are wrong, switch workspaces first or stop here before creating credentials, changing
              settings, or attaching evidence to the wrong workspace.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted">
            <p className="font-medium text-foreground">Audit export continuity</p>
            <p className="mt-1">
              Trusted metadata sessions should reuse the same Latest export receipt from /settings (filename, filters,
              SHA-256) before moving into verification, artifacts, or the go-live lane so the downstream evidence chain
              stays tied to one manual thread.
            </p>
            <p className="mt-2">
              Navigation-only manual relay: these links keep the workspace context intact but do not auto-attach the audit
              export or resolve rollout steps for you.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={settingsAuditExportHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Reopen audit export receipt
              </Link>
              <Link
                href={verificationEvidenceHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Continue to verification evidence
              </Link>
              <Link
                href={goLiveLaneHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Reopen go-live lane
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted">
            <p className="font-medium text-foreground">{lane.title}</p>
            <p className="mt-1">{lane.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={lanePrimaryHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 font-medium text-foreground transition hover:bg-background"
              >
                {lane.primaryLabel}
              </Link>
              <Link
                href={laneSecondaryHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 font-medium text-foreground transition hover:bg-card"
              >
                {lane.secondaryLabel}
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted">
            <p className="font-medium text-foreground">Session safety signals</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant={currentWorkspaceReachable ? "strong" : "default"}>
                {currentWorkspaceReachable ? "Workspace reachable" : "Workspace mismatch"}
              </Badge>
              <Badge variant={workspaceContext.source_detail.is_fallback ? "default" : "subtle"}>
                {workspaceContext.source_detail.is_fallback ? "Fallback context" : "Metadata-backed context"}
              </Badge>
              {workspaceContext.source_detail.local_only ? <Badge variant="default">Local only</Badge> : null}
            </div>
            <div className="mt-3 space-y-2">
              {contextRisks.map((risk) => (
                <div key={risk.label} className="rounded-xl border border-border bg-card px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={risk.tone}>{risk.label}</Badge>
                  </div>
                  <p className="mt-2">{risk.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace access</CardTitle>
          <CardDescription>
            Review which workspaces the current session can reach, then use the topbar switcher to move between them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {sessionQuery.isLoading ? <p className="text-muted">Loading session access...</p> : null}
          {sessionQuery.isError ? (
            <p className="text-muted">
              Live session data is unavailable, so this panel is showing the current workspace-context fallback list.
            </p>
          ) : null}
          <div className="space-y-3">
            {accessibleWorkspaces.map((workspace) => {
              const isCurrent = workspace.slug === workspaceContext.workspace.slug;
              return (
                <div key={workspace.workspace_id} className="rounded-2xl border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{workspace.display_name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {workspace.slug} · {workspace.workspace_id}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isCurrent ? <Badge variant="strong">Current</Badge> : null}
                      <Badge variant="subtle">{workspace.membership_role}</Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted">
            <p className="font-medium text-foreground">How to use this</p>
            <p className="mt-1">
              Use this page to verify identity and workspace reach before onboarding, billing, verification, or
              go-live follow-up. Use the workspace switcher in the topbar for actual context changes.
            </p>
            <p className="mt-2">
              Changing the workspace remains manual. This page does not edit membership, elevate access, or impersonate
              a different user when you move between workspaces.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/onboarding"
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 font-medium text-foreground transition hover:bg-card"
              >
                Open onboarding
              </Link>
              <Link
                href="/members"
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 font-medium text-foreground transition hover:bg-card"
              >
                Review members
              </Link>
              <Link
                href="/settings"
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 font-medium text-foreground transition hover:bg-card"
              >
                Review settings
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Role-aware next lanes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          <p>
            Use this page to confirm the right user, tenant, workspace, and roles before heading into Onboarding,
            Billing, Verification, or the Go-live drill. That keeps those routes safe and traceable.
          </p>
          <p className="text-xs text-muted">
            The actions here are recommendations only. They help the operator pick the next manual lane, but they do
            not alter access or perform any support-side task.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={settingsManagePlanHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Billing and settings
            </Link>
            <Link
              href="/verification?surface=verification"
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Verification lane
            </Link>
            <Link
              href="/go-live?surface=go_live"
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Go-live lane
            </Link>
          </div>
          <p className="text-xs text-muted">
            All context changes remain manual here; nothing impersonates another role or runs support automation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
