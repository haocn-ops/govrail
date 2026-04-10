import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkspaceEnterpriseGetInit,
  buildWorkspaceEnterpriseGetPath,
  buildWorkspaceEnterprisePath,
  buildWorkspaceEnterprisePostInit,
  proxyWorkspaceEnterpriseGet,
  proxyWorkspaceEnterprisePost,
} from "../workspace/route-helpers";

test("buildWorkspaceEnterpriseGetPath preserves query passthrough for enterprise GET routes", () => {
  const request = new Request("https://example.com/api/control-plane/workspace/audit-events/export?format=jsonl&from=2026-04-01");

  assert.equal(
    buildWorkspaceEnterpriseGetPath("workspace-123", "/audit-events:export", request),
    "/api/v1/saas/workspaces/workspace-123/audit-events:export?format=jsonl&from=2026-04-01",
  );
  assert.equal(
    buildWorkspaceEnterpriseGetPath("workspace-123", "/audit-events:export"),
    "/api/v1/saas/workspaces/workspace-123/audit-events:export",
  );
});

test("buildWorkspaceEnterpriseGetInit preserves request accept header and default fallback", () => {
  const request = new Request("https://example.com", {
    headers: {
      accept: "application/x-ndjson",
    },
  });

  const init = buildWorkspaceEnterpriseGetInit({
    request,
    defaultAccept: "application/json, application/x-ndjson",
  });
  const headers = new Headers(init.headers);

  assert.equal(init.method, "GET");
  assert.equal(headers.get("accept"), "application/x-ndjson");

  const defaultInit = buildWorkspaceEnterpriseGetInit({
    defaultAccept: "application/json, application/x-ndjson",
  });
  const defaultHeaders = new Headers(defaultInit.headers);
  assert.equal(defaultInit.method, "GET");
  assert.equal(defaultHeaders.get("accept"), "application/json, application/x-ndjson");
});

test("buildWorkspaceEnterprisePostInit preserves accept/content-type passthrough and POST idempotency metadata", async () => {
  const body = JSON.stringify({ feature: "sso" });
  const request = new Request("https://example.com", {
    method: "POST",
    headers: {
      accept: "application/vnd.govrail+json",
      "content-type": "application/custom",
    },
    body,
  });

  const init = await buildWorkspaceEnterprisePostInit(request);
  const headers = new Headers(init.headers);

  assert.equal(init.method, "POST");
  assert.equal(headers.get("accept"), "application/vnd.govrail+json");
  assert.equal(headers.get("content-type"), "application/custom");
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
  assert.equal(init.body, body);
});

test("buildWorkspaceEnterprisePostInit omits accept/content-type defaults and keeps empty bodies undefined", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
  });

  const init = await buildWorkspaceEnterprisePostInit(request);
  const headers = new Headers(init.headers);

  assert.equal(headers.get("accept"), null);
  assert.equal(headers.get("content-type"), null);
  assert.match(headers.get("idempotency-key") ?? "", /^web-/);
  assert.equal(init.body, undefined);
});

test("buildWorkspaceEnterprisePath composes workspace suffixes correctly", () => {
  assert.equal(buildWorkspaceEnterprisePath("workspace-123", "/sso"), "/api/v1/saas/workspaces/workspace-123/sso");
  assert.equal(
    buildWorkspaceEnterprisePath("workspace-123", "/dedicated-environment"),
    "/api/v1/saas/workspaces/workspace-123/dedicated-environment",
  );
  assert.equal(
    buildWorkspaceEnterprisePath("workspace-123", "/audit-events:export"),
    "/api/v1/saas/workspaces/workspace-123/audit-events:export",
  );
});

test("proxyWorkspaceEnterpriseGet keeps workspace-scoped query passthrough and injected GET init", async () => {
  let capturedPath = "";
  let capturedInit: RequestInit | undefined;
  let capturedWorkspaceId = "";

  const response = await proxyWorkspaceEnterpriseGet("/audit-events:export", {
    request: new Request("https://example.com/api/control-plane/workspace/audit-events/export?format=jsonl"),
    defaultAccept: "application/json, application/x-ndjson",
    resolveWorkspaceContext: async () =>
      ({
        source: "metadata",
        source_detail: { label: "SaaS metadata", is_fallback: false, local_only: false, warning: null },
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
      capturedInit = options?.init;
      capturedWorkspaceId = options?.workspaceContext?.workspace.workspace_id ?? "";
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_123/audit-events:export?format=jsonl");
  assert.equal(capturedWorkspaceId, "ws_123");
  assert.equal(capturedInit?.method, "GET");
  assert.equal(new Headers(capturedInit?.headers).get("accept"), "application/json, application/x-ndjson");
  assert.equal(response.status, 200);
});

test("proxyWorkspaceEnterprisePost returns metadata guard response before proxying", async () => {
  let proxyCalled = false;

  const response = await proxyWorkspaceEnterprisePost(
    {
      suffix: "/sso",
      request: new Request("https://example.com", {
        method: "POST",
        body: "{}",
      }),
      metadataMessage: "Workspace SSO updates require metadata-backed SaaS context.",
    },
    {
      resolveWorkspaceContext: async () =>
        ({
          source: "preview-fallback",
          source_detail: {
            label: "Preview fallback (non-production)",
            is_fallback: true,
            local_only: true,
            warning: "preview",
            session_checkpoint_required: true,
            checkpoint_label: "Session checkpoint required",
          },
          session_user: null,
          workspace: {
            workspace_id: "ws_preview",
            slug: "preview",
            display_name: "Preview",
            tenant_id: "tenant_demo",
          },
          available_workspaces: [],
          selection: {
            requested_workspace_id: null,
            requested_workspace_slug: null,
            cookie_workspace: null,
          },
        }) as never,
      proxy: async () => {
        proxyCalled = true;
        return new Response("{}", { status: 200 });
      },
    },
  );

  assert.equal(proxyCalled, false);
  assert.equal(response.status, 412);
  const payload = await response.json();
  assert.equal(payload.error.code, "workspace_context_not_metadata");
});

test("proxyWorkspaceEnterprisePost forwards metadata-backed writes through injected proxy and init builder", async () => {
  let capturedPath = "";
  let capturedInit: RequestInit | undefined;
  let capturedWorkspaceId = "";

  const response = await proxyWorkspaceEnterprisePost(
    {
      suffix: "/dedicated-environment",
      request: new Request("https://example.com", {
        method: "POST",
        body: '{"target_region":"us-east-1"}',
      }),
      metadataMessage: "Dedicated environment updates require metadata-backed SaaS context.",
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
      initBuilder: async () => ({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: '{"target_region":"us-east-1"}',
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

  assert.equal(capturedPath, "/api/v1/saas/workspaces/ws_123/dedicated-environment");
  assert.equal(capturedWorkspaceId, "ws_123");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(new Headers(capturedInit?.headers).get("content-type"), "application/json");
  assert.equal(capturedInit?.body, '{"target_region":"us-east-1"}');
  assert.equal(response.status, 202);
});
