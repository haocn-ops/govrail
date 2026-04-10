import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AuditExportReceiptCallout } from "../audit-export-receipt-callout";

test("AuditExportReceiptCallout renders filename, export window, sha, and evidence note", () => {
  const originalToLocaleString = Date.prototype.toLocaleString;
  Date.prototype.toLocaleString = () => "Apr 2, 2026, 6:48 PM";

  try {
    const html = renderToStaticMarkup(
      createElement(AuditExportReceiptCallout, {
        receipt: {
          filename: "audit-2026-04.csv",
          exportedAt: "2026-04-02T10:48:00.000Z",
          fromDate: "2026-03-01",
          toDate: "2026-03-31",
          sha256: "abc123",
        },
      }),
    );

    assert.match(html, /Latest audit export receipt/);
    assert.match(html, /audit-2026-04\.csv/);
    assert.match(html, /Apr 2, 2026, 6:48 PM/);
    assert.match(html, /2026-03-01 -&gt; 2026-03-31/);
    assert.match(html, /abc123/);
    assert.match(html, /Audit export audit-2026-04\.csv \(2026-03-01 -&gt; 2026-03-31, SHA-256: abc123\)\./);
  } finally {
    Date.prototype.toLocaleString = originalToLocaleString;
  }
});

test("AuditExportReceiptCallout falls back when filter window or sha are unavailable", () => {
  const originalToLocaleString = Date.prototype.toLocaleString;
  Date.prototype.toLocaleString = () => "Apr 2, 2026, 6:48 PM";

  try {
    const html = renderToStaticMarkup(
      createElement(AuditExportReceiptCallout, {
        receipt: {
          filename: "audit-2026-full.csv",
          exportedAt: "2026-04-02T10:48:00.000Z",
          fromDate: null,
          toDate: null,
          sha256: null,
        },
        reminder: "Carry forward",
      }),
    );

    assert.match(html, /Full workspace history/);
    assert.match(html, /Unavailable in this browser/);
    assert.match(html, /Carry forward/);
    assert.match(html, /Audit export audit-2026-full\.csv \(full workspace history, SHA-256: hash unavailable\)\./);
  } finally {
    Date.prototype.toLocaleString = originalToLocaleString;
  }
});
