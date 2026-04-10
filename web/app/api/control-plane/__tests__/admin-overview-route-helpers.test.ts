import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminOverviewFallback,
  buildAdminOverviewPath,
  proxyAdminOverviewGet,
} from "../admin/route-helpers";

test("buildAdminOverviewPath keeps admin overview endpoint stable", () => {
  assert.equal(buildAdminOverviewPath(), "/api/v1/saas/admin/overview");
});

test("buildAdminOverviewFallback keeps preview admin snapshot contract stable", () => {
  const fallback = buildAdminOverviewFallback();

  assert.equal(fallback.data.summary.organizations_total, 1);
  assert.equal(fallback.data.summary.paid_subscriptions_total, 0);
  assert.equal(fallback.data.attention_workspaces[0]?.next_action_surface, "verification");
  assert.equal(fallback.data.week8_readiness_workspaces[0]?.next_action_surface, "onboarding");
  assert.equal(fallback.data.contract_meta?.issue?.code, "admin_overview_preview_fallback");
  assert.equal(fallback.data.contract_meta?.issue?.details?.path, "/api/v1/saas/admin/overview");
});

test("proxyAdminOverviewGet keeps includeTenant=false and delegates fallback GET through injected proxy", async () => {
  let capturedPath = "";
  let capturedIncludeTenant = true;
  let fallbackIssueCode = "";

  const response = await proxyAdminOverviewGet({
    proxy: async ({ path, includeTenant, buildFallback }) => {
      capturedPath = path;
      capturedIncludeTenant = includeTenant ?? true;
      fallbackIssueCode = buildFallback(new Response(null, { status: 503 })).data.contract_meta?.issue?.code ?? "";
      return new Response("{}", { status: 200 });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(capturedPath, "/api/v1/saas/admin/overview");
  assert.equal(capturedIncludeTenant, false);
  assert.equal(fallbackIssueCode, "admin_overview_preview_fallback");
});
