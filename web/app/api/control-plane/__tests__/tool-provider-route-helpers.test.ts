import assert from "node:assert/strict";
import test from "node:test";

import {
  buildToolProviderPath,
  buildToolProviderPostInit,
  proxyToolProviderPost,
} from "../tool-providers/route-helpers";

test("buildToolProviderPath keeps update and disable upstream paths stable", () => {
  assert.equal(buildToolProviderPath("provider_123"), "/api/v1/tool-providers/provider_123");
  assert.equal(
    buildToolProviderPath("provider_123", "disable"),
    "/api/v1/tool-providers/provider_123:disable",
  );
});

test("buildToolProviderPostInit preserves accept/content-type/body and idempotency", async () => {
  const body = '{"enabled":false}';
  const init = await buildToolProviderPostInit(
    new Request("https://example.com", {
      method: "POST",
      body,
      headers: {
        accept: "application/vnd.govrail+json",
        "content-type": "application/merge-patch+json",
      },
    }),
  );
  const headers = new Headers(init.headers);

  assert.equal(init.method, "POST");
  assert.equal(headers.get("accept"), "application/vnd.govrail+json");
  assert.equal(headers.get("content-type"), "application/merge-patch+json");
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
  assert.equal(init.body, body);
});

test("proxyToolProviderPost keeps injected workspace context, path, and post init wiring stable", async () => {
  let capturedPath = "";
  let capturedWorkspaceId = "";
  let capturedInit: RequestInit | undefined;

  const response = await proxyToolProviderPost(
    new Request("https://example.com", {
      method: "POST",
      body: '{"enabled":false}',
      headers: {
        "content-type": "application/json",
      },
    }),
    "provider_123",
    "disable",
    {
      resolveWorkspaceContext: async () =>
        ({
          source: "metadata",
          source_detail: {
            label: "SaaS metadata",
            is_fallback: false,
            local_only: false,
            warning: null,
          },
          session_user: null,
          workspace: {
            workspace_id: "ws_123",
            slug: "acme",
            display_name: "Acme",
            tenant_id: "tenant_123",
          },
          available_workspaces: [],
          selection: {
            requested_workspace_id: null,
            requested_workspace_slug: null,
            cookie_workspace: null,
          },
        }) as never,
      initBuilder: async () => ({
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": "web-test",
        },
        body: '{"enabled":false}',
      }),
      proxy: async (path, options) => {
        capturedPath = path;
        capturedWorkspaceId = (options?.workspaceContext as { workspace: { workspace_id: string } } | undefined)?.workspace
          .workspace_id;
        capturedInit = options?.init;
        return new Response("{}", {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  const headers = new Headers(capturedInit?.headers);

  assert.equal(capturedPath, "/api/v1/tool-providers/provider_123:disable");
  assert.equal(capturedWorkspaceId, "ws_123");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("idempotency-key"), "web-test");
  assert.equal(capturedInit?.body, '{"enabled":false}');
  assert.equal(response.status, 202);
});
