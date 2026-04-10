import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHandoffQuery,
  buildAdminReturnHref,
  buildHandoffHref,
  buildVerificationChecklistHandoffHref,
  resolveAdminQueueSurface,
} from "../handoff-query";

type AdminReturnArgs = {
  source?: string | null;
  runId?: string | null;
  queueSurface?: string | null;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  recentTrackKey?: string | null;
  auditReceiptFilename?: string | null;
  auditReceiptExportedAt?: string | null;
  auditReceiptSha256?: string | null;
};

test("applyHandoffQuery writes shared handoff keys and skips empty values", () => {
  const params = new URLSearchParams();
  applyHandoffQuery(params, {
    source: "admin-readiness",
    runId: "run_123",
    week8Focus: "billing",
    attentionWorkspace: "ws-alpha",
    attentionOrganization: "org-alpha",
    deliveryContext: "recent_activity",
    recentTrackKey: "verification",
    recentUpdateKind: "verification_completed",
    evidenceCount: 3,
    recentOwnerLabel: "Alice",
    recentOwnerDisplayName: null,
    recentOwnerEmail: "",
    auditReceiptFilename: "audit-export.jsonl",
    auditReceiptExportedAt: "2026-04-06T10:00:00.000Z",
    auditReceiptFromDate: "2026-04-01",
    auditReceiptToDate: "2026-04-06",
    auditReceiptSha256: "abc123",
  });

  assert.equal(params.get("source"), "admin-readiness");
  assert.equal(params.get("run_id"), "run_123");
  assert.equal(params.get("week8_focus"), "billing");
  assert.equal(params.get("attention_workspace"), "ws-alpha");
  assert.equal(params.get("attention_organization"), "org-alpha");
  assert.equal(params.get("delivery_context"), "recent_activity");
  assert.equal(params.get("recent_track_key"), "verification");
  assert.equal(params.get("recent_update_kind"), "verification_completed");
  assert.equal(params.get("evidence_count"), "3");
  assert.equal(params.get("recent_owner_label"), "Alice");
  assert.equal(params.has("recent_owner_display_name"), false);
  assert.equal(params.has("recent_owner_email"), false);
  assert.equal(params.get("audit_export_filename"), "audit-export.jsonl");
  assert.equal(params.get("audit_export_exported_at"), "2026-04-06T10:00:00.000Z");
  assert.equal(params.get("audit_export_from_date"), "2026-04-01");
  assert.equal(params.get("audit_export_to_date"), "2026-04-06");
  assert.equal(params.get("audit_export_sha256"), "abc123");
});

test("buildHandoffHref preserves existing query when requested", () => {
  const href = buildHandoffHref(
    "/settings?intent=upgrade",
    {
      source: "onboarding",
      week8Focus: "go_live",
      evidenceCount: "2",
    },
    { preserveExistingQuery: true },
  );

  const parsed = new URL(`https://example.test${href}`);
  assert.equal(parsed.pathname, "/settings");
  assert.equal(parsed.searchParams.get("intent"), "upgrade");
  assert.equal(parsed.searchParams.get("source"), "onboarding");
  assert.equal(parsed.searchParams.get("week8_focus"), "go_live");
  assert.equal(parsed.searchParams.get("evidence_count"), "2");
});

test("admin-return helper keeps admin-attention return URL query contract", () => {
  const href = buildAdminReturnHref("/admin", {
    source: "admin-attention",
    queueSurface: "go_live",
    attentionWorkspace: "ws-attention",
    attentionOrganization: "org-attention",
    auditReceiptFilename: "audit-export.jsonl",
    auditReceiptExportedAt: "2026-04-06T10:00:00.000Z",
  } satisfies AdminReturnArgs);

  const parsed = new URL(`https://example.test${href}`);
  assert.equal(parsed.pathname, "/admin");
  assert.equal(parsed.searchParams.get("queue_surface"), "go_live");
  assert.equal(parsed.searchParams.get("queue_returned"), "1");
  assert.equal(parsed.searchParams.get("attention_workspace"), "ws-attention");
  assert.equal(parsed.searchParams.get("attention_organization"), "org-attention");
  assert.equal(parsed.searchParams.get("audit_export_filename"), "audit-export.jsonl");
  assert.equal(parsed.searchParams.get("audit_export_exported_at"), "2026-04-06T10:00:00.000Z");
  assert.equal(parsed.searchParams.has("week8_focus"), false);
  assert.equal(parsed.searchParams.has("readiness_returned"), false);
});

test("admin-return helper keeps admin-readiness return URL query contract", () => {
  const href = buildAdminReturnHref("/admin", {
    source: "admin-readiness",
    runId: "run_readiness_123",
    week8Focus: "billing_warning",
    attentionWorkspace: "ws-readiness",
    attentionOrganization: "org-readiness",
    recentTrackKey: "verification",
    auditReceiptFilename: "audit-export.jsonl",
    auditReceiptExportedAt: "2026-04-06T10:00:00.000Z",
    auditReceiptSha256: "def456",
  } satisfies AdminReturnArgs);

  const parsed = new URL(`https://example.test${href}`);
  assert.equal(parsed.pathname, "/admin");
  assert.equal(parsed.searchParams.get("run_id"), "run_readiness_123");
  assert.equal(parsed.searchParams.get("week8_focus"), "billing_warning");
  assert.equal(parsed.searchParams.get("readiness_returned"), "1");
  assert.equal(parsed.searchParams.get("attention_workspace"), "ws-readiness");
  assert.equal(parsed.searchParams.get("attention_organization"), "org-readiness");
  assert.equal(parsed.searchParams.get("recent_track_key"), "verification");
  assert.equal(parsed.searchParams.get("audit_export_filename"), "audit-export.jsonl");
  assert.equal(parsed.searchParams.get("audit_export_exported_at"), "2026-04-06T10:00:00.000Z");
  assert.equal(parsed.searchParams.get("audit_export_sha256"), "def456");
  assert.equal(parsed.searchParams.has("queue_surface"), false);
  assert.equal(parsed.searchParams.has("queue_returned"), false);
});

test("resolveAdminQueueSurface normalizes current governance queue surfaces", () => {
  assert.equal(resolveAdminQueueSurface("verification"), "verification");
  assert.equal(resolveAdminQueueSurface("go_live"), "go_live");
  assert.equal(resolveAdminQueueSurface("go-live"), "go_live");
  assert.equal(resolveAdminQueueSurface("usage"), null);
  assert.equal(resolveAdminQueueSurface(null), null);
});

test("buildVerificationChecklistHandoffHref preserves existing query and normalizes shared continuity keys", () => {
  const href = buildVerificationChecklistHandoffHref({
    pathname: "/settings?intent=manage-plan",
    source: "admin-readiness",
    runId: "run_789",
    week8Focus: "credentials",
    attentionWorkspace: "ws-alpha",
    attentionOrganization: "org-alpha",
    deliveryContext: "week8",
    recentTrackKey: "go-live",
    recentUpdateKind: "go_live_completed",
    evidenceCount: 2,
    recentOwnerLabel: "Alice",
    recentOwnerDisplayName: "Alice Example",
    recentOwnerEmail: "alice@example.com",
    auditReceiptFilename: "audit-export.jsonl",
    auditReceiptExportedAt: "2026-04-06T10:00:00.000Z",
    auditReceiptFromDate: "2026-04-01",
    auditReceiptToDate: "2026-04-06",
    auditReceiptSha256: "ghi789",
  });

  const parsed = new URL(`https://example.test${href}`);
  assert.equal(parsed.pathname, "/settings");
  assert.equal(parsed.searchParams.get("intent"), "manage-plan");
  assert.equal(parsed.searchParams.get("source"), "admin-readiness");
  assert.equal(parsed.searchParams.get("run_id"), "run_789");
  assert.equal(parsed.searchParams.get("week8_focus"), "credentials");
  assert.equal(parsed.searchParams.get("attention_workspace"), "ws-alpha");
  assert.equal(parsed.searchParams.get("attention_organization"), "org-alpha");
  assert.equal(parsed.searchParams.get("delivery_context"), "week8");
  assert.equal(parsed.searchParams.get("recent_track_key"), "go_live");
  assert.equal(parsed.searchParams.get("recent_update_kind"), "go_live_completed");
  assert.equal(parsed.searchParams.get("evidence_count"), "2");
  assert.equal(parsed.searchParams.get("recent_owner_label"), "Alice");
  assert.equal(parsed.searchParams.get("recent_owner_display_name"), "Alice Example");
  assert.equal(parsed.searchParams.get("recent_owner_email"), "alice@example.com");
  assert.equal(parsed.searchParams.get("audit_export_filename"), "audit-export.jsonl");
  assert.equal(parsed.searchParams.get("audit_export_exported_at"), "2026-04-06T10:00:00.000Z");
  assert.equal(parsed.searchParams.get("audit_export_from_date"), "2026-04-01");
  assert.equal(parsed.searchParams.get("audit_export_to_date"), "2026-04-06");
  assert.equal(parsed.searchParams.get("audit_export_sha256"), "ghi789");
});
