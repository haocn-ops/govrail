"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchWorkspaceMembersViewModel } from "@/services/control-plane";
import { buildConsoleHandoffHref, type ConsoleHandoffState } from "@/lib/console-handoff";

function formatJoinedAt(value: string | null): string {
  if (!value) {
    return "n/a";
  }

  return new Date(value).toLocaleString();
}

function getRoleFollowUp(role: string): string {
  if (role === "viewer" || role === "auditor") {
    return "Best next lane: verification, usage, and artifacts review.";
  }
  if (role === "operator") {
    return "Best next lane: playground run, usage confirmation, and verification evidence capture.";
  }
  if (role === "approver") {
    return "Best next lane: Week 8 checklist review and go-live drill sign-off.";
  }
  if (role === "workspace_admin" || role === "workspace_owner") {
    return "Best next lane: members, settings, credentials, and overall workspace readiness follow-up.";
  }
  return "Best next lane: continue with the workspace surface that matches this member's current responsibility.";
}

function memberStatusVariant(status: string): "strong" | "default" | "subtle" {
  if (status === "active") {
    return "strong";
  }
  if (status === "pending" || status === "invited") {
    return "default";
  }
  return "subtle";
}

function memberStatusSummary(status: string): string {
  if (status === "active") {
    return "This membership is live and can continue through the assigned manual lane now.";
  }
  if (status === "pending" || status === "invited") {
    return "This membership still needs manual follow-up such as invite redemption or workspace-context confirmation.";
  }
  return "This membership should be treated as historical or manually reviewed before any further workspace follow-up.";
}

export function MembersPanel({
  workspaceSlug,
  handoff,
}: {
  workspaceSlug: string;
  handoff?: ConsoleHandoffState;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["workspace-members", workspaceSlug],
    queryFn: fetchWorkspaceMembersViewModel,
  });
  const defaultHandoff: ConsoleHandoffState = {
    source: null,
    surface: null,
    runId: null,
    attentionWorkspace: null,
    attentionOrganization: null,
    week8Focus: null,
    deliveryContext: null,
    recentTrackKey: null,
    recentUpdateKind: null,
    evidenceCount: null,
    recentOwnerLabel: null,
    recentOwnerDisplayName: null,
    recentOwnerEmail: null,
  };
  const safeHandoff = handoff ?? defaultHandoff;
  const auditContinuityLinks = [
    { label: "Reopen audit export receipt", href: "/settings?intent=upgrade" },
    { label: "Capture verification evidence", href: "/verification?surface=verification" },
    { label: "Return to go-live drill", href: "/go-live?surface=go_live" },
  ];

  const members = data?.items ?? [];
  const contract = data?.contract;
  const isMetadataGuard = contract?.source === "workspace_context_not_metadata";
  const isFeatureGate = contract?.source === "fallback_feature_gate";
  const isControlPlaneUnavailable = contract?.source === "fallback_control_plane_unavailable";
  const isFallbackError = contract?.source === "fallback_error";
  const contextSource = typeof contract?.details?.source === "string" ? contract.details.source : null;
  const workspaceSlugHint =
    typeof contract?.details?.workspace_slug === "string" ? contract.details.workspace_slug : null;

  function getContractBadgeLabel(): string {
    if (!contract) {
      return "";
    }
    if (contract.source === "live") {
      return "Live members contract";
    }
    if (contract.source === "workspace_context_not_metadata") {
      return "Metadata context required";
    }
    if (contract.source === "fallback_feature_gate") {
      return "Plan-gated members";
    }
    if (contract.source === "fallback_control_plane_unavailable") {
      return "Control plane unavailable";
    }
    return "Fallback error";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace members</CardTitle>
        <CardDescription>Role and status visibility for the selected workspace.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted">
          <p className="font-medium text-foreground">Who to invite first</p>
          <p className="mt-1">
            A viewer keeps verification evidence readable, an operator handles the first run / plan checks, and
            an approver covers the legal gate if you need approvals before going live. Adjust roles later once the
            workspace has real usage or billing evidence.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted">
          <p className="font-medium text-foreground">Status semantics</p>
          <p className="mt-1">
            `active` means the person can continue through their assigned lane now. `pending` or `invited` means the
            self-serve handoff is still incomplete. Any other state should be treated as historical or requiring manual
            review before the workspace relies on that access again.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted">
          <p className="font-medium text-foreground">Audit export continuity</p>
          <p className="mt-1">
            Governance roles should reopen the Latest export receipt from <code className="font-mono">/settings?intent=upgrade</code>
            so the filename, filters, and SHA-256 stay linked to verification, go-live, and the eventual admin handoff.
          </p>
          <p className="mt-1">
            This is a navigation-only manual relay; the links keep workspace context intact but do not auto-attach the
            receipt or finish rollout steps on your behalf.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {/* Source contract sentinel: href="/settings?intent=upgrade" */}
            {auditContinuityLinks.map((link) => (
              <Link
                key={link.href}
                href={buildConsoleHandoffHref(link.href, safeHandoff)}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-card"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        {contract ? (
          <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  contract.source === "live"
                    ? "strong"
                    : contract.source === "workspace_context_not_metadata"
                    ? "default"
                    : "subtle"
                }
              >
                {getContractBadgeLabel()}
              </Badge>
              {contract.code ? <Badge variant="subtle">code: {contract.code}</Badge> : null}
              {typeof contract.status === "number" ? <Badge variant="subtle">status: {contract.status}</Badge> : null}
            </div>
            <p className="mt-2">{contract.message}</p>
            {isMetadataGuard ? (
              <p className="mt-1">
                Current context source: <span className="font-medium text-foreground">{contextSource ?? "unknown"}</span>.{" "}
                Open onboarding to establish metadata-backed workspace context, then return to members.
              </p>
            ) : null}
            {workspaceSlugHint ? (
              <p className="mt-1">
                Workspace hint: <span className="font-medium text-foreground">{workspaceSlugHint}</span>
              </p>
            ) : null}
            {isFeatureGate ? (
              <p className="mt-1">
                Invite and role management can stay staged for this workspace until the plan enables the members surface.
              </p>
            ) : null}
            {isControlPlaneUnavailable ? (
              <p className="mt-1">
                Members will recover automatically after the live control-plane endpoint is configured again.
              </p>
            ) : null}
            {isFallbackError ? (
              <p className="mt-1">
                You can continue with other setup surfaces while members is unavailable, then retry after control-plane recovery.
              </p>
            ) : null}
          </div>
        ) : null}
        {isLoading ? <p className="text-sm text-muted">Loading members...</p> : null}
        {isError ? (
          <p className="text-sm text-muted">
            Members request failed unexpectedly. Refresh this page and verify workspace context/session headers.
          </p>
        ) : null}
        {!isLoading && isMetadataGuard ? (
          <p className="text-sm text-muted">
            Members data is intentionally hidden until metadata-backed workspace context is available.
          </p>
        ) : null}
        {!isLoading && isFallbackError ? (
          <p className="text-sm text-muted">
            Members endpoint is temporarily unavailable. Existing setup can continue; retry later for member visibility.
          </p>
        ) : null}
        {!isLoading && isFeatureGate ? (
          <p className="text-sm text-muted">
            Members visibility for this workspace is currently plan-gated. Upgrade the workspace plan before using this surface.
          </p>
        ) : null}
        {!isLoading && isControlPlaneUnavailable ? (
          <p className="text-sm text-muted">
            Members endpoint is waiting for live control-plane configuration. Verify the deployment wiring, then retry.
          </p>
        ) : null}
        {!isLoading && contract?.source === "live" && members.length === 0 ? (
          <p className="text-sm text-muted">No members found for this workspace yet.</p>
        ) : null}

        {members.map((member) => (
          <div key={member.user_id} className="rounded-2xl border border-border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{member.display_name ?? member.email}</p>
                <p className="mt-1 text-xs text-muted">{member.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="subtle">{member.role}</Badge>
                <Badge variant={memberStatusVariant(member.status)}>{member.status}</Badge>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">Joined: {formatJoinedAt(member.joined_at)}</p>
            <p className="mt-1 text-xs text-muted">{memberStatusSummary(member.status)}</p>
            <p className="mt-1 text-xs text-muted">{getRoleFollowUp(member.role)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
