import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildProxyControlPlaneHeaders,
  controlPlaneErrorResponse,
  proxyControlPlane,
  proxyControlPlaneOrFallback,
  requireMetadataWorkspaceContext,
} from "../control-plane-proxy";

const PROXY_ENV_KEYS = [
  "CONTROL_PLANE_BASE_URL",
  "NEXT_PUBLIC_CONTROL_PLANE_BASE_URL",
  "CONTROL_PLANE_SUBJECT_ID",
  "NEXT_PUBLIC_CONTROL_PLANE_SUBJECT_ID",
  "CONTROL_PLANE_SUBJECT_ROLES",
  "NEXT_PUBLIC_CONTROL_PLANE_SUBJECT_ROLES",
  "CONTROL_PLANE_WORKSPACES_JSON",
] as const;

async function withCleanProxyEnv<T>(fn: () => Promise<T> | T): Promise<T> {
  const snapshot = new Map<string, string | undefined>();
  for (const key of PROXY_ENV_KEYS) {
    snapshot.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    return await fn();
  } finally {
    for (const key of PROXY_ENV_KEYS) {
      const original = snapshot.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  }
}

const metadataWorkspaceContext = {
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
    workspace_id: "ws_meta_1",
    slug: "meta-one",
    display_name: "Meta One",
    tenant_id: "tenant_meta_1",
    subject_id: "owner@govrail.dev",
    subject_roles: "workspace_owner,operator",
  },
  available_workspaces: [],
  selection: {
    requested_workspace_id: null,
    requested_workspace_slug: null,
    cookie_workspace: null,
  },
} as const;

test("controlPlaneErrorResponse returns structured error payload", async () => {
  const response = controlPlaneErrorResponse({
    code: "example_error",
    message: "Example message",
    details: { reason: "test" },
  });

  assert.equal(response.status, 503);
  const payload = (await response.json()) as {
    error: { code: string; message: string; details?: Record<string, unknown> };
  };
  assert.equal(payload.error.code, "example_error");
  assert.equal(payload.error.message, "Example message");
  assert.equal(payload.error.details?.reason, "test");
});

test("controlPlaneErrorResponse honors explicit status override", async () => {
  const response = controlPlaneErrorResponse({
    status: 412,
    code: "workspace_context_not_metadata",
    message: "Metadata-backed context required",
  });
  assert.equal(response.status, 412);
  const payload = (await response.json()) as {
    error: { code: string; message: string };
  };
  assert.equal(payload.error.code, "workspace_context_not_metadata");
  assert.equal(payload.error.message, "Metadata-backed context required");
});

test("requireMetadataWorkspaceContext returns structured fallback details for non-metadata sources", async () => {
  const response = requireMetadataWorkspaceContext({
    workspaceContext: {
      ...metadataWorkspaceContext,
      source: "env-fallback",
      source_detail: {
        label: "Environment fallback (non-production)",
        is_fallback: true,
        local_only: true,
        warning:
          "Workspace context was loaded from environment fallback values. Use metadata-backed session context before production rollout.",
        session_checkpoint_required: true,
        checkpoint_label: "Session checkpoint required",
      },
    },
    message: "Workspace details require metadata-backed SaaS context.",
  });

  assert.ok(response);
  assert.equal(response.status, 412);
  const payload = (await response.json()) as {
    error: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };
  };
  assert.equal(payload.error.code, "workspace_context_not_metadata");
  assert.equal(payload.error.details?.source, "env-fallback");
  assert.equal(payload.error.details?.source_label, "Environment fallback (non-production)");
  assert.equal(payload.error.details?.session_checkpoint_required, true);
  assert.equal(payload.error.details?.checkpoint_label, "Session checkpoint required");
  assert.match(String(payload.error.details?.warning ?? ""), /metadata-backed session context/i);
  assert.equal(payload.error.details?.workspace_id, "ws_meta_1");
  assert.equal(payload.error.details?.workspace_slug, "meta-one");
});

test(
  "proxyControlPlane returns control_plane_base_missing when base URL is unavailable",
  { concurrency: false },
  async () =>
    withCleanProxyEnv(async () => {
      const response = await proxyControlPlane("/api/v1/saas/me");
      assert.equal(response.status, 503);
      const payload = (await response.json()) as {
        error: { code: string; message: string };
      };
      assert.equal(payload.error.code, "control_plane_base_missing");
      assert.match(payload.error.message, /CONTROL_PLANE_BASE_URL/);
    }),
);

test(
  "proxyControlPlaneOrFallback returns fallback envelope on upstream failure",
  { concurrency: false },
  async () =>
    withCleanProxyEnv(async () => {
      const fallback = { mode: "fallback", ok: true };
      const response = await proxyControlPlaneOrFallback("/api/v1/saas/me", fallback);
      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: { mode: string; ok: boolean };
        meta: { request_id: string; trace_id: string };
      };
      assert.deepEqual(payload.data, fallback);
      assert.equal(payload.meta.request_id, "preview-request");
      assert.equal(payload.meta.trace_id, "preview-trace");
    }),
);

test(
  "proxyControlPlane contract preserves content-disposition passthrough logic",
  { concurrency: false },
  async () =>
    withCleanProxyEnv(async () => {
      const testDir = path.dirname(fileURLToPath(import.meta.url));
      const proxyPath = path.resolve(testDir, "../control-plane-proxy.ts");
      const source = await readFile(proxyPath, "utf8");
      assert.match(source, /const contentDisposition = upstream\.headers\.get\("content-disposition"\)/);
      assert.match(source, /responseHeaders\.set\("content-disposition", contentDisposition\)/);
    }),
);

test(
  "proxyControlPlane contract keeps includeTenant=false tenant-header guard",
  { concurrency: false },
  async () =>
    withCleanProxyEnv(async () => {
      const testDir = path.dirname(fileURLToPath(import.meta.url));
      const proxyPath = path.resolve(testDir, "../control-plane-proxy.ts");
      const source = await readFile(proxyPath, "utf8");
      assert.match(source, /export function buildProxyControlPlaneHeaders\(/);
      assert.match(source, /if \(args\.includeTenant !== false && !upstreamHeaders\.get\("x-tenant-id"\)\)/);
      assert.match(source, /upstreamHeaders\.set\("x-tenant-id", args\.workspaceContext\.workspace\.tenant_id\)/);
      assert.match(source, /const upstreamHeaders = buildProxyControlPlaneHeaders\(\{/);
      assert.match(source, /includeTenant: options\?\.includeTenant,/);
    }),
);

test(
  "proxyControlPlane contract preserves explicit workspace headers (no overwrite)",
  { concurrency: false },
  async () =>
    withCleanProxyEnv(async () => {
      const testDir = path.dirname(fileURLToPath(import.meta.url));
      const proxyPath = path.resolve(testDir, "../control-plane-proxy.ts");
      const source = await readFile(proxyPath, "utf8");
      assert.match(source, /if \(!upstreamHeaders\.get\("x-workspace-id"\)\)/);
      assert.match(source, /if \(!upstreamHeaders\.get\("x-workspace-slug"\)\)/);
      assert.match(source, /upstreamHeaders\.set\("x-workspace-id", args\.workspaceContext\.workspace\.workspace_id\)/);
      assert.match(source, /upstreamHeaders\.set\("x-workspace-slug", args\.workspaceContext\.workspace\.slug\)/);
      assert.match(source, /upstreamHeaders\.delete\("x-subject-id"\)/);
      assert.match(source, /upstreamHeaders\.delete\("x-subject-roles"\)/);
      assert.match(source, /upstreamHeaders\.delete\("x-roles"\)/);
      assert.match(source, /if \(!upstreamHeaders\.get\("x-authenticated-subject"\)\)/);
      assert.match(source, /if \(!upstreamHeaders\.get\("x-authenticated-roles"\)\)/);
    }),
);

test("buildProxyControlPlaneHeaders injects default auth/workspace/tenant headers when absent", async () => {
  const headers = buildProxyControlPlaneHeaders({
    workspaceContext: metadataWorkspaceContext,
  });

  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.get("x-authenticated-subject"), "owner@govrail.dev");
  assert.equal(headers.get("x-authenticated-roles"), "workspace_owner,operator");
  assert.equal(headers.get("x-workspace-id"), "ws_meta_1");
  assert.equal(headers.get("x-workspace-slug"), "meta-one");
  assert.equal(headers.get("x-tenant-id"), "tenant_meta_1");
});

test("buildProxyControlPlaneHeaders preserves explicit auth/workspace/tenant headers from caller", async () => {
  const headers = buildProxyControlPlaneHeaders({
    workspaceContext: metadataWorkspaceContext,
    headers: {
      accept: "application/x-ndjson",
      "x-authenticated-subject": "explicit@govrail.dev",
      "x-authenticated-roles": "platform_admin",
      "x-workspace-id": "ws_explicit",
      "x-workspace-slug": "explicit-slug",
      "x-tenant-id": "tenant_explicit",
    },
  });

  assert.equal(headers.get("accept"), "application/x-ndjson");
  assert.equal(headers.get("x-authenticated-subject"), "explicit@govrail.dev");
  assert.equal(headers.get("x-authenticated-roles"), "platform_admin");
  assert.equal(headers.get("x-workspace-id"), "ws_explicit");
  assert.equal(headers.get("x-workspace-slug"), "explicit-slug");
  assert.equal(headers.get("x-tenant-id"), "tenant_explicit");
});

test("buildProxyControlPlaneHeaders omits tenant injection when includeTenant is false", async () => {
  const headers = buildProxyControlPlaneHeaders({
    workspaceContext: metadataWorkspaceContext,
    includeTenant: false,
  });

  assert.equal(headers.get("x-authenticated-subject"), "owner@govrail.dev");
  assert.equal(headers.get("x-tenant-id"), null);
});

test("buildProxyControlPlaneHeaders strips legacy untrusted identity override headers", async () => {
  const headers = buildProxyControlPlaneHeaders({
    workspaceContext: metadataWorkspaceContext,
    headers: {
      "x-subject-id": "spoofed@govrail.dev",
      "x-subject-roles": "platform_owner",
      "x-roles": "platform_owner",
    },
  });

  assert.equal(headers.get("x-subject-id"), null);
  assert.equal(headers.get("x-subject-roles"), null);
  assert.equal(headers.get("x-roles"), null);
  assert.equal(headers.get("x-authenticated-subject"), "owner@govrail.dev");
  assert.equal(headers.get("x-authenticated-roles"), "workspace_owner,operator");
});
