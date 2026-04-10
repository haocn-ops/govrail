export type AuditExportReceiptContinuityArgs = {
  auditReceiptFilename?: string | null;
  auditReceiptExportedAt?: string | null;
  auditReceiptFromDate?: string | null;
  auditReceiptToDate?: string | null;
  auditReceiptSha256?: string | null;
};

export type AuditExportReceiptSummary = {
  filename: string;
  exportedAt: string;
  fromDate: string | null;
  toDate: string | null;
  sha256: string | null;
};

export function resolveAuditExportReceiptSummary(
  args: AuditExportReceiptContinuityArgs,
): AuditExportReceiptSummary | null {
  if (!args.auditReceiptFilename || !args.auditReceiptExportedAt) {
    return null;
  }

  return {
    filename: args.auditReceiptFilename,
    exportedAt: args.auditReceiptExportedAt,
    fromDate: args.auditReceiptFromDate ?? null,
    toDate: args.auditReceiptToDate ?? null,
    sha256: args.auditReceiptSha256 ?? null,
  };
}

export function formatAuditExportReceiptWindow(args: {
  fromDate?: string | null;
  toDate?: string | null;
}): string {
  if (args.fromDate || args.toDate) {
    return `${args.fromDate ?? "start"} -> ${args.toDate ?? "end"}`;
  }
  return "Full workspace history";
}

export function formatAuditExportReceiptEvidenceNote(
  receipt: Pick<AuditExportReceiptSummary, "filename" | "fromDate" | "toDate" | "sha256">,
): string {
  const filters =
    receipt.fromDate || receipt.toDate
      ? `${receipt.fromDate ?? "start"} -> ${receipt.toDate ?? "end"}`
      : "full workspace history";
  const hash = receipt.sha256 ?? "hash unavailable";
  return `Audit export ${receipt.filename} (${filters}, SHA-256: ${hash}).`;
}
