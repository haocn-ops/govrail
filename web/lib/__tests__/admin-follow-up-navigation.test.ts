import assert from "node:assert/strict";
import test from "node:test";

import {
  adminAttentionActionLabel,
  buildAdminAttentionNavigationTarget,
  buildAdminReadinessNavigationTarget,
} from "../admin-follow-up-navigation";

test("adminAttentionActionLabel maps go-live and verification surfaces explicitly", () => {
  assert.equal(adminAttentionActionLabel("go_live"), "Open go-live drill");
  assert.equal(adminAttentionActionLabel("verification"), "Open verification checklist");
  assert.equal(adminAttentionActionLabel(null), "Open verification checklist");
});

test("buildAdminAttentionNavigationTarget preserves admin-attention continuity metadata", () => {
  const result = buildAdminAttentionNavigationTarget(
    {
      slug: "ws-ops",
      next_action_surface: "go_live",
      latest_demo_run_id: "run_123",
    },
    {
      attentionOrganizationId: "org_preview",
      deliveryContext: "recent_activity",
      recentTrackKey: "verification",
      recentUpdateKind: "verification_completed",
      evidenceCount: 2,
      recentOwnerLabel: "Ops",
      recentOwnerDisplayName: "Avery Ops",
      recentOwnerEmail: "avery.ops@govrail.test",
    },
  );

  assert.equal(result.workspaceSlug, "ws-ops");
  assert.equal(result.pathname, "/go-live");
  assert.deepEqual(result.searchParams, {
    source: "admin-attention",
    surface: "go_live",
    run_id: "run_123",
    attention_workspace: "ws-ops",
    attention_organization: "org_preview",
    delivery_context: "recent_activity",
    recent_track_key: "verification",
    recent_update_kind: "verification_completed",
    evidence_count: "2",
    recent_owner_label: "Ops",
    recent_owner_display_name: "Avery Ops",
    recent_owner_email: "avery.ops@govrail.test",
  });
});

test("buildAdminAttentionNavigationTarget defaults to verification without optional metadata", () => {
  const result = buildAdminAttentionNavigationTarget({
    slug: "ws-ops",
    next_action_surface: null,
    latest_demo_run_id: null,
  });

  assert.equal(result.pathname, "/verification");
  assert.equal(result.searchParams.surface, "verification");
  assert.equal(result.searchParams.run_id, null);
  assert.equal(result.searchParams.evidence_count, null);
});

test("buildAdminReadinessNavigationTarget maps go-live and preserves readiness focus metadata", () => {
  const result = buildAdminReadinessNavigationTarget(
    {
      slug: "ws-ops",
      next_action_surface: "go_live",
      latest_demo_run_id: "run_123",
      organization_id: "org_live",
    },
    {
      readinessFocus: "billing_warning",
      attentionOrganizationId: "org_fallback",
    },
  );

  assert.equal(result.workspaceSlug, "ws-ops");
  assert.equal(result.pathname, "/go-live");
  assert.deepEqual(result.searchParams, {
    source: "admin-readiness",
    surface: "go_live",
    run_id: "run_123",
    week8_focus: "billing_warning",
    attention_workspace: "ws-ops",
    attention_organization: "org_live",
  });
});

test("buildAdminReadinessNavigationTarget defaults onboarding/settings surfaces without synthetic surface query", () => {
  const onboarding = buildAdminReadinessNavigationTarget(
    {
      slug: "ws-onboarding",
      next_action_surface: "onboarding",
      latest_demo_run_id: null,
      organization_id: "",
    },
    {
      readinessFocus: "baseline",
      attentionOrganizationId: "org_preview",
    },
  );
  const settings = buildAdminReadinessNavigationTarget(
    {
      slug: "ws-settings",
      next_action_surface: "settings",
      latest_demo_run_id: "run_456",
      organization_id: "org_live",
    },
    {
      readinessFocus: "billing_warning",
      attentionOrganizationId: "org_preview",
    },
  );

  assert.equal(onboarding.pathname, "/onboarding");
  assert.equal(onboarding.searchParams.surface, null);
  assert.equal(onboarding.searchParams.attention_organization, "org_preview");
  assert.equal(settings.pathname, "/settings");
  assert.equal(settings.searchParams.surface, null);
  assert.equal(settings.searchParams.attention_organization, "org_live");
});
