import type { AuditExportReceiptSummary } from "@/lib/audit-export-receipt";
import {
  formatAuditExportReceiptEvidenceNote,
  formatAuditExportReceiptWindow,
} from "@/lib/audit-export-receipt";

function formatExportedAt(value: string): string {
  return new Date(value).toLocaleString();
}

export function AuditExportReceiptCallout({
  receipt,
  title = "Latest audit export receipt",
  description = "Keep this receipt aligned across verification, go-live, and delivery notes so the same export can be traced end to end.",
  reminder = "Evidence note",
}: {
  receipt: AuditExportReceiptSummary;
  title?: string;
  description?: string;
  reminder?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted">{description}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-xs text-muted">Filename</p>
          <p className="mt-1 break-all text-sm font-medium text-foreground">{receipt.filename}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Exported at</p>
          <p className="mt-1 text-sm font-medium text-foreground">{formatExportedAt(receipt.exportedAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Filters</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {formatAuditExportReceiptWindow(receipt)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">SHA-256</p>
          <p className="mt-1 break-all text-sm font-medium text-foreground">
            {receipt.sha256 ?? "Unavailable in this browser"}
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-3">
        <p className="text-xs text-muted">{reminder}</p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {formatAuditExportReceiptEvidenceNote(receipt)}
        </p>
      </div>
    </div>
  );
}
