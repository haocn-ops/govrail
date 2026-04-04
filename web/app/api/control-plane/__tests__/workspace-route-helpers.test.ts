import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkspaceBootstrapProxyInit,
  buildWorkspaceCreateProxyInit,
} from "../workspaces/route-helpers";

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
