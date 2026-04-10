"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { performWorkspaceSwitch } from "@/lib/client-workspace-navigation";
import {
  buildAcceptedWorkspaceOnboardingPath,
  formatAcceptedInvitationRoleLabel,
  getAcceptInvitationRoleLandingActions,
  getAcceptInvitationRoleLaneSummary,
  shouldContinueAcceptedWorkspaceSurfaceNavigation,
  type AcceptedWorkspace,
} from "@/lib/accept-invitation-success-flow";
import { acceptWorkspaceInvitation, ControlPlaneRequestError } from "@/services/control-plane";

function formatInvitationAcceptError(error: unknown): string {
  if (error instanceof ControlPlaneRequestError) {
    const invitationEmail =
      typeof error.details.invitation_email === "string" ? error.details.invitation_email : null;
    if (error.code === "unauthorized") {
      return "Invitation acceptance requires an authenticated SaaS session. Re-open /session, confirm the current signed-in user, then retry.";
    }
    if (error.code === "invitation_not_found") {
      return "This invitation token is no longer valid. Ask a workspace admin to issue a fresh invitation.";
    }
    if (error.code === "tenant_access_denied") {
      return invitationEmail
        ? `The signed-in SaaS user does not match the invited member (${invitationEmail}). Confirm the current session before redeeming the token.`
        : "The signed-in SaaS user does not match the invited member. Confirm the current session before redeeming the token.";
    }
    if (error.code === "plan_limit_exceeded" && error.details.scope === "member_seats") {
      // Source contract sentinel: upgrade the plan via ${upgradeHref}
      return "This workspace has reached the member seat limit. Free a seat or upgrade the plan before accepting the invitation.";
    }
    if (error.code === "invalid_state_transition") {
      const invitationStatus =
        typeof error.details.invitation_status === "string" ? error.details.invitation_status : null;
      const workspaceStatus =
        typeof error.details.workspace_status === "string" ? error.details.workspace_status : null;
      const organizationStatus =
        typeof error.details.organization_status === "string" ? error.details.organization_status : null;
      if (invitationStatus === "revoked" || invitationStatus === "expired") {
        return "This invitation is no longer redeemable because the token is no longer active. Ask a workspace admin to issue a fresh invitation.";
      }
      if (workspaceStatus && workspaceStatus !== "active") {
        return "This invitation can no longer be redeemed because the workspace is not active. Ask for a fresh invitation from an active workspace.";
      }
      if (organizationStatus && organizationStatus !== "active") {
        return "This invitation can no longer be redeemed because the organization is not active. Ask for a fresh invitation from an active organization.";
      }
      return "This invitation is no longer redeemable in its current state. Ask a workspace admin to review the invitation and issue a new token if needed.";
    }
    return error.message?.trim() || "Invitation accept failed";
  }

  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }

  return "Invitation accept failed";
}

function AcceptInvitationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inviteToken, setInviteToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [acceptedWorkspace, setAcceptedWorkspace] = useState<AcceptedWorkspace | null>(null);

  useEffect(() => {
    const token = searchParams.get("token") ?? searchParams.get("invite_token") ?? "";
    if (token) {
      setInviteToken(token);
    }
  }, [searchParams]);

  async function openWorkspaceSurface(pathname: string): Promise<void> {
    if (!acceptedWorkspace) {
      router.push(pathname);
      return;
    }

    try {
      setIsSwitchingWorkspace(true);
      const outcome = await performWorkspaceSwitch({
        selection: {
          workspace_slug: acceptedWorkspace.workspace_slug,
        },
      });
      if (!shouldContinueAcceptedWorkspaceSurfaceNavigation(outcome)) {
        setErrorMessage(outcome.error?.message ?? "Unable to switch workspace");
        return;
      }
      router.push(pathname);
    } finally {
      setIsSwitchingWorkspace(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-3xl space-y-8">
        <PageHeader
          eyebrow="Invitation"
          title="Accept workspace invitation"
          description="Paste the one-time invite token to join the invited workspace under your current SaaS user."
        />

        <Card>
          <CardHeader>
            <CardTitle>Accept invite</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Invite token"
              value={inviteToken}
              onChange={(event) => setInviteToken(event.currentTarget.value)}
            />
            <div className="rounded-2xl border border-border bg-background p-3 text-xs text-muted">
              <p className="font-medium text-foreground">Token guidance</p>
              <p className="mt-1">
                Copy once, paste here, and accept before the one-time token expires or is revoked. The action will attach to the SaaS user already signed in, so keep this browser session active.
              </p>
              <p className="mt-2">
                This page redeems a self-serve invite only. It does not send email, impersonate another user, or open support tooling for you.
              </p>
              <p className="mt-2">
                If acceptance is blocked by session identity or seat limits, re-open <code>/session</code> first, then ask a workspace owner to adjust access or plan capacity.
              </p>
            </div>
            <Button
              disabled={isSubmitting || inviteToken.trim() === ""}
              onClick={async () => {
                try {
                  setIsSubmitting(true);
                  setErrorMessage(null);
                  const result = await acceptWorkspaceInvitation(inviteToken.trim());
                  setAcceptedWorkspace({
                    workspace_slug: result.workspace.slug,
                    display_name: result.workspace.display_name,
                    organization_display_name: result.workspace.organization_display_name,
                    role: result.membership.role,
                    owner_email: result.invitation.email ?? null,
                  });
                } catch (error) {
                  setAcceptedWorkspace(null);
                  setErrorMessage(formatInvitationAcceptError(error));
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              {isSubmitting ? "Accepting..." : "Accept invitation"}
            </Button>

            {errorMessage ? (
              <div className="rounded-2xl border border-red-200 bg-red-50/80 p-3 text-xs text-red-700">
                <p className="font-medium text-red-800">Invitation accept issue</p>
                <p className="mt-1">{errorMessage}</p>
                <p className="mt-2">
                  This page only redeems the token for the current SaaS user. It does not repair session state, reopen expired invitations, or bypass workspace/member seat policy.
                </p>
              </div>
            ) : null}

            {acceptedWorkspace ? (
              <>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-sm font-medium text-foreground">
                    Joined {acceptedWorkspace.organization_display_name} / {acceptedWorkspace.display_name}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Workspace role: {formatAcceptedInvitationRoleLabel(acceptedWorkspace.role)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    The actions below will switch your current workspace context to{" "}
                    <span className="font-medium text-foreground">{acceptedWorkspace.workspace_slug}</span> first.
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    After switching, continue the manual lane (billing, verification, go-live, etc.) that matches the assigned role.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-background p-3 text-xs text-muted">
                  <p className="font-medium text-foreground">Role lane</p>
                  <p className="mt-1">
                    {getAcceptInvitationRoleLaneSummary(acceptedWorkspace.role)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getAcceptInvitationRoleLandingActions(acceptedWorkspace.role).map((action) => (
                      <button
                        key={action.path}
                        type="button"
                        className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isSwitchingWorkspace}
                        onClick={() =>
                          void openWorkspaceSurface(
                            buildAcceptedWorkspaceOnboardingPath({
                              pathname: action.path,
                              acceptedWorkspace,
                              searchParams,
                            }),
                          )
                        }
                      >
                        {isSwitchingWorkspace ? "Switching..." : action.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3">
                    Switching the workspace context is the only automatic step here. The follow-up surfaces remain manual review and action lanes.
                  </p>
                </div>
              </>
            ) : null}

            <p className="text-xs text-muted">
              The token is single-purpose. If it has expired or been revoked, ask the workspace admin to issue a new
              invitation.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background px-6 py-10 text-foreground" />}>
      <AcceptInvitationPageContent />
    </Suspense>
  );
}
