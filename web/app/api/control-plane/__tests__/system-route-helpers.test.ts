import assert from "node:assert/strict";
import test from "node:test";

import { buildHealthPath, proxyHealthGet } from "../system-route-helpers";

test("buildHealthPath keeps the control-plane health endpoint stable", () => {
  assert.equal(buildHealthPath(), "/api/v1/health");
});

test("proxyHealthGet preserves includeTenant=false on the health route", async () => {
  let capturedPath = "";
  let capturedIncludeTenant: boolean | undefined;

  const response = await proxyHealthGet({
    proxy: async (path, options) => {
      capturedPath = path;
      capturedIncludeTenant = options?.includeTenant;
      return new Response("ok", { status: 200 });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(capturedPath, "/api/v1/health");
  assert.equal(capturedIncludeTenant, false);
});
