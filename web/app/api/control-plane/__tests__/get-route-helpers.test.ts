import assert from "node:assert/strict";
import test from "node:test";

import { proxyMetadataGet } from "../get-route-helpers";

test("proxyMetadataGet returns injected metadata guard response before proxying", async () => {
  let proxyCalled = false;
  const guardResponse = new Response("guarded", { status: 409 });

  const response = await proxyMetadataGet(
    {
      getPath: () => "/api/v1/saas/workspaces/ws_123",
      message: "metadata required",
    },
    {
      resolveWorkspaceContext: async () =>
        ({
          source: "env-fallback",
          source_detail: {
            label: "Environment fallback (non-production)",
            is_fallback: true,
            local_only: true,
            warning: "fallback",
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
      metadataGuard: () => guardResponse,
      proxy: async () => {
        proxyCalled = true;
        return new Response(null, { status: 204 });
      },
    },
  );

  assert.equal(response, guardResponse);
  assert.equal(proxyCalled, false);
});

test("proxyMetadataGet forwards path and includeTenant through injected proxy", async () => {
  let capturedPath = "";
  let capturedIncludeTenant: boolean | undefined;

  const response = await proxyMetadataGet(
    {
      getPath: (workspaceContext) =>
        `/api/v1/saas/workspaces/${workspaceContext.workspace.workspace_id}/members`,
      includeTenant: true,
      message: "metadata required",
    },
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
      metadataGuard: () => null,
      proxy: async (path, options) => {
        capturedPath = path;
        capturedIncludeTenant = options?.includeTenant;
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_123/members");
  assert.equal(capturedIncludeTenant, true);
  assert.equal(response.status, 200);
});
