import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeliveryFallbackTrack,
  buildDeliveryPath,
  buildWorkspaceDeliveryPostInit,
  proxyWorkspaceDeliveryGet,
  proxyWorkspaceDeliveryPost,
} from "../workspace/delivery/route-helpers";

test("buildDeliveryPath composes the workspace delivery endpoint", () => {
  assert.equal(
    buildDeliveryPath("ws_123"),
    "/api/v1/saas/workspaces/ws_123/delivery",
  );
});

test("buildDeliveryFallbackTrack keeps delivery preview fallback contract stable", () => {
  const track = buildDeliveryFallbackTrack("ws_123", 503);

  assert.equal(track.workspace_id, "ws_123");
  assert.equal(track.verification.status, "pending");
  assert.equal(track.go_live.status, "pending");
  assert.equal(track.contract_meta?.source, "fallback_error");
  assert.equal(track.contract_meta?.issue?.code, "workspace_delivery_preview_fallback");
  assert.equal(track.contract_meta?.issue?.status, 503);
  assert.equal(track.contract_meta?.issue?.details?.path, "/api/v1/saas/workspaces/ws_123/delivery");
});

test("proxyWorkspaceDeliveryGet resolves workspace context and forwards includeTenant fallback args", async () => {
  let capturedPath = "";
  let capturedIncludeTenant = false;
  let capturedFallbackStatus = 0;
  let capturedWorkspaceId = "";

  const response = await proxyWorkspaceDeliveryGet({
    resolveWorkspaceContext: async () =>
      ({
        workspace: {
          workspace_id: "ws_123",
          slug: "acme",
          tenant_id: "tenant_123",
        },
      }) as never,
    proxy: async ({ path, includeTenant, workspaceContext, buildFallback }) => {
      capturedPath = path;
      capturedIncludeTenant = includeTenant ?? false;
      capturedWorkspaceId = workspaceContext?.workspace.workspace_id ?? "";
      capturedFallbackStatus = buildFallback(new Response(null, { status: 404 })).data.contract_meta?.issue?.status ?? 0;
      return new Response("{}", { status: 200 });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_123/delivery");
  assert.equal(capturedIncludeTenant, true);
  assert.equal(capturedWorkspaceId, "ws_123");
  assert.equal(capturedFallbackStatus, 404);
});

test("buildWorkspaceDeliveryPostInit forces JSON content-type and empty-body passthrough semantics", async () => {
  const init = await buildWorkspaceDeliveryPostInit(
    new Request("https://example.com", {
      method: "POST",
      body: '{"ok":true}',
      headers: {
        accept: "application/json",
        "content-type": "application/merge-patch+json",
      },
    }),
  );
  const headers = new Headers(init.headers);

  assert.equal(init.method, "POST");
  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.get("content-type"), "application/json");
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
  assert.equal(init.body, '{"ok":true}');
});

test("proxyWorkspaceDeliveryPost resolves workspace context and proxies POST with includeTenant=true", async () => {
  let capturedPath = "";
  let capturedIncludeTenant = false;
  let capturedInit: RequestInit | undefined;
  let capturedWorkspaceId = "";
  const request = new Request("https://example.com", {
    method: "POST",
    body: '{"ok":true}',
  });

  const response = await proxyWorkspaceDeliveryPost({
    request,
    resolveWorkspaceContext: async () =>
      ({
        workspace: {
          workspace_id: "ws_123",
          slug: "acme",
          tenant_id: "tenant_123",
        },
      }) as never,
    initBuilder: async (requestArg) => {
      assert.equal(requestArg, request);
      return {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: '{"ok":true}',
      };
    },
    proxy: async (path, options) => {
      capturedPath = path;
      capturedIncludeTenant = options?.includeTenant ?? false;
      capturedInit = options?.init;
      capturedWorkspaceId = options?.workspaceContext?.workspace.workspace_id ?? "";
      return new Response("{}", { status: 202 });
    },
  });

  const headers = new Headers(capturedInit?.headers);
  assert.equal(response.status, 202);
  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_123/delivery");
  assert.equal(capturedIncludeTenant, true);
  assert.equal(capturedWorkspaceId, "ws_123");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(capturedInit?.body, '{"ok":true}');
});
