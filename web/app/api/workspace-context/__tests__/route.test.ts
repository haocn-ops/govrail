import assert from "node:assert/strict";
import test from "node:test";

import { GET, POST } from "../route";

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

test(
  "GET /api/workspace-context keeps headers aligned with response source",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      const response = await GET(new Request("http://localhost/api/workspace-context"));
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        data: { source: string; source_detail: { is_fallback: boolean } };
      };

      assert.equal(response.headers.get("x-govrail-workspace-context-source"), payload.data.source);
      assert.equal(
        response.headers.get("x-govrail-workspace-context-fallback"),
        payload.data.source_detail.is_fallback ? "1" : "0",
      );
    }),
);

test(
  "GET /api/workspace-context returns metadata source when /api/v1/saas/me succeeds",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_SUBJECT_ROLES = "workspace_owner,operator";

      let fetchCallCount = 0;
      const response = await withMockFetch(async (input, init) => {
        fetchCallCount += 1;
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
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
      }, () =>
        GET(
          new Request("http://localhost/api/workspace-context", {
            headers: {
              "x-authenticated-subject": "owner@example.com",
              "x-authenticated-roles": "workspace_owner,operator",
              "x-workspace-slug": "live-two",
            },
          }),
        ),
      );

      assert.equal(fetchCallCount, 1);
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        data: {
          source: string;
          source_detail: { is_fallback: boolean };
          workspace: { workspace_id: string; slug: string };
          session_user: { user_id: string; auth_subject: string } | null;
        };
      };

      assert.equal(payload.data.source, "metadata");
      assert.equal(payload.data.source_detail.is_fallback, false);
      assert.equal(payload.data.workspace.workspace_id, "ws_live_2");
      assert.equal(payload.data.workspace.slug, "live-two");
      assert.equal(payload.data.session_user?.user_id, "usr_live_1");
      assert.equal(payload.data.session_user?.auth_subject, "owner@example.com");
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), "metadata");
      assert.equal(response.headers.get("x-govrail-workspace-context-fallback"), "0");
    }),
);

test(
  "GET /api/workspace-context accepts cf-access headers for metadata subject/roles",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";

      let fetchCallCount = 0;
      const response = await withMockFetch(async (input, init) => {
        fetchCallCount += 1;
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.accept, "application/json");
        assert.equal(headers?.["x-authenticated-subject"], "cf-user@example.com");
        assert.equal(headers?.["x-authenticated-roles"], "workspace_owner,operator");

        return new Response(
          JSON.stringify({
            data: {
              user: {
                user_id: "usr_cf_1",
                email: "cf-user@example.com",
                auth_provider: "cf_access",
                auth_subject: "cf-user@example.com",
              },
              workspaces: [
                {
                  workspace_id: "ws_cf_alpha",
                  slug: "cf-alpha",
                  display_name: "CF Alpha",
                  tenant_id: "tenant_cf_alpha",
                },
                {
                  workspace_id: "ws_cf_beta",
                  slug: "cf-beta",
                  display_name: "CF Beta",
                  tenant_id: "tenant_cf_beta",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }, () =>
        GET(
          new Request("http://localhost/api/workspace-context", {
            headers: {
              "cf-access-authenticated-user-email": "cf-user@example.com",
              "cf-access-authenticated-user-groups": "workspace_owner, operator",
              "x-workspace-slug": "cf-beta",
            },
          }),
        ),
      );

      assert.equal(fetchCallCount, 1);
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        data: {
          source: string;
          source_detail: { is_fallback: boolean };
          workspace: { workspace_id: string; slug: string };
          session_user: { user_id: string; auth_subject: string } | null;
        };
      };

      assert.equal(payload.data.source, "metadata");
      assert.equal(payload.data.source_detail.is_fallback, false);
      assert.equal(payload.data.workspace.workspace_id, "ws_cf_beta");
      assert.equal(payload.data.workspace.slug, "cf-beta");
      assert.equal(payload.data.session_user?.user_id, "usr_cf_1");
      assert.equal(payload.data.session_user?.auth_subject, "cf-user@example.com");
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), "metadata");
      assert.equal(response.headers.get("x-govrail-workspace-context-fallback"), "0");
    }),
);

test(
  "GET /api/workspace-context ignores legacy x-subject-id and stays on fallback sources without trusted auth headers",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_WORKSPACES_JSON = JSON.stringify([
        {
          workspace_id: "ws_fallback_alpha",
          slug: "fallback-alpha",
          display_name: "Fallback Alpha",
          tenant_id: "tenant_fallback_alpha",
        },
      ]);

      let fetchCallCount = 0;
      const response = await withMockFetch(async () => {
        fetchCallCount += 1;
        throw new Error("metadata fetch should not run for legacy x-subject-id headers");
      }, () =>
        GET(
          new Request("http://localhost/api/workspace-context", {
            headers: {
              "x-subject-id": "spoofed@example.com",
            },
          }),
        ),
      );

      assert.equal(fetchCallCount, 0);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          source: string;
          source_detail: { is_fallback: boolean };
          workspace: { workspace_id: string; slug: string };
          session_user: null;
        };
      };

      assert.equal(payload.data.source, "env-fallback");
      assert.equal(payload.data.source_detail.is_fallback, true);
      assert.equal(payload.data.workspace.workspace_id, "ws_fallback_alpha");
      assert.equal(payload.data.workspace.slug, "fallback-alpha");
      assert.equal(payload.data.session_user, null);
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), "env-fallback");
      assert.equal(response.headers.get("x-govrail-workspace-context-fallback"), "1");
    }),
);

test(
  "GET /api/workspace-context emits warning header when fallback source warns",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_TENANT_ID = "tenant_fallback";
      process.env.CONTROL_PLANE_WORKSPACE_SLUG = "fallback";
      process.env.CONTROL_PLANE_WORKSPACE_NAME = "Fallback";

      const response = await GET(new Request("http://localhost/api/workspace-context"));
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        data: {
          source: string;
          source_detail: { warning: string | null };
        };
      };
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), payload.data.source);
      assert.equal(response.headers.get("x-govrail-workspace-context-warning"), payload.data.source_detail.warning);
      assert(payload.data.source_detail.warning, "Warning text should be present for fallback source");
    }),
);

test(
  "GET /api/workspace-context does not treat x-subject-id as a trusted metadata identity",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_WORKSPACES_JSON = JSON.stringify([
        {
          workspace_id: "ws_env_only",
          slug: "env-only",
          display_name: "Env Only",
          tenant_id: "tenant_env_only",
        },
      ]);
      process.env.CONTROL_PLANE_SUBJECT_ID = "fallback-user@example.com";
      process.env.CONTROL_PLANE_SUBJECT_ROLES = "platform_admin";

      let fetchCallCount = 0;
      const response = await withMockFetch(async () => {
        fetchCallCount += 1;
        throw new Error("metadata fetch should not run for x-subject-id");
      }, () =>
        GET(
          new Request("http://localhost/api/workspace-context", {
            headers: {
              "x-subject-id": "spoof@example.com",
              "x-workspace-slug": "env-only",
            },
          }),
        ),
      );

      assert.equal(fetchCallCount, 0);
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        data: {
          source: string;
          source_detail: { is_fallback: boolean };
          workspace: { workspace_id: string; slug: string };
          session_user: null;
        };
      };

      assert.equal(payload.data.source, "env-fallback");
      assert.equal(payload.data.source_detail.is_fallback, true);
      assert.equal(payload.data.workspace.workspace_id, "ws_env_only");
      assert.equal(payload.data.workspace.slug, "env-only");
      assert.equal(payload.data.session_user, null);
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), "env-fallback");
      assert.equal(response.headers.get("x-govrail-workspace-context-fallback"), "1");
    }),
);

test(
  "POST /api/workspace-context keeps warning header when fallback selection persists",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_TENANT_ID = "tenant_fallback";
      process.env.CONTROL_PLANE_WORKSPACE_SLUG = "fallback";

      const response = await POST(
        new Request("http://localhost/api/workspace-context", {
          method: "POST",
          body: JSON.stringify({ workspace_id: "ws_missing" }),
          headers: { "content-type": "application/json" },
        }),
      );
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        data: { source_detail: { warning: string | null } };
      };
      assert.equal(response.headers.get("x-govrail-workspace-context-warning"), payload.data.source_detail.warning);
    }),
);

test(
  "POST /api/workspace-context ignores legacy x-subject-id and keeps fallback selection semantics",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_WORKSPACES_JSON = JSON.stringify([
        {
          workspace_id: "ws_fallback_alpha",
          slug: "fallback-alpha",
          display_name: "Fallback Alpha",
          tenant_id: "tenant_fallback_alpha",
        },
        {
          workspace_id: "ws_fallback_beta",
          slug: "fallback-beta",
          display_name: "Fallback Beta",
          tenant_id: "tenant_fallback_beta",
        },
      ]);

      let fetchCallCount = 0;
      const response = await withMockFetch(async () => {
        fetchCallCount += 1;
        throw new Error("metadata fetch should not run for legacy x-subject-id headers");
      }, () =>
        POST(
          new Request("http://localhost/api/workspace-context", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-subject-id": "spoofed@example.com",
              cookie: "govrail_workspace=fallback-alpha",
            },
            body: JSON.stringify({
              workspace_id: "ws_fallback_beta",
              workspace_slug: "fallback-alpha",
            }),
          }),
        ),
      );

      assert.equal(fetchCallCount, 0);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          source: string;
          source_detail: { is_fallback: boolean };
          workspace: { workspace_id: string; slug: string };
          selection: {
            requested_workspace_id: string | null;
            requested_workspace_slug: string | null;
            cookie_workspace: string | null;
          };
          session_user: null;
        };
      };

      assert.equal(payload.data.source, "env-fallback");
      assert.equal(payload.data.source_detail.is_fallback, true);
      assert.equal(payload.data.workspace.workspace_id, "ws_fallback_beta");
      assert.equal(payload.data.workspace.slug, "fallback-beta");
      assert.equal(payload.data.selection.requested_workspace_id, "ws_fallback_beta");
      assert.equal(payload.data.selection.requested_workspace_slug, "fallback-alpha");
      assert.equal(payload.data.selection.cookie_workspace, "fallback-alpha");
      assert.equal(payload.data.session_user, null);
      assert.match(response.headers.get("set-cookie") ?? "", /govrail_workspace=fallback-beta/);
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), "env-fallback");
      assert.equal(response.headers.get("x-govrail-workspace-context-fallback"), "1");
    }),
);

test(
  "GET /api/workspace-context prefers explicit auth headers over cf-access headers and keeps metadata/header alignment",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";

      let fetchCallCount = 0;
      const response = await withMockFetch(async (input, init) => {
        fetchCallCount += 1;
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.accept, "application/json");
        assert.equal(headers?.["x-authenticated-subject"], "explicit@example.com");
        assert.equal(headers?.["x-authenticated-roles"], "workspace_admin");

        return new Response(
          JSON.stringify({
            data: {
              user: {
                user_id: "usr_explicit_get_1",
                email: "explicit@example.com",
                auth_provider: "cf_access",
                auth_subject: "explicit@example.com",
              },
              workspaces: [
                {
                  workspace_id: "ws_explicit_alpha",
                  slug: "explicit-alpha",
                  display_name: "Explicit Alpha",
                  tenant_id: "tenant_explicit_alpha",
                },
                {
                  workspace_id: "ws_explicit_beta",
                  slug: "explicit-beta",
                  display_name: "Explicit Beta",
                  tenant_id: "tenant_explicit_beta",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }, () =>
        GET(
          new Request("http://localhost/api/workspace-context", {
            headers: {
              "x-authenticated-subject": "explicit@example.com",
              "x-authenticated-roles": "workspace_admin",
              "cf-access-authenticated-user-email": "cf-user@example.com",
              "cf-access-authenticated-user-groups": "workspace_owner,operator",
              "x-workspace-slug": "explicit-beta",
            },
          }),
        ),
      );

      assert.equal(fetchCallCount, 1);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          source: string;
          source_detail: { is_fallback: boolean };
          workspace: { workspace_id: string; slug: string };
          session_user: { user_id: string; auth_subject: string } | null;
        };
      };

      assert.equal(payload.data.source, "metadata");
      assert.equal(payload.data.source_detail.is_fallback, false);
      assert.equal(payload.data.workspace.workspace_id, "ws_explicit_beta");
      assert.equal(payload.data.workspace.slug, "explicit-beta");
      assert.equal(payload.data.session_user?.user_id, "usr_explicit_get_1");
      assert.equal(payload.data.session_user?.auth_subject, "explicit@example.com");
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), "metadata");
      assert.equal(response.headers.get("x-govrail-workspace-context-fallback"), "0");
    }),
);

test(
  "GET /api/workspace-context ignores legacy x-subject-id when trusted auth headers are present",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";

      let fetchCallCount = 0;
      const response = await withMockFetch(async (input, init) => {
        fetchCallCount += 1;
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.accept, "application/json");
        assert.equal(headers?.["x-authenticated-subject"], "trusted@example.com");
        assert.equal(headers?.["x-authenticated-roles"], "workspace_admin");

        return new Response(
          JSON.stringify({
            data: {
              user: {
                user_id: "usr_trusted_get_1",
                email: "trusted@example.com",
                auth_provider: "cf_access",
                auth_subject: "trusted@example.com",
              },
              workspaces: [
                {
                  workspace_id: "ws_trusted_alpha",
                  slug: "trusted-alpha",
                  display_name: "Trusted Alpha",
                  tenant_id: "tenant_trusted_alpha",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }, () =>
        GET(
          new Request("http://localhost/api/workspace-context", {
            headers: {
              "x-authenticated-subject": "trusted@example.com",
              "x-authenticated-roles": "workspace_admin",
              "x-subject-id": "spoofed@example.com",
            },
          }),
        ),
      );

      assert.equal(fetchCallCount, 1);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          source: string;
          workspace: { workspace_id: string };
          session_user: { auth_subject: string } | null;
        };
      };

      assert.equal(payload.data.source, "metadata");
      assert.equal(payload.data.workspace.workspace_id, "ws_trusted_alpha");
      assert.equal(payload.data.session_user?.auth_subject, "trusted@example.com");
    }),
);

test(
  "GET /api/workspace-context selection precedence keeps workspace_id over workspace_slug and cookie",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_SUBJECT_ROLES = "workspace_owner,operator";

      let fetchCallCount = 0;
      const response = await withMockFetch(async (input, init) => {
        fetchCallCount += 1;
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.accept, "application/json");
        assert.equal(headers?.["x-authenticated-subject"], "owner@example.com");
        assert.equal(headers?.["x-authenticated-roles"], "workspace_owner,operator");

        return new Response(
          JSON.stringify({
            data: {
              user: {
                user_id: "usr_live_precedence",
                email: "owner@example.com",
                auth_provider: "cf_access",
                auth_subject: "owner@example.com",
              },
              workspaces: [
                {
                  workspace_id: "ws_live_primary",
                  slug: "live-primary",
                  display_name: "Live Primary",
                  tenant_id: "tenant_live_primary",
                },
                {
                  workspace_id: "ws_live_secondary",
                  slug: "live-secondary",
                  display_name: "Live Secondary",
                  tenant_id: "tenant_live_secondary",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }, () =>
        GET(
          new Request("http://localhost/api/workspace-context", {
            headers: {
              "x-authenticated-subject": "owner@example.com",
              "x-authenticated-roles": "workspace_owner,operator",
              "x-workspace-id": "ws_live_primary",
              "x-workspace-slug": "live-secondary",
              cookie: "govrail_workspace=live-secondary",
            },
          }),
        ),
      );

      assert.equal(fetchCallCount, 1);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          source: string;
          workspace: { workspace_id: string; slug: string };
          selection: {
            requested_workspace_id: string | null;
            requested_workspace_slug: string | null;
            cookie_workspace: string | null;
          };
        };
      };

      assert.equal(payload.data.source, "metadata");
      assert.equal(payload.data.workspace.workspace_id, "ws_live_primary");
      assert.equal(payload.data.workspace.slug, "live-primary");
      assert.equal(payload.data.selection.requested_workspace_id, "ws_live_primary");
      assert.equal(payload.data.selection.requested_workspace_slug, "live-secondary");
      assert.equal(payload.data.selection.cookie_workspace, "live-secondary");
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), "metadata");
      assert.equal(response.headers.get("x-govrail-workspace-context-fallback"), "0");
    }),
);

test(
  "POST /api/workspace-context selects requested workspace and writes cookie",
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
          workspace_id: "ws_security",
          slug: "security",
          display_name: "Security",
          tenant_id: "tenant_security",
        },
      ]);

      const response = await POST(
        new Request("http://localhost/api/workspace-context", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            workspace_id: "ws_security",
            workspace_slug: "ops",
          }),
        }),
      );

      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          source: string;
          workspace: { workspace_id: string; slug: string };
          selection: { requested_workspace_id: string | null; requested_workspace_slug: string | null };
        };
      };

      assert.equal(payload.data.source, "env-fallback");
      assert.equal(payload.data.workspace.workspace_id, "ws_security");
      assert.equal(payload.data.workspace.slug, "security");
      assert.equal(payload.data.selection.requested_workspace_id, "ws_security");
      assert.equal(payload.data.selection.requested_workspace_slug, "ops");
      assert.match(response.headers.get("set-cookie") ?? "", /govrail_workspace=security/);
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), "env-fallback");
      assert.equal(response.headers.get("x-govrail-workspace-context-fallback"), "1");
    }),
);

test(
  "POST /api/workspace-context uses cookie workspace when body is absent in metadata mode",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";

      let fetchCallCount = 0;
      const response = await withMockFetch(async (input, init) => {
        fetchCallCount += 1;
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.accept, "application/json");
        assert.equal(headers?.["x-authenticated-subject"], "cookie-user@example.com");
        assert.equal(headers?.["x-authenticated-roles"], "workspace_owner,operator");

        return new Response(
          JSON.stringify({
            data: {
              user: {
                user_id: "usr_cookie_1",
                email: "cookie-user@example.com",
                auth_provider: "cf_access",
                auth_subject: "cookie-user@example.com",
              },
              workspaces: [
                {
                  workspace_id: "ws_cookie_alpha",
                  slug: "cookie-alpha",
                  display_name: "Cookie Alpha",
                  tenant_id: "tenant_cookie_alpha",
                },
                {
                  workspace_id: "ws_cookie_beta",
                  slug: "cookie-beta",
                  display_name: "Cookie Beta",
                  tenant_id: "tenant_cookie_beta",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }, () =>
        POST(
          new Request("http://localhost/api/workspace-context", {
            method: "POST",
            headers: {
              "cf-access-authenticated-user-email": "cookie-user@example.com",
              "cf-access-authenticated-user-groups": "workspace_owner,operator",
              cookie: "other=1; govrail_workspace=cookie-beta",
            },
          }),
        ),
      );

      assert.equal(fetchCallCount, 1);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          source: string;
          source_detail: { is_fallback: boolean };
          workspace: { workspace_id: string; slug: string };
          selection: {
            requested_workspace_id: string | null;
            requested_workspace_slug: string | null;
            cookie_workspace: string | null;
          };
        };
      };

      assert.equal(payload.data.source, "metadata");
      assert.equal(payload.data.source_detail.is_fallback, false);
      assert.equal(payload.data.workspace.workspace_id, "ws_cookie_beta");
      assert.equal(payload.data.workspace.slug, "cookie-beta");
      assert.equal(payload.data.selection.requested_workspace_id, null);
      assert.equal(payload.data.selection.requested_workspace_slug, "cookie-beta");
      assert.equal(payload.data.selection.cookie_workspace, "cookie-beta");
      assert.match(response.headers.get("set-cookie") ?? "", /govrail_workspace=cookie-beta/);
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), "metadata");
      assert.equal(response.headers.get("x-govrail-workspace-context-fallback"), "0");
    }),
);

test(
  "POST /api/workspace-context selects workspace in metadata mode using body over slug/cookie and keeps headers aligned",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_SUBJECT_ROLES = "workspace_owner,operator";

      let fetchCallCount = 0;
      const response = await withMockFetch(async (input, init) => {
        fetchCallCount += 1;
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
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
                {
                  workspace_id: "ws_gamma",
                  slug: "gamma",
                  display_name: "Gamma",
                  tenant_id: "tenant_gamma",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }, () =>
        POST(
          new Request("http://localhost/api/workspace-context", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-authenticated-subject": "owner@example.com",
              "x-authenticated-roles": "workspace_owner,operator",
              cookie: "govrail_workspace=gamma",
            },
            body: JSON.stringify({
              workspace_id: "ws_beta",
              workspace_slug: "alpha",
            }),
          }),
        ),
      );

      assert.equal(fetchCallCount, 1);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          source: string;
          source_detail: { is_fallback: boolean };
          workspace: { workspace_id: string; slug: string };
          selection: {
            requested_workspace_id: string | null;
            requested_workspace_slug: string | null;
            cookie_workspace: string | null;
          };
        };
      };

      assert.equal(payload.data.source, "metadata");
      assert.equal(payload.data.source_detail.is_fallback, false);
      assert.equal(payload.data.workspace.workspace_id, "ws_beta");
      assert.equal(payload.data.workspace.slug, "beta");
      assert.equal(payload.data.selection.requested_workspace_id, "ws_beta");
      assert.equal(payload.data.selection.requested_workspace_slug, "alpha");
      assert.equal(payload.data.selection.cookie_workspace, "gamma");
      assert.match(response.headers.get("set-cookie") ?? "", /govrail_workspace=beta/);
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), "metadata");
      assert.equal(response.headers.get("x-govrail-workspace-context-fallback"), "0");
    }),
);

test(
  "POST /api/workspace-context prefers explicit auth headers over cf-access headers and applies slug-over-cookie selection",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_SUBJECT_ROLES = "workspace_owner";

      let fetchCallCount = 0;
      const response = await withMockFetch(async (input, init) => {
        fetchCallCount += 1;
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.accept, "application/json");
        assert.equal(headers?.["x-authenticated-subject"], "explicit@example.com");
        assert.equal(headers?.["x-authenticated-roles"], "workspace_admin");

        return new Response(
          JSON.stringify({
            data: {
              user: {
                user_id: "usr_explicit_1",
                email: "explicit@example.com",
                auth_provider: "cf_access",
                auth_subject: "explicit@example.com",
              },
              workspaces: [
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
                {
                  workspace_id: "ws_gamma",
                  slug: "gamma",
                  display_name: "Gamma",
                  tenant_id: "tenant_gamma",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }, () =>
        POST(
          new Request("http://localhost/api/workspace-context", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-authenticated-subject": "explicit@example.com",
              "x-authenticated-roles": "workspace_admin",
              "cf-access-authenticated-user-email": "cf-user@example.com",
              "cf-access-authenticated-user-groups": "workspace_owner,operator",
              cookie: "govrail_workspace=gamma",
            },
            body: JSON.stringify({
              workspace_slug: "beta",
            }),
          }),
        ),
      );

      assert.equal(fetchCallCount, 1);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          source: string;
          source_detail: { is_fallback: boolean };
          workspace: { workspace_id: string; slug: string };
          selection: {
            requested_workspace_id: string | null;
            requested_workspace_slug: string | null;
            cookie_workspace: string | null;
          };
        };
      };

      assert.equal(payload.data.source, "metadata");
      assert.equal(payload.data.source_detail.is_fallback, false);
      assert.equal(payload.data.workspace.workspace_id, "ws_beta");
      assert.equal(payload.data.workspace.slug, "beta");
      assert.equal(payload.data.selection.requested_workspace_id, null);
      assert.equal(payload.data.selection.requested_workspace_slug, "beta");
      assert.equal(payload.data.selection.cookie_workspace, "gamma");
      assert.match(response.headers.get("set-cookie") ?? "", /govrail_workspace=beta/);
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), "metadata");
      assert.equal(response.headers.get("x-govrail-workspace-context-fallback"), "0");
    }),
);

test(
  "POST /api/workspace-context ignores legacy x-subject-id when trusted auth headers are present",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";

      let fetchCallCount = 0;
      const response = await withMockFetch(async (input, init) => {
        fetchCallCount += 1;
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.accept, "application/json");
        assert.equal(headers?.["x-authenticated-subject"], "trusted-post@example.com");
        assert.equal(headers?.["x-authenticated-roles"], "workspace_owner");

        return new Response(
          JSON.stringify({
            data: {
              user: {
                user_id: "usr_trusted_post_1",
                email: "trusted-post@example.com",
                auth_provider: "cf_access",
                auth_subject: "trusted-post@example.com",
              },
              workspaces: [
                {
                  workspace_id: "ws_post_alpha",
                  slug: "post-alpha",
                  display_name: "Post Alpha",
                  tenant_id: "tenant_post_alpha",
                },
                {
                  workspace_id: "ws_post_beta",
                  slug: "post-beta",
                  display_name: "Post Beta",
                  tenant_id: "tenant_post_beta",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }, () =>
        POST(
          new Request("http://localhost/api/workspace-context", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-authenticated-subject": "trusted-post@example.com",
              "x-authenticated-roles": "workspace_owner",
              "x-subject-id": "spoofed-post@example.com",
              cookie: "govrail_workspace=post-alpha",
            },
            body: JSON.stringify({
              workspace_slug: "post-beta",
            }),
          }),
        ),
      );

      assert.equal(fetchCallCount, 1);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          source: string;
          workspace: { workspace_id: string; slug: string };
          session_user: { auth_subject: string } | null;
        };
      };

      assert.equal(payload.data.source, "metadata");
      assert.equal(payload.data.workspace.workspace_id, "ws_post_beta");
      assert.equal(payload.data.workspace.slug, "post-beta");
      assert.equal(payload.data.session_user?.auth_subject, "trusted-post@example.com");
      assert.match(response.headers.get("set-cookie") ?? "", /govrail_workspace=post-beta/);
    }),
);

test(
  "POST /api/workspace-context tolerates malformed JSON without returning 500",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      const response = await POST(
        new Request("http://localhost/api/workspace-context", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: "{bad",
        }),
      );

      assert.notEqual(response.status, 500);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          source: string;
          selection: { requested_workspace_id: string | null; requested_workspace_slug: string | null };
        };
      };
      assert.equal(payload.data.selection.requested_workspace_id, null);
      assert.equal(payload.data.selection.requested_workspace_slug, null);
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), payload.data.source);
    }),
);
