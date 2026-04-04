import Link from "next/link";

import { AdminFollowUpNotice } from "@/components/admin/admin-follow-up-notice";
import { MockGoLiveDrillPanel } from "@/components/go-live/mock-go-live-drill-panel";
import { PageHeader } from "@/components/page-header";
import { WorkspaceDeliveryTrackPanel } from "@/components/delivery/workspace-delivery-track-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildAdminReturnHref, buildHandoffHref } from "@/lib/handoff-query";
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

type RecentOwnerDetail = {
  displayName: string | null;
  email: string | null;
};

function parseRecentDeliveryMetadata(
  searchParams?: Record<string, string | string[] | undefined>,
): RecentDeliveryMetadata & RecentOwnerDetail {
  const recentTrackKey = getParam(searchParams?.recent_track_key);
  const recentUpdateKind = getParam(searchParams?.recent_update_kind);
  const evidenceCountParam = getParam(searchParams?.evidence_count);
  const ownerDisplayName =
    getParam(searchParams?.recent_owner_display_name) ?? getParam(searchParams?.recent_owner_label);
  const ownerEmail = getParam(searchParams?.recent_owner_email);
  const evidenceCount =
    evidenceCountParam !== null && !Number.isNaN(Number(evidenceCountParam))
      ? Number(evidenceCountParam)
      : null;

  return {
    recentTrackKey,
    recentUpdateKind,
    recentEvidenceCount: evidenceCount,
    recentOwnerLabel: ownerDisplayName ?? ownerEmail,
    displayName: ownerDisplayName,
    email: ownerEmail,
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

function buildGoLiveHref(args: {
  pathname: string;
  source: string | null;
  week8Focus: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  deliveryContext?: string | null;
  recentTrackKey?: string | null;
  recentUpdateKind?: string | null;
  evidenceCount?: string | null;
  recentOwnerDisplayName?: string | null;
  recentOwnerEmail?: string | null;
}): string {
  return buildHandoffHref(args.pathname, {
    source: args.source,
    week8Focus: args.week8Focus,
    attentionWorkspace: args.attentionWorkspace,
    attentionOrganization: args.attentionOrganization,
    deliveryContext: args.deliveryContext,
    recentTrackKey: args.recentTrackKey,
    recentUpdateKind: args.recentUpdateKind,
    evidenceCount: args.evidenceCount,
    recentOwnerDisplayName: args.recentOwnerDisplayName,
    recentOwnerEmail: args.recentOwnerEmail,
  }, { preserveExistingQuery: true });
}

export default async function GoLivePage({
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
  const goLiveMetadata = parseRecentDeliveryMetadata(searchParams);
  const recentTrackKey = goLiveMetadata.recentTrackKey;
  const recentUpdateKind = goLiveMetadata.recentUpdateKind;
  const recentEvidenceCount = goLiveMetadata.recentEvidenceCount;
  const recentOwnerDisplayName = goLiveMetadata.displayName;
  const recentOwnerEmail = goLiveMetadata.email;
  const recentEvidenceCountParam =
    recentEvidenceCount != null ? String(recentEvidenceCount) : null;
  const showAttentionHandoff = handoffSource === "admin-attention" && handoffSurface === "go_live";
  const showReadinessHandoff = handoffSource === "admin-readiness";
  const showAdminReturn = showAttentionHandoff || showReadinessHandoff;
  const adminReturnLabel = showAttentionHandoff ? "Return to admin queue" : "Return to admin readiness view";
  const adminQueueSurface =
    handoffSurface === "verification" || handoffSurface === "go_live"
      ? handoffSurface
      : recentTrackKey === "verification" || recentTrackKey === "go_live"
        ? recentTrackKey
        : null;
  const goLiveDeliveryBase =
    "Track go-live drill status, experiments, and evidence references for this workspace.";
  const goLiveDeliveryDescription = buildRecentDeliveryDescription(goLiveDeliveryBase, goLiveMetadata);
  const verificationHref = buildGoLiveHref({
    pathname: "/verification?surface=verification",
    source: handoffSource,
    week8Focus,
    attentionWorkspace: handoffWorkspace,
    attentionOrganization: handoffOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount: recentEvidenceCountParam,
    recentOwnerDisplayName,
    recentOwnerEmail,
  });
  const usageHref = buildGoLiveHref({
    pathname: "/usage",
    source: handoffSource,
    week8Focus,
    attentionWorkspace: handoffWorkspace,
    attentionOrganization: handoffOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount: recentEvidenceCountParam,
    recentOwnerDisplayName,
    recentOwnerEmail,
  });
  const settingsHref = buildGoLiveHref({
    pathname: "/settings",
    source: handoffSource,
    week8Focus,
    attentionWorkspace: handoffWorkspace,
    attentionOrganization: handoffOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount: recentEvidenceCountParam,
    recentOwnerDisplayName,
    recentOwnerEmail,
  });
  const playgroundHref = buildGoLiveHref({
    pathname: "/playground",
    source: handoffSource,
    week8Focus,
    attentionWorkspace: handoffWorkspace,
    attentionOrganization: handoffOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount: recentEvidenceCountParam,
    recentOwnerDisplayName,
    recentOwnerEmail,
  });
  const artifactsHref = buildGoLiveHref({
    pathname: "/artifacts",
    source: handoffSource,
    week8Focus,
    attentionWorkspace: handoffWorkspace,
    attentionOrganization: handoffOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount: recentEvidenceCountParam,
    recentOwnerDisplayName,
    recentOwnerEmail,
  });
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
    evidenceCount: recentEvidenceCount,
    recentOwnerLabel: recentOwnerDisplayName ?? recentOwnerEmail,
    recentOwnerDisplayName,
    recentOwnerEmail,
  });
  const adminHref = showAdminReturn ? adminReturnHref : "/admin";
  const adminLinkLabel = showAdminReturn ? adminReturnLabel : "Admin overview";

  return (
    <div className="space-y-8">
      {showAttentionHandoff ? (
        <AdminFollowUpNotice
          source="admin-attention"
          surface="go_live"
          workspaceSlug={workspaceContext.workspace.slug}
          sourceWorkspaceSlug={handoffWorkspace}
          attentionOrganization={handoffOrganization}
          deliveryContext={deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={recentUpdateKind}
          evidenceCount={recentEvidenceCount}
          ownerDisplayName={recentOwnerDisplayName}
          ownerEmail={recentOwnerEmail}
        />
      ) : null}
      {showReadinessHandoff ? (
        <AdminFollowUpNotice
          source="admin-readiness"
          surface="go_live"
          workspaceSlug={workspaceContext.workspace.slug}
          sourceWorkspaceSlug={handoffWorkspace}
          week8Focus={week8Focus}
          attentionOrganization={handoffOrganization}
          deliveryContext={deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={recentUpdateKind}
          evidenceCount={recentEvidenceCount}
          ownerDisplayName={recentOwnerDisplayName}
          ownerEmail={recentOwnerEmail}
      />
      ) : null}
      <PageHeader
        eyebrow="Go-live"
        title="Mock go-live drill"
        description="Run a staged rehearsal using existing onboarding, billing, run, and evidence surfaces. This page guides a mock drill only and does not trigger automation."
      />
      <Card>
        <CardHeader>
          <CardTitle>Session-aware drill lane</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Rehearse the drill inside the active workspace session for{" "}
            <span className="font-medium text-foreground">{workspaceContext.workspace.slug}</span>. Current context
            source: <span className="font-medium text-foreground">{workspaceContext.source_detail.label}</span>.
          </p>
          <p>
            This lane stays manual: revisit verification evidence, confirm usage pressure and billing posture, then log
            drill notes here. Navigation context is preserved across surfaces, but no step is executed automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={verificationHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen verification evidence
            </Link>
            <Link
              href={usageHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Confirm usage posture
            </Link>
            <Link
              href={settingsHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review billing + settings
            </Link>
            <Link
              href={playgroundHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Revisit playground run
            </Link>
            <Link
              href={artifactsHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Inspect artifacts evidence
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
      <Card>
        <CardHeader>
          <CardTitle>Governance recap</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Use this drill surface once the verification checklist, billing posture, and usage pressure have been
            reviewed. Keep the same workspace context, capture evidence in
            <Link
              href={verificationHref}
            >
              Verification
            </Link>
            , collect the usage trace via{" "}
            <Link
              href={usageHref}
            >
              Usage
            </Link>
            , inspect the concrete bundle in <Link href={artifactsHref}>Artifacts</Link>, and record the experiment
            notes in the delivery tracker here before ending the loop in <Link href={adminHref}>{adminLinkLabel}</Link>.
            These links only steer the navigation; they do not impersonate the admin or automate any step.
          </p>
        </CardContent>
      </Card>
      <MockGoLiveDrillPanel
        workspaceSlug={workspaceContext.workspace.slug}
        source={handoffSource}
        week8Focus={week8Focus}
        attentionWorkspace={handoffWorkspace}
        attentionOrganization={handoffOrganization}
        deliveryContext={deliveryContext}
        recentTrackKey={recentTrackKey}
        recentUpdateKind={recentUpdateKind}
        evidenceCount={recentEvidenceCount}
        recentOwnerLabel={recentOwnerDisplayName ?? recentOwnerEmail}
      />
      <WorkspaceDeliveryTrackPanel
        workspaceSlug={workspaceContext.workspace.slug}
        sectionKey="go_live"
        title="Go-live delivery notes"
        description={goLiveDeliveryDescription}
        source={handoffSource}
        surface="go_live"
        week8Focus={week8Focus}
        attentionWorkspace={handoffWorkspace}
        attentionOrganization={handoffOrganization}
        deliveryContext={deliveryContext}
        recentTrackKey={recentTrackKey}
        recentUpdateKind={recentUpdateKind}
        evidenceCount={recentEvidenceCount}
      />
    </div>
  );
}
