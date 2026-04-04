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
  queueSurface?: string | null;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
};

test("applyHandoffQuery writes shared handoff keys and skips empty values", () => {
  const params = new URLSearchParams();
  applyHandoffQuery(params, {
    source: "admin-readiness",
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
  });

  assert.equal(params.get("source"), "admin-readiness");
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
  } satisfies AdminReturnArgs);

  const parsed = new URL(`https://example.test${href}`);
  assert.equal(parsed.pathname, "/admin");
  assert.equal(parsed.searchParams.get("queue_surface"), "go_live");
  assert.equal(parsed.searchParams.get("queue_returned"), "1");
  assert.equal(parsed.searchParams.get("attention_workspace"), "ws-attention");
  assert.equal(parsed.searchParams.get("attention_organization"), "org-attention");
  assert.equal(parsed.searchParams.has("week8_focus"), false);
  assert.equal(parsed.searchParams.has("readiness_returned"), false);
});

test("admin-return helper keeps admin-readiness return URL query contract", () => {
  const href = buildAdminReturnHref("/admin", {
    source: "admin-readiness",
    week8Focus: "billing_warning",
    attentionWorkspace: "ws-readiness",
    attentionOrganization: "org-readiness",
  } satisfies AdminReturnArgs);

  const parsed = new URL(`https://example.test${href}`);
  assert.equal(parsed.pathname, "/admin");
  assert.equal(parsed.searchParams.get("week8_focus"), "billing_warning");
  assert.equal(parsed.searchParams.get("readiness_returned"), "1");
  assert.equal(parsed.searchParams.get("attention_workspace"), "ws-readiness");
  assert.equal(parsed.searchParams.get("attention_organization"), "org-readiness");
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
    week8Focus: "credentials",
    attentionWorkspace: "ws-alpha",
    attentionOrganization: "org-alpha",
    deliveryContext: "week8",
    recentTrackKey: "go-live",
    recentUpdateKind: "go_live_completed",
    evidenceCount: 2,
    recentOwnerLabel: "Alice",
  });

  const parsed = new URL(`https://example.test${href}`);
  assert.equal(parsed.pathname, "/settings");
  assert.equal(parsed.searchParams.get("intent"), "manage-plan");
  assert.equal(parsed.searchParams.get("source"), "admin-readiness");
  assert.equal(parsed.searchParams.get("week8_focus"), "credentials");
  assert.equal(parsed.searchParams.get("attention_workspace"), "ws-alpha");
  assert.equal(parsed.searchParams.get("attention_organization"), "org-alpha");
  assert.equal(parsed.searchParams.get("recent_track_key"), "go_live");
  assert.equal(parsed.searchParams.get("recent_update_kind"), "go_live_completed");
  assert.equal(parsed.searchParams.get("evidence_count"), "2");
  assert.equal(parsed.searchParams.get("recent_owner_label"), "Alice");
  assert.equal(parsed.searchParams.has("delivery_context"), false);
});
