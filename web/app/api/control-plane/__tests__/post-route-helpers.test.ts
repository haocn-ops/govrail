import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAuthenticatedPostHeaders,
  buildProxyControlPlanePostInit,
  buildWorkspaceScopedPostHeaders,
  controlPlaneBaseMissingResponse,
  getControlPlaneBaseUrl,
  proxyAuthenticatedPostRequest,
  proxyControlPlanePost,
  proxyWorkspaceScopedDetailPost,
  proxyWorkspaceScopedPostRequest,
} from "../post-route-helpers";

test("getControlPlaneBaseUrl trims trailing slash and prefers server base url", () => {
  const previousBase = process.env.CONTROL_PLANE_BASE_URL;
  const previousPublicBase = process.env.NEXT_PUBLIC_CONTROL_PLANE_BASE_URL;
  process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.test/";
  process.env.NEXT_PUBLIC_CONTROL_PLANE_BASE_URL = "https://public.test/";

  try {
    assert.equal(getControlPlaneBaseUrl(), "https://control-plane.test");
  } finally {
    process.env.CONTROL_PLANE_BASE_URL = previousBase;
    process.env.NEXT_PUBLIC_CONTROL_PLANE_BASE_URL = previousPublicBase;
  }
});

test("controlPlaneBaseMissingResponse returns structured 503 payload", async () => {
  const response = controlPlaneBaseMissingResponse();
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error.code, "control_plane_base_missing");
});

test("buildWorkspaceScopedPostHeaders injects auth workspace tenant and idempotency headers", () => {
  const headers = buildWorkspaceScopedPostHeaders({
    workspace: {
      subject_id: "owner@govrail.dev",
      subject_roles: "owner admin",
      workspace_id: "ws_123",
      slug: "acme",
      tenant_id: "tenant_123",
    },
  });

  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("x-authenticated-subject"), "owner@govrail.dev");
  assert.equal(headers.get("x-authenticated-roles"), "owner admin");
  assert.equal(headers.get("x-workspace-id"), "ws_123");
  assert.equal(headers.get("x-workspace-slug"), "acme");
  assert.equal(headers.get("x-tenant-id"), "tenant_123");
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
});

test("buildAuthenticatedPostHeaders preserves explicit auth values and content-type override", () => {
  const headers = buildAuthenticatedPostHeaders({
    subjectId: "invitee@govrail.dev",
    subjectRoles: "member",
    contentType: "application/custom",
  });

  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.get("content-type"), "application/custom");
  assert.equal(headers.get("x-authenticated-subject"), "invitee@govrail.dev");
  assert.equal(headers.get("x-authenticated-roles"), "member");
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
});

test("buildProxyControlPlanePostInit returns POST init with shared json defaults", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    body: '{"rotate":true}',
  });

  const init = await buildProxyControlPlanePostInit({ request });
  const headers = new Headers(init.headers);

  assert.equal(init.method, "POST");
  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.get("content-type"), "application/json");
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
  assert.equal(init.body, '{"rotate":true}');
});

test("buildProxyControlPlanePostInit merges extra headers and can omit empty bodies", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    body: "",
  });

  const init = await buildProxyControlPlanePostInit({
    request,
    headers: {
      "x-workspace-id": "ws_123",
    },
    contentType: "application/merge-patch+json",
    accept: "application/problem+json",
    emptyBodyAsUndefined: true,
  });
  const headers = new Headers(init.headers);

  assert.equal(headers.get("x-workspace-id"), "ws_123");
  assert.equal(headers.get("accept"), "application/problem+json");
  assert.equal(headers.get("content-type"), "application/merge-patch+json");
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
  assert.equal(init.body, undefined);
});

test("buildProxyControlPlanePostInit can skip accept or content-type injection when explicitly disabled", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    body: '{"ok":true}',
  });

  const init = await buildProxyControlPlanePostInit({
    request,
    accept: null,
    contentType: null,
  });
  const headers = new Headers(init.headers);

  assert.equal(headers.get("accept"), null);
  assert.equal(headers.get("content-type"), null);
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
  assert.equal(init.body, '{"ok":true}');
});

test("proxyControlPlanePost preserves upstream status and content-type fallback", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://control-plane.test/api/v1/test");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("accept"), "application/json");
    assert.equal(init?.body, '{"ok":true}');
    return new Response('{"ok":true}', {
      status: 202,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    const response = await proxyControlPlanePost({
      baseUrl: "https://control-plane.test",
      path: "/api/v1/test",
      headers: {
        accept: "application/json",
      },
      body: '{"ok":true}',
    });
    assert.equal(response.status, 202);
    assert.equal(response.headers.get("content-type"), "application/json");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("proxyWorkspaceScopedPostRequest builds base url, workspace headers, and request body", async () => {
  const previousBase = process.env.CONTROL_PLANE_BASE_URL;
  process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.test";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://control-plane.test/api/v1/saas/workspaces/ws_123/invitations");
    const headers = new Headers(init?.headers);
    assert.equal(init?.method, "POST");
    assert.equal(headers.get("x-workspace-id"), "ws_123");
    assert.equal(headers.get("x-workspace-slug"), "acme");
    assert.equal(headers.get("x-tenant-id"), "tenant_123");
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(init?.body, '{"email":"owner@govrail.dev"}');
    return new Response('{"ok":true}', {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const request = new Request("https://example.com", {
      method: "POST",
      body: '{"email":"owner@govrail.dev"}',
    });
    const response = await proxyWorkspaceScopedPostRequest({
      request,
      workspace: {
        subject_id: "owner@govrail.dev",
        subject_roles: "owner admin",
        workspace_id: "ws_123",
        slug: "acme",
        tenant_id: "tenant_123",
      },
      path: "/api/v1/saas/workspaces/ws_123/invitations",
    });

    assert.equal(response.status, 201);
  } finally {
    process.env.CONTROL_PLANE_BASE_URL = previousBase;
    globalThis.fetch = originalFetch;
  }
});

test("proxyAuthenticatedPostRequest builds auth headers and returns base-missing response when needed", async () => {
  const previousBase = process.env.CONTROL_PLANE_BASE_URL;
  const previousPublicBase = process.env.NEXT_PUBLIC_CONTROL_PLANE_BASE_URL;
  delete process.env.CONTROL_PLANE_BASE_URL;
  delete process.env.NEXT_PUBLIC_CONTROL_PLANE_BASE_URL;

  try {
    const missingResponse = await proxyAuthenticatedPostRequest({
      request: new Request("https://example.com", {
        method: "POST",
        body: '{"accept":true}',
      }),
      path: "/api/v1/saas/invitations:accept",
      subjectId: "invitee@govrail.dev",
      subjectRoles: "member",
      contentType: "application/json",
    });

    assert.equal(missingResponse.status, 503);
  } finally {
    process.env.CONTROL_PLANE_BASE_URL = previousBase;
    process.env.NEXT_PUBLIC_CONTROL_PLANE_BASE_URL = previousPublicBase;
  }

  process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.test";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://control-plane.test/api/v1/saas/invitations:accept");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-authenticated-subject"), "invitee@govrail.dev");
    assert.equal(headers.get("x-authenticated-roles"), "member");
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(init?.body, '{"accept":true}');
    return new Response('{"ok":true}', {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await proxyAuthenticatedPostRequest({
      request: new Request("https://example.com", {
        method: "POST",
        body: '{"accept":true}',
      }),
      path: "/api/v1/saas/invitations:accept",
      subjectId: "invitee@govrail.dev",
      subjectRoles: "member",
      contentType: "application/json",
    });

    assert.equal(response.status, 202);
  } finally {
    process.env.CONTROL_PLANE_BASE_URL = previousBase;
    process.env.NEXT_PUBLIC_CONTROL_PLANE_BASE_URL = previousPublicBase;
    globalThis.fetch = originalFetch;
  }
});

test("proxyWorkspaceScopedDetailPost resolves workspace context and posts via injected helper contracts", async () => {
  const context = {
    source: "metadata" as const,
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
  };

  const request = new Request("https://example.com", {
    method: "POST",
    body: '{"ok":true}',
    headers: {
      "content-type": "application/json",
    },
  });
  let capturedPath = "";
  let capturedWorkspaceId = "";
  let capturedInit: RequestInit | undefined;

  const response = await proxyWorkspaceScopedDetailPost({
    request,
    buildPath: (workspaceId) => `/api/v1/saas/workspaces/${workspaceId}/api-keys/x:revoke`,
    resolveWorkspaceContext: async () => context as never,
    initBuilder: async ({ request: requestArg }) => {
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
      capturedWorkspaceId = (options?.workspaceContext as typeof context | undefined)?.workspace.workspace_id ?? "";
      capturedInit = options?.init;
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_123/api-keys/x:revoke");
  assert.equal(capturedWorkspaceId, "ws_123");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(new Headers(capturedInit?.headers).get("content-type"), "application/json");
  assert.equal(capturedInit?.body, '{"ok":true}');
});

test("proxyWorkspaceScopedDetailPost forwards includeTenant overrides to the shared proxy", async () => {
  let capturedIncludeTenant: boolean | undefined;

  await proxyWorkspaceScopedDetailPost({
    request: new Request("https://example.com", {
      method: "POST",
      body: '{"ok":true}',
    }),
    buildPath: (workspaceId) => `/api/v1/saas/workspaces/${workspaceId}/delivery`,
    includeTenant: true,
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
      body: '{"ok":true}',
    }),
    proxy: async (_path, options) => {
      capturedIncludeTenant = options?.includeTenant;
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(capturedIncludeTenant, true);
});

test("proxyWorkspaceScopedDetailPost returns guard response before building init or proxying", async () => {
  let initBuilderCalled = false;
  let proxyCalled = false;
  const guardResponse = new Response("guarded", { status: 412 });

  const response = await proxyWorkspaceScopedDetailPost({
    request: new Request("https://example.com", {
      method: "POST",
      body: '{"ok":true}',
    }),
    buildPath: (workspaceId) => `/api/v1/saas/workspaces/${workspaceId}/sso`,
    resolveWorkspaceContext: async () =>
      ({
        workspace: {
          workspace_id: "ws_123",
        },
      }) as never,
    beforeProxy: () => guardResponse,
    initBuilder: async () => {
      initBuilderCalled = true;
      return { method: "POST" };
    },
    proxy: async () => {
      proxyCalled = true;
      return new Response("{}", { status: 200 });
    },
  });

  assert.equal(response, guardResponse);
  assert.equal(initBuilderCalled, false);
  assert.equal(proxyCalled, false);
});
