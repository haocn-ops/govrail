import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkspaceEnterprisePath,
  buildWorkspaceEnterprisePostInit,
} from "../workspace/route-helpers";

test("buildWorkspaceEnterprisePostInit preserves accept/content-type passthrough and POST idempotency metadata", async () => {
  const body = JSON.stringify({ feature: "sso" });
  const request = new Request("https://example.com", {
    method: "POST",
    headers: {
      accept: "application/vnd.govrail+json",
      "content-type": "application/custom",
    },
    body,
  });

  const init = await buildWorkspaceEnterprisePostInit(request);
  const headers = new Headers(init.headers);

  assert.equal(init.method, "POST");
  assert.equal(headers.get("accept"), "application/vnd.govrail+json");
  assert.equal(headers.get("content-type"), "application/custom");
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
  assert.equal(init.body, body);
});

test("buildWorkspaceEnterprisePostInit omits accept/content-type defaults and keeps empty bodies undefined", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
  });

  const init = await buildWorkspaceEnterprisePostInit(request);
  const headers = new Headers(init.headers);

  assert.equal(headers.get("accept"), null);
  assert.equal(headers.get("content-type"), null);
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
  assert.equal(init.body, undefined);
});

test("buildWorkspaceEnterprisePath composes workspace suffixes correctly", () => {
  assert.equal(buildWorkspaceEnterprisePath("workspace-123", "/sso"), "/api/v1/saas/workspaces/workspace-123/sso");
  assert.equal(
    buildWorkspaceEnterprisePath("workspace-123", "/dedicated-environment"),
    "/api/v1/saas/workspaces/workspace-123/dedicated-environment",
  );
});
