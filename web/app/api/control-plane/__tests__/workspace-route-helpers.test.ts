import assert from "node:assert/strict";
import test from "node:test";

import {
  type WorkspaceBootstrapHeaderContext,
  buildWorkspaceBootstrapPath,
  buildWorkspaceBootstrapProxyInit,
  buildWorkspaceCreateProxyInit,
  proxyWorkspaceBootstrapPost,
  proxyWorkspaceCreatePost,
  proxyWorkspaceTenantlessPost,
} from "../workspaces/route-helpers";

test("buildWorkspaceBootstrapPath composes workspace bootstrap endpoint", () => {
  assert.equal(
    buildWorkspaceBootstrapPath("ws_123"),
    "/api/v1/saas/workspaces/ws_123/bootstrap",
  );
});

test("buildWorkspaceCreateProxyInit preserves method/body/idempotency without injecting accept", async () => {
  const payload = JSON.stringify({ foo: "bar" });
  const request = new Request("https://example.com", {
    method: "POST",
    body: payload,
  });

  const init = await buildWorkspaceCreateProxyInit(request);
  const headers = new Headers(init.headers);

  assert.equal(init.method, "POST");
  assert.equal(headers.get("accept"), null);
  assert.equal(headers.get("content-type"), "application/json");
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
  assert.equal(init.body, payload);
});

test("buildWorkspaceBootstrapProxyInit forwards auth headers and workspace metadata when current workspace matches", async () => {
  const body = JSON.stringify({ foo: "bar" });
  const request = new Request("https://example.com", {
    method: "POST",
    headers: {
      "x-authenticated-subject": "owner@example.com",
      "x-authenticated-roles": "workspace_owner",
    },
    body,
  });

  const init = await buildWorkspaceBootstrapProxyInit(request, {
    workspaceId: "ws_123",
    currentWorkspace: {
      workspace_id: "ws_123",
      slug: "acme",
      tenant_id: "tenant_123",
    },
  });
  const headers = new Headers(init.headers);

  assert.equal(headers.get("x-authenticated-subject"), "owner@example.com");
  assert.equal(headers.get("x-authenticated-roles"), "workspace_owner");
  assert.equal(headers.get("x-workspace-id"), "ws_123");
  assert.equal(headers.get("x-workspace-slug"), "acme");
  assert.equal(headers.get("x-tenant-id"), "tenant_123");
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
  assert.equal(init.body, body);
});

test("buildWorkspaceBootstrapProxyInit omits slug/tenant when linking a different workspace", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    body: "{}",
    headers: {
      "cf-access-authenticated-user-email": "owner@example.com",
      "cf-access-authenticated-user-groups": "platform_admin",
    },
  });

  const init = await buildWorkspaceBootstrapProxyInit(request, {
    workspaceId: "ws_123",
    currentWorkspace: {
      workspace_id: "ws_other",
      slug: "other",
      tenant_id: "tenant_other",
    },
  });
  const headers = new Headers(init.headers);

  assert.equal(headers.get("x-authenticated-subject"), "owner@example.com");
  assert.equal(headers.get("x-authenticated-roles"), "platform_admin");
  assert.equal(headers.get("x-workspace-id"), "ws_123");
  assert.equal(headers.get("x-workspace-slug"), null);
  assert.equal(headers.get("x-tenant-id"), null);
});

test("buildWorkspaceBootstrapProxyInit does not forward legacy x-subject-id without trusted SaaS auth headers", async () => {
  const body = JSON.stringify({ foo: "bar" });
  const request = new Request("https://example.com", {
    method: "POST",
    body,
    headers: {
      "x-subject-id": "spoofed@example.com",
    },
  });

  const init = await buildWorkspaceBootstrapProxyInit(request, {
    workspaceId: "ws_123",
    currentWorkspace: {
      workspace_id: "ws_123",
      slug: "acme",
      tenant_id: "tenant_123",
    },
  });
  const headers = new Headers(init.headers);

  assert.equal(headers.get("x-authenticated-subject"), null);
  assert.equal(headers.get("x-authenticated-roles"), null);
  assert.equal(headers.get("x-workspace-id"), "ws_123");
  assert.equal(headers.get("x-workspace-slug"), "acme");
  assert.equal(headers.get("x-tenant-id"), "tenant_123");
  assert.equal(init.body, body);
});

test("proxyWorkspaceCreatePost keeps includeTenant=false and uses injected proxy/init builder", async () => {
  let capturedPath = "";
  let capturedOptions: { includeTenant?: boolean; init?: RequestInit } | undefined;
  const response = new Response(null, { status: 202 });

  const result = await proxyWorkspaceCreatePost(
    new Request("https://example.com", {
      method: "POST",
      body: '{"slug":"acme"}',
    }),
    {
      initBuilder: async () => ({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: '{"slug":"acme"}',
      }),
      proxy: async (path, options) => {
        capturedPath = path;
        capturedOptions = options;
        return response;
      },
    },
  );

  assert.equal(result, response);
  assert.equal(capturedPath, "/api/v1/saas/workspaces");
  assert.equal(capturedOptions?.includeTenant, false);
  assert.equal(capturedOptions?.init?.method, "POST");
  assert.equal(new Headers(capturedOptions?.init?.headers).get("content-type"), "application/json");
  assert.equal(capturedOptions?.init?.body, '{"slug":"acme"}');
});

test("proxyWorkspaceTenantlessPost keeps includeTenant=false and delegates init builder output", async () => {
  let capturedPath = "";
  let capturedOptions: { includeTenant?: boolean; init?: RequestInit } | undefined;
  const response = new Response(null, { status: 202 });

  const result = await proxyWorkspaceTenantlessPost(
    {
      request: new Request("https://example.com", {
        method: "POST",
        body: '{"slug":"acme"}',
      }),
      path: "/api/v1/saas/workspaces",
    },
    {
      initBuilder: async () => ({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: '{"slug":"acme"}',
      }),
      proxy: async (path, options) => {
        capturedPath = path;
        capturedOptions = options;
        return response;
      },
    },
  );

  assert.equal(result, response);
  assert.equal(capturedPath, "/api/v1/saas/workspaces");
  assert.equal(capturedOptions?.includeTenant, false);
  assert.equal(capturedOptions?.init?.method, "POST");
  assert.equal(new Headers(capturedOptions?.init?.headers).get("content-type"), "application/json");
  assert.equal(capturedOptions?.init?.body, '{"slug":"acme"}');
});

test("proxyWorkspaceBootstrapPost resolves current workspace through helper when caller omits it", async () => {
  const body = JSON.stringify({ foo: "bar" });
  const request = new Request("https://example.com", {
    method: "POST",
    headers: {
      "x-authenticated-subject": "owner@example.com",
      "x-authenticated-roles": "workspace_owner",
    },
    body,
  });

  let capturedPath = "";
  let capturedOptions: { includeTenant?: boolean; init?: RequestInit } | undefined;
  const response = new Response(null, { status: 204 });

  const result = await proxyWorkspaceBootstrapPost(
    request,
    {
      workspaceId: "ws_123",
    },
    {
      resolveWorkspaceContext: async () => ({
        workspace: {
          workspace_id: "ws_123",
          slug: "acme",
          tenant_id: "tenant_123",
        },
      }),
      proxy: async (path, options) => {
        capturedPath = path;
        capturedOptions = options;
        return response;
      },
    },
  );

  const headers = new Headers(capturedOptions?.init?.headers);

  assert.equal(result, response);
  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_123/bootstrap");
  assert.equal(capturedOptions?.includeTenant, false);
  assert.equal(headers.get("x-authenticated-subject"), "owner@example.com");
  assert.equal(headers.get("x-authenticated-roles"), "workspace_owner");
  assert.equal(headers.get("x-workspace-id"), "ws_123");
  assert.equal(headers.get("x-workspace-slug"), "acme");
  assert.equal(headers.get("x-tenant-id"), "tenant_123");
  assert.equal(capturedOptions?.init?.body, body);
});

test("proxyWorkspaceBootstrapPost uses injected init builder with resolved current workspace", async () => {
  let capturedCurrentWorkspace: WorkspaceBootstrapHeaderContext | null = null;

  await proxyWorkspaceBootstrapPost(
    new Request("https://example.com", {
      method: "POST",
      body: '{"foo":"bar"}',
    }),
    {
      workspaceId: "ws_123",
    },
    {
      resolveWorkspaceContext: async () => ({
        workspace: {
          workspace_id: "ws_123",
          slug: "acme",
          tenant_id: "tenant_123",
        },
      }),
      initBuilder: async (_request, args) => {
        capturedCurrentWorkspace = args.currentWorkspace;
        return {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: '{"foo":"bar"}',
        };
      },
      proxy: async () => new Response(null, { status: 204 }),
    },
  );

  assert.deepEqual(capturedCurrentWorkspace, {
    workspace_id: "ws_123",
    slug: "acme",
    tenant_id: "tenant_123",
  });
});
