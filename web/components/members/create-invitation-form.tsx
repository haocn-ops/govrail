"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildHandoffHref, type HandoffQueryArgs } from "@/lib/handoff-query";
import { ControlPlaneRequestError, createWorkspaceInvitation } from "@/services/control-plane";

const invitationRoleOptions = [
  {
    value: "viewer",
    label: "Viewer",
    description: "Best for audit reviewers and people who only need read access to evidence and usage posture.",
  },
  {
    value: "operator",
    label: "Operator",
    description: "Best for the person running the first demo flow and keeping verification notes current.",
  },
  {
    value: "approver",
    label: "Approver",
    description: "Best for legal or policy sign-off before the mock go-live drill is treated as ready.",
  },
  {
    value: "workspace_admin",
    label: "Workspace admin",
    description: "Best for the teammate coordinating members, settings, and credential readiness.",
  },
];

function getRoleNextLane(role: string): { label: string; href: string } {
  if (role === "viewer") {
    return { label: "Open verification lane", href: "/verification?surface=verification" };
  }
  if (role === "operator") {
    return { label: "Open playground lane", href: "/playground" };
  }
  if (role === "approver") {
    return { label: "Open go-live lane", href: "/go-live?surface=go_live" };
  }
  return { label: "Open workspace settings", href: "/settings" };
}

function describeRoleLane(role: string): string {
  if (role === "viewer") {
    return "Viewer lanes usually start in Verification and Artifacts so evidence can be reviewed before any broader change is requested.";
  }
  if (role === "operator") {
    return "Operator lanes usually continue through Playground, Usage, and then Verification to keep the first governed run traceable.";
  }
  if (role === "approver") {
    return "Approver lanes usually review the Week 8 checklist and mock go-live drill before sign-off.";
  }
  return "Workspace-admin lanes usually confirm session context, members, settings, and credential readiness before broader rollout work.";
}

function describeInvitationCreateError(error: unknown): string {
  if (error instanceof ControlPlaneRequestError) {
    const upgradeHref =
      typeof error.details.upgrade_href === "string" ? error.details.upgrade_href : "/settings?intent=upgrade";
    if (error.code === "invitation_limit_reached") {
      return `Invitation seat limit reached. Pending invitations reserve seats too, so disable an existing invite, remove inactive access, or upgrade the plan via ${upgradeHref}.`;
    }
    if (error.code === "invalid_state_transition") {
      return "Invitations are unavailable until the workspace and organization return to an active state.";
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Invitation creation failed. Check email, role, and workspace access.";
}

export function CreateInvitationForm({
  workspaceSlug,
  handoffArgs,
}: {
  workspaceSlug: string;
  handoffArgs?: HandoffQueryArgs;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [expiresAt, setExpiresAt] = useState("");
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [revealedRole, setRevealedRole] = useState<string>("viewer");
  const [formError, setFormError] = useState<string | null>(null);

  function buildInviteLaneHref(pathname: string): string {
    if (!handoffArgs) {
      return pathname;
    }
    return buildHandoffHref(pathname, handoffArgs, { preserveExistingQuery: true });
  }

  const mutation = useMutation({
    mutationFn: async () =>
      createWorkspaceInvitation({
        email: email.trim(),
        role: role.trim() || "viewer",
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      }),
    onSuccess: async (result) => {
      setRevealedToken(result.invite_token);
      setRevealedRole(role.trim() || "viewer");
      setEmail("");
      setRole("viewer");
      setExpiresAt("");
      setFormError(null);
      await queryClient.invalidateQueries({
        queryKey: ["workspace-invitations", workspaceSlug],
      });
    },
    onError: (error: unknown) => {
      setFormError(describeInvitationCreateError(error));
    },
  });

  return (
    <div className="space-y-4">
      <Input
        type="email"
        placeholder="Member email"
        value={email}
        onChange={(event) => setEmail(event.currentTarget.value)}
      />
      <label className="space-y-2 text-xs text-muted">
        <span className="block font-medium text-foreground">Workspace role</span>
        <select
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
          value={role}
          onChange={(event) => setRole(event.currentTarget.value)}
        >
          {invitationRoleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted">
        Selected lane:{" "}
        <span className="font-medium text-foreground">
          {invitationRoleOptions.find((option) => option.value === role)?.label ?? role}
        </span>
      </p>
      <Input
        type="datetime-local"
        value={expiresAt}
        onChange={(event) => setExpiresAt(event.currentTarget.value)}
      />
      <Button disabled={mutation.isPending || email.trim() === ""} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Creating invitation..." : "Create invitation"}
      </Button>
      <div className="rounded-2xl border border-border bg-background p-3 text-xs text-muted">
        <p className="font-medium text-foreground">Role guidance</p>
        <ul className="mt-2 space-y-2">
          {invitationRoleOptions.map((option) => (
            <li key={option.value}>
              <span className="font-medium text-foreground">{option.label}</span>: {option.description}
            </li>
          ))}
        </ul>
        <p className="mt-3">
          This flow is self-serve. A one-time token is revealed in the browser and you share it through your existing channel; the product does not send email for you in this slice.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-background p-3 text-xs text-muted">
        <p className="font-medium text-foreground">Manual invite checklist</p>
        <p className="mt-1">
          Copy the token, send it manually, remind the recipient to redeem it at <code>/accept-invitation</code>, then confirm the workspace switch and follow the role lane you just assigned.
        </p>
        <p className="mt-1">
          This keeps the entire onboarding path traceable without relying on email automation or support tooling.
        </p>
        <p className="mt-1">
          The recipient should redeem from a trusted SaaS session that matches the invited identity, then re-open <code>/session</code> before continuing into onboarding, usage, verification, or go-live follow-up.
        </p>
        <p className="mt-1">
          Pending invitations count against the workspace seat reservation until they are accepted, revoked, or expired.
        </p>
        <p className="mt-1">
          Current role lane: <span className="font-medium text-foreground">{describeRoleLane(role)}</span>
        </p>
      </div>
      {formError ? <p className="text-xs text-muted">{formError}</p> : null}
      {revealedToken ? (
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-xs uppercase tracking-[0.15em] text-muted">One-time invite token</p>
          <p className="mt-2 break-all font-mono text-sm text-foreground">{revealedToken}</p>
          <p className="mt-2 text-xs text-muted">
            This token is shown only once. Share it over your existing channel, and remind the recipient to redeem it via <code>/accept-invitation</code> before it expires.
          </p>
          <p className="mt-2 text-xs text-muted">
            The token is the handoff artifact for this self-serve flow. If the invite is revoked or expires, generate a new one instead of trying to recover the old value.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={buildInviteLaneHref("/accept-invitation")}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Open accept-invitation
            </Link>
            <Link
              href={buildInviteLaneHref("/session")}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Confirm session context
            </Link>
            <Link
              href={buildInviteLaneHref(getRoleNextLane(revealedRole).href)}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              {getRoleNextLane(revealedRole).label}
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted">
            After the recipient accepts and switches into the workspace, continue manually into the role lane above.
          </p>
          <p className="mt-1 text-xs text-muted">
            If the recipient reports the wrong workspace or role after acceptance, have them verify the active context on <code>/session</code> before doing any onboarding, billing, verification, or go-live follow-up.
          </p>
        </div>
      ) : null}
    </div>
  );
}
