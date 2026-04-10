import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBillingGetProxyInit,
  buildBillingPostProxyInit,
  buildWorkspaceBillingPath,
  proxyWorkspaceBillingGet,
  proxyWorkspaceBillingPost,
} from "../workspace/billing/route-helpers";

test("buildBillingGetProxyInit enforces GET method", () => {
  const init = buildBillingGetProxyInit();

  assert.strictEqual(init.method, "GET");
});

test("buildWorkspaceBillingPath composes workspace-scoped billing suffixes", () => {
  assert.strictEqual(
    buildWorkspaceBillingPath("ws_123", "/checkout-sessions"),
    "/api/v1/saas/workspaces/ws_123/billing/checkout-sessions",
  );
  assert.strictEqual(
    buildWorkspaceBillingPath("ws_123", "/checkout-sessions/session_123:complete"),
    "/api/v1/saas/workspaces/ws_123/billing/checkout-sessions/session_123:complete",
  );
  assert.strictEqual(
    buildWorkspaceBillingPath("ws_123", "/subscription:resume"),
    "/api/v1/saas/workspaces/ws_123/billing/subscription:resume",
  );
});

test("buildBillingPostProxyInit keeps provided headers, body, and sets POST metadata", async () => {
  const body = JSON.stringify({ foo: "bar" });
  const request = new Request("https://example.com", {
    method: "POST",
    headers: {
      "content-type": "application/custom",
    },
    body,
  });

  const init = await buildBillingPostProxyInit(request);
  const headers = new Headers(init.headers);

  assert.strictEqual(init.method, "POST");
  assert.strictEqual(headers.get("accept"), "application/json");
  assert.strictEqual(headers.get("content-type"), "application/custom");
  assert.strictEqual(init.body, body);
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
});

test("buildBillingPostProxyInit defaults to application/json when content-type is missing", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    body: "[]",
  });
  request.headers.delete("content-type");
  const init = await buildBillingPostProxyInit(request);
  const headers = new Headers(init.headers);

  assert.strictEqual(headers.get("accept"), "application/json");
  assert.strictEqual(headers.get("content-type"), "application/json");
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
});

test("proxyWorkspaceBillingGet keeps workspace-scoped billing path and GET init wiring", async () => {
  let capturedPath = "";
  let capturedInit: RequestInit | undefined;
  let capturedWorkspaceId = "";

  const response = await proxyWorkspaceBillingGet("/providers", {
    resolveWorkspaceContext: async () =>
      ({
        workspace: {
          workspace_id: "ws_123",
        },
      }) as never,
    proxy: async (path, options) => {
      capturedPath = path;
      capturedInit = options?.init;
      capturedWorkspaceId = options?.workspaceContext?.workspace.workspace_id ?? "";
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.strictEqual(capturedPath, "/api/v1/saas/workspaces/ws_123/billing/providers");
  assert.strictEqual(capturedInit?.method, "GET");
  assert.strictEqual(capturedWorkspaceId, "ws_123");
  assert.strictEqual(response.status, 200);
});

test("proxyWorkspaceBillingPost keeps workspace-scoped billing path and injected POST init wiring", async () => {
  let capturedPath = "";
  let capturedInit: RequestInit | undefined;
  let capturedWorkspaceId = "";

  const response = await proxyWorkspaceBillingPost(
    new Request("https://example.com", {
      method: "POST",
      body: '{"plan":"pro"}',
    }),
    "/checkout-sessions",
    {
      resolveWorkspaceContext: async () =>
        ({
          workspace: {
            workspace_id: "ws_123",
          },
        }) as never,
      initBuilder: async () => ({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: '{"plan":"pro"}',
      }),
      proxy: async (path, options) => {
        capturedPath = path;
        capturedInit = options?.init;
        capturedWorkspaceId = options?.workspaceContext?.workspace.workspace_id ?? "";
        return new Response("{}", {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  assert.strictEqual(capturedPath, "/api/v1/saas/workspaces/ws_123/billing/checkout-sessions");
  assert.strictEqual(capturedInit?.method, "POST");
  assert.strictEqual(capturedWorkspaceId, "ws_123");
  assert.strictEqual(new Headers(capturedInit?.headers).get("content-type"), "application/json");
  assert.strictEqual(capturedInit?.body, '{"plan":"pro"}');
  assert.strictEqual(response.status, 202);
});
