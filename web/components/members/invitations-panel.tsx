"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildHandoffHref, type HandoffQueryArgs } from "@/lib/handoff-query";
import { ControlPlaneRequestError, fetchWorkspaceInvitations, revokeWorkspaceInvitation } from "@/services/control-plane";

function formatDate(value: string | null): string {
  if (!value) {
    return "n/a";
  }

  return new Date(value).toLocaleString();
}

function formatInvitationRevokeError(error: unknown): string {
  if (error instanceof ControlPlaneRequestError) {
    return `Invitation revoke failed: ${error.message ?? error.code ?? "unknown error"}`;
  }
  return "Invitation revoke failed. Check workspace permissions and retry.";
}

function describeInvitationLane(role: string): string {
  if (role === "viewer" || role === "auditor") {
    return "After acceptance, continue through verification and artifact review.";
  }
  if (role === "operator") {
    return "After acceptance, continue through Playground, Usage, and Verification.";
  }
  if (role === "approver") {
    return "After acceptance, continue through the Week 8 checklist and go-live drill.";
  }
  if (role === "workspace_admin" || role === "workspace_owner") {
    return "After acceptance, confirm session context and continue through Members, Settings, and credential readiness.";
  }
  return "After acceptance, confirm workspace context and continue through the assigned manual lane.";
}

export function InvitationsPanel({
  workspaceSlug,
  handoffArgs,
}: {
  workspaceSlug: string;
  handoffArgs?: HandoffQueryArgs;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["workspace-invitations", workspaceSlug],
    queryFn: fetchWorkspaceInvitations,
  });
  const [actionError, setActionError] = useState<string | null>(null);

  const revokeMutation = useMutation({
    onMutate: () => {
      setActionError(null);
    },
    mutationFn: revokeWorkspaceInvitation,
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["workspace-invitations", workspaceSlug] });
    },
    onError: (error: unknown) => {
      setActionError(formatInvitationRevokeError(error));
    },
  });

  const invitations = data ?? [];
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");
  const historicalInvitations = invitations.filter((invitation) => invitation.status !== "pending");
  const acceptedInvitations = invitations.filter((invitation) => invitation.status === "accepted");
  const expiredInvitations = invitations.filter((invitation) => invitation.status === "expired");
  const revokedInvitations = invitations.filter((invitation) => invitation.status === "revoked");

  function buildInvitationHref(pathname: string): string {
    if (!handoffArgs) {
      return pathname;
    }
    return buildHandoffHref(pathname, handoffArgs, { preserveExistingQuery: true });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitations</CardTitle>
        <CardDescription>Track pending, accepted, expired, and revoked invitation state.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted">
          <p className="font-medium text-foreground">Invitation lifecycle</p>
          <p className="mt-1">
            When you create an invitation, a one-time token appears for copying; it is not retrievable later, so paste it
            into the onboarding note before closing the form. Invited users redeem the token at <code>/accept-invitation</code>.
            Revoke removes the pending record so the token can no longer be used; already accepted memberships stay active and
            must be manually deactivated if access should stop.
          </p>
          <p className="mt-2">
            This panel tracks the self-serve handoff only. It does not confirm external delivery over email or messaging tools.
          </p>
          <p className="mt-2">
            Pending invitations also reserve member seats until they are redeemed, revoked, or expire, so seat pressure can block additional invites before a new member accepts.
          </p>
          <p className="mt-2">
            After the token is accepted, double-check workspace context and then follow the appropriate role lane (verification for viewers, playground for operators, go-live for approvers, etc.).
          </p>
          <p className="mt-2">
            Treat acceptance as a trusted-session checkpoint too: if the invitee lands in the wrong workspace or role,
            send them to <code>/session</code> before they touch onboarding, usage, verification, or go-live follow-up.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="strong">Pending {pendingInvitations.length}</Badge>
          <Badge variant="subtle">Accepted {acceptedInvitations.length}</Badge>
          <Badge variant="subtle">Expired {expiredInvitations.length}</Badge>
          <Badge variant="subtle">Revoked {revokedInvitations.length}</Badge>
        </div>
        {isLoading ? <p className="text-sm text-muted">Loading invitations...</p> : null}
        {isError ? <p className="text-sm text-muted">Invitation service unavailable.</p> : null}

        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.15em] text-muted">Pending</p>
          {!isLoading && pendingInvitations.length === 0 ? (
            <p className="text-sm text-muted">No pending invitations right now.</p>
          ) : null}

          {pendingInvitations.map((invitation) => (
            <div key={invitation.invitation_id} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{invitation.email}</p>
                  <p className="text-xs text-muted">Role: {invitation.role}</p>
                </div>
                <Badge variant="strong">{invitation.status}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted">Expires: {formatDate(invitation.expires_at)}</p>
              <p className="mt-1 text-xs text-muted">
                Invited by: {invitation.invited_by_display_name ?? invitation.invited_by_email ?? "workspace owner"}
              </p>
              <p className="mt-1 text-xs text-muted">Sent: {formatDate(invitation.created_at)}</p>
              <p className="mt-1 text-xs text-muted">
                Awaiting redemption via <code>/accept-invitation</code>.
              </p>
              <p className="mt-1 text-xs text-muted">{describeInvitationLane(invitation.role)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={buildInvitationHref("/accept-invitation")}
                  className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
                >
                  Open accept page
                </Link>
                <Link
                  href={buildInvitationHref("/session")}
                  className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
                >
                  Review session lane
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(invitation.invitation_id)}
                >
                  {revokeMutation.isPending ? "Revoking..." : "Revoke"}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-xs uppercase tracking-[0.15em] text-muted">Recent history</p>
          {!isLoading && historicalInvitations.length === 0 ? (
            <p className="text-sm text-muted">No accepted, expired, or revoked invitations yet.</p>
          ) : null}

          {historicalInvitations.map((invitation) => (
            <div key={invitation.invitation_id} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{invitation.email}</p>
                  <p className="text-xs text-muted">Role: {invitation.role}</p>
                </div>
                <Badge variant="subtle">{invitation.status}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted">Sent: {formatDate(invitation.created_at)}</p>
              <p className="mt-1 text-xs text-muted">Expires: {formatDate(invitation.expires_at)}</p>
              {invitation.accepted_at ? (
                <p className="mt-1 text-xs text-muted">Accepted: {formatDate(invitation.accepted_at)}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted">{describeInvitationLane(invitation.role)}</p>
              {invitation.status === "accepted" ? (
                <p className="mt-1 text-xs text-muted">
                  Acceptance only completes the membership handoff. The new member still needs to switch workspace
                  context and continue manually into the role lane that fits the assignment.
                </p>
              ) : null}
              {invitation.status === "revoked" ? (
                <p className="mt-1 text-xs text-muted">
                  The token can no longer be redeemed; create a fresh invitation if access is still needed.
                </p>
              ) : null}
            </div>
          ))}
        </div>

        {actionError ? (
          <p className="text-xs text-red-600">{actionError}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
