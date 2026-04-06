import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConsoleAdminFollowUpPayload,
  buildConsoleAdminLinkState,
  buildConsoleAdminReturnHref,
  buildConsoleAdminReturnState,
  buildConsoleHandoffHref,
  buildConsoleRunAwareHandoffHref,
  buildConsoleVerificationChecklistHandoffArgs,
  buildRecentDeliveryDescription,
  buildRecentDeliveryMetadata,
  parseConsoleEvidenceCount,
  parseConsoleHandoffState,
  resolveAdminQueueSurface,
} from "../console-handoff";

test("parseConsoleHandoffState normalizes shared search params and owner continuity", () => {
  const handoff = parseConsoleHandoffState({
    source: "admin-attention",
    surface: "go_live",
    run_id: "run_123",
    attention_workspace: "ws-alpha",
    attention_organization: "org-alpha",
    week8_focus: "billing_warning",
    delivery_context: "recent_activity",
    recent_track_key: "verification",
    recent_update_kind: "verification_completed",
    evidence_count: "2",
    recent_owner_display_name: "Alice",
    recent_owner_email: "alice@example.com",
    audit_export_filename: "audit-export.jsonl",
    audit_export_exported_at: "2026-04-06T10:00:00.000Z",
    audit_export_from_date: "2026-04-01",
    audit_export_to_date: "2026-04-06",
    audit_export_sha256: "abc123",
  });

  assert.equal(handoff.source, "admin-attention");
  assert.equal(handoff.surface, "go_live");
  assert.equal(handoff.runId, "run_123");
  assert.equal(handoff.attentionWorkspace, "ws-alpha");
  assert.equal(handoff.attentionOrganization, "org-alpha");
  assert.equal(handoff.week8Focus, "billing_warning");
  assert.equal(handoff.deliveryContext, "recent_activity");
  assert.equal(handoff.recentTrackKey, "verification");
  assert.equal(handoff.recentUpdateKind, "verification_completed");
  assert.equal(handoff.evidenceCount, 2);
  assert.equal(handoff.recentOwnerLabel, "Alice");
  assert.equal(handoff.recentOwnerDisplayName, "Alice");
  assert.equal(handoff.recentOwnerEmail, "alice@example.com");
  assert.equal(handoff.auditReceiptFilename, "audit-export.jsonl");
  assert.equal(handoff.auditReceiptExportedAt, "2026-04-06T10:00:00.000Z");
  assert.equal(handoff.auditReceiptFromDate, "2026-04-01");
  assert.equal(handoff.auditReceiptToDate, "2026-04-06");
  assert.equal(handoff.auditReceiptSha256, "abc123");
});

test("parseConsoleEvidenceCount and queue surface helpers reject invalid values", () => {
  assert.equal(parseConsoleEvidenceCount(""), null);
  assert.equal(parseConsoleEvidenceCount("not-a-number"), null);
  assert.equal(parseConsoleEvidenceCount("3"), 3);
  assert.equal(resolveAdminQueueSurface("go-live"), "go_live");
  assert.equal(resolveAdminQueueSurface("verification"), "verification");
  assert.equal(resolveAdminQueueSurface("usage"), null);
});

test("buildConsoleVerificationChecklistHandoffArgs keeps only shared continuity contract", () => {
  const args = buildConsoleVerificationChecklistHandoffArgs(
    parseConsoleHandoffState({
      source: "admin-readiness",
      run_id: "run_321",
      delivery_context: "other-context",
      recent_track_key: "go_live",
      recent_update_kind: "go_live_completed",
      evidence_count: "4",
      recent_owner_label: "Ops",
      recent_owner_display_name: "Ops Team",
      recent_owner_email: "ops@example.com",
      audit_export_filename: "audit-export.jsonl",
      audit_export_exported_at: "2026-04-06T10:00:00.000Z",
      audit_export_sha256: "def456",
    }),
  );

  assert.equal(args.source, "admin-readiness");
  assert.equal(args.runId, "run_321");
  assert.equal(args.deliveryContext, null);
  assert.equal(args.recentTrackKey, "go_live");
  assert.equal(args.recentUpdateKind, "go_live_completed");
  assert.equal(args.evidenceCount, 4);
  assert.equal(args.recentOwnerLabel, "Ops Team");
  assert.equal(args.recentOwnerDisplayName, "Ops Team");
  assert.equal(args.recentOwnerEmail, "ops@example.com");
  assert.equal(args.auditReceiptFilename, "audit-export.jsonl");
  assert.equal(args.auditReceiptExportedAt, "2026-04-06T10:00:00.000Z");
  assert.equal(args.auditReceiptSha256, "def456");
});

test("buildConsoleVerificationChecklistHandoffArgs preserves week8 delivery continuity for readiness handoff", () => {
  const args = buildConsoleVerificationChecklistHandoffArgs(
    parseConsoleHandoffState({
      source: "admin-readiness",
      run_id: "run_654",
      delivery_context: "week8",
      recent_track_key: "verification",
      recent_update_kind: "verification_completed",
      evidence_count: "2",
      recent_owner_label: "Ops",
      recent_owner_display_name: "Ops Team",
      recent_owner_email: "ops@example.com",
    }),
  );

  assert.equal(args.source, "admin-readiness");
  assert.equal(args.runId, "run_654");
  assert.equal(args.deliveryContext, "week8");
  assert.equal(args.recentTrackKey, "verification");
  assert.equal(args.recentUpdateKind, "verification_completed");
  assert.equal(args.evidenceCount, 2);
  assert.equal(args.recentOwnerLabel, "Ops Team");
  assert.equal(args.recentOwnerDisplayName, "Ops Team");
  assert.equal(args.recentOwnerEmail, "ops@example.com");
});

test("buildConsoleAdminFollowUpPayload keeps admin-only notice props centralized", () => {
  const readinessPayload = buildConsoleAdminFollowUpPayload({
    handoff: parseConsoleHandoffState({
      source: "admin-readiness",
      week8_focus: "go_live_ready",
      attention_organization: "org-ready",
      delivery_context: "recent_activity",
      recent_track_key: "go_live",
      recent_update_kind: "go_live_completed",
      evidence_count: "4",
      recent_owner_display_name: "Alice",
      recent_owner_email: "alice@example.com",
    }),
  });
  const onboardingPayload = buildConsoleAdminFollowUpPayload({
    handoff: parseConsoleHandoffState({
      source: "onboarding",
      recent_owner_display_name: "Ignored",
    }),
  });

  assert.deepEqual(readinessPayload, {
    source: "admin-readiness",
    week8Focus: "go_live_ready",
    attentionOrganization: "org-ready",
    deliveryContext: "recent_activity",
    recentTrackKey: "go_live",
    recentUpdateKind: "go_live_completed",
    evidenceCount: 4,
    ownerDisplayName: "Alice",
    ownerEmail: "alice@example.com",
  });
  assert.equal(onboardingPayload, null);
});

test("buildConsoleHandoffHref preserves existing query and extended owner metadata", () => {
  const href = buildConsoleHandoffHref(
    "/settings?intent=manage-plan",
    parseConsoleHandoffState({
      source: "admin-attention",
      run_id: "run_111",
      attention_workspace: "ws-beta",
      recent_track_key: "verification",
      evidence_count: "1",
      recent_owner_display_name: "Alice",
      recent_owner_email: "alice@example.com",
      audit_export_filename: "audit-export.jsonl",
      audit_export_exported_at: "2026-04-06T10:00:00.000Z",
      audit_export_from_date: "2026-04-01",
      audit_export_to_date: "2026-04-06",
      audit_export_sha256: "ghi789",
    }),
  );

  const parsed = new URL(`https://example.test${href}`);
  assert.equal(parsed.pathname, "/settings");
  assert.equal(parsed.searchParams.get("intent"), "manage-plan");
  assert.equal(parsed.searchParams.get("source"), "admin-attention");
  assert.equal(parsed.searchParams.get("run_id"), "run_111");
  assert.equal(parsed.searchParams.get("attention_workspace"), "ws-beta");
  assert.equal(parsed.searchParams.get("recent_track_key"), "verification");
  assert.equal(parsed.searchParams.get("evidence_count"), "1");
  assert.equal(parsed.searchParams.get("recent_owner_display_name"), "Alice");
  assert.equal(parsed.searchParams.get("recent_owner_email"), "alice@example.com");
  assert.equal(parsed.searchParams.get("audit_export_filename"), "audit-export.jsonl");
  assert.equal(parsed.searchParams.get("audit_export_exported_at"), "2026-04-06T10:00:00.000Z");
  assert.equal(parsed.searchParams.get("audit_export_from_date"), "2026-04-01");
  assert.equal(parsed.searchParams.get("audit_export_to_date"), "2026-04-06");
  assert.equal(parsed.searchParams.get("audit_export_sha256"), "ghi789");
});

test("buildConsoleHandoffHref preserves week8 delivery continuity for onboarding-style links", () => {
  const href = buildConsoleHandoffHref(
    "/accept-invitation",
    parseConsoleHandoffState({
      source: "admin-readiness",
      run_id: "run_222",
      week8_focus: "credentials",
      attention_workspace: "ws-beta",
      attention_organization: "org-beta",
      delivery_context: "week8",
      recent_track_key: "verification",
      recent_update_kind: "verification_completed",
      evidence_count: "1",
      recent_owner_display_name: "Alice",
    }),
  );

  const parsed = new URL(`https://example.test${href}`);
  assert.equal(parsed.pathname, "/accept-invitation");
  assert.equal(parsed.searchParams.get("source"), "admin-readiness");
  assert.equal(parsed.searchParams.get("run_id"), "run_222");
  assert.equal(parsed.searchParams.get("week8_focus"), "credentials");
  assert.equal(parsed.searchParams.get("attention_workspace"), "ws-beta");
  assert.equal(parsed.searchParams.get("attention_organization"), "org-beta");
  assert.equal(parsed.searchParams.get("delivery_context"), "week8");
  assert.equal(parsed.searchParams.get("recent_track_key"), "verification");
  assert.equal(parsed.searchParams.get("recent_update_kind"), "verification_completed");
  assert.equal(parsed.searchParams.get("evidence_count"), "1");
  assert.equal(parsed.searchParams.get("recent_owner_display_name"), "Alice");
});

test("buildConsoleRunAwareHandoffHref keeps console handoff semantics and appends run_id", () => {
  const handoff = parseConsoleHandoffState({
    source: "admin-readiness",
    attention_workspace: "ws-beta",
    recent_track_key: "verification",
    evidence_count: "1",
    recent_owner_display_name: "Alice",
  });

  const withRunId = buildConsoleRunAwareHandoffHref("/logs?view=stream", handoff, "run_123");
  const withRunIdParsed = new URL(`https://example.test${withRunId}`);
  assert.equal(withRunIdParsed.pathname, "/logs");
  assert.equal(withRunIdParsed.searchParams.get("view"), "stream");
  assert.equal(withRunIdParsed.searchParams.get("source"), "admin-readiness");
  assert.equal(withRunIdParsed.searchParams.get("attention_workspace"), "ws-beta");
  assert.equal(withRunIdParsed.searchParams.get("recent_track_key"), "verification");
  assert.equal(withRunIdParsed.searchParams.get("evidence_count"), "1");
  assert.equal(withRunIdParsed.searchParams.get("recent_owner_display_name"), "Alice");
  assert.equal(withRunIdParsed.searchParams.get("run_id"), "run_123");

  const withoutRunId = buildConsoleRunAwareHandoffHref("/logs?view=stream", handoff);
  const withoutRunIdParsed = new URL(`https://example.test${withoutRunId}`);
  assert.equal(withoutRunIdParsed.searchParams.get("run_id"), null);
});

test("buildConsoleAdminReturnState and href keep admin queue/readiness semantics", () => {
  const handoff = parseConsoleHandoffState({
    source: "admin-attention",
    surface: "go_live",
    recent_track_key: "verification",
    attention_workspace: "ws-gamma",
    attention_organization: "org-gamma",
    recent_owner_display_name: "Alice",
    audit_export_filename: "audit-export.jsonl",
    audit_export_exported_at: "2026-04-06T10:00:00.000Z",
  });
  const state = buildConsoleAdminReturnState({
    source: handoff.source,
    surface: handoff.surface,
    expectedSurface: "go_live",
    recentTrackKey: handoff.recentTrackKey,
  });

  assert.equal(state.showAttentionHandoff, true);
  assert.equal(state.showReadinessHandoff, false);
  assert.equal(state.showAdminReturn, true);
  assert.equal(state.adminReturnLabel, "Return to admin queue");
  assert.equal(state.adminQueueSurface, "go_live");

  const href = buildConsoleAdminReturnHref({
    pathname: "/admin",
    handoff,
    workspaceSlug: "ws-fallback",
    queueSurface: state.adminQueueSurface,
  });
  const parsed = new URL(`https://example.test${href}`);

  assert.equal(parsed.pathname, "/admin");
  assert.equal(parsed.searchParams.get("queue_surface"), "go_live");
  assert.equal(parsed.searchParams.get("queue_returned"), "1");
  assert.equal(parsed.searchParams.get("attention_workspace"), "ws-gamma");
  assert.equal(parsed.searchParams.get("attention_organization"), "org-gamma");
  assert.equal(parsed.searchParams.get("recent_owner_display_name"), "Alice");
  assert.equal(parsed.searchParams.get("audit_export_filename"), "audit-export.jsonl");
  assert.equal(parsed.searchParams.get("audit_export_exported_at"), "2026-04-06T10:00:00.000Z");
});

test("buildConsoleAdminReturnHref preserves run_id for object-style console page handoff args", () => {
  const href = buildConsoleAdminReturnHref({
    pathname: "/admin",
    handoff: parseConsoleHandoffState({
      source: "admin-readiness",
      surface: "verification",
      run_id: "run_789",
      week8_focus: "billing_warning",
      attention_workspace: "ws-ready",
      recent_track_key: "verification",
      recent_update_kind: "verification_completed",
      evidence_count: "2",
      recent_owner_display_name: "Alice",
      audit_export_filename: "audit-export.jsonl",
      audit_export_exported_at: "2026-04-06T10:00:00.000Z",
      audit_export_sha256: "jkl012",
    }),
    workspaceSlug: "ws-fallback",
    queueSurface: "verification",
  });
  const parsed = new URL(`https://example.test${href}`);

  assert.equal(parsed.pathname, "/admin");
  assert.equal(parsed.searchParams.get("readiness_returned"), "1");
  assert.equal(parsed.searchParams.get("run_id"), "run_789");
  assert.equal(parsed.searchParams.get("week8_focus"), "billing_warning");
  assert.equal(parsed.searchParams.get("attention_workspace"), "ws-ready");
  assert.equal(parsed.searchParams.get("audit_export_filename"), "audit-export.jsonl");
  assert.equal(parsed.searchParams.get("audit_export_exported_at"), "2026-04-06T10:00:00.000Z");
  assert.equal(parsed.searchParams.get("audit_export_sha256"), "jkl012");
});

test("buildConsoleAdminLinkState keeps generic console-page admin return semantics centralized", () => {
  const readinessHandoff = parseConsoleHandoffState({
    source: "admin-readiness",
    surface: "verification",
    week8_focus: "billing_warning",
    attention_workspace: "ws-ready",
    attention_organization: "org-ready",
    recent_track_key: "verification",
  });
  const readinessState = buildConsoleAdminLinkState({
    handoff: readinessHandoff,
    workspaceSlug: "ws-fallback",
    runId: "run_456",
  });
  const readinessHref = new URL(`https://example.test${readinessState.adminHref}`);

  assert.equal(readinessState.showAdminReturn, true);
  assert.equal(readinessState.adminLinkLabel, "Return to admin readiness view");
  assert.equal(readinessState.adminQueueSurface, "verification");
  assert.equal(readinessHref.pathname, "/admin");
  assert.equal(readinessHref.searchParams.get("readiness_returned"), "1");
  assert.equal(readinessHref.searchParams.get("week8_focus"), "billing_warning");
  assert.equal(readinessHref.searchParams.get("attention_workspace"), "ws-ready");
  assert.equal(readinessHref.searchParams.get("run_id"), "run_456");

  const attentionState = buildConsoleAdminLinkState({
    handoff: parseConsoleHandoffState({
      source: "admin-attention",
      surface: "go_live",
      attention_workspace: "ws-attn",
      recent_track_key: "verification",
    }),
    workspaceSlug: "ws-fallback",
  });
  const attentionHref = new URL(`https://example.test${attentionState.adminHref}`);

  assert.equal(attentionState.showAdminReturn, true);
  assert.equal(attentionState.adminLinkLabel, "Return to admin queue");
  assert.equal(attentionState.adminQueueSurface, "go_live");
  assert.equal(attentionHref.searchParams.get("queue_returned"), "1");
  assert.equal(attentionHref.searchParams.get("queue_surface"), "go_live");
  assert.equal(attentionHref.searchParams.get("attention_workspace"), "ws-attn");

  const neutralState = buildConsoleAdminLinkState({
    handoff: parseConsoleHandoffState({
      source: "onboarding",
    }),
    workspaceSlug: "ws-neutral",
  });

  assert.equal(neutralState.showAdminReturn, false);
  assert.equal(neutralState.adminLinkLabel, "Open admin overview");
  assert.equal(neutralState.adminHref, "/admin");
  assert.equal(neutralState.adminQueueSurface, null);
});

test("buildRecentDeliveryDescription keeps stitched admin handoff copy centralized", () => {
  const description = buildRecentDeliveryDescription(
    "Track delivery state.",
    buildRecentDeliveryMetadata(
      parseConsoleHandoffState({
        recent_track_key: "verification",
        recent_update_kind: "evidence_only",
        evidence_count: "3",
        recent_owner_label: "Alice",
      }),
    ),
  );

  assert.equal(
    description,
    "Track delivery state. Latest admin handoff: Verification track · Evidence added · 3 evidence items · handled by Alice.",
  );
});
