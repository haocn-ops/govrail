import Link from "next/link";

import { AdminFollowUpNotice } from "@/components/admin/admin-follow-up-notice";
import { WorkspaceDeliveryTrackPanel } from "@/components/delivery/workspace-delivery-track-panel";
import { PageHeader } from "@/components/page-header";
import { Week8VerificationChecklist } from "@/components/verification/week8-verification-checklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildAdminReturnHref, buildVerificationChecklistHandoffHref } from "@/lib/handoff-query";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function getParam(value?: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

type RecentDeliveryMetadata = {
  recentTrackKey: string | null;
  recentUpdateKind: string | null;
  recentEvidenceCount: number | null;
  recentOwnerLabel: string | null;
};

function parseRecentDeliveryMetadata(
  searchParams?: Record<string, string | string[] | undefined>,
): RecentDeliveryMetadata {
  const recentEvidenceCountValue = getParam(searchParams?.recent_evidence_count);
  const parsedEvidence = recentEvidenceCountValue ? Number(recentEvidenceCountValue) : null;
  return {
    recentTrackKey: getParam(searchParams?.recent_track_key),
    recentUpdateKind: getParam(searchParams?.recent_update_kind),
    recentEvidenceCount:
      typeof parsedEvidence === "number" && !Number.isNaN(parsedEvidence) ? parsedEvidence : null,
    recentOwnerLabel: getParam(searchParams?.recent_owner_label),
  };
}

function formatTrackLabel(trackKey?: string | null): string | null {
  if (trackKey === "go_live") {
    return "Go-live track";
  }
  if (trackKey === "verification") {
    return "Verification track";
  }
  return null;
}

function describeUpdateKind(kind?: string | null): string | null {
  switch (kind) {
    case "verification":
      return "Verification tracking refreshed";
    case "go_live":
      return "Go-live tracking refreshed";
    case "verification_completed":
      return "Verification completed";
    case "go_live_completed":
      return "Go-live completed";
    case "evidence_only":
      return "Evidence added";
    default:
      return kind ? kind.replaceAll("_", " ") : null;
  }
}

function buildRecentDeliveryDescription(
  base: string,
  metadata: RecentDeliveryMetadata,
): string {
  const parts: string[] = [];
  const trackLabel = formatTrackLabel(metadata.recentTrackKey);
  if (trackLabel) {
    parts.push(trackLabel);
  }
  const updateLabel = describeUpdateKind(metadata.recentUpdateKind);
  if (updateLabel) {
    parts.push(updateLabel);
  }
  if (metadata.recentEvidenceCount != null) {
    parts.push(
      `${metadata.recentEvidenceCount} evidence ${metadata.recentEvidenceCount === 1 ? "item" : "items"}`,
    );
  }
  if (metadata.recentOwnerLabel) {
    parts.push(`handled by ${metadata.recentOwnerLabel}`);
  }

  if (parts.length === 0) {
    return base;
  }
  return `${base} Latest admin handoff: ${parts.join(" · ")}.`;
}

export default async function VerificationPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoffSource = getParam(searchParams?.source);
  const handoffSurface = getParam(searchParams?.surface);
  const handoffWorkspace = getParam(searchParams?.attention_workspace);
  const handoffOrganization = getParam(searchParams?.attention_organization);
  const week8Focus = getParam(searchParams?.week8_focus);
  const deliveryContext = getParam(searchParams?.delivery_context);
  const recentTrackKey = getParam(searchParams?.recent_track_key);
  const recentUpdateKind = getParam(searchParams?.recent_update_kind);
  const evidenceCountParam = getParam(searchParams?.evidence_count);
  const recentOwnerDisplayName =
    getParam(searchParams?.recent_owner_display_name) ?? getParam(searchParams?.recent_owner_label);
  const recentOwnerEmail = getParam(searchParams?.recent_owner_email);
  const evidenceCount =
    evidenceCountParam && !Number.isNaN(Number(evidenceCountParam))
      ? Number(evidenceCountParam)
      : null;
  const recentDeliveryMetadata: RecentDeliveryMetadata = {
    recentTrackKey,
    recentUpdateKind,
    recentEvidenceCount: evidenceCount,
    recentOwnerLabel: recentOwnerDisplayName ?? recentOwnerEmail,
  };
  const verificationDeliveryBase =
    "Persist the current verification status, owner, notes, and evidence references for this workspace.";
  const verificationDeliveryDescription = buildRecentDeliveryDescription(
    verificationDeliveryBase,
    recentDeliveryMetadata,
  );
  const showAttentionHandoff = handoffSource === "admin-attention" && handoffSurface === "verification";
  const showReadinessHandoff = handoffSource === "admin-readiness";
  const showAdminReturn = showAttentionHandoff || showReadinessHandoff;
  const adminReturnLabel = showAttentionHandoff ? "Return to admin queue" : "Return to admin readiness view";
  const adminQueueSurface =
    handoffSurface === "verification" || handoffSurface === "go_live"
      ? handoffSurface
      : recentTrackKey === "verification" || recentTrackKey === "go_live"
        ? recentTrackKey
        : null;
  const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>[0], "pathname"> = {
    source:
      handoffSource === "admin-attention" || handoffSource === "admin-readiness" || handoffSource === "onboarding"
        ? handoffSource
        : null,
    week8Focus,
    attentionWorkspace: handoffWorkspace,
    attentionOrganization: handoffOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel: recentOwnerDisplayName ?? recentOwnerEmail,
  };
  const adminReturnHref = buildAdminReturnHref("/admin", {
    source:
      handoffSource === "admin-attention" || handoffSource === "admin-readiness" ? handoffSource : null,
    queueSurface: adminQueueSurface,
    week8Focus,
    attentionWorkspace: handoffWorkspace ?? workspaceContext.workspace.slug,
    attentionOrganization: handoffOrganization,
    deliveryContext: deliveryContext === "recent_activity" ? deliveryContext : null,
    recentUpdateKind:
      recentUpdateKind === "verification" ||
      recentUpdateKind === "go_live" ||
      recentUpdateKind === "verification_completed" ||
      recentUpdateKind === "go_live_completed" ||
      recentUpdateKind === "evidence_only"
        ? recentUpdateKind
        : null,
    evidenceCount,
    recentOwnerLabel: recentOwnerDisplayName ?? recentOwnerEmail,
  });

  return (
    <div className="space-y-8">
      {showAttentionHandoff ? (
        <AdminFollowUpNotice
          source="admin-attention"
          surface="verification"
          workspaceSlug={workspaceContext.workspace.slug}
          sourceWorkspaceSlug={handoffWorkspace}
          attentionOrganization={handoffOrganization}
          deliveryContext={deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={recentUpdateKind}
          evidenceCount={evidenceCount}
          ownerDisplayName={recentOwnerDisplayName}
          ownerEmail={recentOwnerEmail}
        />
      ) : null}
      {showReadinessHandoff ? (
        <AdminFollowUpNotice
          source="admin-readiness"
          surface="verification"
          workspaceSlug={workspaceContext.workspace.slug}
          sourceWorkspaceSlug={handoffWorkspace}
          week8Focus={week8Focus}
          attentionOrganization={handoffOrganization}
          deliveryContext={deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={recentUpdateKind}
          evidenceCount={evidenceCount}
          ownerDisplayName={recentOwnerDisplayName}
          ownerEmail={recentOwnerEmail}
        />
      ) : null}
      <PageHeader
        eyebrow="Verification"
        title="Week 8 launch checklist"
        description="Walk through onboarding, billing posture, first-run validation, and evidence capture before treating a workspace as ready for a mock go-live drill."
      />
      <Card>
        <CardHeader>
          <CardTitle>Verification evidence lane</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Keep verification grounded in the current workspace session:{" "}
            <span className="font-medium text-foreground">{workspaceContext.workspace.slug}</span> via{" "}
            <span className="font-medium text-foreground">{workspaceContext.source_detail.label}</span>. This page is
            the manual point where onboarding, billing posture, first-run evidence, and go-live preparation are tied
            into one audit trail.
          </p>
          <p>
            Use the links below to revisit the original run context, confirm the usage signal, review settings and
            billing posture, then continue into the mock go-live rehearsal. Nothing here triggers automation or changes
            identity.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/playground", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review playground run
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/usage", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Confirm usage signal
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/settings", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review settings + billing
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/artifacts", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review artifacts evidence
            </Link>
            <Link
              href={buildVerificationChecklistHandoffHref({ pathname: "/go-live?surface=go_live", ...handoffHrefArgs })}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Continue to go-live drill
            </Link>
            {showAdminReturn ? (
              <Link
                href={adminReturnHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
              >
                {adminReturnLabel}
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Week8VerificationChecklist
        workspaceSlug={workspaceContext.workspace.slug}
        source={handoffSource}
        week8Focus={week8Focus}
        attentionWorkspace={handoffWorkspace}
        attentionOrganization={handoffOrganization}
        deliveryContext={deliveryContext}
        recentTrackKey={recentTrackKey}
        recentUpdateKind={recentUpdateKind}
        evidenceCount={evidenceCount}
        recentOwnerLabel={recentOwnerDisplayName ?? recentOwnerEmail}
      />
      <WorkspaceDeliveryTrackPanel
        workspaceSlug={workspaceContext.workspace.slug}
        sectionKey="verification"
        title="Verification delivery notes"
        description={verificationDeliveryDescription}
        source={handoffSource}
        surface="verification"
        week8Focus={week8Focus}
        attentionWorkspace={handoffWorkspace}
        attentionOrganization={handoffOrganization}
        deliveryContext={deliveryContext}
        recentTrackKey={recentTrackKey}
        recentUpdateKind={recentUpdateKind}
        evidenceCount={evidenceCount}
      />
    </div>
  );
}
