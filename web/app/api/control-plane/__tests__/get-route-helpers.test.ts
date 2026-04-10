import assert from "node:assert/strict";
import test from "node:test";

import {
  proxyMetadataGet,
  proxyPathGet,
  proxyRequestPathGet,
  proxyWorkspaceContextGet,
  proxyWorkspaceScopedGet,
} from "../get-route-helpers";

test("proxyPathGet forwards path includeTenant and init through injected proxy", async () => {
  let capturedPath = "";
  let capturedIncludeTenant: boolean | undefined;
  let capturedInit: RequestInit | undefined;

  const response = await proxyPathGet(
    {
      path: "/api/v1/health",
      includeTenant: false,
      init: {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      },
    },
    {
      proxy: async (path, options) => {
        capturedPath = path;
        capturedIncludeTenant = options?.includeTenant;
        capturedInit = options?.init;
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  assert.equal(capturedPath, "/api/v1/health");
  assert.equal(capturedIncludeTenant, false);
  assert.equal(capturedInit?.method, "GET");
  assert.equal(new Headers(capturedInit?.headers).get("accept"), "application/json");
  assert.equal(response.status, 200);
});

test("proxyRequestPathGet appends request search params before delegating", async () => {
  let capturedPath = "";

  const response = await proxyRequestPathGet(
    {
      request: new Request("https://example.com/api/runs/run_123/events?cursor=abc"),
      path: "/api/v1/runs/run_123/events",
    },
    {
      proxy: async (path) => {
        capturedPath = path;
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  assert.equal(capturedPath, "/api/v1/runs/run_123/events?cursor=abc");
  assert.equal(response.status, 200);
});

test("proxyWorkspaceContextGet forwards an already resolved workspace context", async () => {
  let capturedPath = "";
  let capturedWorkspaceId = "";
  let capturedInit: RequestInit | undefined;

  const response = await proxyWorkspaceContextGet(
    {
      workspaceContext: {
        source: "metadata",
        source_detail: {
          label: "SaaS metadata",
          is_fallback: false,
          local_only: false,
          warning: null,
          session_checkpoint_required: false,
          checkpoint_label: "Trusted metadata session",
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
      } as never,
      getPath: (workspaceContext) =>
        `/api/v1/saas/workspaces/${workspaceContext.workspace.workspace_id}/members`,
      init: {
        method: "GET",
      },
    },
    {
      proxy: async (path, options) => {
        capturedPath = path;
        capturedWorkspaceId = options?.workspaceContext?.workspace.workspace_id ?? "";
        capturedInit = options?.init;
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_123/members");
  assert.equal(capturedWorkspaceId, "ws_123");
  assert.equal(capturedInit?.method, "GET");
  assert.equal(response.status, 200);
});

test("proxyWorkspaceScopedGet resolves workspace context and forwards init through injected proxy", async () => {
  let capturedPath = "";
  let capturedIncludeTenant: boolean | undefined;
  let capturedWorkspaceId = "";
  let capturedInit: RequestInit | undefined;

  const response = await proxyWorkspaceScopedGet(
    {
      getPath: (workspaceContext) =>
        `/api/v1/saas/workspaces/${workspaceContext.workspace.workspace_id}/billing/providers`,
      includeTenant: false,
      init: {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      },
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
            session_checkpoint_required: false,
            checkpoint_label: "Trusted metadata session",
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
      proxy: async (path, options) => {
        capturedPath = path;
        capturedIncludeTenant = options?.includeTenant;
        capturedWorkspaceId = options?.workspaceContext?.workspace.workspace_id ?? "";
        capturedInit = options?.init;
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_123/billing/providers");
  assert.equal(capturedIncludeTenant, false);
  assert.equal(capturedWorkspaceId, "ws_123");
  assert.equal(capturedInit?.method, "GET");
  assert.equal(new Headers(capturedInit?.headers).get("accept"), "application/json");
  assert.equal(response.status, 200);
});

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
            session_checkpoint_required: true,
            checkpoint_label: "Session checkpoint required",
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
  let capturedWorkspaceId = "";

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
            session_checkpoint_required: false,
            checkpoint_label: "Trusted metadata session",
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
        capturedWorkspaceId = options?.workspaceContext?.workspace.workspace_id ?? "";
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );

  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_123/members");
  assert.equal(capturedIncludeTenant, true);
  assert.equal(capturedWorkspaceId, "ws_123");
  assert.equal(response.status, 200);
});
