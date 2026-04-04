import assert from "node:assert/strict";
import test from "node:test";

import {
  describeWorkspaceContextSource,
  isWorkspaceContextFallbackSource,
  resolveCookieWorkspaceFromRawCookie,
  resolveWorkspaceContextFromRequest,
  resolveWorkspaceContextFromValues,
} from "../workspace-context";

const WORKSPACE_ENV_KEYS = [
  "CONTROL_PLANE_BASE_URL",
  "NEXT_PUBLIC_CONTROL_PLANE_BASE_URL",
  "CONTROL_PLANE_TENANT_ID",
  "NEXT_PUBLIC_CONTROL_PLANE_TENANT_ID",
  "CONTROL_PLANE_WORKSPACE_SLUG",
  "CONTROL_PLANE_WORKSPACE_NAME",
  "CONTROL_PLANE_WORKSPACES_JSON",
  "CONTROL_PLANE_SUBJECT_ID",
  "NEXT_PUBLIC_CONTROL_PLANE_SUBJECT_ID",
  "CONTROL_PLANE_SUBJECT_ROLES",
  "NEXT_PUBLIC_CONTROL_PLANE_SUBJECT_ROLES",
] as const;

async function withCleanWorkspaceEnv<T>(fn: () => Promise<T> | T): Promise<T> {
  const snapshot = new Map<string, string | undefined>();
  for (const key of WORKSPACE_ENV_KEYS) {
    snapshot.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    return await fn();
  } finally {
    for (const key of WORKSPACE_ENV_KEYS) {
      const original = snapshot.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  }
}

async function withMockFetch<T>(
  mock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("describeWorkspaceContextSource exposes expected fallback metadata", () => {
  const metadata = describeWorkspaceContextSource("metadata");
  assert.equal(metadata.is_fallback, false);
  assert.equal(metadata.local_only, false);
  assert.equal(metadata.warning, null);

  const envFallback = describeWorkspaceContextSource("env-fallback");
  assert.equal(envFallback.is_fallback, true);
  assert.equal(envFallback.local_only, true);
  assert.match(envFallback.label, /Environment fallback/);
});

test("isWorkspaceContextFallbackSource matches source semantics", () => {
  assert.equal(isWorkspaceContextFallbackSource("metadata"), false);
  assert.equal(isWorkspaceContextFallbackSource("env-fallback"), true);
  assert.equal(isWorkspaceContextFallbackSource("preview-fallback"), true);
});

test("resolveCookieWorkspaceFromRawCookie decodes workspace cookie values", () => {
  assert.equal(resolveCookieWorkspaceFromRawCookie(null), null);
  assert.equal(resolveCookieWorkspaceFromRawCookie("a=1; b=2"), null);
  assert.equal(resolveCookieWorkspaceFromRawCookie("govrail_workspace=alpha"), "alpha");
  assert.equal(resolveCookieWorkspaceFromRawCookie("x=1; govrail_workspace=team%2Fprod"), "team/prod");
});

test("resolveCookieWorkspaceFromRawCookie tolerates malformed encoded cookie", () => {
  const malformed = "x=1; govrail_workspace=%E0%A4%A; y=2";
  assert.doesNotThrow(() => resolveCookieWorkspaceFromRawCookie(malformed));
  assert.equal(resolveCookieWorkspaceFromRawCookie(malformed), "%E0%A4%A");
});

test(
  "resolveWorkspaceContextFromValues falls back to preview workspace when metadata/env are unavailable",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      const context = await resolveWorkspaceContextFromValues({});
      assert.equal(context.source, "preview-fallback");
      assert.equal(context.workspace.workspace_id, "ws_preview");
      assert.equal(context.workspace.slug, "preview");
      assert.equal(context.available_workspaces.length, 1);
    }),
);

test(
  "resolveWorkspaceContextFromValues honors configured env workspaces and slug selection",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_WORKSPACES_JSON = JSON.stringify([
        {
          workspace_id: "ws_ops",
          slug: "ops",
          display_name: "Ops",
          tenant_id: "tenant_ops",
        },
        {
          workspace_id: "ws_sec",
          slug: "security",
          display_name: "Security",
          tenant_id: "tenant_sec",
        },
      ]);
      process.env.CONTROL_PLANE_SUBJECT_ID = "tester@example.com";
      process.env.CONTROL_PLANE_SUBJECT_ROLES = "platform_admin";

      const context = await resolveWorkspaceContextFromValues({
        requestedWorkspaceSlug: "security",
      });

      assert.equal(context.source, "env-fallback");
      assert.equal(context.workspace.workspace_id, "ws_sec");
      assert.equal(context.workspace.slug, "security");
      assert.equal(context.workspace.subject_id, "tester@example.com");
      assert.equal(context.workspace.subject_roles, "platform_admin");
      assert.equal(context.available_workspaces.length, 2);
    }),
);

test(
  "resolveWorkspaceContextFromValues prioritizes requested workspace_id over requested slug",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_WORKSPACES_JSON = JSON.stringify([
        {
          workspace_id: "ws_ops",
          slug: "ops",
          display_name: "Ops",
          tenant_id: "tenant_ops",
        },
        {
          workspace_id: "ws_sec",
          slug: "security",
          display_name: "Security",
          tenant_id: "tenant_sec",
        },
      ]);

      const context = await resolveWorkspaceContextFromValues({
        requestedWorkspaceId: "ws_ops",
        requestedWorkspaceSlug: "security",
      });

      assert.equal(context.workspace.workspace_id, "ws_ops");
      assert.equal(context.workspace.slug, "ops");
      assert.equal(context.selection.requested_workspace_id, "ws_ops");
      assert.equal(context.selection.requested_workspace_slug, "security");
    }),
);

test(
  "resolveWorkspaceContextFromValues uses cookie slug when requested slug is absent",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_WORKSPACES_JSON = JSON.stringify([
        {
          workspace_id: "ws_ops",
          slug: "ops",
          display_name: "Ops",
          tenant_id: "tenant_ops",
        },
        {
          workspace_id: "ws_sec",
          slug: "security",
          display_name: "Security",
          tenant_id: "tenant_sec",
        },
      ]);

      const context = await resolveWorkspaceContextFromValues({
        cookieWorkspace: "security",
      });

      assert.equal(context.workspace.workspace_id, "ws_sec");
      assert.equal(context.workspace.slug, "security");
      assert.equal(context.selection.requested_workspace_slug, "security");
      assert.equal(context.selection.cookie_workspace, "security");
    }),
);

test(
  "resolveWorkspaceContextFromValues falls back to the first available workspace when no explicit selection is provided",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_WORKSPACES_JSON = JSON.stringify([
        {
          workspace_id: "ws_alpha",
          slug: "alpha",
          display_name: "Alpha",
          tenant_id: "tenant_alpha",
        },
        {
          workspace_id: "ws_beta",
          slug: "beta",
          display_name: "Beta",
          tenant_id: "tenant_beta",
        },
      ]);

      const context = await resolveWorkspaceContextFromValues({});

      assert.equal(context.source, "env-fallback");
      assert.equal(context.workspace.workspace_id, "ws_alpha");
      assert.equal(context.workspace.slug, "alpha");
      assert.equal(context.available_workspaces[0]?.workspace_id, "ws_alpha");
      assert.equal(context.selection.requested_workspace_id, null);
      assert.equal(context.selection.requested_workspace_slug, null);
      assert.equal(context.selection.cookie_workspace, null);
    }),
);

test(
  "resolveWorkspaceContextFromValues uses metadata source when /api/v1/saas/me returns live workspaces",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_SUBJECT_ROLES = "workspace_owner,operator";

      let fetchCallCount = 0;
      await withMockFetch(async (input, init) => {
        fetchCallCount += 1;
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
        assert.equal(init?.headers instanceof Headers, false);
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.accept, "application/json");
        assert.equal(headers?.["x-authenticated-subject"], "owner@example.com");
        assert.equal(headers?.["x-authenticated-roles"], "workspace_owner,operator");

        return new Response(
          JSON.stringify({
            data: {
              user: {
                user_id: "usr_live_1",
                email: "owner@example.com",
                auth_provider: "cf_access",
                auth_subject: "owner@example.com",
              },
              workspaces: [
                {
                  workspace_id: "ws_live_1",
                  slug: "live-one",
                  display_name: "Live One",
                  tenant_id: "tenant_live_1",
                },
                {
                  workspace_id: "ws_live_2",
                  slug: "live-two",
                  display_name: "Live Two",
                  tenant_id: "tenant_live_2",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }, async () => {
        const context = await resolveWorkspaceContextFromValues({
          requestedWorkspaceSlug: "live-two",
          preferredSubjectId: "owner@example.com",
          preferredSubjectRoles: "workspace_owner,operator",
        });

        assert.equal(context.source, "metadata");
        assert.equal(context.workspace.workspace_id, "ws_live_2");
        assert.equal(context.workspace.slug, "live-two");
        assert.equal(context.workspace.subject_id, "owner@example.com");
        assert.equal(context.workspace.subject_roles, "workspace_owner,operator");
        assert.equal(context.available_workspaces.length, 2);
        assert.equal(context.session_user?.user_id, "usr_live_1");
        assert.equal(context.session_user?.email, "owner@example.com");
      });

      assert.equal(fetchCallCount, 1);
    }),
);

test(
  "resolveWorkspaceContextFromValues does not query metadata without a trusted subject and falls back locally",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_WORKSPACES_JSON = JSON.stringify([
        {
          workspace_id: "ws_env_ops",
          slug: "ops",
          display_name: "Ops",
          tenant_id: "tenant_ops",
        },
      ]);
      process.env.CONTROL_PLANE_SUBJECT_ID = "fallback-user@example.com";
      process.env.CONTROL_PLANE_SUBJECT_ROLES = "platform_admin";

      let fetchCallCount = 0;
      await withMockFetch(async () => {
        fetchCallCount += 1;
        throw new Error("metadata fetch should not run without a trusted subject");
      }, async () => {
        const context = await resolveWorkspaceContextFromValues({
          requestedWorkspaceSlug: "ops",
        });

        assert.equal(context.source, "env-fallback");
        assert.equal(context.workspace.workspace_id, "ws_env_ops");
        assert.equal(context.workspace.slug, "ops");
        assert.equal(context.workspace.subject_id, "fallback-user@example.com");
        assert.equal(context.session_user, null);
      });

      assert.equal(fetchCallCount, 0);
    }),
);

test(
  "resolveWorkspaceContextFromRequest uses trusted authenticated subject and ignores x-subject-id for SaaS metadata identity",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_SUBJECT_ID = "fallback-user@example.com";
      process.env.CONTROL_PLANE_SUBJECT_ROLES = "platform_admin";

      let fetchCallCount = 0;
      await withMockFetch(async (input, init) => {
        fetchCallCount += 1;
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.accept, "application/json");
        assert.equal(headers?.["x-authenticated-subject"], "trusted-owner@example.com");

        return new Response(
          JSON.stringify({
            data: {
              user: {
                user_id: "usr_trusted_1",
                email: "trusted-owner@example.com",
                auth_provider: "cf_access",
                auth_subject: "trusted-owner@example.com",
              },
              workspaces: [
                {
                  workspace_id: "ws_trusted_1",
                  slug: "trusted-one",
                  display_name: "Trusted One",
                  tenant_id: "tenant_trusted_1",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }, async () => {
        const context = await resolveWorkspaceContextFromRequest(
          new Request("http://localhost/api/workspace-context", {
            headers: {
              "x-authenticated-subject": "trusted-owner@example.com",
              "x-subject-id": "spoofed@example.com",
              "x-workspace-slug": "trusted-one",
            },
          }),
        );

        assert.equal(context.source, "metadata");
        assert.equal(context.workspace.workspace_id, "ws_trusted_1");
        assert.equal(context.workspace.subject_id, "trusted-owner@example.com");
        assert.equal(context.workspace.subject_roles, "platform_admin");
        assert.equal(context.session_user?.auth_subject, "trusted-owner@example.com");
      });

      assert.equal(fetchCallCount, 1);
    }),
);

test(
  "resolveWorkspaceContextFromValues falls back to env workspaces when metadata request fails",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_SUBJECT_ID = "fallback-user@example.com";
      process.env.CONTROL_PLANE_SUBJECT_ROLES = "platform_admin";
      process.env.CONTROL_PLANE_WORKSPACES_JSON = JSON.stringify([
        {
          workspace_id: "ws_env_ops",
          slug: "ops",
          display_name: "Ops",
          tenant_id: "tenant_ops",
        },
        {
          workspace_id: "ws_env_risk",
          slug: "risk",
          display_name: "Risk",
          tenant_id: "tenant_risk",
        },
      ]);

      let fetchCallCount = 0;
      await withMockFetch(async () => {
        fetchCallCount += 1;
        return new Response(JSON.stringify({ error: { code: "unavailable" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }, async () => {
        const context = await resolveWorkspaceContextFromValues({
          requestedWorkspaceSlug: "risk",
          preferredSubjectId: "fallback-user@example.com",
          preferredSubjectRoles: "platform_admin",
        });

        assert.equal(context.source, "env-fallback");
        assert.equal(context.workspace.workspace_id, "ws_env_risk");
        assert.equal(context.workspace.slug, "risk");
        assert.equal(context.workspace.subject_id, "fallback-user@example.com");
        assert.equal(context.workspace.subject_roles, "platform_admin");
        assert.equal(context.available_workspaces.length, 2);
        assert.equal(context.session_user, null);
      });

      assert.equal(fetchCallCount, 1);
    }),
);
