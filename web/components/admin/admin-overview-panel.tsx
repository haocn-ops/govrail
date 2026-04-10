"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { AdminFocusBar } from "@/components/admin/admin-focus-bar";
import { AdminReadinessReturnBanner } from "@/components/admin/admin-readiness-return-banner";
import {
  AdminWeek8ReadinessCard,
  type AdminWeek8ReadinessMetric,
} from "@/components/admin/admin-week8-readiness-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildWorkspaceNavigationHref,
  performWorkspaceSwitch,
} from "@/lib/client-workspace-navigation";
import { buildAdminOverviewPreviewData } from "@/lib/admin-overview-preview";
import {
  adminAttentionActionLabel,
  buildAdminAttentionNavigationTarget,
  buildAdminReadinessNavigationTarget,
} from "@/lib/admin-follow-up-navigation";
import type {
  ControlPlaneAdminAttentionWorkspace,
  ControlPlaneAdminDeliveryWorkspace,
  ControlPlaneAdminDeliveryUpdateKind,
  ControlPlaneContractMeta,
  ControlPlaneAdminWeek8ReadinessFocus,
  ControlPlaneAdminWeek8ReadinessWorkspace,
  ControlPlaneDeliveryGovernance,
  ControlPlaneDeliveryTrackStatus,
} from "@/lib/control-plane-types";
import { buildHandoffHref } from "@/lib/handoff-query";
import { fetchAdminOverview } from "@/services/control-plane";

type SurfaceFilter = "all" | "verification" | "go_live";
type AdminNavigationSurface = "onboarding" | "settings" | "verification" | "go_live";

type SurfaceActionInfo = {
  buttonLabel: string;
  detail: string;
};

const surfaceActionInfo: Record<AdminNavigationSurface, SurfaceActionInfo> = {
  onboarding: {
    buttonLabel: "Finish onboarding",
    detail: "Complete the baseline, service account, and key setup so that verification can continue with a seeded workspace context.",
  },
  settings: {
    buttonLabel: "Review billing posture",
    detail: "Confirm the billing summary, feature gating, and audit export readiness before widening scope.",
  },
  verification: {
    buttonLabel: "Open Week 8 checklist",
    detail: "Walk through the verification flow so usage, evidence, and mock go-live triggers stay aligned.",
  },
  go_live: {
    buttonLabel: "Open mock go-live drill",
    detail: "Run the mock go-live rehearsal to rehearse blox with real workspace context and capture the handoff notes.",
  },
};

function summarizeDeliveryStatus(workspace: ControlPlaneAdminAttentionWorkspace): string {
  if (workspace.verification_status === "complete" && workspace.go_live_status !== "complete") {
    return "Verification is complete; next focus remains on go-live follow-up.";
  }
  if (workspace.verification_status === "in_progress") {
    return "Verification is still in progress; capture the remaining evidence before advancing.";
  }
  if (workspace.go_live_status === "in_progress") {
    return "Go-live prep is underway; keep the mock drill evidence linked to this workspace.";
  }
  if (workspace.verification_status === "pending" && workspace.go_live_status === "pending") {
    return "Verification hasn’t started; ensure the baseline/demonstration flow finishes before the go-live drill.";
  }
  return "Delivery status is tracked; confirm the linked surface once next_action_surface resolves.";
}

function summarizeReadinessStatus(workspace: ControlPlaneAdminWeek8ReadinessWorkspace): string {
  if (!workspace.baseline_ready) {
    return "Baseline setup is still incomplete; finish the onboarding controls before moving deeper into Week 8.";
  }
  if (!workspace.credentials_ready) {
    return "Baseline is in place, but service accounts and API keys still need to be provisioned.";
  }
  if (!workspace.demo_run_succeeded) {
    return "Credentials are ready; complete the workspace demo run before the verification handoff.";
  }
  if (workspace.billing_warning) {
    return "Operational readiness is close, but billing posture still needs review before the mock go-live drill.";
  }
  if (workspace.mock_go_live_ready) {
    return "Week 8 readiness is in place; the next review step is usually the mock go-live drill.";
  }
  return "Week 8 readiness is tracked for this workspace; confirm the next handoff surface before proceeding.";
}

function deliveryTrackLabel(trackKey?: "verification" | "go_live" | null): string {
  return trackKey === "go_live" ? "go-live" : "verification";
}

function describeRecentUpdateKind(
  kind?: ControlPlaneAdminDeliveryUpdateKind | null,
  trackKey?: "verification" | "go_live" | null,
): string {
  if (kind === "verification_completed") {
    return "Verification was marked complete in the latest update.";
  }
  if (kind === "go_live_completed") {
    return "The mock go-live drill was marked complete in the latest update.";
  }
  if (kind === "evidence_only") {
    return `Evidence was attached on the ${deliveryTrackLabel(trackKey)} track.`;
  }
  if (kind === "go_live") {
    return "Go-live drill tracking was refreshed in this workspace.";
  }
  if (kind === "verification") {
    return "Verification tracking was refreshed in this workspace.";
  }
  return "Delivery update recorded for this workspace.";
}

function formatOwnerLabel(displayName?: string | null, email?: string | null): string | null {
  if (displayName) {
    return displayName;
  }
  if (email) {
    return email;
  }
  return null;
}

function adminContractBadgeVariant(
  source?: ControlPlaneContractMeta["source"] | null,
): "strong" | "default" | "subtle" {
  if (source === "live") {
    return "strong";
  }
  if (source === "fallback_control_plane_unavailable" || source === "fallback_error") {
    return "default";
  }
  return "subtle";
}

type AdminContractIssue = ControlPlaneContractMeta["issue"];

function adminFallbackStatusLabel(issue?: AdminContractIssue | null): string | null {
  if (issue?.status === 404) {
    return "route unavailable";
  }
  if (issue?.status === 503) {
    return "control plane unavailable";
  }
  return null;
}

function adminContractLabel(
  source?: ControlPlaneContractMeta["source"] | null,
  issue?: AdminContractIssue | null,
): string {
  if (source === "live") {
    return "Live admin contract";
  }
  if (source === "fallback_feature_gate") {
    return "Fallback: feature gate";
  }
  if (source === "fallback_control_plane_unavailable") {
    return adminFallbackStatusLabel(issue) === "control plane unavailable"
      ? "Fallback: control plane unavailable"
      : "Fallback: preview data";
  }
  if (source === "fallback_error") {
    const fallbackStatusLabel = adminFallbackStatusLabel(issue);
    if (fallbackStatusLabel) {
      return `Fallback: ${fallbackStatusLabel}`;
    }
    return "Fallback: preview data";
  }
  return "Contract source unknown";
}

function adminContractDescription(
  source?: ControlPlaneContractMeta["source"] | null,
  issue?: AdminContractIssue | null,
): string {
  if (source === "live") {
    return "Platform snapshot is loaded from live admin control-plane data.";
  }
  if (source === "fallback_feature_gate") {
    return issue?.status === 409
      ? "Admin snapshot is plan-gated, so the live summary stays hidden until the workspace entitlement changes."
      : "Admin snapshot is currently feature-gated and cannot show the full live summary.";
  }
  if (source === "fallback_control_plane_unavailable") {
    return issue?.status === 503
      ? "Admin snapshot is using preview fallback data because the control plane returned 503."
      : "Admin snapshot is using preview fallback data because the control plane is unavailable.";
  }
  if (source === "fallback_error") {
    if (issue?.status === 404) {
      return "Admin snapshot is using preview fallback data because the live overview route returned 404.";
    }
    if (issue?.status === 503) {
      return "Admin snapshot is using preview fallback data because the live overview route returned 503.";
    }
    return "Admin snapshot is using preview fallback data and should not be treated as live workspace readiness.";
  }
  return "Admin snapshot contract source is unavailable.";
}

function evidenceBadgeVariant(evidenceCount?: number): "strong" | "default" | "subtle" {
  if (evidenceCount == null) {
    return "subtle";
  }
  if (evidenceCount > 0) {
    return "strong";
  }
  return "default";
}

function summarizeNotes(notes?: string, maxLength = 120): string | null {
  if (!notes) {
    return null;
  }
  const trimmed = notes.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function rolloutVariant(enabledCount: number, totalCount: number): "strong" | "default" | "subtle" {
  if (enabledCount === 0) {
    return "subtle";
  }
  if (enabledCount === totalCount && totalCount > 0) {
    return "strong";
  }
  return "default";
}

function surfaceLabel(surface: SurfaceFilter): string {
  if (surface === "go_live") {
    return "Go-live";
  }
  if (surface === "verification") {
    return "Verification";
  }
  return "All";
}

function readinessFocusLabel(focus: ControlPlaneAdminWeek8ReadinessFocus): string {
  if (focus === "baseline") {
    return "Baseline gaps";
  }
  if (focus === "credentials") {
    return "Credentials";
  }
  if (focus === "demo_run") {
    return "Demo run";
  }
  if (focus === "billing_warning") {
    return "Billing warning";
  }
  return "Go-live ready";
}

function buildAdminHref({
  surface,
  readinessFocus,
  organizationId,
  workspaceSlug,
  queueReturned,
  readinessReturned,
}: {
  surface?: SurfaceFilter;
  readinessFocus?: ControlPlaneAdminWeek8ReadinessFocus | null;
  organizationId?: string | null;
  workspaceSlug?: string | null;
  queueReturned?: boolean;
  readinessReturned?: boolean;
}): string {
  const searchParams = new URLSearchParams();
  if (surface && surface !== "all") {
    searchParams.set("queue_surface", surface);
  }
  if (readinessFocus) {
    searchParams.set("week8_focus", readinessFocus);
  }
  if (workspaceSlug) {
    searchParams.set("attention_workspace", workspaceSlug);
  }
  if (organizationId) {
    searchParams.set("attention_organization", organizationId);
  }
  if (queueReturned) {
    searchParams.set("queue_returned", "1");
  }
  if (readinessReturned) {
    searchParams.set("readiness_returned", "1");
  }
  const query = searchParams.toString();
  return query ? `/admin?${query}` : "/admin";
}

function buildSurfaceFollowUpHref({
  pathname,
  runId,
  readinessFocus,
  workspaceSlug,
  organizationId,
}: {
  pathname: string;
  runId?: string | null;
  readinessFocus?: ControlPlaneAdminWeek8ReadinessFocus | null;
  workspaceSlug?: string | null;
  organizationId?: string | null;
}): string {
  return buildHandoffHref(
    pathname,
    {
      source: "admin-readiness",
      runId,
      week8Focus: readinessFocus,
      attentionWorkspace: workspaceSlug,
      attentionOrganization: organizationId,
    },
    { preserveExistingQuery: true },
  );
}

function readinessFollowUpAction(
  readinessFocus: ControlPlaneAdminWeek8ReadinessFocus | null,
  runId?: string | null,
  attentionWorkspaceSlug?: string | null,
  attentionOrganizationId?: string | null,
): { label: string; href: string; hint: string } | null {
  if (!readinessFocus) {
    return null;
  }
  if (readinessFocus === "billing_warning") {
    return {
      label: "Open billing warning flow",
      href: buildSurfaceFollowUpHref({
        pathname: "/settings?intent=resolve-billing",
        runId,
        readinessFocus,
        workspaceSlug: attentionWorkspaceSlug,
        organizationId: attentionOrganizationId,
      }),
      hint:
        "Billing-warning follow-up usually starts in Settings. After reviewing or resolving the warning, continue into verification or the mock go-live drill from the same workspace context.",
    };
  }
  if (readinessFocus === "baseline" || readinessFocus === "credentials") {
    return {
      label: "Open onboarding flow",
      href: buildSurfaceFollowUpHref({
        pathname: "/onboarding",
        runId,
        readinessFocus,
        workspaceSlug: attentionWorkspaceSlug,
        organizationId: attentionOrganizationId,
      }),
      hint:
        "This focus is best handled in the onboarding lane before the workspace returns to verification and go-live readiness review.",
    };
  }
  if (readinessFocus === "demo_run") {
    return {
      label: "Open Week 8 checklist",
      href: buildSurfaceFollowUpHref({
        pathname: "/verification?surface=verification",
        runId,
        readinessFocus,
        workspaceSlug: attentionWorkspaceSlug,
        organizationId: attentionOrganizationId,
      }),
      hint:
        "Use verification to confirm the demo run, then continue into usage evidence or the mock go-live drill once the run succeeds.",
    };
  }
  return {
    label: "Open mock go-live drill",
    href: buildSurfaceFollowUpHref({
      pathname: "/go-live?surface=go_live",
      runId,
      readinessFocus,
      workspaceSlug: attentionWorkspaceSlug,
      organizationId: attentionOrganizationId,
    }),
    hint:
      "These workspaces are close to the end of the Week 8 flow, so the next review step is usually the mock go-live drill and evidence handoff.",
  };
}

type RecentDeliveryDetail = ControlPlaneAdminDeliveryWorkspace;

export function AdminOverviewPanel({
  initialSurfaceFilter,
  initialReadinessFocus,
  attentionWorkspaceSlug,
  attentionOrganizationId,
  queueReturned,
  readinessReturned,
  preferPreviewScaffolding = false,
}: {
  initialSurfaceFilter?: SurfaceFilter;
  initialReadinessFocus?: ControlPlaneAdminWeek8ReadinessFocus;
  attentionWorkspaceSlug?: string | null;
  attentionOrganizationId?: string | null;
  queueReturned?: boolean;
  readinessReturned?: boolean;
  preferPreviewScaffolding?: boolean;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: fetchAdminOverview,
  });

  const normalizedData = useMemo(() => {
    if (!preferPreviewScaffolding) {
      return data;
    }

    const previewData = buildAdminOverviewPreviewData(data?.updated_at);
    if (!data) {
      return {
        ...previewData,
        contract_meta: {
          source: "fallback_error" as const,
          normalized_at: previewData.updated_at,
          issue: {
            code: "admin_overview_preview_fallback",
            message: "Admin overview is showing preview fallback data until the live control-plane summary is available.",
            status: null,
            retryable: true,
            details: {
              path: "/api/v1/saas/admin/overview",
            },
          },
        },
      };
    }

    return {
      ...data,
      recent_workspaces: data.recent_workspaces.length > 0 ? data.recent_workspaces : previewData.recent_workspaces,
      delivery_governance: data.delivery_governance ?? previewData.delivery_governance,
      recent_delivery_workspaces:
        data.recent_delivery_workspaces && data.recent_delivery_workspaces.length > 0
          ? data.recent_delivery_workspaces
          : previewData.recent_delivery_workspaces,
      attention_workspaces:
        data.attention_workspaces && data.attention_workspaces.length > 0
          ? data.attention_workspaces
          : previewData.attention_workspaces,
      attention_summary: data.attention_summary ?? previewData.attention_summary,
      attention_organizations:
        data.attention_organizations && data.attention_organizations.length > 0
          ? data.attention_organizations
          : previewData.attention_organizations,
      week8_readiness: data.week8_readiness ?? previewData.week8_readiness,
      week8_readiness_workspaces:
        data.week8_readiness_workspaces && data.week8_readiness_workspaces.length > 0
          ? data.week8_readiness_workspaces
          : previewData.week8_readiness_workspaces,
    };
  }, [data, preferPreviewScaffolding]);

  const summary = normalizedData?.summary;
  const adminContractMeta = normalizedData?.contract_meta ?? null;
  const adminContractSource = adminContractMeta?.source ?? (normalizedData ? "live" : null);
  const planDistribution = normalizedData?.plan_distribution ?? [];
  const recentWorkspaces = normalizedData?.recent_workspaces ?? [];
  const featureRollout = normalizedData?.feature_rollout;
  const deliveryGovernance = normalizedData?.delivery_governance;
  const week8Readiness = normalizedData?.week8_readiness;
  const week8ReadinessWorkspaces = normalizedData?.week8_readiness_workspaces ?? [];
  const recentDeliveryWorkspaces = normalizedData?.recent_delivery_workspaces ?? [];
  const recentDeliveryWorkspacesWithMetadata: RecentDeliveryDetail[] = recentDeliveryWorkspaces.map(
    (workspace) => ({
      ...workspace,
      organization_display_name: workspace.organization_display_name ?? workspace.slug,
    }),
  );
  const attentionSummary = normalizedData?.attention_summary;
  const attentionOrganizations = normalizedData?.attention_organizations ?? [];
  const totalWorkspaces = summary?.workspaces_total ?? 0;
  const showRecentDeliveryWorkspaces = recentDeliveryWorkspacesWithMetadata.length > 0;
  const attentionWorkspaces = normalizedData?.attention_workspaces ?? [];
  const readinessFocus = initialReadinessFocus ?? null;
  const organizationMatchesFocus = (workspace: {
    organization_id: string;
    organization_display_name: string;
  }): boolean => {
    if (!attentionOrganizationId) {
      return true;
    }
    return (
      workspace.organization_id === attentionOrganizationId
      || workspace.organization_display_name === attentionOrganizationId
    );
  };
  const actionableWorkspaces = attentionWorkspaces.filter(
    (workspace) =>
      workspace.verification_status !== "complete" || workspace.go_live_status !== "complete",
  );
  const prioritizedActionableWorkspaces =
    attentionWorkspaceSlug || attentionOrganizationId
      ? [...actionableWorkspaces].sort((left, right) => {
          const leftWorkspaceMatches = left.slug === attentionWorkspaceSlug ? 1 : 0;
          const rightWorkspaceMatches = right.slug === attentionWorkspaceSlug ? 1 : 0;
          if (leftWorkspaceMatches !== rightWorkspaceMatches) {
            return rightWorkspaceMatches - leftWorkspaceMatches;
          }
          const leftOrganizationMatches = organizationMatchesFocus(left) ? 1 : 0;
          const rightOrganizationMatches = organizationMatchesFocus(right) ? 1 : 0;
          return rightOrganizationMatches - leftOrganizationMatches;
        })
      : actionableWorkspaces;
  const focusedActionableWorkspaces = attentionOrganizationId
    ? prioritizedActionableWorkspaces.filter(organizationMatchesFocus)
    : prioritizedActionableWorkspaces;
  const visibleActionableWorkspaces = focusedActionableWorkspaces.slice(0, 4);
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>(initialSurfaceFilter ?? "all");
  const [showInProgressOnly, setShowInProgressOnly] = useState(false);
  const defaultQueueLimit = 4;
  const [queueLimit, setQueueLimit] = useState(defaultQueueLimit);
  const recentDeliveryLimit = 3;
  const [recentLimit, setRecentLimit] = useState(recentDeliveryLimit);
  const matchesCurrentFilters = (workspace: {
    next_action_surface: "verification" | "go_live";
    verification_status: ControlPlaneDeliveryTrackStatus | null;
    go_live_status: ControlPlaneDeliveryTrackStatus | null;
  }) => {
    if (surfaceFilter !== "all" && workspace.next_action_surface !== surfaceFilter) {
      return false;
    }
    if (
      showInProgressOnly &&
      workspace.verification_status !== "in_progress" &&
      workspace.go_live_status !== "in_progress"
    ) {
      return false;
    }
    return true;
  };
  const filteredOrganizationWorkspaces = focusedActionableWorkspaces.filter(matchesCurrentFilters);
  const filteredWorkspaces = visibleActionableWorkspaces.filter(matchesCurrentFilters);
  const showActionQueue = visibleActionableWorkspaces.length > 0;
  const focusedRecentWorkspaces = attentionOrganizationId
    ? recentDeliveryWorkspacesWithMetadata.filter(organizationMatchesFocus)
    : recentDeliveryWorkspacesWithMetadata;
  const filteredRecentWorkspaces = focusedRecentWorkspaces.filter(matchesCurrentFilters);
  const recentShownWorkspaces = filteredRecentWorkspaces.slice(0, recentLimit);
  const isRecentExpanded = recentLimit >= filteredRecentWorkspaces.length;
  const canExpandRecent = filteredRecentWorkspaces.length > recentDeliveryLimit;
  useEffect(() => {
    setRecentLimit(recentDeliveryLimit);
  }, [
    attentionWorkspaceSlug,
    attentionOrganizationId,
    surfaceFilter,
    showInProgressOnly,
    filteredRecentWorkspaces.length,
  ]);
  const availableActionWorkspaces = filteredOrganizationWorkspaces;
  const shownActionWorkspaces = availableActionWorkspaces.slice(0, queueLimit);
  const canExpandQueue = availableActionWorkspaces.length > defaultQueueLimit;
  const isQueueExpanded = queueLimit >= availableActionWorkspaces.length;
  useEffect(() => {
    setQueueLimit(defaultQueueLimit);
  }, [attentionWorkspaceSlug, attentionOrganizationId, availableActionWorkspaces.length]);
  const highlightedWorkspace = attentionWorkspaceSlug
    ? filteredOrganizationWorkspaces.find((workspace) => workspace.slug === attentionWorkspaceSlug) ?? null
    : null;
  const [expandedOrganization, setExpandedOrganization] = useState<string | null>(() => {
    if (attentionOrganizationId) {
      return attentionOrganizationId;
    }
    if (!attentionWorkspaceSlug) {
      return null;
    }
    const matchingWorkspace = actionableWorkspaces.find(
      (workspace) => workspace.slug === attentionWorkspaceSlug,
    );
    return matchingWorkspace?.organization_id || matchingWorkspace?.organization_display_name || null;
  });
  useEffect(() => {
    if (attentionOrganizationId) {
      setExpandedOrganization(attentionOrganizationId);
      return;
    }
    if (!attentionWorkspaceSlug) {
      return;
    }
    const matchingWorkspace = actionableWorkspaces.find(
      (workspace) => workspace.slug === attentionWorkspaceSlug,
    );
    setExpandedOrganization(
      matchingWorkspace?.organization_id || matchingWorkspace?.organization_display_name || null,
    );
  }, [actionableWorkspaces, attentionOrganizationId, attentionWorkspaceSlug]);
  const attentionWorkspacesByOrg = useMemo(() => {
    const map = new Map<string, ControlPlaneAdminAttentionWorkspace[]>();
    filteredOrganizationWorkspaces.forEach((workspace) => {
      const key = workspace.organization_id || workspace.organization_display_name;
      const group = map.get(key) ?? [];
      group.push(workspace);
      map.set(key, group);
    });
    return map;
  }, [filteredOrganizationWorkspaces]);
  const visibleAttentionOrganizations = attentionOrganizationId
    ? attentionOrganizations.filter(
        (organization) =>
          organization.organization_id === attentionOrganizationId
          || organization.organization_display_name === attentionOrganizationId,
      )
    : attentionOrganizations;
  const focusedOrganizationLabel = attentionOrganizationId
    ? visibleAttentionOrganizations[0]?.organization_display_name
      ?? actionableWorkspaces.find(
        (workspace) =>
          workspace.organization_id === attentionOrganizationId
          || workspace.organization_display_name === attentionOrganizationId,
      )?.organization_display_name
      ?? attentionOrganizationId
    : null;
  const focusedWorkspaceLabel = attentionWorkspaceSlug
    ? actionableWorkspaces.find((workspace) => workspace.slug === attentionWorkspaceSlug)?.display_name
      ?? recentDeliveryWorkspacesWithMetadata.find((workspace) => workspace.slug === attentionWorkspaceSlug)?.display_name
      ?? attentionWorkspaceSlug
    : null;
  const activeSurface = surfaceFilter !== "all" ? surfaceFilter : undefined;
  const hasFocusState =
    !!activeSurface ||
    !!readinessFocus ||
    !!attentionOrganizationId ||
    !!attentionWorkspaceSlug ||
    !!queueReturned ||
    !!readinessReturned;
  const clearSurfaceHref = activeSurface
    ? buildAdminHref({
        readinessFocus,
        organizationId: attentionOrganizationId,
        workspaceSlug: attentionWorkspaceSlug,
        queueReturned,
        readinessReturned,
      })
    : null;
  const clearReadinessHref = readinessFocus
    ? buildAdminHref({
        surface: activeSurface,
        organizationId: attentionOrganizationId,
        workspaceSlug: attentionWorkspaceSlug,
        queueReturned,
      })
    : null;
  const clearWorkspaceHref = attentionWorkspaceSlug
    ? buildAdminHref({
        surface: activeSurface,
        readinessFocus,
        organizationId: attentionOrganizationId,
        queueReturned,
        readinessReturned,
      })
    : null;
  const clearOrganizationHref = attentionOrganizationId
    ? buildAdminHref({
        surface: activeSurface,
        readinessFocus,
        queueReturned,
        readinessReturned,
      })
    : null;
  const clearQueueReturnedHref = queueReturned
    ? buildAdminHref({
        surface: activeSurface,
        readinessFocus,
        organizationId: attentionOrganizationId,
        workspaceSlug: attentionWorkspaceSlug,
        readinessReturned,
      })
    : null;
  const clearReadinessReturnedHref = readinessReturned
    ? buildAdminHref({
        surface: activeSurface,
        readinessFocus,
        organizationId: attentionOrganizationId,
        workspaceSlug: attentionWorkspaceSlug,
        queueReturned,
      })
    : null;
  const clearAllHref = hasFocusState ? "/admin" : null;
  const router = useRouter();
  const [switchingWorkspace, setSwitchingWorkspace] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startRoutingTransition] = useTransition();

  const statusVariant = (status: ControlPlaneDeliveryTrackStatus | null | undefined): "strong" | "default" | "subtle" => {
    if (status === "complete") {
      return "strong";
    }
    if (status === "in_progress") {
      return "default";
    }
    return "subtle";
  };

  const statusLabel = (status: ControlPlaneDeliveryTrackStatus | null | undefined): string => {
    if (!status) {
      return "Not tracked";
    }
    return status.replace("_", " ");
  };

  const navigateWithWorkspaceContext = async (options: {
    workspaceSlug: string;
    pathname: string;
    searchParams?: Record<string, string | null | undefined>;
  }) => {
    setActionError(null);
    setSwitchingWorkspace(options.workspaceSlug);
    const outcome = await performWorkspaceSwitch({
      selection: {
        workspace_slug: options.workspaceSlug,
      },
    });
    if (outcome.status === "switched") {
      startRoutingTransition(() => {
        router.push(buildWorkspaceNavigationHref(options.pathname, options.searchParams));
      });
    } else {
      setActionError(outcome.error?.message ?? "Unable to switch workspace");
    }
    setSwitchingWorkspace(null);
  };

  const handleAction = async (
    workspace: ControlPlaneAdminAttentionWorkspace,
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
  ) => {
    await navigateWithWorkspaceContext(buildAdminAttentionNavigationTarget(workspace, options));
  };

  const handleReadinessAction = async (workspace: ControlPlaneAdminWeek8ReadinessWorkspace) => {
    await navigateWithWorkspaceContext(
      buildAdminReadinessNavigationTarget(workspace, {
        readinessFocus,
        attentionOrganizationId,
      }),
    );
  };

  const renderStatusRow = (label: string, counts: ControlPlaneDeliveryGovernance["verification"]) => (
    <div key={label} className="space-y-2 rounded-xl border border-border bg-background px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <div className="rounded-xl border border-border px-2 py-1 text-muted">
          Pending {counts.pending}
        </div>
        <div className="rounded-xl border border-border px-2 py-1 text-muted">
          In progress {counts.in_progress}
        </div>
        <div className="rounded-xl border border-border px-2 py-1 text-muted">
          Complete {counts.complete}
        </div>
      </div>
    </div>
  );

  const readinessTotal = week8Readiness?.total ?? totalWorkspaces;
  const readinessMetrics: AdminWeek8ReadinessMetric[] = week8Readiness
    ? [
        {
          label: "Baseline bundle",
          count: `${week8Readiness.baseline_ready_total}/${readinessTotal}`,
          status:
            week8Readiness.baseline_ready_total === readinessTotal && readinessTotal > 0
              ? "Broad coverage"
              : week8Readiness.baseline_ready_total > 0
                ? "In flight"
                : "Pending",
          tone:
            week8Readiness.baseline_ready_total === readinessTotal && readinessTotal > 0
              ? "strong"
              : week8Readiness.baseline_ready_total > 0
                ? "default"
                : "subtle",
          detail: "Seeded providers and policies are in place for first-run governance.",
          href: buildAdminHref({
            surface: activeSurface,
            readinessFocus: readinessFocus === "baseline" ? null : "baseline",
            organizationId: attentionOrganizationId,
            workspaceSlug: attentionWorkspaceSlug,
            queueReturned,
            readinessReturned,
          }),
          active: readinessFocus === "baseline",
        },
        {
          label: "Credentials ready",
          count: `${week8Readiness.credentials_ready_total}/${readinessTotal}`,
          status:
            week8Readiness.credentials_ready_total === readinessTotal && readinessTotal > 0
              ? "Provisioned"
              : week8Readiness.credentials_ready_total > 0
                ? "Partial"
                : "Pending",
          tone:
            week8Readiness.credentials_ready_total === readinessTotal && readinessTotal > 0
              ? "strong"
              : week8Readiness.credentials_ready_total > 0
                ? "default"
                : "subtle",
          detail: "At least one service account and API key path exist in the workspace.",
          href: buildAdminHref({
            surface: activeSurface,
            readinessFocus: readinessFocus === "credentials" ? null : "credentials",
            organizationId: attentionOrganizationId,
            workspaceSlug: attentionWorkspaceSlug,
            queueReturned,
            readinessReturned,
          }),
          active: readinessFocus === "credentials",
        },
        {
          label: "Demo run success",
          count: `${week8Readiness.demo_run_succeeded_total}/${readinessTotal}`,
          status:
            week8Readiness.demo_run_succeeded_total === readinessTotal && readinessTotal > 0
              ? "Validated"
              : week8Readiness.demo_run_succeeded_total > 0
                ? "Growing"
                : "Pending",
          tone:
            week8Readiness.demo_run_succeeded_total === readinessTotal && readinessTotal > 0
              ? "strong"
              : week8Readiness.demo_run_succeeded_total > 0
                ? "default"
                : "subtle",
          detail: "The onboarding demo run has completed successfully in workspace console context.",
          href: buildAdminHref({
            surface: activeSurface,
            readinessFocus: readinessFocus === "demo_run" ? null : "demo_run",
            organizationId: attentionOrganizationId,
            workspaceSlug: attentionWorkspaceSlug,
            queueReturned,
            readinessReturned,
          }),
          active: readinessFocus === "demo_run",
        },
        {
          label: "Billing warnings",
          count: `${week8Readiness.billing_warning_total}/${readinessTotal}`,
          status: week8Readiness.billing_warning_total > 0 ? "Needs follow-up" : "Clear",
          tone: week8Readiness.billing_warning_total > 0 ? "default" : "strong",
          detail: "Past-due, paused, cancelled, or scheduled-to-end subscriptions still needing review.",
          href: buildAdminHref({
            surface: activeSurface,
            readinessFocus: readinessFocus === "billing_warning" ? null : "billing_warning",
            organizationId: attentionOrganizationId,
            workspaceSlug: attentionWorkspaceSlug,
            queueReturned,
            readinessReturned,
          }),
          active: readinessFocus === "billing_warning",
        },
        {
          label: "Mock go-live ready",
          count: `${week8Readiness.mock_go_live_ready_total}/${readinessTotal}`,
          status:
            week8Readiness.mock_go_live_ready_total === readinessTotal && readinessTotal > 0
              ? "Ready"
              : week8Readiness.mock_go_live_ready_total > 0
                ? "Partial"
                : "Pending",
          tone:
            week8Readiness.mock_go_live_ready_total === readinessTotal && readinessTotal > 0
              ? "strong"
              : week8Readiness.mock_go_live_ready_total > 0
                ? "default"
                : "subtle",
          detail: "Baseline, credentials, and a successful demo run are in place without a live billing warning.",
          href: buildAdminHref({
            surface: activeSurface,
            readinessFocus: readinessFocus === "go_live_ready" ? null : "go_live_ready",
            organizationId: attentionOrganizationId,
            workspaceSlug: attentionWorkspaceSlug,
            queueReturned,
            readinessReturned,
          }),
          active: readinessFocus === "go_live_ready",
        },
      ]
    : [];
  const showReadinessReturnBanner =
    !!readinessReturned && !!readinessFocus;
  const readinessFocusLabelText = readinessFocus ? readinessFocusLabel(readinessFocus) : "";
  const matchesReadinessFocus = (workspace: ControlPlaneAdminWeek8ReadinessWorkspace) => {
    if (!readinessFocus) {
      return true;
    }
    if (readinessFocus === "baseline") {
      return !workspace.baseline_ready;
    }
    if (readinessFocus === "credentials") {
      return workspace.baseline_ready && !workspace.credentials_ready;
    }
    if (readinessFocus === "demo_run") {
      return workspace.baseline_ready && workspace.credentials_ready && !workspace.demo_run_succeeded;
    }
    if (readinessFocus === "billing_warning") {
      return workspace.billing_warning;
    }
    return workspace.mock_go_live_ready;
  };
  const focusedReadinessWorkspaces = attentionOrganizationId
    ? week8ReadinessWorkspaces.filter(organizationMatchesFocus)
    : week8ReadinessWorkspaces;
  const filteredReadinessWorkspaces = focusedReadinessWorkspaces.filter(matchesReadinessFocus);
  const prioritizedReadinessWorkspaces =
    attentionWorkspaceSlug || attentionOrganizationId
      ? [...filteredReadinessWorkspaces].sort((left, right) => {
          const leftWorkspaceMatches = left.slug === attentionWorkspaceSlug ? 1 : 0;
          const rightWorkspaceMatches = right.slug === attentionWorkspaceSlug ? 1 : 0;
          if (leftWorkspaceMatches !== rightWorkspaceMatches) {
            return rightWorkspaceMatches - leftWorkspaceMatches;
          }
          const leftOrganizationMatches = organizationMatchesFocus(left) ? 1 : 0;
          const rightOrganizationMatches = organizationMatchesFocus(right) ? 1 : 0;
          return rightOrganizationMatches - leftOrganizationMatches;
        })
      : filteredReadinessWorkspaces;
  const focusedReadinessWorkspace = attentionWorkspaceSlug
    ? prioritizedReadinessWorkspaces.find((workspace) => workspace.slug === attentionWorkspaceSlug) ?? null
    : null;
  const focusedAttentionWorkspace = attentionWorkspaceSlug
    ? filteredOrganizationWorkspaces.find((workspace) => workspace.slug === attentionWorkspaceSlug) ?? null
    : null;
  const focusedRecentDeliveryWorkspace = attentionWorkspaceSlug
    ? recentDeliveryWorkspacesWithMetadata.find((workspace) => workspace.slug === attentionWorkspaceSlug) ?? null
    : null;
  const focusedRunId =
    focusedRecentDeliveryWorkspace?.latest_demo_run_id
    ?? focusedReadinessWorkspace?.latest_demo_run_id
    ?? focusedAttentionWorkspace?.latest_demo_run_id
    ?? null;
  const defaultReadinessLimit = 4;
  const [readinessLimit, setReadinessLimit] = useState(defaultReadinessLimit);
  useEffect(() => {
    setReadinessLimit(defaultReadinessLimit);
  }, [readinessFocus, attentionOrganizationId, attentionWorkspaceSlug, prioritizedReadinessWorkspaces.length]);
  const shownReadinessWorkspaces = prioritizedReadinessWorkspaces.slice(0, readinessLimit);
  const canExpandReadiness = prioritizedReadinessWorkspaces.length > defaultReadinessLimit;
  const isReadinessExpanded = readinessLimit >= prioritizedReadinessWorkspaces.length;
  const readinessActionLabel = (surface: AdminNavigationSurface) => surfaceActionInfo[surface].buttonLabel;
  const readinessFollowUp = readinessFollowUpAction(
    readinessFocus,
    focusedRunId,
    attentionWorkspaceSlug,
    attentionOrganizationId,
  );
  const returnLinksHref = "#admin-return-links";

  return (
    <div className="space-y-6">
      <AdminFocusBar
        surface={activeSurface ? surfaceLabel(activeSurface) : null}
        readiness={readinessFocus ? readinessFocusLabel(readinessFocus) : null}
        organization={focusedOrganizationLabel}
        workspace={focusedWorkspaceLabel}
        queueReturned={queueReturned}
        readinessReturned={readinessReturned}
        clearSurfaceHref={clearSurfaceHref}
        clearReadinessHref={clearReadinessHref}
        clearOrganizationHref={clearOrganizationHref}
        clearWorkspaceHref={clearWorkspaceHref}
        clearQueueReturnedHref={clearQueueReturnedHref}
        clearReadinessReturnedHref={clearReadinessReturnedHref}
        clearAllHref={clearAllHref}
      />
      {showReadinessReturnBanner ? (
        <AdminReadinessReturnBanner
          focusLabel={readinessFocusLabelText}
          clearHref={clearReadinessHref}
          focusHint={readinessFollowUp?.hint ?? null}
          followUpHref={readinessFollowUp?.href ?? null}
          followUpLabel={readinessFollowUp?.label ?? null}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Focus & return loop</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted">
            {readinessFocus
              ? `Readiness focus: ${readinessFocusLabel(readinessFocus)}.`
              : "No Week 8 readiness focus is currently set."}{" "}
            Use this highlight to know which surface should be opened for the next verification or go-live follow-up.
          </p>
          <p className="text-muted">
            The attention queue lists workspaces that still need manual review. Open a workspace from the list, perform
            the governance work on verification/go-live/etc., capture evidence or operator notes on that surface, then
            close the loop by using the <Link href={returnLinksHref}>return links below</Link> to restore the admin
            overview.
          </p>
          <div id="admin-return-links" className="flex flex-wrap gap-2">
            {clearReadinessHref ? (
              <Link
                href={clearReadinessHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Clear readiness focus
              </Link>
            ) : null}
            {clearQueueReturnedHref ? (
              <Link
                href={clearQueueReturnedHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Clear queue return
              </Link>
            ) : null}
            {clearAllHref ? (
              <Link
                href={clearAllHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Return to admin overview
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {isLoading ? <p className="text-muted">Loading admin overview...</p> : null}
          {isError ? <p className="text-muted">Unable to load live admin overview, showing preview data.</p> : null}
          {data ? (
            <div className="space-y-2 rounded-2xl border border-border bg-background px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={adminContractBadgeVariant(adminContractSource)}>
                  {adminContractLabel(adminContractSource, adminContractMeta?.issue ?? null)}
                </Badge>
                <p className="text-xs text-muted">
                  {adminContractDescription(adminContractSource, adminContractMeta?.issue ?? null)}
                </p>
              </div>
              {adminContractMeta?.issue ? (
                <p className="text-xs text-muted">Contract note: {adminContractMeta.issue.message}</p>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Organizations</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{summary?.organizations_total ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Workspaces</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{summary?.workspaces_total ?? 0}</p>
              <p className="mt-1 text-xs text-muted">Active: {summary?.active_workspaces_total ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Users</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{summary?.users_total ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Paid subscriptions</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{summary?.paid_subscriptions_total ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Past due subscriptions</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{summary?.past_due_subscriptions_total ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Last updated</p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {data?.updated_at ? formatDate(data.updated_at) : "-"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Plan distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {planDistribution.length === 0 ? <p className="text-muted">No plan data available.</p> : null}
            {planDistribution.map((entry) => (
              <div key={entry.plan_code} className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                <p className="font-medium text-foreground">{entry.plan_code}</p>
                <Badge variant="subtle">{entry.workspace_count} workspaces</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feature rollout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
              <p className="font-medium text-foreground">SSO readiness</p>
              <Badge variant={rolloutVariant(featureRollout?.sso_enabled_workspaces ?? 0, totalWorkspaces)}>
                {featureRollout?.sso_enabled_workspaces ?? 0}/{totalWorkspaces}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
              <p className="font-medium text-foreground">Audit export</p>
              <Badge variant={rolloutVariant(featureRollout?.audit_export_enabled_workspaces ?? 0, totalWorkspaces)}>
                {featureRollout?.audit_export_enabled_workspaces ?? 0}/{totalWorkspaces}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
              <p className="font-medium text-foreground">Dedicated environment readiness</p>
              <Badge variant={rolloutVariant(featureRollout?.dedicated_environment_enabled_workspaces ?? 0, totalWorkspaces)}>
                {featureRollout?.dedicated_environment_enabled_workspaces ?? 0}/{totalWorkspaces}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent workspaces</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {recentWorkspaces.length === 0 ? <p className="text-muted">No recent workspaces available.</p> : null}
          {recentWorkspaces.map((workspace) => (
            <div
              key={workspace.workspace_id}
              className="rounded-xl border border-border bg-background p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">{workspace.display_name}</p>
                <Badge variant="subtle">{workspace.plan_code}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                {workspace.organization_display_name} · {workspace.slug}
              </p>
              <p className="mt-1 text-xs text-muted">
                Status: {workspace.status} · Created: {formatDate(workspace.created_at)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery governance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted">
            These counts show how many workspaces are pending, in progress, or complete for the verification and
            go-live tracks. When data is missing, the platform is still operating in preview mode.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {deliveryGovernance ? (
              <>
                {renderStatusRow("Verification track", deliveryGovernance.verification)}
                {renderStatusRow("Go-live track", deliveryGovernance.go_live)}
              </>
            ) : (
              <p className="text-muted">Delivery governance counts are unavailable for this environment.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <AdminWeek8ReadinessCard
        description="A platform-level Week 8 view that rolls up onboarding, billing posture, and first-run validation so operators can see which workspaces are genuinely approaching mock go-live readiness."
        metrics={readinessMetrics}
        focusLabel={readinessFocusLabelText || null}
        focusHint={readinessFollowUp?.hint ?? null}
        clearFocusHref={clearReadinessHref}
        primaryAction={
          readinessFollowUp
            ? {
                label: readinessFollowUp.label,
                href: readinessFollowUp.href,
              }
            : {
                label: "Open Week 8 checklist",
                href: "/verification?surface=verification",
              }
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Week 8 readiness follow-up</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted">
            Use this list to move from a readiness metric into the specific workspaces that still need onboarding,
            billing, verification, or mock go-live follow-up. These actions only switch workspace context and open the
            relevant surface; they do not trigger remediation or automate evidence capture for the operator.
          </p>
          {readinessFollowUp ? (
            <div className="rounded-xl border border-border bg-background px-3 py-3 text-xs text-muted">
              <p className="font-medium text-foreground">{readinessFollowUp.label}</p>
              <p className="mt-1">{readinessFollowUp.hint}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <div className="px-3 py-1">
              Showing {shownReadinessWorkspaces.length}/{filteredReadinessWorkspaces.length} readiness items
              {readinessFocus ? ` for ${readinessFocusLabel(readinessFocus).toLowerCase()}` : ""}
              {attentionOrganizationId ? " in the focused organization" : ""}
            </div>
            {canExpandReadiness ? (
              <button
                type="button"
                className="text-xs font-medium text-foreground transition hover:text-foreground/70"
                onClick={() => {
                  if (isReadinessExpanded) {
                    setReadinessLimit(defaultReadinessLimit);
                    return;
                  }
                  setReadinessLimit(prioritizedReadinessWorkspaces.length || defaultReadinessLimit);
                }}
              >
                {isReadinessExpanded ? "Show less" : "Show more"}
              </button>
            ) : null}
          </div>
          {shownReadinessWorkspaces.length > 0 ? (
            shownReadinessWorkspaces.map((workspace) => {
              const isSwitching = switchingWorkspace === workspace.slug;
              const isHighlighted = attentionWorkspaceSlug === workspace.slug;
              const targetSurface = (workspace.next_action_surface ?? "verification") as AdminNavigationSurface;
              const actionDetail = surfaceActionInfo[targetSurface].detail;
              return (
                <div
                  key={workspace.workspace_id}
                  className={`space-y-2 rounded-xl border p-3 ${
                    isHighlighted ? "border-foreground bg-foreground/5" : "border-border bg-background"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{workspace.display_name}</p>
                        {isHighlighted && readinessReturned ? <Badge variant="default">Focused return</Badge> : null}
                        {workspace.mock_go_live_ready ? <Badge variant="strong">Mock go-live ready</Badge> : null}
                      </div>
                      <p className="text-xs text-muted">
                        {workspace.organization_display_name} · {workspace.slug}
                      </p>
                      {workspace.updated_at ? (
                        <p className="text-xs text-muted">Updated {formatDate(workspace.updated_at)}</p>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleReadinessAction(workspace)}
                      disabled={isSwitching}
                      aria-busy={isSwitching}
                    >
                      {isSwitching ? "Switching..." : readinessActionLabel(targetSurface)}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant={workspace.baseline_ready ? "strong" : "subtle"}>
                      Baseline {workspace.baseline_ready ? "ready" : "pending"}
                    </Badge>
                    <Badge variant={workspace.credentials_ready ? "strong" : workspace.baseline_ready ? "default" : "subtle"}>
                      Credentials {workspace.credentials_ready ? "ready" : "pending"}
                    </Badge>
                    <Badge
                      variant={
                        workspace.demo_run_succeeded
                          ? "strong"
                          : workspace.credentials_ready
                            ? "default"
                            : "subtle"
                      }
                    >
                      Demo run {workspace.demo_run_succeeded ? "complete" : "pending"}
                    </Badge>
                    <Badge variant={workspace.billing_warning ? "default" : "strong"}>
                      Billing {workspace.billing_warning ? "warning" : "clear"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">Next step: {actionDetail}</p>
                  <p className="text-[0.65rem] text-muted">
                    {summarizeReadinessStatus(workspace)} Keep this drill manual, record the outcome on the target
                    surface, then return here with the same focus.
                  </p>
                </div>
              );
            })
          ) : (
            <p className="text-muted">
              {readinessFocus
                ? "No workspaces match the current Week 8 readiness focus."
                : "No Week 8 readiness workspaces are available yet."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted">
            Workspaces that need follow-up are listed here with a direct jump to the right surface.
          </p>
          <p className="text-xs text-muted">
            Once the workspace surface is handled, use the clear links (shown when you return from a workspace) to go
            back to admin, keep the attention cluster aligned, and show the full overview again.
          </p>
          {attentionSummary ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted">Queue total</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{attentionSummary.total}</p>
              </div>
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted">Verification</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{attentionSummary.verification_total}</p>
              </div>
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted">Go-live</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{attentionSummary.go_live_total}</p>
              </div>
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted">In progress</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{attentionSummary.in_progress_total}</p>
              </div>
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted">Pending</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{attentionSummary.pending_total}</p>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1">
              <span className="text-muted">Surface</span>
              {["all", "verification", "go_live"].map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    surfaceFilter === option
                      ? "bg-foreground text-background"
                      : "text-muted hover:text-foreground"
                  }`}
                  onClick={() => setSurfaceFilter(option as SurfaceFilter)}
                >
                  {option === "all" ? "All" : option === "verification" ? "Verification" : "Go-live"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1 text-xs text-muted">
              <input
                type="checkbox"
                className="h-3 w-3 rounded border border-border bg-background"
                checked={showInProgressOnly}
                onChange={(event) => setShowInProgressOnly(event.currentTarget.checked)}
              />
              Show in-progress only
            </label>
            <div className="px-3 py-1 text-xs text-muted">
              Showing {shownActionWorkspaces.length}/{availableActionWorkspaces.length} queue items
              {attentionOrganizationId ? " for the focused organization" : ""}
            </div>
            {canExpandQueue ? (
              <button
                type="button"
                className="text-xs font-medium text-foreground transition hover:text-foreground/70"
                onClick={() => {
                  if (isQueueExpanded) {
                    setQueueLimit(defaultQueueLimit);
                    return;
                  }
                  setQueueLimit(availableActionWorkspaces.length || defaultQueueLimit);
                }}
              >
                {isQueueExpanded ? "Show less" : "Show more"}
              </button>
            ) : null}
          </div>
          {queueReturned ? (
            <div className="rounded-xl border border-foreground/40 bg-foreground/5 px-3 py-3 text-sm text-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">Admin queue focus restored</p>
                <Badge variant="default">{surfaceLabel(surfaceFilter)}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                {attentionWorkspaceSlug
                  ? `Returned from workspace follow-up for ${attentionWorkspaceSlug}. Continue the governance review from the filtered queue, or clear the focus to inspect the full overview again.`
                  : "Returned from a workspace follow-up. Continue the governance review from the filtered queue, or clear the focus to inspect the full overview again."}
              </p>
              {attentionOrganizationId ? (
                <p className="mt-1 text-xs text-muted">
                  Organization focus is preserved for this return path so the same governance cluster stays in view.
                </p>
              ) : null}
              {!highlightedWorkspace && attentionWorkspaceSlug ? (
                <p className="mt-1 text-xs text-muted">
                  The requested workspace is no longer visible in the current queue snapshot. It may already be
                  complete or outside the current preview window.
                </p>
              ) : null}
              <div className="mt-3">
                <Link
                  href={clearQueueReturnedHref ?? clearAllHref ?? "/admin"}
                  className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                >
                  Clear follow-up return
                </Link>
              </div>
            </div>
          ) : null}
          {showActionQueue ? (
            shownActionWorkspaces.length > 0 ? (
              shownActionWorkspaces.map((workspace) => {
                const targetSurface = (workspace.next_action_surface ?? "verification") as AdminNavigationSurface;
                const actionDetail = surfaceActionInfo[targetSurface].detail;
                const actionLabel = adminAttentionActionLabel(targetSurface);
                const isSwitching = switchingWorkspace === workspace.slug;
                const isHighlighted = attentionWorkspaceSlug === workspace.slug;
                return (
                  <div
                    key={workspace.workspace_id}
                    className={`space-y-2 rounded-xl border p-3 ${
                      isHighlighted
                        ? "border-foreground bg-foreground/5"
                        : "border-border bg-background"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{workspace.display_name}</p>
                          {isHighlighted ? <Badge variant="default">Focused return</Badge> : null}
                        </div>
                        <p className="text-xs text-muted">
                          {workspace.organization_display_name} · {workspace.slug}
                        </p>
                        {workspace.updated_at ? (
                          <p className="text-xs text-muted">
                            Updated {formatDate(workspace.updated_at)}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleAction(workspace, {
                            attentionOrganizationId: workspace.organization_id || attentionOrganizationId || null,
                          })}
                        disabled={isSwitching}
                        aria-busy={isSwitching}
                      >
                        {isSwitching ? "Switching..." : actionLabel}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant={statusVariant(workspace.verification_status)}>
                        Verification {statusLabel(workspace.verification_status)}
                      </Badge>
                      <Badge variant={statusVariant(workspace.go_live_status)}>
                        Go-live {statusLabel(workspace.go_live_status)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted">Next step: {actionDetail}</p>
                    <p className="text-[0.65rem] text-muted">{summarizeDeliveryStatus(workspace)}</p>
                  </div>
                );
              })
            ) : (
              <p className="text-muted">No action queue items match the selected filters.</p>
            )
          ) : (
            <p className="text-muted">No action queue items at the moment.</p>
          )}
          {actionError ? (
            <p className="text-xs text-foreground">Action failed: {actionError}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attention by organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted">
            Use this rollup to spot which organizations currently hold the most follow-up work across verification and
            go-live readiness.
          </p>
          {visibleAttentionOrganizations.length > 0 ? (
            visibleAttentionOrganizations.map((organization) => {
              const organizationKey = organization.organization_id || organization.organization_display_name;
              const workspacesForOrg = attentionWorkspacesByOrg.get(organizationKey) ?? [];
              const showWorkspaceList = expandedOrganization === organizationKey;
              const isFocusedOrganization = attentionOrganizationId === organizationKey;
              const toggleWorkspaceList = () => {
                setExpandedOrganization((current) => (current === organizationKey ? null : organizationKey));
              };
              return (
                <div
                  key={organizationKey}
                  className={`rounded-xl border bg-background p-3 ${
                    isFocusedOrganization ? "border-foreground bg-foreground/5" : "border-border"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{organization.organization_display_name}</p>
                      {isFocusedOrganization ? <Badge variant="default">Focused organization</Badge> : null}
                    </div>
                    <Badge variant="subtle">{organization.workspaces_total} workspaces</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <Badge variant="subtle">Verification {organization.verification_total}</Badge>
                    <Badge variant="subtle">Go-live {organization.go_live_total}</Badge>
                    <Badge variant="default">In progress {organization.in_progress_total}</Badge>
                    <Badge variant="subtle">Pending {organization.pending_total}</Badge>
                  </div>
                  {organization.latest_update_at ? (
                    <p className="mt-2 text-xs text-muted">Latest update {formatDate(organization.latest_update_at)}</p>
                  ) : null}
                  {workspacesForOrg.length > 0 ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <button
                        type="button"
                        className="text-xs font-medium text-foreground transition hover:text-foreground/70"
                        onClick={toggleWorkspaceList}
                      >
                        {showWorkspaceList
                          ? "Hide attention workspaces"
                          : `Show ${workspacesForOrg.length} attention workspace${workspacesForOrg.length > 1 ? "s" : ""}`}
                      </button>
                      {showWorkspaceList ? (
                        <div className="mt-3 space-y-3">
                          {workspacesForOrg.map((workspace) => {
                            const targetSurface = workspace.next_action_surface ?? "verification";
                            const actionLabel = adminAttentionActionLabel(targetSurface);
                            const isSwitching = switchingWorkspace === workspace.slug;
                            const isHighlighted = attentionWorkspaceSlug === workspace.slug;
                            return (
                              <div
                                key={workspace.workspace_id}
                                className={`space-y-2 rounded-xl border p-3 ${
                                  isHighlighted
                                    ? "border-foreground bg-foreground/5"
                                    : "border-border bg-background"
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="font-medium text-foreground">{workspace.display_name}</p>
                                      {isHighlighted ? <Badge variant="default">Focused return</Badge> : null}
                                    </div>
                                    <p className="text-xs text-muted">
                                      {workspace.organization_display_name} · {workspace.slug}
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleAction(workspace, {
                                        attentionOrganizationId: organizationKey,
                                      })}
                                    disabled={isSwitching}
                                    aria-busy={isSwitching}
                                  >
                                    {isSwitching ? "Switching..." : actionLabel}
                                  </Button>
                                </div>
                                <div className="flex flex-wrap gap-2 text-xs">
                                  <Badge variant={statusVariant(workspace.verification_status)}>
                                    Verification {statusLabel(workspace.verification_status)}
                                  </Badge>
                                  <Badge variant={statusVariant(workspace.go_live_status)}>
                                    Go-live {statusLabel(workspace.go_live_status)}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted">No filtered workspaces match this organization right now.</p>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-muted">No organization-level queue rollups are available yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent delivery activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted">
            The latest workspaces that updated their delivery tracking are listed here so you can follow up quickly.
          </p>
          {showRecentDeliveryWorkspaces ? (
            <>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  Showing {recentShownWorkspaces.length}/{filteredRecentWorkspaces.length} recent updates
                  {attentionOrganizationId ? " for the focused organization" : ""}
                </span>
                {canExpandRecent ? (
                  <button
                    type="button"
                    className="font-medium text-foreground transition hover:text-foreground/70"
                    onClick={() => setRecentLimit(isRecentExpanded ? recentDeliveryLimit : filteredRecentWorkspaces.length)}
                  >
                    {isRecentExpanded ? "Show less" : "Show more"}
                  </button>
                ) : null}
              </div>
              {recentShownWorkspaces.map((workspace) => {
                const targetSurface = (workspace.next_action_surface ?? "verification") as AdminNavigationSurface;
                const actionLabel = adminAttentionActionLabel(targetSurface);
                const actionDetail = surfaceActionInfo[targetSurface].detail;
                const isSwitching = switchingWorkspace === workspace.slug;
                const isHighlighted = attentionWorkspaceSlug === workspace.slug;
                const ownerLabel = formatOwnerLabel(workspace.owner_display_name, workspace.owner_email);
                const evidenceCount = workspace.evidence_count ?? 0;
                const evidenceText =
                  evidenceCount > 0
                    ? `${evidenceCount} evidence ${evidenceCount === 1 ? "item" : "items"}`
                    : "No linked evidence yet";
                const notesSummary = summarizeNotes(workspace.notes_summary ?? undefined);
                const updateKindDescription = describeRecentUpdateKind(
                  workspace.recent_update_kind,
                  workspace.recent_track_key,
                );
                return (
                  <div
                    key={workspace.workspace_id}
                    className={`space-y-2 rounded-xl border p-3 ${
                      isHighlighted
                        ? "border-foreground bg-foreground/5"
                        : "border-border bg-background"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{workspace.display_name}</p>
                          {isHighlighted ? <Badge variant="default">Focused return</Badge> : null}
                        </div>
                        <p className="text-xs text-muted">
                          {workspace.organization_display_name} · {workspace.slug}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleAction(workspace, {
                            attentionOrganizationId: workspace.organization_id || attentionOrganizationId || null,
                            deliveryContext: "recent_activity",
                            recentTrackKey: workspace.recent_track_key ?? null,
                            recentUpdateKind: workspace.recent_update_kind ?? null,
                            evidenceCount: workspace.evidence_count ?? null,
                            recentOwnerLabel: ownerLabel ?? null,
                            recentOwnerDisplayName: workspace.owner_display_name ?? null,
                            recentOwnerEmail: workspace.owner_email ?? null,
                          })}
                        disabled={isSwitching}
                        aria-busy={isSwitching}
                      >
                        {isSwitching ? "Switching..." : actionLabel}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant={statusVariant(workspace.verification_status)}>
                        Verification {statusLabel(workspace.verification_status)}
                      </Badge>
                      <Badge variant={statusVariant(workspace.go_live_status)}>
                        Go-live {statusLabel(workspace.go_live_status)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[0.7rem]">
                      {ownerLabel ? (
                        <span className="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[0.65rem] font-medium text-foreground/90">
                          Updated by {ownerLabel}
                        </span>
                      ) : null}
                      <Badge variant={evidenceBadgeVariant(evidenceCount)}>
                        {evidenceText}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted">Next step: {actionDetail}</p>
                    {notesSummary ? (
                      <p
                        className="text-[0.65rem] text-muted"
                        title={workspace.notes_summary ?? undefined}
                      >
                        {notesSummary}
                      </p>
                    ) : null}
                    <p className="text-[0.65rem] text-muted">{updateKindDescription}</p>
                    <p className="text-xs text-muted">
                      Updated {formatDate(workspace.updated_at ?? new Date().toISOString())}
                    </p>
                  </div>
                );
              })}
            </>
          ) : (
            <p className="text-muted">No delivery tracking activity has been captured yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verification flow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted">
            Week 8 keeps the admin surface lightweight, but the current console already exposes the core path needed
            for onboarding, billing, and runtime verification.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildSurfaceFollowUpHref({
                pathname: "/go-live?surface=go_live",
                runId: focusedRunId,
                readinessFocus,
                workspaceSlug: attentionWorkspaceSlug,
                organizationId: attentionOrganizationId,
              })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Open mock go-live drill
            </Link>
            <Link
              href={buildSurfaceFollowUpHref({
                pathname: "/verification?surface=verification",
                runId: focusedRunId,
                readinessFocus,
                workspaceSlug: attentionWorkspaceSlug,
                organizationId: attentionOrganizationId,
              })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Open Week 8 checklist
            </Link>
            <Link
              href={buildSurfaceFollowUpHref({
                pathname: "/onboarding",
                runId: focusedRunId,
                readinessFocus,
                workspaceSlug: attentionWorkspaceSlug,
                organizationId: attentionOrganizationId,
              })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Open onboarding
            </Link>
            <Link
              href={buildSurfaceFollowUpHref({
                pathname: "/usage",
                runId: focusedRunId,
                readinessFocus,
                workspaceSlug: attentionWorkspaceSlug,
                organizationId: attentionOrganizationId,
              })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review usage
            </Link>
            <Link
              href={buildSurfaceFollowUpHref({
                pathname: "/settings?intent=manage-plan",
                runId: focusedRunId,
                readinessFocus,
                workspaceSlug: attentionWorkspaceSlug,
                organizationId: attentionOrganizationId,
              })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Inspect billing and features
            </Link>
            <Link
              href={buildSurfaceFollowUpHref({
                pathname: "/playground",
                runId: focusedRunId,
                readinessFocus,
                workspaceSlug: attentionWorkspaceSlug,
                organizationId: attentionOrganizationId,
              })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Run flow checks
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
