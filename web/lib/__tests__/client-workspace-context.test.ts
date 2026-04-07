import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchWorkspaceContext,
  WorkspaceContextClientError,
  fetchWorkspaceContextSource,
  switchWorkspaceContext,
} from "../client-workspace-context";

test("fetchWorkspaceContextSource normalizes metadata-backed response details", async () => {
  const value = await fetchWorkspaceContextSource({
    fetchImpl: async () =>
      Response.json({
        data: {
          source: "metadata",
          source_detail: {
            label: "SaaS metadata",
            is_fallback: false,
            local_only: false,
            warning: null,
          },
          session_user: {
            user_id: "user_123",
            email: "owner@example.com",
            auth_provider: "cf-access",
            auth_subject: "owner@example.com",
          },
          workspace: {
            workspace_id: "ws_123",
            slug: "acme",
            display_name: "Acme",
            tenant_id: "tenant_123",
            subject_id: "owner@example.com",
            subject_roles: "workspace_owner",
          },
          available_workspaces: [
            {
              workspace_id: "ws_123",
              slug: "acme",
              display_name: "Acme",
              tenant_id: "tenant_123",
            },
          ],
          selection: {
            requested_workspace_id: null,
            requested_workspace_slug: "acme",
            cookie_workspace: "acme",
          },
        },
        meta: {
          request_id: "workspace-context",
          trace_id: "workspace-context",
        },
      }),
  });

  assert.equal(value.source, "metadata");
  assert.equal(value.label, "SaaS metadata");
  assert.equal(value.isFallback, false);
  assert.equal(value.localOnly, false);
  assert.equal(value.warning, null);
  assert.equal(value.requestId, "workspace-context");
  assert.equal(value.traceId, "workspace-context");
  assert.deepEqual(value.context.sessionUser, {
    userId: "user_123",
    email: "owner@example.com",
    authProvider: "cf-access",
    authSubject: "owner@example.com",
  });
  assert.deepEqual(value.context.workspace, {
    workspaceId: "ws_123",
    slug: "acme",
    displayName: "Acme",
    tenantId: "tenant_123",
    subjectId: "owner@example.com",
    subjectRoles: "workspace_owner",
  });
  assert.deepEqual(value.context.availableWorkspaces, [
    {
      workspaceId: "ws_123",
      slug: "acme",
      displayName: "Acme",
      tenantId: "tenant_123",
      subjectId: null,
      subjectRoles: null,
    },
  ]);
  assert.deepEqual(value.context.selection, {
    requestedWorkspaceId: null,
    requestedWorkspaceSlug: "acme",
    cookieWorkspace: "acme",
  });
});

test("fetchWorkspaceContext aliases the richer workspace-context payload", async () => {
  const value = await fetchWorkspaceContext({
    fetchImpl: async () =>
      Response.json({
        data: {
          source: "preview-fallback",
          source_detail: {},
          workspace: {
            workspace_id: "ws_preview",
            slug: "preview",
            display_name: "Preview",
            tenant_id: "tenant_demo",
          },
        },
        meta: {
          request_id: "workspace-context",
          trace_id: "workspace-context",
        },
      }),
  });

  assert.equal(value.source, "preview-fallback");
  assert.equal(value.context.workspace?.workspaceId, "ws_preview");
  assert.equal(value.context.sourceDetail.warning, value.warning);
});

test("switchWorkspaceContext posts workspace selectors and fills fallback warning defaults", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];

  const value = await switchWorkspaceContext(
    {
      workspace_id: "ws_ops",
      workspace_slug: "ops",
    },
    {
      fetchImpl: async (input, init) => {
        calls.push({ input: String(input), init });
        return Response.json({
          data: {
            source: "env-fallback",
            source_detail: {
              label: "Environment fallback (non-production)",
            },
          },
        });
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "/api/workspace-context");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(calls[0]?.init?.headers, {
    accept: "application/json",
    "content-type": "application/json",
  });
  assert.equal(
    calls[0]?.init?.body,
    JSON.stringify({
      workspace_id: "ws_ops",
      workspace_slug: "ops",
    }),
  );
  assert.equal(value.source, "env-fallback");
  assert.equal(value.label, "Environment fallback (non-production)");
  assert.equal(value.isFallback, true);
  assert.equal(value.localOnly, true);
  assert.match(
    value.warning ?? "",
    /environment fallback values/i,
  );
});

test("switchWorkspaceContext throws typed errors for non-ok responses", async () => {
  await assert.rejects(
    () =>
      switchWorkspaceContext(
        {
          workspace_slug: "ops",
        },
        {
          fetchImpl: async () =>
            Response.json(
              {
                error: {
                  message: "Workspace switch failed (409)",
                },
              },
              { status: 409 },
            ),
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceContextClientError);
      assert.equal(error.status, 409);
      assert.equal(error.message, "Workspace switch failed (409)");
      return true;
    },
  );
});
