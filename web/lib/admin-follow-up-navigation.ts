import type {
  ControlPlaneAdminAttentionWorkspace,
  ControlPlaneAdminWeek8ReadinessFocus,
  ControlPlaneAdminWeek8ReadinessWorkspace,
} from "@/lib/control-plane-types";

export function adminAttentionActionLabel(surface?: string | null): string {
  return surface === "go_live" ? "Open go-live drill" : "Open verification checklist";
}

export function buildAdminReadinessNavigationTarget(
  workspace: Pick<
    ControlPlaneAdminWeek8ReadinessWorkspace,
    "slug" | "next_action_surface" | "latest_demo_run_id" | "organization_id"
  >,
  options?: {
    readinessFocus?: ControlPlaneAdminWeek8ReadinessFocus | null;
    attentionOrganizationId?: string | null;
  },
): {
  workspaceSlug: string;
  pathname: string;
  searchParams: Record<string, string | null>;
} {
  const targetSurface = workspace.next_action_surface;

  return {
    workspaceSlug: workspace.slug,
    pathname:
      targetSurface === "go_live"
        ? "/go-live"
        : targetSurface === "verification"
          ? "/verification"
          : targetSurface === "settings"
            ? "/settings"
            : "/onboarding",
    searchParams: {
      source: "admin-readiness",
      surface: targetSurface === "go_live" || targetSurface === "verification" ? targetSurface : null,
      run_id: workspace.latest_demo_run_id ?? null,
      week8_focus: options?.readinessFocus ?? null,
      attention_workspace: workspace.slug,
      attention_organization: workspace.organization_id || options?.attentionOrganizationId || null,
    },
  };
}

export function buildAdminAttentionNavigationTarget(
  workspace: Pick<ControlPlaneAdminAttentionWorkspace, "slug" | "next_action_surface" | "latest_demo_run_id">,
  options?: {
    attentionOrganizationId?: string | null;
    deliveryContext?: "recent_activity" | null;
    recentTrackKey?: "verification" | "go_live" | null;
    recentUpdateKind?: string | null;
    evidenceCount?: number | null;
    recentOwnerLabel?: string | null;
    recentOwnerDisplayName?: string | null;
    recentOwnerEmail?: string | null;
  },
): {
  workspaceSlug: string;
  pathname: string;
  searchParams: Record<string, string | null>;
} {
  const targetSurface = workspace.next_action_surface ?? "verification";

  return {
    workspaceSlug: workspace.slug,
    pathname: targetSurface === "go_live" ? "/go-live" : "/verification",
    searchParams: {
      source: "admin-attention",
      surface: targetSurface,
      run_id: workspace.latest_demo_run_id ?? null,
      attention_workspace: workspace.slug,
      attention_organization: options?.attentionOrganizationId ?? null,
      delivery_context: options?.deliveryContext ?? null,
      recent_track_key: options?.recentTrackKey ?? null,
      recent_update_kind: options?.recentUpdateKind ?? null,
      evidence_count:
        typeof options?.evidenceCount === "number" ? String(options.evidenceCount) : null,
      recent_owner_label: options?.recentOwnerLabel ?? null,
      recent_owner_display_name: options?.recentOwnerDisplayName ?? null,
      recent_owner_email: options?.recentOwnerEmail ?? null,
    },
  };
}
