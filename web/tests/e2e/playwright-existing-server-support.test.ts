import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExistingServerProbeURL,
  formatExistingServerRunnerSummary,
  parseExistingServerSettings,
  probeExistingServerReadiness,
} from "../../scripts/playwright-existing-server-support.mjs";

test("existing-server support parses base URL, probe defaults, and override env", () => {
  const defaults = parseExistingServerSettings({
    PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3106/console",
  });

  assert.equal(defaults.explicitBaseURL, "http://127.0.0.1:3106/console");
  assert.equal(defaults.resolvedHost, "127.0.0.1");
  assert.equal(defaults.resolvedPort, "3106");
  assert.equal(defaults.readyPath, "/api/control-plane/health");
  assert.equal(defaults.readyTimeoutMs, 10_000);
  assert.equal(defaults.readyRetries, 4);
  assert.equal(defaults.readyRetryDelayMs, 1_000);
  assert.equal(defaults.skipServerProbe, false);
  assert.equal(defaults.manageWebServer, "0");
  assert.equal(defaults.reuseExistingServer, "1");

  const overrides = parseExistingServerSettings({
    PLAYWRIGHT_BASE_URL: "https://govrail.test",
    PLAYWRIGHT_HOST: "preview.govrail.test",
    PLAYWRIGHT_PORT: "443",
    PLAYWRIGHT_SERVER_READY_PATH: "/api/control-plane/health",
    PLAYWRIGHT_SERVER_READY_TIMEOUT_MS: "15000",
    PLAYWRIGHT_SERVER_READY_RETRIES: "2",
    PLAYWRIGHT_SERVER_READY_RETRY_DELAY_MS: "250",
    PLAYWRIGHT_SKIP_SERVER_PROBE: "1",
    PLAYWRIGHT_MANAGE_WEB_SERVER: "0",
    PLAYWRIGHT_REUSE_EXISTING_SERVER: "1",
  });

  assert.equal(overrides.resolvedHost, "preview.govrail.test");
  assert.equal(overrides.resolvedPort, "443");
  assert.equal(overrides.readyPath, "/api/control-plane/health");
  assert.equal(overrides.readyTimeoutMs, 15_000);
  assert.equal(overrides.readyRetries, 2);
  assert.equal(overrides.readyRetryDelayMs, 250);
  assert.equal(overrides.skipServerProbe, true);
});

test("existing-server support rejects missing or malformed base URLs", () => {
  assert.throws(
    () => parseExistingServerSettings({}),
    /PLAYWRIGHT_BASE_URL is required when reusing an existing server/,
  );
  assert.throws(
    () => parseExistingServerSettings({ PLAYWRIGHT_BASE_URL: "://bad-url" }),
    /Invalid PLAYWRIGHT_BASE_URL/,
  );
});

test("existing-server support builds probe URLs from relative and absolute ready paths", () => {
  assert.equal(
    buildExistingServerProbeURL("http://127.0.0.1:3106/console", "/api/control-plane/health"),
    "http://127.0.0.1:3106/api/control-plane/health",
  );
  assert.equal(
    buildExistingServerProbeURL("http://127.0.0.1:3106/console", "healthz"),
    "http://127.0.0.1:3106/healthz",
  );
  assert.equal(
    buildExistingServerProbeURL("http://127.0.0.1:3106/console", "https://preview.govrail.test/ready"),
    "https://preview.govrail.test/ready",
  );
});

test("existing-server support treats 2xx and 3xx preflight responses as ready", async () => {
  const ok = await probeExistingServerReadiness({
    probeURL: "http://127.0.0.1:3106/",
    fetchImpl: async () => new Response(null, { status: 200 }),
  });
  assert.deepEqual(ok, { ok: true, status: 200 });

  const redirect = await probeExistingServerReadiness({
    probeURL: "http://127.0.0.1:3106/",
    fetchImpl: async () =>
      new Response(null, {
        status: 302,
        headers: { location: "/login" },
      }),
  });
  assert.deepEqual(redirect, { ok: true, status: 302 });
});

test("existing-server support retries failing probes before succeeding", async () => {
  let attempts = 0;
  const result = await probeExistingServerReadiness({
    probeURL: "http://127.0.0.1:3106/api/control-plane/health",
    retries: 2,
    retryDelayMs: 25,
    fetchImpl: async () => {
      attempts += 1;
      return attempts < 3
        ? new Response(null, { status: 503 })
        : new Response(null, { status: 200 });
    },
    waitImpl: async () => {},
  });

  assert.deepEqual(result, { ok: true, status: 200 });
  assert.equal(attempts, 3);
});

test("existing-server support surfaces failing preflight status and fetch errors", async () => {
  const unhealthy = await probeExistingServerReadiness({
    probeURL: "http://127.0.0.1:3106/",
    retries: 1,
    retryDelayMs: 25,
    fetchImpl: async () => new Response(null, { status: 503 }),
    waitImpl: async () => {},
  });
  assert.deepEqual(unhealthy, { ok: false, status: 503 });

  const unreachable = await probeExistingServerReadiness({
    probeURL: "http://127.0.0.1:3106/",
    retries: 1,
    retryDelayMs: 25,
    fetchImpl: async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:3106");
    },
    waitImpl: async () => {},
  });
  assert.equal(unreachable.ok, false);
  assert.match(unreachable.error ?? "", /ECONNREFUSED/);
});

test("existing-server support formats explicit start and completion summaries", () => {
  assert.equal(
    formatExistingServerRunnerSummary({
      phase: "Starting",
      specCount: 1,
      baseURL: "https://preview.govrail.test",
      durationMs: 0,
      exitCode: 0,
    }),
    "[playwright-existing-server-smoke] Starting 1 spec against https://preview.govrail.test in 0.0s (exit 0).",
  );

  assert.equal(
    formatExistingServerRunnerSummary({
      phase: "Completed",
      specCount: 8,
      baseURL: "https://preview.govrail.test",
      durationMs: 72_345,
      exitCode: 0,
    }),
    "[playwright-existing-server-smoke] Completed 8 specs against https://preview.govrail.test in 72.3s (exit 0).",
  );
});
