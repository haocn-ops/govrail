import assert from "node:assert/strict";
import test from "node:test";

import type { WorkspaceContext } from "@/lib/workspace-context";
import {
  buildWorkspaceCollectionPath,
  proxyCollectionGet,
  proxyPathCollectionGet,
  proxyWorkspaceCollectionPost,
  proxyWorkspaceContextCollectionGet,
  proxyWorkspaceContextCollectionPost,
  proxyWorkspaceScopedCollectionGet,
  proxyWorkspaceScopedCollectionPost,
} from "../collection-route-helpers";

test("buildWorkspaceCollectionPath normalizes collection suffixes", () => {
  assert.equal(
    buildWorkspaceCollectionPath("ws_123", "/api-keys"),
    "/api/v1/saas/workspaces/ws_123/api-keys",
  );
  assert.equal(
    buildWorkspaceCollectionPath("ws_123", "service-accounts"),
    "/api/v1/saas/workspaces/ws_123/service-accounts",
  );
});

test("proxyWorkspaceScopedCollectionGet resolves workspace context and delegates fallback GET", async () => {
  const calls: Array<{ path: string; fallback: unknown; workspaceId: string }> = [];

  const response = await proxyWorkspaceScopedCollectionGet({
    suffix: "/invitations",
    fallback: {
      items: [],
      page_info: {
        next_cursor: null,
      },
    },
    resolveWorkspaceContext: async () =>
      ({
        workspace: {
          workspace_id: "ws_123",
          slug: "preview",
          tenant_id: "tenant_123",
        },
      }) as WorkspaceContext,
    proxy: async (path, fallback, options) => {
      calls.push({
        path,
        fallback,
        workspaceId: options?.workspaceContext?.workspace.workspace_id ?? "",
      });
      return Response.json({ ok: true });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/api/v1/saas/workspaces/ws_123/invitations");
  assert.deepEqual(calls[0]?.fallback, {
    items: [],
    page_info: {
      next_cursor: null,
    },
  });
  assert.equal(calls[0]?.workspaceId, "ws_123");
  assert.equal(response.status, 200);
});

test("proxyWorkspaceContextCollectionGet delegates fallback GET with provided workspace context", async () => {
  const calls: Array<{ path: string; fallback: unknown; workspaceId: string }> = [];

  const response = await proxyWorkspaceContextCollectionGet({
    workspaceContext: {
      workspace: {
        workspace_id: "ws_123",
        slug: "preview",
        tenant_id: "tenant_123",
      },
    } as WorkspaceContext,
    suffix: "/invitations",
    fallback: {
      items: [],
      page_info: {
        next_cursor: null,
      },
    },
  }, {
    proxy: async (path, fallback, options) => {
      calls.push({
        path,
        fallback,
        workspaceId: options?.workspaceContext?.workspace.workspace_id ?? "",
      });
      return Response.json({ ok: true });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/api/v1/saas/workspaces/ws_123/invitations");
  assert.deepEqual(calls[0]?.fallback, {
    items: [],
    page_info: {
      next_cursor: null,
    },
  });
  assert.equal(calls[0]?.workspaceId, "ws_123");
  assert.equal(response.status, 200);
});

test("proxyPathCollectionGet delegates path-based fallback GET without workspace context", async () => {
  const calls: Array<{ path: string; fallback: unknown }> = [];

  const response = await proxyPathCollectionGet({
    path: "/api/v1/tool-providers",
    fallback: {
      items: [],
      page_info: {
        next_cursor: null,
      },
    },
    proxy: async (path, fallback) => {
      calls.push({ path, fallback });
      return Response.json({ ok: true });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/api/v1/tool-providers");
  assert.deepEqual(calls[0]?.fallback, {
    items: [],
    page_info: {
      next_cursor: null,
    },
  });
  assert.equal(response.status, 200);
});

test("proxyCollectionGet forwards optional workspace context to fallback GET", async () => {
  const calls: Array<{ path: string; fallback: unknown; workspaceId: string | null }> = [];

  const response = await proxyCollectionGet({
    path: "/api/v1/saas/workspaces/ws_789/invitations",
    fallback: {
      items: [],
      page_info: {
        next_cursor: null,
      },
    },
    workspaceContext: {
      workspace: {
        workspace_id: "ws_789",
        slug: "preview",
        tenant_id: "tenant_789",
      },
    } as WorkspaceContext,
  }, {
    proxy: async (path, fallback, options) => {
      calls.push({
        path,
        fallback,
        workspaceId: options?.workspaceContext?.workspace.workspace_id ?? null,
      });
      return Response.json({ ok: true });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/api/v1/saas/workspaces/ws_789/invitations");
  assert.deepEqual(calls[0]?.fallback, {
    items: [],
    page_info: {
      next_cursor: null,
    },
  });
  assert.equal(calls[0]?.workspaceId, "ws_789");
  assert.equal(response.status, 200);
});

test("proxyWorkspaceScopedCollectionPost resolves workspace context and delegates collection POST", async () => {
  const calls: Array<{
    request: Request;
    workspace: WorkspaceContext["workspace"];
    path: string;
    contentType?: string;
  }> = [];
  const request = new Request("https://example.com", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "demo" }),
  });

  const response = await proxyWorkspaceScopedCollectionPost({
    request,
    suffix: "/api-keys",
    contentType: "application/json",
    resolveWorkspaceContext: async () =>
      ({
        workspace: {
          workspace_id: "ws_123",
          slug: "preview",
          tenant_id: "tenant_123",
        },
      }) as WorkspaceContext,
    proxyPost: async (args) => {
      calls.push(args);
      return Response.json({ ok: true });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/api/v1/saas/workspaces/ws_123/api-keys");
  assert.equal(calls[0]?.workspace.workspace_id, "ws_123");
  assert.equal(calls[0]?.contentType, "application/json");
  assert.equal(response.status, 200);
});

test("proxyWorkspaceCollectionPost delegates collection POST with the provided workspace context", async () => {
  const calls: Array<{
    request: Request;
    workspace: WorkspaceContext["workspace"];
    path: string;
    contentType?: string;
  }> = [];
  const request = new Request("https://example.com", {
    method: "POST",
    body: JSON.stringify({ name: "run" }),
  });

  const response = await proxyWorkspaceCollectionPost({
    request,
    path: "/api/v1/runs",
    contentType: "application/json",
    workspaceContext: {
      workspace: {
        workspace_id: "ws_456",
        slug: "staging",
        tenant_id: "tenant_456",
      },
    } as WorkspaceContext,
  }, {
    proxyPost: async (args) => {
      calls.push(args);
      return Response.json({ ok: true });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/api/v1/runs");
  assert.equal(calls[0]?.workspace.workspace_id, "ws_456");
  assert.equal(calls[0]?.contentType, "application/json");
  assert.equal(response.status, 200);
});

test("proxyWorkspaceContextCollectionPost resolves workspace context and delegates path-based collection POST", async () => {
  const calls: Array<{
    request: Request;
    workspace: WorkspaceContext["workspace"];
    path: string;
    contentType?: string;
  }> = [];
  const request = new Request("https://example.com", {
    method: "POST",
    body: JSON.stringify({ name: "run" }),
  });

  const response = await proxyWorkspaceContextCollectionPost({
    request,
    path: "/api/v1/runs",
    contentType: "application/json",
    resolveWorkspaceContext: async () =>
      ({
        workspace: {
          workspace_id: "ws_123",
          slug: "preview",
          tenant_id: "tenant_123",
        },
      }) as WorkspaceContext,
    proxyPost: async (args) => {
      calls.push(args);
      return Response.json({ ok: true });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/api/v1/runs");
  assert.equal(calls[0]?.workspace.workspace_id, "ws_123");
  assert.equal(calls[0]?.contentType, "application/json");
  assert.equal(response.status, 200);
});

test("proxyWorkspaceContextCollectionPost reuses a provided workspace context without resolving again", async () => {
  let resolveCalls = 0;
  const calls: Array<{
    request: Request;
    workspace: WorkspaceContext["workspace"];
    path: string;
    contentType?: string;
  }> = [];
  const request = new Request("https://example.com", {
    method: "POST",
    body: JSON.stringify({ name: "run" }),
  });

  const response = await proxyWorkspaceContextCollectionPost({
    request,
    path: "/api/v1/runs",
    contentType: "application/json",
    workspaceContext: {
      workspace: {
        workspace_id: "ws_789",
        slug: "preview",
        tenant_id: "tenant_789",
      },
    } as WorkspaceContext,
    resolveWorkspaceContext: async () => {
      resolveCalls += 1;
      throw new Error("workspace context should not be resolved");
    },
    proxyPost: async (args) => {
      calls.push(args);
      return Response.json({ ok: true });
    },
  });

  assert.equal(resolveCalls, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, "/api/v1/runs");
  assert.equal(calls[0]?.workspace.workspace_id, "ws_789");
  assert.equal(response.status, 200);
});
