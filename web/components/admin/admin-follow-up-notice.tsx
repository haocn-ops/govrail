"use client";

import Link from "next/link";

import { AuditExportReceiptCallout } from "@/components/audit-export-receipt-callout";
import type {
  ControlPlaneAdminDeliveryUpdateKind,
  ControlPlaneAdminWeek8ReadinessFocus,
} from "@/lib/control-plane-types";
import { resolveAuditExportReceiptSummary } from "@/lib/audit-export-receipt";
import { buildConsoleHandoffHref, type ConsoleHandoffState } from "@/lib/console-handoff";
import { buildAdminReturnHref } from "@/lib/handoff-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type AdminFollowUpSurface =
  | "onboarding"
  | "members"
  | "settings"
  | "verification"
  | "go_live"
  | "usage"
  | "playground"
  | "artifacts"
  | "logs"
  | "agents"
  | "egress"
  | "tasks"
  | "launchpad"
  | "api-keys"
  | "service-accounts";
export type AdminFollowUpSource = "admin-attention" | "admin-readiness";

type RecentDeliveryContext = {
  recentTrackKey?: "verification" | "go_live" | null;
  recentUpdateKind?: ControlPlaneAdminDeliveryUpdateKind | null;
  evidenceCount?: number | null;
  ownerDisplayName?: string | null;
  ownerEmail?: string | null;
};

function normalizeDeliveryContext(value?: string | null): "recent_activity" | "week8" | null {
  return value === "recent_activity" || value === "week8" ? value : null;
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

function normalizeEvidenceCount(value?: number | string | null): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function surfaceLabel(surface: AdminFollowUpSurface): string {
  if (surface === "go_live") {
    return "Go-live";
  }
  if (surface === "settings") {
    return "Settings";
  }
  if (surface === "usage") {
    return "Usage";
  }
  if (surface === "playground") {
    return "Playground";
  }
  if (surface === "members") {
    return "Members";
  }
  if (surface === "artifacts") {
    return "Artifacts";
  }
  if (surface === "logs") {
    return "Logs";
  }
  if (surface === "agents") {
    return "Agents";
  }
  if (surface === "egress") {
    return "Egress";
  }
  if (surface === "tasks") {
    return "Tasks";
  }
  if (surface === "launchpad") {
    return "Launchpad";
  }
  if (surface === "api-keys") {
    return "API keys";
  }
  if (surface === "service-accounts") {
    return "Service accounts";
  }
  if (surface === "onboarding") {
    return "Onboarding";
  }
  return "Verification";
}

function formatDeliveryOwnerLabel(displayName?: string | null, email?: string | null): string | null {
  if (displayName) {
    return displayName;
  }
  if (email) {
    return email;
  }
  return null;
}

function deliveryTrackLabel(track?: "verification" | "go_live" | null): string {
  if (track === "go_live") {
    return "go-live";
  }
  return "verification";
}

function followUpSourceLabel(source: AdminFollowUpSource): string {
  return source === "admin-readiness" ? "Week 8 readiness" : "Attention queue";
}

function normalizeWeek8Focus(value?: string | null): ControlPlaneAdminWeek8ReadinessFocus | null {
  if (
    value === "baseline" ||
    value === "credentials" ||
    value === "demo_run" ||
    value === "billing_warning" ||
    value === "go_live_ready"
  ) {
    return value;
  }
  return null;
}

function week8FocusLabel(focus: ControlPlaneAdminWeek8ReadinessFocus): string {
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

function describeRecentDeliveryContext(context: RecentDeliveryContext): string | null {
  if (!context.recentTrackKey && !context.recentUpdateKind && context.evidenceCount == null && !context.ownerDisplayName && !context.ownerEmail) {
    return null;
  }

  const ownerLabel = formatDeliveryOwnerLabel(context.ownerDisplayName, context.ownerEmail);
  const trackLabel = deliveryTrackLabel(context.recentTrackKey);
  const evidenceText =
    context.evidenceCount != null
      ? context.evidenceCount > 0
        ? `${context.evidenceCount} evidence ${context.evidenceCount === 1 ? "link" : "links"} recorded`
        : "No evidence links yet"
      : null;

  let updatePhrase = "";
  if (context.recentUpdateKind === "verification_completed" || context.recentUpdateKind === "go_live_completed") {
    updatePhrase = "marked complete";
  } else if (context.recentUpdateKind === "evidence_only") {
    updatePhrase = "evidence was added";
  } else if (context.recentUpdateKind === "go_live" || context.recentUpdateKind === "verification") {
    updatePhrase = "tracking was refreshed";
  }

  const details: string[] = [];
  if (ownerLabel) {
    details.push(`Last updated by ${ownerLabel}`);
  }
  if (updatePhrase) {
    details.push(`${trackLabel} track ${updatePhrase}`);
  } else if (context.recentTrackKey) {
    details.push(`Recent activity on the ${trackLabel} surface`);
  }
  if (evidenceText) {
    details.push(evidenceText);
  }

  if (details.length === 0) {
    return null;
  }

  return `${details.join(" · ")}.`;
}

export function AdminFollowUpNotice({
  source,
  workspaceSlug,
  sourceWorkspaceSlug,
  runId,
  surface,
  week8Focus,
  attentionOrganization,
  deliveryContext,
  recentTrackKey,
  recentUpdateKind,
  evidenceCount,
  ownerDisplayName,
  ownerEmail,
  auditReceiptFilename,
  auditReceiptExportedAt,
  auditReceiptFromDate,
  auditReceiptToDate,
  auditReceiptSha256,
}: {
  source: AdminFollowUpSource;
  workspaceSlug: string;
  sourceWorkspaceSlug: string | null;
  runId?: string | null;
  surface: AdminFollowUpSurface;
  week8Focus?: string | null;
  attentionOrganization?: string | null;
  deliveryContext?: string | null;
  recentTrackKey?: string | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | string | null;
  ownerDisplayName?: string | null;
  ownerEmail?: string | null;
  auditReceiptFilename?: string | null;
  auditReceiptExportedAt?: string | null;
  auditReceiptFromDate?: string | null;
  auditReceiptToDate?: string | null;
  auditReceiptSha256?: string | null;
}) {
  const safeAttentionWorkspace =
    sourceWorkspaceSlug && sourceWorkspaceSlug.trim() !== "" ? sourceWorkspaceSlug : null;
  const currentWorkspaceMatches =
    !sourceWorkspaceSlug || sourceWorkspaceSlug.trim() === "" || sourceWorkspaceSlug === workspaceSlug;
  const returnWorkspaceSlug = sourceWorkspaceSlug && sourceWorkspaceSlug.trim() !== "" ? sourceWorkspaceSlug : workspaceSlug;
  const isReadinessFlow = source === "admin-readiness";
  const description = isReadinessFlow
    ? "You navigated here via the admin Week 8 readiness summary. Continue the targeted onboarding, billing, verification, or go-live review for this workspace, capture the outcome on that surface, then return to the filtered admin readiness view. This is navigation-only context and does not change identity, impersonate a member, or automate remediation."
    : "You navigated here via the admin attention queue. Continue the manual delivery follow-up in this workspace, capture the evidence or note on the opened surface, then return to the filtered queue view. This is navigation-only context and does not change identity, impersonate a member, or automate remediation.";
  const normalizedDeliveryContext = normalizeDeliveryContext(deliveryContext);
  const normalizedRecentTrackKey = normalizeRecentTrackKey(recentTrackKey);
  const normalizedRecentUpdateKind = normalizeRecentUpdateKind(recentUpdateKind);
  const normalizedEvidenceCount = normalizeEvidenceCount(evidenceCount);
  const normalizedWeek8Focus = normalizeWeek8Focus(week8Focus);
  const auditExportReceipt = resolveAuditExportReceiptSummary({
    auditReceiptFilename,
    auditReceiptExportedAt,
    auditReceiptFromDate,
    auditReceiptToDate,
    auditReceiptSha256,
  });
  const recentContextDescription =
    normalizedDeliveryContext === "recent_activity"
      ? describeRecentDeliveryContext({
          recentTrackKey: normalizedRecentTrackKey,
          recentUpdateKind: normalizedRecentUpdateKind,
          evidenceCount: normalizedEvidenceCount,
          ownerDisplayName,
          ownerEmail,
        })
      : null;
  const recentOwnerLabel = formatDeliveryOwnerLabel(ownerDisplayName, ownerEmail);
  const handoffState: ConsoleHandoffState = {
    source,
    surface,
    runId: runId ?? null,
    attentionWorkspace: safeAttentionWorkspace,
    attentionOrganization: attentionOrganization ?? null,
    week8Focus: week8Focus ?? null,
    deliveryContext: deliveryContext ?? null,
    recentTrackKey: recentTrackKey ?? null,
    recentUpdateKind: recentUpdateKind ?? null,
    evidenceCount: normalizedEvidenceCount,
    recentOwnerLabel,
    recentOwnerDisplayName: ownerDisplayName ?? null,
    recentOwnerEmail: ownerEmail ?? null,
  };
  const baseReturnLabel = isReadinessFlow ? "Return to admin readiness view" : "Return to admin queue";
  const trackLabel = normalizedRecentTrackKey ? deliveryTrackLabel(normalizedRecentTrackKey) : null;
  const returnLabel = trackLabel ? `${baseReturnLabel} (continue ${trackLabel})` : baseReturnLabel;
  const queueSurface =
    surface === "verification" || surface === "go_live" ? surface : normalizedRecentTrackKey ?? null;
  const returnHref = buildAdminReturnHref("/admin", {
    source,
    runId,
    queueSurface,
    week8Focus,
    attentionWorkspace: returnWorkspaceSlug,
    attentionOrganization,
    deliveryContext: normalizedDeliveryContext,
    recentTrackKey: normalizedRecentTrackKey,
    recentUpdateKind: normalizedRecentUpdateKind,
    evidenceCount: normalizedEvidenceCount,
    recentOwnerLabel,
    recentOwnerDisplayName: ownerDisplayName ?? null,
    recentOwnerEmail: ownerEmail ?? null,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>Admin follow-up context</span>
          <Badge variant="default">{surfaceLabel(surface)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted">{description}</p>
        <div className="rounded-xl border border-border bg-background p-3 text-xs text-muted">
          <p className="font-medium text-foreground">Audit export continuity</p>
          <p>
            Reuse the same Latest export receipt from <code className="font-mono">/settings</code> so the filename,
            filters, and SHA-256 stay chained from settings through verification, go-live, and back into this admin
            handoff. This manual evidence relay is navigation-only; open the receipt, carry the proof in the workspace surfaces, and then return here to complete the queue or readiness loop.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={buildConsoleHandoffHref("/settings?intent=upgrade", handoffState)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen audit export receipt
            </Link>
            <Link
              href={buildConsoleHandoffHref("/verification?surface=verification", handoffState)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen verification evidence
            </Link>
          </div>
          {auditExportReceipt ? (
            <div className="mt-3">
              <AuditExportReceiptCallout
                receipt={auditExportReceipt}
                title="Audit export continuity"
                description="Keep the same receipt visible in the admin handoff so the final queue or readiness review cites the same export already used in verification and go-live."
              />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="subtle">{followUpSourceLabel(source)}</Badge>
          {isReadinessFlow && normalizedWeek8Focus ? (
            <Badge variant="default">Focus {week8FocusLabel(normalizedWeek8Focus)}</Badge>
          ) : null}
          <Badge variant={currentWorkspaceMatches ? "strong" : "default"}>
            {currentWorkspaceMatches ? "Workspace aligned" : "Workspace check needed"}
          </Badge>
        </div>
        {recentContextDescription ? (
          <p className="text-xs text-muted">{recentContextDescription}</p>
        ) : null}
        <p className="text-xs text-muted">
          Current workspace: <span className="font-medium text-foreground">{workspaceSlug}</span>
          {sourceWorkspaceSlug ? (
            <>
              {" "}
              · Requested from admin: <span className="font-medium text-foreground">{sourceWorkspaceSlug}</span>
            </>
          ) : null}
          {isReadinessFlow && week8Focus ? (
            <>
              {" "}
              · Week 8 focus:{" "}
              <span className="font-medium text-foreground">
                {normalizedWeek8Focus ? week8FocusLabel(normalizedWeek8Focus) : week8Focus}
              </span>
            </>
          ) : null}
        </p>
        <p className="text-xs text-muted">
          Treat this as the manual admin → workspace surface → admin loop: follow the requested surface, capture
          evidence or outcome notes there, then use the return link below to restore the admin context and keep the
          focus state aligned.
        </p>
        {!currentWorkspaceMatches ? (
          <p className="text-xs text-foreground">
            The current workspace does not match the requested admin follow-up target. Double-check the workspace
            switcher before updating delivery tracking.
          </p>
        ) : null}
        <div className="mt-2">
          <Link
            href={returnHref}
            className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-background"
          >
            {returnLabel}
          </Link>
        </div>
        <p className="text-[0.7rem] text-muted">
          Returning keeps the same admin filter state in place so the operator can continue the governance review
          without rerunning the drill-down manually.
        </p>
      </CardContent>
    </Card>
  );
}
