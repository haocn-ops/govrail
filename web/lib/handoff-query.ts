import type { AuditExportReceiptContinuityArgs } from "@/lib/audit-export-receipt";

export type HandoffQueryArgs = AuditExportReceiptContinuityArgs & {
  source?: string | null;
  surface?: string | null;
  runId?: string | null;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  deliveryContext?: string | null;
  recentTrackKey?: string | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | string | null;
  recentOwnerLabel?: string | null;
  recentOwnerDisplayName?: string | null;
  recentOwnerEmail?: string | null;
};

export type AdminReturnQueryArgs = AuditExportReceiptContinuityArgs & {
  source?: string | null;
  runId?: string | null;
  queueSurface?: string | null;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  deliveryContext?: string | null;
  recentTrackKey?: string | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | string | null;
  recentOwnerLabel?: string | null;
  recentOwnerDisplayName?: string | null;
  recentOwnerEmail?: string | null;
};

export type VerificationChecklistHandoffArgs = AuditExportReceiptContinuityArgs & {
  pathname: string;
  source?: string | null;
  runId?: string | null;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  deliveryContext?: string | null;
  recentTrackKey?: string | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | null;
  recentOwnerLabel?: string | null;
  recentOwnerDisplayName?: string | null;
  recentOwnerEmail?: string | null;
};

function applyAuditExportReceiptContinuityQuery(
  searchParams: URLSearchParams,
  args: AuditExportReceiptContinuityArgs,
): void {
  if (args.auditReceiptFilename) {
    searchParams.set("audit_export_filename", args.auditReceiptFilename);
  }
  if (args.auditReceiptExportedAt) {
    searchParams.set("audit_export_exported_at", args.auditReceiptExportedAt);
  }
  if (args.auditReceiptFromDate) {
    searchParams.set("audit_export_from_date", args.auditReceiptFromDate);
  }
  if (args.auditReceiptToDate) {
    searchParams.set("audit_export_to_date", args.auditReceiptToDate);
  }
  if (args.auditReceiptSha256) {
    searchParams.set("audit_export_sha256", args.auditReceiptSha256);
  }
}

export function applyHandoffQuery(searchParams: URLSearchParams, args: HandoffQueryArgs): void {
  if (args.source) {
    searchParams.set("source", args.source);
  }
  if (args.runId) {
    searchParams.set("run_id", args.runId);
  }
  if (args.surface) {
    searchParams.set("surface", args.surface);
  }
  if (args.week8Focus) {
    searchParams.set("week8_focus", args.week8Focus);
  }
  if (args.attentionWorkspace) {
    searchParams.set("attention_workspace", args.attentionWorkspace);
  }
  if (args.attentionOrganization) {
    searchParams.set("attention_organization", args.attentionOrganization);
  }
  if (args.deliveryContext) {
    searchParams.set("delivery_context", args.deliveryContext);
  }
  if (args.recentTrackKey) {
    searchParams.set("recent_track_key", args.recentTrackKey);
  }
  if (args.recentUpdateKind) {
    searchParams.set("recent_update_kind", args.recentUpdateKind);
  }
  if (args.evidenceCount !== null && args.evidenceCount !== undefined && String(args.evidenceCount) !== "") {
    searchParams.set("evidence_count", String(args.evidenceCount));
  }
  if (args.recentOwnerLabel) {
    searchParams.set("recent_owner_label", args.recentOwnerLabel);
  }
  if (args.recentOwnerDisplayName) {
    searchParams.set("recent_owner_display_name", args.recentOwnerDisplayName);
  }
  if (args.recentOwnerEmail) {
    searchParams.set("recent_owner_email", args.recentOwnerEmail);
  }
  applyAuditExportReceiptContinuityQuery(searchParams, args);
}

export function applyAdminReturnQuery(searchParams: URLSearchParams, args: AdminReturnQueryArgs): void {
  if (args.runId) {
    searchParams.set("run_id", args.runId);
  }
  if (args.source === "admin-attention") {
    if (args.queueSurface) {
      searchParams.set("queue_surface", args.queueSurface);
    }
    searchParams.set("queue_returned", "1");
  }
  if (args.source === "admin-readiness") {
    if (args.week8Focus) {
      searchParams.set("week8_focus", args.week8Focus);
    }
    searchParams.set("readiness_returned", "1");
  }
  if (args.attentionWorkspace) {
    searchParams.set("attention_workspace", args.attentionWorkspace);
  }
  if (args.attentionOrganization) {
    searchParams.set("attention_organization", args.attentionOrganization);
  }
  if (args.deliveryContext) {
    searchParams.set("delivery_context", args.deliveryContext);
  }
  if (args.recentTrackKey) {
    searchParams.set("recent_track_key", args.recentTrackKey);
  }
  if (args.recentUpdateKind) {
    searchParams.set("recent_update_kind", args.recentUpdateKind);
  }
  if (args.evidenceCount !== null && args.evidenceCount !== undefined && String(args.evidenceCount) !== "") {
    searchParams.set("evidence_count", String(args.evidenceCount));
  }
  if (args.recentOwnerLabel) {
    searchParams.set("recent_owner_label", args.recentOwnerLabel);
  }
  if (args.recentOwnerDisplayName) {
    searchParams.set("recent_owner_display_name", args.recentOwnerDisplayName);
  }
  if (args.recentOwnerEmail) {
    searchParams.set("recent_owner_email", args.recentOwnerEmail);
  }
  applyAuditExportReceiptContinuityQuery(searchParams, args);
}

export function buildHandoffHref(
  pathname: string,
  args: HandoffQueryArgs,
  options?: {
    preserveExistingQuery?: boolean;
  },
): string {
  const [basePath, rawQuery] = pathname.split("?");
  const searchParams = new URLSearchParams(options?.preserveExistingQuery ? rawQuery ?? "" : "");
  applyHandoffQuery(searchParams, args);
  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function buildAdminReturnHref(pathname: string, args: AdminReturnQueryArgs): string {
  const [basePath, rawQuery] = pathname.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");
  applyAdminReturnQuery(searchParams, args);
  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function resolveAdminQueueSurface(value?: string | null): "verification" | "go_live" | null {
  if (value === "verification") {
    return "verification";
  }
  if (value === "go_live" || value === "go-live") {
    return "go_live";
  }
  return null;
}

export function buildVerificationChecklistHandoffHref(args: VerificationChecklistHandoffArgs): string {
  const {
    pathname,
    source,
    runId,
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel,
    recentOwnerDisplayName,
    recentOwnerEmail,
    auditReceiptFilename,
    auditReceiptExportedAt,
    auditReceiptFromDate,
    auditReceiptToDate,
    auditReceiptSha256,
  } = args;

  if (source !== "admin-readiness" && source !== "admin-attention" && source !== "onboarding") {
    return pathname;
  }

  const normalizedRecentUpdateKind =
    recentUpdateKind === "verification" ||
    recentUpdateKind === "go_live" ||
    recentUpdateKind === "verification_completed" ||
    recentUpdateKind === "go_live_completed" ||
    recentUpdateKind === "evidence_only"
      ? recentUpdateKind
      : null;

  return buildHandoffHref(
    pathname,
    {
      source,
      runId,
      week8Focus,
      attentionWorkspace,
      attentionOrganization,
      deliveryContext:
        deliveryContext === "recent_activity" || deliveryContext === "week8" ? deliveryContext : null,
      recentTrackKey: resolveAdminQueueSurface(recentTrackKey),
      recentUpdateKind: normalizedRecentUpdateKind,
      evidenceCount,
      recentOwnerLabel,
      recentOwnerDisplayName,
      recentOwnerEmail,
      auditReceiptFilename,
      auditReceiptExportedAt,
      auditReceiptFromDate,
      auditReceiptToDate,
      auditReceiptSha256,
    },
    { preserveExistingQuery: true },
  );
}
