import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminOverviewFallback,
  buildAdminOverviewPath,
  proxyAdminOverviewGet,
} from "../admin/route-helpers";

test("buildAdminOverviewPath keeps the admin overview upstream path stable", () => {
  assert.equal(buildAdminOverviewPath(), "/api/v1/saas/admin/overview");
});

test("buildAdminOverviewFallback keeps preview summary and contract metadata stable", () => {
  const fallback = buildAdminOverviewFallback();

  assert.equal(fallback.data.summary.paid_subscriptions_total, 0);
  assert.equal(fallback.data.summary.past_due_subscriptions_total, 0);
  assert.equal(fallback.data.recent_delivery_workspaces[0]?.next_action_surface, "verification");
  assert.equal(fallback.data.week8_readiness_workspaces[0]?.next_action_surface, "onboarding");
  assert.equal(fallback.data.contract_meta?.source, "fallback_error");
  assert.equal(fallback.data.contract_meta?.issue?.code, "admin_overview_preview_fallback");
  assert.equal(fallback.data.contract_meta?.issue?.details?.path, "/api/v1/saas/admin/overview");
});

test("proxyAdminOverviewGet preserves includeTenant=false and fallback delegation", async () => {
  let capturedPath = "";
  let capturedIncludeTenant: boolean | undefined;
  let capturedSurface: string | null = null;

  const response = await proxyAdminOverviewGet({
    proxy: async ({ path, includeTenant, buildFallback }) => {
      capturedPath = path;
      capturedIncludeTenant = includeTenant;
      capturedSurface = buildFallback().data.recent_delivery_workspaces[0]?.next_action_surface ?? null;
      return new Response("{}", { status: 200 });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(capturedPath, "/api/v1/saas/admin/overview");
  assert.equal(capturedIncludeTenant, false);
  assert.equal(capturedSurface, "verification");
});
