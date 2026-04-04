"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  ControlPlaneAdminDeliveryUpdateKind,
  ControlPlaneContractMeta,
  ControlPlaneDeliveryEvidenceLink,
  ControlPlaneDeliveryTrackStatus,
  ControlPlaneWorkspaceDeliveryTrack,
  ControlPlaneWorkspaceDeliveryTrackUpsert,
} from "@/lib/control-plane-types";
import { buildAdminReturnHref, buildHandoffHref } from "@/lib/handoff-query";
import { fetchWorkspaceDeliveryTrack, saveWorkspaceDeliveryTrack } from "@/services/control-plane";

type DeliveryPanelSource = "onboarding" | "admin-readiness" | "admin-attention";
type DeliveryPanelSurface = "verification" | "go_live";
type SectionKey = "verification" | "go_live";
type DeliveryContext = "recent_activity";

type ContextCard = {
  title: string;
  body: string;
  actions: Array<{ label: string; href: string }>;
  footnote?: string;
  metaLines?: string[];
};

type RecentDeliveryMetadata = {
  recentTrackKey?: "verification" | "go_live" | null;
  recentUpdateKind?: ControlPlaneAdminDeliveryUpdateKind | null;
  evidenceCount?: number | null;
};

function normalizeSource(source?: string | null): DeliveryPanelSource | null {
  if (source === "onboarding" || source === "admin-readiness" || source === "admin-attention") {
    return source;
  }
  return null;
}

function normalizeDeliveryContext(value?: string | null): DeliveryContext | null {
  return value === "recent_activity" ? "recent_activity" : null;
}

function normalizeRecentTrackKey(value?: string | null): "verification" | "go_live" | null {
  if (value === "verification" || value === "go_live") {
    return value;
  }
  return null;
}

function normalizeRecentUpdateKind(value?: string | null): ControlPlaneAdminDeliveryUpdateKind | null {
  if (
    value === "verification" ||
    value === "go_live" ||
    value === "verification_completed" ||
    value === "go_live_completed" ||
    value === "evidence_only"
  ) {
    return value;
  }
  return null;
}

function trackLabel(trackKey?: "verification" | "go_live" | null): string {
  return trackKey === "go_live" ? "go-live" : "verification";
}

function describeRecentUpdateKind(
  kind?: ControlPlaneAdminDeliveryUpdateKind | null,
  trackKey?: "verification" | "go_live" | null,
): string | null {
  if (kind === "verification_completed") {
    return "Verification was marked complete in the latest admin activity.";
  }
  if (kind === "go_live_completed") {
    return "The mock go-live drill was marked complete in the latest admin activity.";
  }
  if (kind === "evidence_only") {
    return `Evidence links were added on the ${trackLabel(trackKey)} track.`;
  }
  if (kind === "verification") {
    return "Verification tracking was refreshed recently.";
  }
  if (kind === "go_live") {
    return "Go-live tracking was refreshed recently.";
  }
  if (trackKey) {
    return `Recent admin activity touched the ${trackLabel(trackKey)} track.`;
  }
  return null;
}

function buildMetadataLines(metadata: RecentDeliveryMetadata): string[] {
  const lines: string[] = [];
  const updateSummary = describeRecentUpdateKind(metadata.recentUpdateKind, metadata.recentTrackKey);
  if (updateSummary) {
    lines.push(updateSummary);
  }
  if (typeof metadata.evidenceCount === "number") {
    if (metadata.evidenceCount > 0) {
      lines.push(
        `${metadata.evidenceCount} evidence ${metadata.evidenceCount === 1 ? "link" : "links"} were already recorded in admin context.`,
      );
    } else {
      lines.push("No evidence links were recorded in the latest admin context yet.");
    }
  }
  return lines;
}

function buildContextHref(
  pathname: string,
  source?: DeliveryPanelSource | null,
  surface?: DeliveryPanelSurface | null,
  week8Focus?: string | null,
  attentionWorkspace?: string | null,
  attentionOrganization?: string | null,
  deliveryContext?: DeliveryContext | null,
  recentTrackKey?: "verification" | "go_live" | null,
  recentUpdateKind?: ControlPlaneAdminDeliveryUpdateKind | null,
  evidenceCount?: number | null,
): string {
  return buildHandoffHref(pathname, {
    source,
    surface,
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
  });
}

function buildAdminReturnUrl(
  source: DeliveryPanelSource | undefined,
  surface: DeliveryPanelSurface | undefined,
  workspaceSlug: string,
  week8Focus?: string | null,
  attentionOrganization?: string | null,
): string {
  return buildAdminReturnHref("/admin", {
    source,
    queueSurface: surface,
    week8Focus,
    attentionWorkspace: workspaceSlug,
    attentionOrganization,
  });
}

const statusOptions: Array<{ value: ControlPlaneDeliveryTrackStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "complete", label: "Complete" },
];

const badgeVariant: Record<ControlPlaneDeliveryTrackStatus, "strong" | "default" | "subtle"> = {
  pending: "subtle",
  in_progress: "default",
  complete: "strong",
};

function contractSourceBadgeVariant(
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

type DeliveryContractIssue = ControlPlaneContractMeta["issue"];

function deliveryFallbackStatusLabel(issue?: DeliveryContractIssue | null): string | null {
  if (issue?.status === 404) {
    return "route unavailable";
  }
  if (issue?.status === 503) {
    return "control plane unavailable";
  }
  return null;
}

function contractSourceLabel(
  source?: ControlPlaneContractMeta["source"] | null,
  issue?: DeliveryContractIssue | null,
): string {
  if (source === "live") {
    return "Live contract";
  }
  if (source === "fallback_feature_gate") {
    return "Fallback: feature gate";
  }
  if (source === "fallback_control_plane_unavailable") {
    return "Fallback: control plane unavailable";
  }
  if (source === "fallback_error") {
    const fallbackStatusLabel = deliveryFallbackStatusLabel(issue);
    if (fallbackStatusLabel) {
      return `Fallback: ${fallbackStatusLabel}`;
    }
    return "Fallback: preview data";
  }
  return "Contract source unknown";
}

function contractSourceDescription(
  source?: ControlPlaneContractMeta["source"] | null,
  issue?: DeliveryContractIssue | null,
): string {
  if (source === "live") {
    return "Delivery track data is loaded from live control-plane responses.";
  }
  if (source === "fallback_feature_gate") {
    return issue?.status === 409
      ? "Delivery track is using fallback guidance because the feature is not available on this plan."
      : "Delivery track is using fallback guidance until the workspace plan enables this feature.";
  }
  if (source === "fallback_control_plane_unavailable") {
    return "Delivery track is using preview fallback data because the control plane is unavailable.";
  }
  if (source === "fallback_error") {
    if (issue?.status === 404) {
      return "Delivery track is using preview fallback data because the live delivery route returned 404.";
    }
    if (issue?.status === 503) {
      return "Delivery track is using preview fallback data because the live delivery route returned 503.";
    }
    return "Delivery track is using preview fallback data and should not be treated as live evidence.";
  }
  return "Delivery track contract source is unavailable.";
}

function deliveryStatusHint(sectionKey: SectionKey, status: ControlPlaneDeliveryTrackStatus): string {
  if (status === "complete") {
    return sectionKey === "verification"
      ? "Verification notes are complete; admin readiness now turns toward the go-live drill."
      : "Go-live notes are complete; return to verification or the admin snapshot once the drill wraps up.";
  }
  if (status === "in_progress") {
    return sectionKey === "verification"
      ? "Verification is in progress; capture the remaining evidence before heading to the go-live drill."
      : "Go-live is being rehearsed; keep the drill evidence entries focused and loop back to verification if new issues surface.";
  }
  return "Delivery tracking is pending; finish the required follow-up actions before marking the field ready.";
}

function getContextCard(args: {
  source: DeliveryPanelSource | null;
  sectionKey: SectionKey;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  workspaceSlug: string;
  deliveryContext?: DeliveryContext | null;
  metadata: RecentDeliveryMetadata;
}): ContextCard | null {
  const {
    source,
    sectionKey,
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    workspaceSlug,
    deliveryContext,
    metadata,
  } = args;
  if (!source) {
    return null;
  }

  const targetWorkspace = attentionWorkspace ?? workspaceSlug;
  const verificationHref = buildContextHref(
    "/verification",
    source,
    "verification",
    week8Focus,
    targetWorkspace,
    attentionOrganization,
    deliveryContext,
    metadata.recentTrackKey,
    metadata.recentUpdateKind,
    metadata.evidenceCount,
  );
  const goLiveHref = buildContextHref(
    "/go-live",
    source,
    "go_live",
    week8Focus,
    targetWorkspace,
    attentionOrganization,
    deliveryContext,
    metadata.recentTrackKey,
    metadata.recentUpdateKind,
    metadata.evidenceCount,
  );
  const usageHref = buildContextHref(
    "/usage",
    source,
    sectionKey,
    week8Focus,
    targetWorkspace,
    attentionOrganization,
    deliveryContext,
    metadata.recentTrackKey,
    metadata.recentUpdateKind,
    metadata.evidenceCount,
  );
  const settingsHref = buildContextHref(
    "/settings",
    source,
    sectionKey,
    week8Focus,
    targetWorkspace,
    attentionOrganization,
    deliveryContext,
    metadata.recentTrackKey,
    metadata.recentUpdateKind,
    metadata.evidenceCount,
  );

  const metadataLines = deliveryContext === "recent_activity" ? buildMetadataLines(metadata) : [];

  if (source === "onboarding") {
    if (sectionKey === "verification") {
      return {
        title: "Onboarding evidence capture",
        body:
          "Save the owner, notes, and first-demo evidence links here so the verification checklist, usage snapshot, and trace references stay attached to the same workspace before you move into the mock go-live drill.",
        actions: [
          { label: "Review usage evidence", href: usageHref },
          { label: "Continue to go-live drill", href: goLiveHref },
        ],
        footnote:
          "These links only preserve onboarding navigation context. They do not automate evidence capture or change workspace permissions.",
        metaLines: metadataLines.length > 0 ? metadataLines : undefined,
      };
    }

    return {
      title: "Onboarding drill handoff",
      body:
        "Record what happened in the mock drill, including evidence links and follow-up notes, then return to verification if the first-demo checklist still needs another pass.",
      actions: [
        { label: "Return to verification", href: verificationHref },
        { label: "Inspect billing and features", href: settingsHref },
      ],
      footnote:
        "This remains a navigation-only walkthrough. Saving notes here does not trigger remediation, support, or impersonation.",
      metaLines: metadataLines.length > 0 ? metadataLines : undefined,
    };
  }

  const adminReturnHref = buildAdminReturnUrl(
    source,
    sectionKey,
    targetWorkspace,
    week8Focus,
    attentionOrganization,
  );

  if (source === "admin-readiness") {
    return {
      title: "Admin readiness evidence handoff",
      body:
        "The admin readiness view sent you here to capture concrete workspace evidence. Update the delivery track manually, then return to the filtered admin readiness snapshot when you are done.",
      actions:
        sectionKey === "verification"
          ? [
              { label: "Continue to go-live drill", href: goLiveHref },
              { label: "Return to admin readiness view", href: adminReturnHref },
            ]
          : [
              { label: "Return to verification", href: verificationHref },
              { label: "Return to admin readiness view", href: adminReturnHref },
            ],
      footnote:
        "The return link restores navigation focus only. It does not mark the workspace complete automatically.",
      metaLines: metadataLines.length > 0 ? metadataLines : undefined,
    };
  }

  return {
    title: "Admin queue evidence handoff",
    body:
      deliveryContext === "recent_activity"
        ? "You arrived here from the admin recent delivery activity snapshot. Review the latest workspace notes, add any missing evidence manually, then return to the queue when the follow-up is documented."
        : "You arrived from the admin attention queue. Save the current verification or go-live notes here, then return to the queue once the follow-up is documented.",
    actions:
      sectionKey === "verification"
        ? [
            { label: "Continue to go-live drill", href: goLiveHref },
            { label: "Return to admin queue", href: adminReturnHref },
          ]
        : [
            { label: "Return to verification", href: verificationHref },
            { label: "Return to admin queue", href: adminReturnHref },
          ],
    footnote:
      "This handoff is still manual. Queue and recent-activity views change only when people review and update the workspace surfaces.",
    metaLines: metadataLines.length > 0 ? metadataLines : undefined,
  };
}

function getDeliveryStatusGuidance(args: {
  status: ControlPlaneDeliveryTrackStatus;
  sectionKey: SectionKey;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  source?: string | null;
  deliveryContext?: DeliveryContext | null;
  recentTrackKey?: "verification" | "go_live" | null;
  recentUpdateKind?: ControlPlaneAdminDeliveryUpdateKind | null;
  evidenceCount?: number | null;
}): { title: string; body: string; actionLabel: string; actionHref: string } {
  const {
    status,
    sectionKey,
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    source,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
  } = args;
  const navSource = normalizeSource(source);
  const targetWorkspace = attentionWorkspace ?? "";
  const adminHref = buildAdminReturnUrl(
    navSource ?? undefined,
    sectionKey,
    targetWorkspace,
    week8Focus,
    attentionOrganization,
  );
  const verificationHref = buildContextHref(
    "/verification",
    navSource,
    "verification",
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
  );
  const goLiveHref = buildContextHref(
    "/go-live",
    navSource,
    "go_live",
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
  );

  const recentSummary =
    deliveryContext === "recent_activity"
      ? describeRecentUpdateKind(recentUpdateKind, recentTrackKey)
      : null;

  if (status === "pending") {
    return {
      title: "Queue still awaiting evidence",
      body: recentSummary
        ? `Pending status means this workspace still needs manual follow-up. ${recentSummary}`
        : "Pending status means delivery tracking is still waiting for the workspace notes to land. Admins keep the queue focused on this workspace until you populate owner, notes, or evidence.",
      actionLabel: "Return to admin queue",
      actionHref: adminHref,
    };
  }

  if (status === "in_progress") {
    return {
      title: "Admin reviewing the follow-up",
      body: recentSummary
        ? `In-progress status means the current workspace still needs review before the next handoff. ${recentSummary}`
        : "In-progress status reflects that the queue is evaluating the provided evidence. Once verification finishes, go-live is the next natural review before handing off to the broader admin readiness view.",
      actionLabel: sectionKey === "verification" ? "Open mock go-live drill" : "Return to Week 8 checklist",
      actionHref: sectionKey === "verification" ? goLiveHref : verificationHref,
    };
  }

  return {
    title: "Delivery step complete",
    body: recentSummary
      ? `This section is currently complete in the saved track. ${recentSummary}`
      : "Complete status signals this section is ready. After verification completes, go-live checks usually follow, while go-live completion typically routes back to the admin snapshot.",
    actionLabel: sectionKey === "verification" ? "Open mock go-live drill" : "Return to admin view",
    actionHref: sectionKey === "verification" ? goLiveHref : adminHref,
  };
}

export function WorkspaceDeliveryTrackPanel({
  workspaceSlug,
  sectionKey,
  title,
  description,
  source,
  surface,
  week8Focus,
  attentionWorkspace,
  attentionOrganization,
  deliveryContext,
  recentTrackKey,
  recentUpdateKind,
  evidenceCount,
}: {
  workspaceSlug: string;
  sectionKey: SectionKey;
  title: string;
  description: string;
  source?: string | null;
  surface?: DeliveryPanelSurface | null;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  deliveryContext?: string | null;
  recentTrackKey?: string | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | string | null;
}) {
  const queryClient = useQueryClient();
  const deliveryTrackQueryKey = ["workspace-delivery-track", workspaceSlug];
  const { data, isLoading, isError } = useQuery({
    queryKey: deliveryTrackQueryKey,
    queryFn: fetchWorkspaceDeliveryTrack,
    staleTime: 5 * 60 * 1000,
  });
  const deliveryContractMeta = data?.contract_meta ?? null;
  const deliveryContractSource = deliveryContractMeta?.source ?? (data ? "live" : null);

  const sectionData = data?.[sectionKey];
  const otherSectionKey: SectionKey = sectionKey === "verification" ? "go_live" : "verification";
  const otherSectionData = data?.[otherSectionKey];

  const [status, setStatus] = useState<ControlPlaneDeliveryTrackStatus>("pending");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [notes, setNotes] = useState("");
  const [evidenceLinks, setEvidenceLinks] = useState<ControlPlaneDeliveryEvidenceLink[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!sectionData) {
      return;
    }
    setStatus(sectionData.status);
    setOwnerUserId(sectionData.owner_user_id ?? "");
    setNotes(sectionData.notes ?? "");
    setEvidenceLinks(sectionData.evidence_links ?? []);
  }, [sectionData]);

  const mutation = useMutation({
    mutationFn: (payload: ControlPlaneWorkspaceDeliveryTrackUpsert) => saveWorkspaceDeliveryTrack(payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(deliveryTrackQueryKey, updated);
      setSaveError(null);
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : "Unable to save delivery track.");
    },
  });

  const currentStatus = sectionData?.status ?? status;
  const normalizedSource = normalizeSource(source);
  const normalizedDeliveryContext = normalizeDeliveryContext(deliveryContext);
  const normalizedRecentTrackKey = normalizeRecentTrackKey(recentTrackKey);
  const normalizedRecentUpdateKind = normalizeRecentUpdateKind(recentUpdateKind);
  const normalizedEvidenceCount =
    typeof evidenceCount === "number"
      ? evidenceCount
      : typeof evidenceCount === "string" && evidenceCount.trim() !== "" && !Number.isNaN(Number(evidenceCount))
        ? Number(evidenceCount)
        : null;
  const currentSurface = surface ?? sectionKey;
  const statusGuidance = getDeliveryStatusGuidance({
    status: currentStatus,
    sectionKey,
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    source,
    deliveryContext: normalizedDeliveryContext,
    recentTrackKey: normalizedRecentTrackKey,
    recentUpdateKind: normalizedRecentUpdateKind,
    evidenceCount: normalizedEvidenceCount,
  });
  const formattedUpdatedAt = useMemo(() => {
    if (!sectionData?.updated_at) {
      return "Not ready yet";
    }
    return new Date(sectionData.updated_at).toLocaleString();
  }, [sectionData?.updated_at]);

  const sanitizedEvidence = useMemo(() => {
    return evidenceLinks
      .map((link) => ({
        label: link.label.trim(),
        url: link.url.trim(),
      }))
      .filter((link) => link.label && link.url);
  }, [evidenceLinks]);

  const buildSectionInput = (
    section?: ControlPlaneWorkspaceDeliveryTrack["verification"],
  ): ControlPlaneWorkspaceDeliveryTrackUpsert["verification"] => ({
    status: section?.status ?? "pending",
    owner_user_id: section?.owner_user_id ?? null,
    notes: section?.notes ?? null,
    evidence_links: section?.evidence_links ?? [],
  });

  const otherSectionInput = buildSectionInput(otherSectionData);
  const contextCard = getContextCard({
    source: normalizedSource,
    sectionKey: currentSurface,
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    workspaceSlug,
    deliveryContext: normalizedDeliveryContext,
    metadata: {
      recentTrackKey: normalizedRecentTrackKey,
      recentUpdateKind: normalizedRecentUpdateKind,
      evidenceCount: normalizedEvidenceCount,
    },
  });

  const handleEvidenceChange = (
    index: number,
    field: keyof ControlPlaneDeliveryEvidenceLink,
    value: string,
  ) => {
    setEvidenceLinks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleEvidenceRemove = (index: number) => {
    setEvidenceLinks((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddEvidence = () => {
    setEvidenceLinks((prev) => [...prev, { label: "", url: "" }]);
  };

  const handleSave = () => {
    setSaveError(null);
    const payload: ControlPlaneWorkspaceDeliveryTrackUpsert = {
      verification:
        sectionKey === "verification"
          ? {
              status,
              owner_user_id: ownerUserId.trim() || null,
              notes: notes.trim() || null,
              evidence_links: sanitizedEvidence,
            }
          : otherSectionInput,
      go_live:
        sectionKey === "go_live"
          ? {
              status,
              owner_user_id: ownerUserId.trim() || null,
              notes: notes.trim() || null,
              evidence_links: sanitizedEvidence,
            }
          : otherSectionInput,
    };

    mutation.mutate(payload);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>{title}</span>
          <Badge variant={badgeVariant[currentStatus]}>{currentStatus.replace("_", " ")}</Badge>
        </CardTitle>
        <p className="text-xs text-muted">{description}</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant={contractSourceBadgeVariant(deliveryContractSource)}>
            {contractSourceLabel(deliveryContractSource, deliveryContractMeta?.issue ?? null)}
          </Badge>
          <p className="text-xs text-muted">
            {contractSourceDescription(deliveryContractSource, deliveryContractMeta?.issue ?? null)}
          </p>
        </div>
        {deliveryContractMeta?.issue ? (
          <p className="text-xs text-muted">Contract note: {deliveryContractMeta.issue.message}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isLoading ? <p className="text-xs text-muted">Loading delivery track...</p> : null}
        {isError ? (
          <p className="text-xs text-muted">Unable to load delivery track; cached data is still usable.</p>
        ) : null}
        {contextCard ? (
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="font-medium text-foreground">{contextCard.title}</p>
            <p className="mt-1 text-xs text-muted">{contextCard.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {contextCard.actions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                >
                  {action.label}
                </Link>
              ))}
            </div>
            {contextCard.metaLines?.length ? (
              <div className="mt-3 space-y-1">
                {contextCard.metaLines.map((line) => (
                  <p key={line} className="text-[0.65rem] text-muted">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
            {contextCard.footnote ? <p className="mt-3 text-xs text-muted">{contextCard.footnote}</p> : null}
          </div>
        ) : null}
        {statusGuidance ? (
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="font-medium text-foreground">{statusGuidance.title}</p>
            <p className="mt-1 text-xs text-muted">{statusGuidance.body}</p>
            <div className="mt-3">
              <Link
                href={statusGuidance.actionHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                {statusGuidance.actionLabel}
              </Link>
            </div>
          </div>
        ) : null}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted">Status</label>
            <select
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
              value={status}
              onChange={(event) => setStatus(event.target.value as ControlPlaneDeliveryTrackStatus)}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[0.65rem] text-muted">{deliveryStatusHint(sectionKey, currentStatus)}</p>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted">Owner user ID</label>
            <Input
              placeholder="owner_user_id"
              value={ownerUserId}
              onChange={(event) => setOwnerUserId(event.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted">Notes</label>
            <Textarea
              placeholder="Describe what was verified or what needs attention."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Evidence links</p>
              <Button type="button" variant="ghost" size="sm" onClick={handleAddEvidence}>
                + Add link
              </Button>
            </div>

            <div className="space-y-2">
              {evidenceLinks.map((link, index) => (
                <div
                  key={`${link.label}-${link.url}-${index}`}
                  className="space-y-2 rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted">Evidence {index + 1}</p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleEvidenceRemove(index)}>
                      Remove
                    </Button>
                  </div>
                  <Input
                    placeholder="Label (e.g., verification log, walkthrough note)"
                    value={link.label}
                    onChange={(event) => handleEvidenceChange(index, "label", event.target.value)}
                  />
                  <Input
                    placeholder="URL"
                    value={link.url}
                    onChange={(event) => handleEvidenceChange(index, "url", event.target.value)}
                  />
                </div>
              ))}
              {evidenceLinks.length === 0 ? (
                <p className="text-xs text-muted">No evidence links recorded yet.</p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button onClick={handleSave} disabled={mutation.isPending} aria-busy={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
          <div className="text-xs text-muted">
            {saveError ? (
              <span className="text-foreground">儲存失敗：{saveError}</span>
            ) : (
              <span>Last updated {formattedUpdatedAt}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
