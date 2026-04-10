import assert from "node:assert/strict";
import test from "node:test";

import type { WorkspaceContext } from "@/lib/workspace-context";
import {
  proxyFallbackGet,
  proxyPathFallbackGet,
  proxyWorkspaceContextFallbackGet,
  proxyWorkspaceScopedFallbackGet,
} from "../fallback-route-helpers";

test("proxyFallbackGet returns upstream on success", async () => {
  let capturedPath = "";
  let capturedIncludeTenant: boolean | undefined;

  const upstream = new Response("ok", { status: 200 });

  const response = await proxyFallbackGet({
    path: "/api/test",
    includeTenant: false,
    proxy: async (path, options) => {
      capturedPath = path;
      capturedIncludeTenant = options?.includeTenant;
      return upstream;
    },
    buildFallback: () => ({ data: { preview: true } }),
  });

  assert.equal(response, upstream);
  assert.equal(capturedPath, "/api/test");
  assert.equal(capturedIncludeTenant, false);
});

test("proxyFallbackGet returns upstream on non fallback errors", async () => {
  const upstream = new Response("server error", { status: 500 });

  const response = await proxyFallbackGet({
    path: "/api/other",
    buildFallback: () => ({ data: { preview: true } }),
    proxy: async () => upstream,
  });

  assert.equal(response, upstream);
});

test("proxyFallbackGet wraps fallback for 404 and 503", async () => {
  const response = await proxyFallbackGet({
    path: "/api/fallback",
    buildFallback: (upstream) => ({
      data: { mode: "preview" },
      meta: { request_id: "custom-request" },
      // Keep the upstream status available for fallback payload builders.
    }),
    proxy: async () => new Response("not found", { status: 404 }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {
    data: { mode: "preview" },
    meta: {
      request_id: "custom-request",
      trace_id: "preview-trace",
    },
  });
});

test("proxyFallbackGet passes the upstream response to the fallback builder", async () => {
  let observedStatus: number | null = null;

  const response = await proxyFallbackGet({
    path: "/api/delivery",
    buildFallback: (upstream) => {
      observedStatus = upstream.status;
      return { data: { preview: true } };
    },
    proxy: async () => new Response("control plane unavailable", { status: 503 }),
  });

  assert.equal(response.status, 200);
  assert.equal(observedStatus, 503);
});

test("proxyPathFallbackGet delegates args to proxyFallbackGet", async () => {
  let capturedPath = "";
  let capturedIncludeTenant: boolean | undefined;

  const response = await proxyPathFallbackGet({
    path: "/api/fallback",
    includeTenant: false,
    buildFallback: () => ({ data: { preview: true } }),
  }, {
    proxy: async ({ path, includeTenant, buildFallback }) => {
      capturedPath = path;
      capturedIncludeTenant = includeTenant;
      return Response.json(buildFallback(new Response("missing", { status: 404 })));
    },
  });

  assert.equal(capturedPath, "/api/fallback");
  assert.equal(capturedIncludeTenant, false);
  assert.equal(response.status, 200);
});

test("proxyWorkspaceContextFallbackGet derives the path from the provided workspace context", async () => {
  let capturedPath = "";
  let capturedWorkspaceId = "";
  let capturedIssuePath = "";

  const response = await proxyWorkspaceContextFallbackGet({
    workspaceContext: {
      workspace: {
        workspace_id: "ws_123",
        slug: "preview",
        tenant_id: "tenant_123",
      },
    } as WorkspaceContext,
    includeTenant: true,
    getPath: (workspaceContext) => `/api/v1/saas/workspaces/${workspaceContext.workspace.workspace_id}/delivery`,
    buildFallback: (upstream, workspaceContext) => ({
      data: {
        workspace_id: workspaceContext.workspace.workspace_id,
        status: upstream.status,
      },
      meta: {
        request_id: "delivery-preview",
      },
    }),
  }, {
    proxy: async ({ path, workspaceContext, buildFallback }) => {
      capturedPath = path;
      capturedWorkspaceId = workspaceContext?.workspace.workspace_id ?? "";
      const fallback = buildFallback(new Response("unavailable", { status: 503 }));
      capturedIssuePath = fallback.data.workspace_id;
      return Response.json(fallback);
    },
  });

  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_123/delivery");
  assert.equal(capturedWorkspaceId, "ws_123");
  assert.equal(capturedIssuePath, "ws_123");
  assert.equal(response.status, 200);
});

test("proxyWorkspaceScopedFallbackGet resolves workspace context before delegating", async () => {
  let resolveCalls = 0;
  let capturedPath = "";
  let capturedWorkspaceId = "";

  const response = await proxyWorkspaceScopedFallbackGet({
    includeTenant: true,
    getPath: (workspaceContext) => `/api/v1/saas/workspaces/${workspaceContext.workspace.workspace_id}/delivery`,
    buildFallback: (upstream, workspaceContext) => ({
      data: {
        workspace_id: workspaceContext.workspace.workspace_id,
        status: upstream.status,
      },
    }),
  }, {
    resolveWorkspaceContext: async () => {
      resolveCalls += 1;
      return {
        workspace: {
          workspace_id: "ws_456",
          slug: "staging",
          tenant_id: "tenant_456",
        },
      } as WorkspaceContext;
    },
    proxy: async ({ path, workspaceContext, buildFallback }) => {
      capturedPath = path;
      capturedWorkspaceId = workspaceContext?.workspace.workspace_id ?? "";
      return Response.json(buildFallback(new Response("missing", { status: 404 })));
    },
  });

  assert.equal(resolveCalls, 1);
  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_456/delivery");
  assert.equal(capturedWorkspaceId, "ws_456");
  assert.equal(response.status, 200);
});
