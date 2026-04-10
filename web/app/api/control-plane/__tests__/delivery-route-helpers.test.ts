import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeliveryFallbackTrack,
  buildDeliveryPath,
  buildWorkspaceDeliveryPostInit,
  proxyWorkspaceDeliveryGet,
  proxyWorkspaceDeliveryPost,
} from "../workspace/delivery/route-helpers";

test("buildDeliveryPath composes workspace delivery endpoint", () => {
  assert.equal(buildDeliveryPath("ws_123"), "/api/v1/saas/workspaces/ws_123/delivery");
});

test("buildDeliveryFallbackTrack keeps preview fallback issue contract", () => {
  const track = buildDeliveryFallbackTrack("ws_123", 503);

  assert.equal(track.workspace_id, "ws_123");
  assert.equal(track.contract_meta?.source, "fallback_error");
  assert.equal(track.contract_meta?.issue?.code, "workspace_delivery_preview_fallback");
  assert.equal(track.contract_meta?.issue?.status, 503);
  assert.equal(
    track.contract_meta?.issue?.details.path,
    "/api/v1/saas/workspaces/ws_123/delivery",
  );
});

test("proxyWorkspaceDeliveryGet preserves includeTenant and fallback metadata semantics", async () => {
  let capturedPath = "";
  let capturedIncludeTenant: boolean | undefined;
  let capturedWorkspaceId = "";

  const response = await proxyWorkspaceDeliveryGet({
    resolveWorkspaceContext: async () =>
      ({
        workspace: {
          workspace_id: "ws_123",
        },
      }) as never,
    proxy: async (args, options) => {
      const workspaceContext = await options?.resolveWorkspaceContext?.();
      capturedPath = args.getPath(workspaceContext as never);
      capturedIncludeTenant = args.includeTenant;
      capturedWorkspaceId = workspaceContext?.workspace.workspace_id ?? "";
      return Response.json(args.buildFallback(new Response("unavailable", { status: 503 }), workspaceContext as never));
    },
  });

  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_123/delivery");
  assert.equal(capturedIncludeTenant, true);
  assert.equal(capturedWorkspaceId, "ws_123");
  const payload = await response.json();
  assert.equal(payload.data.workspace_id, "ws_123");
  assert.equal(payload.data.contract_meta?.source, "fallback_error");
  assert.equal(payload.data.contract_meta?.issue?.code, "workspace_delivery_preview_fallback");
  assert.equal(payload.data.contract_meta?.issue?.status, 503);
  assert.equal(payload.data.contract_meta?.issue?.details?.path, buildDeliveryPath("ws_123"));
  assert.equal(payload.meta?.request_id, "delivery-preview-unavailable");
  assert.equal(payload.meta?.trace_id, "delivery-preview-unavailable-trace");
});

test("buildWorkspaceDeliveryPostInit keeps delivery JSON post init contract stable", async () => {
  const init = await buildWorkspaceDeliveryPostInit(
    new Request("https://example.com", {
      method: "POST",
      body: '{"ok":true}',
      headers: {
        accept: "application/json",
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

test("proxyWorkspaceDeliveryPost preserves includeTenant and JSON POST init", async () => {
  let capturedPath = "";
  let capturedIncludeTenant: boolean | undefined;
  let capturedInit: RequestInit | undefined;
  let capturedWorkspaceId = "";

  const response = await proxyWorkspaceDeliveryPost({
    request: new Request("https://example.com", {
      method: "POST",
      body: '{"ok":true}',
    }),
    resolveWorkspaceContext: async () =>
      ({
        workspace: {
          workspace_id: "ws_123",
        },
      }) as never,
    initBuilder: async (request) => {
      assert.equal(request.method, "POST");
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
      capturedIncludeTenant = options?.includeTenant;
      capturedInit = options?.init;
      capturedWorkspaceId = options?.workspaceContext?.workspace.workspace_id ?? "";
      return new Response("{}", {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_123/delivery");
  assert.equal(capturedIncludeTenant, true);
  assert.equal(capturedWorkspaceId, "ws_123");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(new Headers(capturedInit?.headers).get("content-type"), "application/json");
  assert.equal(capturedInit?.body, '{"ok":true}');
  assert.equal(response.status, 202);
});
