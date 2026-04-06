import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkspaceNavigationHref,
  buildWorkspaceSwitchWarningMessage,
  performWorkspaceSwitch,
} from "../client-workspace-navigation";

test("buildWorkspaceSwitchWarningMessage prefers explicit warning and falls back to source label guidance", () => {
  assert.equal(
    buildWorkspaceSwitchWarningMessage({
      warning: "Metadata fallback warning",
      isFallback: true,
      label: "Environment fallback (non-production)",
    }),
    "Metadata fallback warning",
  );
  assert.equal(
    buildWorkspaceSwitchWarningMessage({
      warning: null,
      isFallback: true,
      label: "Environment fallback (non-production)",
    }),
    "Workspace switched using Environment fallback (non-production). Re-open /session before trusting the next lane.",
  );
  assert.equal(
    buildWorkspaceSwitchWarningMessage({
      warning: null,
      isFallback: false,
      label: "SaaS metadata",
    }),
    null,
  );
});

test("buildWorkspaceNavigationHref preserves explicit target query when requested", () => {
  const href = buildWorkspaceNavigationHref(
    "/verification?surface=verification",
    {
      surface: "go_live",
      source: "onboarding",
      attention_workspace: "ws-accept",
    },
    { preferExistingQuery: true },
  );

  const parsed = new URL(`https://example.test${href}`);
  assert.equal(parsed.pathname, "/verification");
  assert.equal(parsed.searchParams.get("surface"), "verification");
  assert.equal(parsed.searchParams.get("source"), "onboarding");
  assert.equal(parsed.searchParams.get("attention_workspace"), "ws-accept");
});

test("performWorkspaceSwitch resets query cache after successful switch", async () => {
  const calls: string[] = [];

  const result = await performWorkspaceSwitch({
    selection: {
      workspace_slug: "ops",
    },
    queryClient: {
      clear() {
        calls.push("clear");
      },
      async invalidateQueries() {
        calls.push("invalidate");
      },
    },
    resetMode: "clear",
    switchWorkspaceContextImpl: async () => ({
      source: "metadata",
      label: "SaaS metadata",
      isFallback: false,
      localOnly: false,
      warning: null,
      requestId: "req_123",
      traceId: "trace_123",
      context: {
        source: "metadata",
        sourceDetail: {
          source: "metadata",
          label: "SaaS metadata",
          isFallback: false,
          localOnly: false,
          warning: null,
        },
        sessionUser: null,
        workspace: null,
        availableWorkspaces: [],
        selection: {
          requestedWorkspaceId: null,
          requestedWorkspaceSlug: "ops",
          cookieWorkspace: "ops",
        },
      },
    }),
  });

  assert.equal(result.status, "switched");
  assert.equal(result.error, null);
  assert.equal(result.warning, null);
  assert.deepEqual(calls, ["clear"]);
});

test("performWorkspaceSwitch can continue after switch failure for resilient refresh flows", async () => {
  const calls: string[] = [];

  const result = await performWorkspaceSwitch({
    selection: {
      workspace_slug: "ops",
    },
    queryClient: {
      clear() {
        calls.push("clear");
      },
      async invalidateQueries() {
        calls.push("invalidate");
      },
    },
    resetMode: "invalidate",
    continueOnError: true,
    switchWorkspaceContextImpl: async () => {
      throw new Error("switch failed");
    },
  });

  assert.equal(result.status, "continued_after_error");
  assert.equal(result.warning, null);
  assert.equal(result.error?.message, "switch failed");
  assert.deepEqual(calls, ["invalidate"]);
});

test("performWorkspaceSwitch does not reset queries when switch fails without resilience override", async () => {
  const calls: string[] = [];

  const result = await performWorkspaceSwitch({
    selection: {
      workspace_slug: "ops",
    },
    queryClient: {
      clear() {
        calls.push("clear");
      },
      async invalidateQueries() {
        calls.push("invalidate");
      },
    },
    resetMode: "invalidate",
    switchWorkspaceContextImpl: async () => {
      throw new Error("switch failed");
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error?.message, "switch failed");
  assert.deepEqual(calls, []);
});
