import type {
  ControlPlaneAdminDeliveryUpdateKind,
  ControlPlaneAdminWeek8ReadinessFocus,
} from "@/lib/control-plane-types";
import type { AuditExportReceiptContinuityArgs } from "@/lib/audit-export-receipt";
import type { VerificationChecklistHandoffArgs } from "@/lib/handoff-query";
import { buildAdminReturnHref, buildHandoffHref } from "@/lib/handoff-query";

export type ConsoleSearchParams = Record<string, string | string[] | undefined> | undefined;

export type ConsoleHandoffSource = "admin-attention" | "admin-readiness" | "onboarding";
export type ConsoleDeliveryContext = "recent_activity" | "week8";
export type ConsoleRecentTrackKey = "verification" | "go_live";

export type ConsoleHandoffState = AuditExportReceiptContinuityArgs & {
  source: string | null;
  surface: string | null;
  runId: string | null;
  attentionWorkspace: string | null;
  attentionOrganization: string | null;
  week8Focus: string | null;
  deliveryContext: string | null;
  recentTrackKey: string | null;
  recentUpdateKind: string | null;
  evidenceCount: number | null;
  recentOwnerLabel: string | null;
  recentOwnerDisplayName: string | null;
  recentOwnerEmail: string | null;
};

export type RecentDeliveryMetadata = {
  recentTrackKey: ConsoleRecentTrackKey | null;
  recentUpdateKind: ControlPlaneAdminDeliveryUpdateKind | null;
  recentEvidenceCount: number | null;
  recentOwnerLabel: string | null;
};

export type ConsoleAdminReturnState = {
  source: "admin-attention" | "admin-readiness" | null;
  showAttentionHandoff: boolean;
  showReadinessHandoff: boolean;
  showAdminReturn: boolean;
  adminReturnLabel: string;
  adminQueueSurface: ConsoleRecentTrackKey | null;
};

export type ConsoleAdminLinkState = {
  source: "admin-attention" | "admin-readiness" | null;
  showAdminReturn: boolean;
  adminLinkLabel: string;
  adminHref: string;
  adminQueueSurface: ConsoleRecentTrackKey | null;
};

export type ConsoleAdminFollowUpPayload = {
  source: "admin-attention" | "admin-readiness";
  week8Focus?: string | null;
  attentionOrganization?: string | null;
  deliveryContext?: string | null;
  recentTrackKey?: string | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | null;
  ownerDisplayName?: string | null;
  ownerEmail?: string | null;
};

export function getConsoleParam(value?: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

export function parseConsoleEvidenceCount(value?: string | number | null): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function resolveConsoleHandoffSource(value?: string | null): ConsoleHandoffSource | null {
  if (value === "admin-attention" || value === "admin-readiness" || value === "onboarding") {
    return value;
  }
  return null;
}

export function resolveConsoleDeliveryContext(value?: string | null): ConsoleDeliveryContext | null {
  return value === "recent_activity" || value === "week8" ? value : null;
}

export function resolveConsoleRecentTrackKey(value?: string | null): ConsoleRecentTrackKey | null {
  if (value === "verification" || value === "go_live") {
    return value;
  }
  return null;
}

export function resolveConsoleRecentUpdateKind(
  value?: string | null,
): ControlPlaneAdminDeliveryUpdateKind | null {
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

export function resolveConsoleWeek8Focus(
  value?: string | null,
): ControlPlaneAdminWeek8ReadinessFocus | undefined {
  if (
    value === "baseline" ||
    value === "credentials" ||
    value === "demo_run" ||
    value === "billing_warning" ||
    value === "go_live_ready"
  ) {
    return value;
  }
  return undefined;
}

export function parseConsoleHandoffState(searchParams?: ConsoleSearchParams): ConsoleHandoffState {
  const recentOwnerDisplayName =
    getConsoleParam(searchParams?.recent_owner_display_name) ?? getConsoleParam(searchParams?.recent_owner_label);
  const recentOwnerEmail = getConsoleParam(searchParams?.recent_owner_email);

  return {
    source: getConsoleParam(searchParams?.source),
    surface: getConsoleParam(searchParams?.surface),
    runId: getConsoleParam(searchParams?.run_id) ?? getConsoleParam(searchParams?.runId),
    attentionWorkspace: getConsoleParam(searchParams?.attention_workspace),
    attentionOrganization: getConsoleParam(searchParams?.attention_organization),
    week8Focus: getConsoleParam(searchParams?.week8_focus),
    deliveryContext: getConsoleParam(searchParams?.delivery_context),
    recentTrackKey: getConsoleParam(searchParams?.recent_track_key),
    recentUpdateKind: getConsoleParam(searchParams?.recent_update_kind),
    evidenceCount: parseConsoleEvidenceCount(getConsoleParam(searchParams?.evidence_count)),
    recentOwnerLabel: recentOwnerDisplayName ?? recentOwnerEmail,
    recentOwnerDisplayName,
    recentOwnerEmail,
    auditReceiptFilename: getConsoleParam(searchParams?.audit_export_filename),
    auditReceiptExportedAt: getConsoleParam(searchParams?.audit_export_exported_at),
    auditReceiptFromDate: getConsoleParam(searchParams?.audit_export_from_date),
    auditReceiptToDate: getConsoleParam(searchParams?.audit_export_to_date),
    auditReceiptSha256: getConsoleParam(searchParams?.audit_export_sha256),
  };
}

export function buildRecentDeliveryMetadata(handoff: ConsoleHandoffState): RecentDeliveryMetadata {
  return {
    recentTrackKey: resolveConsoleRecentTrackKey(handoff.recentTrackKey),
    recentUpdateKind: resolveConsoleRecentUpdateKind(handoff.recentUpdateKind),
    recentEvidenceCount: handoff.evidenceCount,
    recentOwnerLabel: handoff.recentOwnerLabel,
  };
}

export function parseRecentDeliveryMetadata(searchParams?: ConsoleSearchParams): RecentDeliveryMetadata {
  return buildRecentDeliveryMetadata(parseConsoleHandoffState(searchParams));
}

export function resolveAdminQueueSurface(
  value?: string | null,
): ConsoleRecentTrackKey | null {
  return resolveConsoleRecentTrackKey(value === "go-live" ? "go_live" : value);
}

export function resolveConsoleAdminQueueSurface(args: {
  surface?: string | null;
  recentTrackKey?: string | null;
}): ConsoleRecentTrackKey | null {
  return resolveAdminQueueSurface(args.surface) ?? resolveConsoleRecentTrackKey(args.recentTrackKey);
}

export function buildConsoleVerificationChecklistHandoffArgs(
  handoff: ConsoleHandoffState,
): Omit<VerificationChecklistHandoffArgs, "pathname"> {
  return {
    source: resolveConsoleHandoffSource(handoff.source),
    runId: handoff.runId,
    week8Focus: handoff.week8Focus,
    attentionWorkspace: handoff.attentionWorkspace,
    attentionOrganization: handoff.attentionOrganization,
    deliveryContext: resolveConsoleDeliveryContext(handoff.deliveryContext),
    recentTrackKey: resolveConsoleRecentTrackKey(handoff.recentTrackKey),
    recentUpdateKind: resolveConsoleRecentUpdateKind(handoff.recentUpdateKind),
    evidenceCount: handoff.evidenceCount,
    recentOwnerLabel: handoff.recentOwnerLabel,
    recentOwnerDisplayName: handoff.recentOwnerDisplayName,
    recentOwnerEmail: handoff.recentOwnerEmail,
    auditReceiptFilename: handoff.auditReceiptFilename,
    auditReceiptExportedAt: handoff.auditReceiptExportedAt,
    auditReceiptFromDate: handoff.auditReceiptFromDate,
    auditReceiptToDate: handoff.auditReceiptToDate,
    auditReceiptSha256: handoff.auditReceiptSha256,
  };
}

export function buildConsoleAdminFollowUpPayload(args: {
  handoff: ConsoleHandoffState;
  ownerDisplayName?: string | null;
  ownerEmail?: string | null;
}): ConsoleAdminFollowUpPayload | null {
  const source = resolveConsoleHandoffSource(args.handoff.source);
  if (source !== "admin-attention" && source !== "admin-readiness") {
    return null;
  }

  return {
    source,
    week8Focus: source === "admin-readiness" ? args.handoff.week8Focus : undefined,
    attentionOrganization: args.handoff.attentionOrganization,
    deliveryContext: args.handoff.deliveryContext,
    recentTrackKey: args.handoff.recentTrackKey,
    recentUpdateKind: args.handoff.recentUpdateKind,
    evidenceCount: args.handoff.evidenceCount,
    ownerDisplayName: args.ownerDisplayName ?? args.handoff.recentOwnerDisplayName,
    ownerEmail: args.ownerEmail ?? args.handoff.recentOwnerEmail,
  };
}

export function buildConsoleHandoffHref(pathname: string, handoff: ConsoleHandoffState): string {
  return buildHandoffHref(
    pathname,
    {
      source: resolveConsoleHandoffSource(handoff.source),
      runId: handoff.runId,
      week8Focus: handoff.week8Focus,
      attentionWorkspace: handoff.attentionWorkspace,
      attentionOrganization: handoff.attentionOrganization,
      deliveryContext: resolveConsoleDeliveryContext(handoff.deliveryContext),
      recentTrackKey: resolveConsoleRecentTrackKey(handoff.recentTrackKey),
      recentUpdateKind: resolveConsoleRecentUpdateKind(handoff.recentUpdateKind),
      evidenceCount: handoff.evidenceCount,
      recentOwnerLabel: handoff.recentOwnerLabel,
      recentOwnerDisplayName: handoff.recentOwnerDisplayName,
      recentOwnerEmail: handoff.recentOwnerEmail,
      auditReceiptFilename: handoff.auditReceiptFilename,
      auditReceiptExportedAt: handoff.auditReceiptExportedAt,
      auditReceiptFromDate: handoff.auditReceiptFromDate,
      auditReceiptToDate: handoff.auditReceiptToDate,
      auditReceiptSha256: handoff.auditReceiptSha256,
    },
    { preserveExistingQuery: true },
  );
}

export function buildConsoleRunAwareHandoffHref(
  pathname: string,
  handoff: ConsoleHandoffState,
  runId?: string | null,
): string {
  const href = buildConsoleHandoffHref(pathname, handoff);
  return appendConsoleRunId(href, runId);
}

function appendConsoleRunId(href: string, runId?: string | null): string {
  if (!runId) {
    return href;
  }

  const [basePath, rawQuery] = href.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");
  searchParams.set("run_id", runId);
  const finalQuery = searchParams.toString();
  return finalQuery ? `${basePath}?${finalQuery}` : basePath;
}

export function buildConsoleAdminReturnState(args: {
  source?: string | null;
  surface?: string | null;
  expectedSurface: ConsoleRecentTrackKey;
  recentTrackKey?: string | null;
}): ConsoleAdminReturnState {
  const source = resolveConsoleHandoffSource(args.source);
  const normalizedSurface = resolveAdminQueueSurface(args.surface);
  const showAttentionHandoff = source === "admin-attention" && normalizedSurface === args.expectedSurface;
  const showReadinessHandoff = source === "admin-readiness";

  return {
    source: source === "admin-attention" || source === "admin-readiness" ? source : null,
    showAttentionHandoff,
    showReadinessHandoff,
    showAdminReturn: showAttentionHandoff || showReadinessHandoff,
    adminReturnLabel: showAttentionHandoff ? "Return to admin queue" : "Return to admin readiness view",
    adminQueueSurface: resolveConsoleAdminQueueSurface({
      surface: args.surface,
      recentTrackKey: args.recentTrackKey,
    }),
  };
}

export function buildConsoleAdminLinkState(args: {
  handoff: ConsoleHandoffState;
  workspaceSlug: string;
  runId?: string | null;
}): ConsoleAdminLinkState {
  const source = resolveConsoleHandoffSource(args.handoff.source);
  const isAttention = source === "admin-attention";
  const isReadiness = source === "admin-readiness";
  const adminQueueSurface = resolveConsoleAdminQueueSurface({
    surface: args.handoff.surface,
    recentTrackKey: args.handoff.recentTrackKey,
  });

  return {
    source: isAttention || isReadiness ? source : null,
    showAdminReturn: isAttention || isReadiness,
    adminLinkLabel: isAttention
      ? "Return to admin queue"
      : isReadiness
        ? "Return to admin readiness view"
        : "Open admin overview",
    adminHref:
      isAttention || isReadiness
        ? appendConsoleRunId(
            buildConsoleAdminReturnHref({
              pathname: "/admin",
              handoff: args.handoff,
              workspaceSlug: args.workspaceSlug,
              queueSurface: adminQueueSurface,
            }),
            args.runId,
          )
        : "/admin",
    adminQueueSurface,
  };
}

type BuildConsoleAdminReturnHrefArgs = {
  pathname: string;
  handoff: ConsoleHandoffState;
  workspaceSlug: string;
  queueSurface?: ConsoleRecentTrackKey | null;
};

type BuildConsoleAdminReturnHrefLegacyArgs = {
  source?: ConsoleHandoffState["source"];
  queueSurface?: ConsoleRecentTrackKey | null;
  week8Focus?: ConsoleHandoffState["week8Focus"];
  attentionWorkspace?: ConsoleHandoffState["attentionWorkspace"];
  attentionOrganization?: ConsoleHandoffState["attentionOrganization"];
  deliveryContext?: ConsoleHandoffState["deliveryContext"];
  recentUpdateKind?: ConsoleHandoffState["recentUpdateKind"];
  evidenceCount?: ConsoleHandoffState["evidenceCount"];
  recentOwnerLabel?: ConsoleHandoffState["recentOwnerLabel"];
  recentOwnerDisplayName?: ConsoleHandoffState["recentOwnerDisplayName"];
  recentOwnerEmail?: ConsoleHandoffState["recentOwnerEmail"];
  auditReceiptFilename?: ConsoleHandoffState["auditReceiptFilename"];
  auditReceiptExportedAt?: ConsoleHandoffState["auditReceiptExportedAt"];
  auditReceiptFromDate?: ConsoleHandoffState["auditReceiptFromDate"];
  auditReceiptToDate?: ConsoleHandoffState["auditReceiptToDate"];
  auditReceiptSha256?: ConsoleHandoffState["auditReceiptSha256"];
};

export function buildConsoleAdminReturnHref(args: BuildConsoleAdminReturnHrefArgs): string;
export function buildConsoleAdminReturnHref(
  pathname: string,
  args: BuildConsoleAdminReturnHrefLegacyArgs,
): string;
export function buildConsoleAdminReturnHref(
  argsOrPathname: BuildConsoleAdminReturnHrefArgs | string,
  legacyArgs?: BuildConsoleAdminReturnHrefLegacyArgs,
): string {
  if (typeof argsOrPathname === "string") {
    return buildAdminReturnHref(argsOrPathname, {
      source: resolveConsoleHandoffSource(legacyArgs?.source),
      queueSurface: legacyArgs?.queueSurface ?? null,
      week8Focus: legacyArgs?.week8Focus ?? null,
      attentionWorkspace: legacyArgs?.attentionWorkspace ?? null,
      attentionOrganization: legacyArgs?.attentionOrganization ?? null,
      deliveryContext: resolveConsoleDeliveryContext(legacyArgs?.deliveryContext),
      recentUpdateKind: resolveConsoleRecentUpdateKind(legacyArgs?.recentUpdateKind),
      evidenceCount: legacyArgs?.evidenceCount ?? null,
      recentOwnerLabel: legacyArgs?.recentOwnerLabel ?? null,
      recentOwnerDisplayName: legacyArgs?.recentOwnerDisplayName ?? null,
      recentOwnerEmail: legacyArgs?.recentOwnerEmail ?? null,
      auditReceiptFilename: legacyArgs?.auditReceiptFilename ?? null,
      auditReceiptExportedAt: legacyArgs?.auditReceiptExportedAt ?? null,
      auditReceiptFromDate: legacyArgs?.auditReceiptFromDate ?? null,
      auditReceiptToDate: legacyArgs?.auditReceiptToDate ?? null,
      auditReceiptSha256: legacyArgs?.auditReceiptSha256 ?? null,
    });
  }

  const args = argsOrPathname;
  const source = resolveConsoleHandoffSource(args.handoff.source);
  const adminSource = source === "admin-attention" || source === "admin-readiness" ? source : null;

  return appendConsoleRunId(
    buildAdminReturnHref(args.pathname, {
      source: adminSource,
      queueSurface:
        args.queueSurface ??
        resolveConsoleAdminQueueSurface({
          surface: args.handoff.surface,
          recentTrackKey: args.handoff.recentTrackKey,
        }),
      week8Focus: args.handoff.week8Focus,
      attentionWorkspace: args.handoff.attentionWorkspace ?? args.workspaceSlug,
      attentionOrganization: args.handoff.attentionOrganization,
      deliveryContext: resolveConsoleDeliveryContext(args.handoff.deliveryContext),
      recentUpdateKind: resolveConsoleRecentUpdateKind(args.handoff.recentUpdateKind),
      evidenceCount: args.handoff.evidenceCount,
      recentOwnerLabel: args.handoff.recentOwnerLabel,
      recentOwnerDisplayName: args.handoff.recentOwnerDisplayName,
      recentOwnerEmail: args.handoff.recentOwnerEmail,
      auditReceiptFilename: args.handoff.auditReceiptFilename,
      auditReceiptExportedAt: args.handoff.auditReceiptExportedAt,
      auditReceiptFromDate: args.handoff.auditReceiptFromDate,
      auditReceiptToDate: args.handoff.auditReceiptToDate,
      auditReceiptSha256: args.handoff.auditReceiptSha256,
    }),
    args.handoff.runId,
  );
}

function formatTrackLabel(trackKey?: ConsoleRecentTrackKey | null): string | null {
  if (trackKey === "go_live") {
    return "Go-live track";
  }
  if (trackKey === "verification") {
    return "Verification track";
  }
  return null;
}

function describeUpdateKind(kind?: ControlPlaneAdminDeliveryUpdateKind | null): string | null {
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
      return null;
  }
}

export function buildRecentDeliveryDescription(
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
