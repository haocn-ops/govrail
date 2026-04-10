import type { WorkspaceSwitchOutcome } from "@/lib/client-workspace-navigation";
import { buildWorkspaceNavigationHref } from "@/lib/client-workspace-navigation";

export type AcceptedWorkspace = {
  workspace_slug: string;
  display_name: string;
  organization_display_name: string;
  role: string;
  owner_email: string | null;
};

export type WorkspaceLandingAction = {
  label: string;
  path: string;
};

export function formatAcceptedInvitationRoleLabel(role: string): string {
  return role.replaceAll("_", " ");
}

export function getAcceptInvitationRoleLaneSummary(role: string): string {
  if (role === "viewer" || role === "auditor") {
    return "This role is usually focused on reading verification evidence, artifacts, and billing posture without changing workspace configuration.";
  }
  if (role === "operator") {
    return "This role is usually focused on running the first demo flow, checking usage pressure, and keeping verification evidence current.";
  }
  if (role === "approver") {
    return "This role is usually focused on reviewing the Week 8 checklist and the mock go-live drill before sign-off.";
  }
  if (role === "workspace_admin" || role === "workspace_owner") {
    return "This role is usually focused on access, settings, credential readiness, and the overall first-run lane for the workspace.";
  }
  return "Use the recommended surfaces below to complete the first follow-up for this workspace.";
}

export function getAcceptInvitationRoleLandingActions(role: string): WorkspaceLandingAction[] {
  if (role === "viewer" || role === "auditor") {
    return [
      { label: "Open verification", path: "/verification?surface=verification" },
      { label: "Review usage", path: "/usage" },
      { label: "Inspect artifacts", path: "/artifacts" },
    ];
  }
  if (role === "operator") {
    return [
      { label: "Run a demo", path: "/playground" },
      { label: "Check usage", path: "/usage" },
      { label: "Capture verification", path: "/verification?surface=verification" },
    ];
  }
  if (role === "approver") {
    return [
      { label: "Open Week 8 checklist", path: "/verification?surface=verification" },
      { label: "Review go-live drill", path: "/go-live?surface=go_live" },
      { label: "Review usage", path: "/usage" },
    ];
  }
  if (role === "workspace_admin" || role === "workspace_owner") {
    return [
      { label: "Confirm members", path: "/members" },
      { label: "Review settings", path: "/settings" },
      { label: "Check service accounts", path: "/service-accounts" },
    ];
  }
  return [
    { label: "Open members", path: "/members" },
    { label: "Run a demo", path: "/playground" },
    { label: "Open verification", path: "/verification?surface=verification" },
  ];
}

export function buildAcceptedWorkspaceOnboardingPath(args: {
  pathname: string;
  acceptedWorkspace: AcceptedWorkspace | null;
  searchParams: Pick<URLSearchParams, "get">;
}): string {
  if (!args.acceptedWorkspace) {
    return args.pathname;
  }

  const continuityKeys = [
    "run_id",
    "week8_focus",
    "attention_organization",
    "delivery_context",
    "recent_track_key",
    "recent_update_kind",
    "evidence_count",
    "recent_owner_label",
    "recent_owner_display_name",
    "recent_owner_email",
  ];
  const continuitySearchParams = Object.fromEntries(
    continuityKeys.map((key) => [key, args.searchParams.get(key)]),
  ) satisfies Record<string, string | null>;

  return buildWorkspaceNavigationHref(
    args.pathname,
    {
      ...continuitySearchParams,
      source: "onboarding",
      attention_workspace: args.acceptedWorkspace.workspace_slug,
      delivery_context: "recent_activity",
      recent_owner_label: args.acceptedWorkspace.display_name,
      recent_owner_display_name: args.acceptedWorkspace.display_name,
      recent_owner_email: args.acceptedWorkspace.owner_email,
    },
    { preferExistingQuery: true },
  );
}

export function shouldContinueAcceptedWorkspaceSurfaceNavigation(
  outcome: Pick<WorkspaceSwitchOutcome, "status">,
): boolean {
  return outcome.status !== "failed";
}
