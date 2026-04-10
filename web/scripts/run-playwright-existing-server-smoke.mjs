import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildExistingServerProbeURL,
  formatExistingServerRunnerSummary,
  parseExistingServerSettings,
  probeExistingServerReadiness,
} from "./playwright-existing-server-support.mjs";

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const playwrightConfigPath = path.resolve(appDir, "playwright.config.ts");

async function main() {
  const startedAt = Date.now();
  let settings;

  try {
    settings = parseExistingServerSettings(process.env);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  if (!settings.skipServerProbe) {
    const probeURL = buildExistingServerProbeURL(
      settings.explicitBaseURL,
      settings.readyPath,
    );
    const probeResult = await probeExistingServerReadiness({
      probeURL,
      timeoutMs: settings.readyTimeoutMs,
      retries: settings.readyRetries,
      retryDelayMs: settings.readyRetryDelayMs,
    });

    if (!probeResult.ok) {
      const failureDetail =
        probeResult.error ?? `unexpected status ${probeResult.status ?? "unknown"}`;
      process.stderr.write(
        `[playwright-existing-server-smoke] Existing server probe failed for ${probeURL}: ${failureDetail}.\n`,
      );
      process.stderr.write(
        "[playwright-existing-server-smoke] Confirm PLAYWRIGHT_BASE_URL points to a reachable production-backed host, adjust PLAYWRIGHT_SERVER_READY_PATH / PLAYWRIGHT_SERVER_READY_TIMEOUT_MS / PLAYWRIGHT_SERVER_READY_RETRIES / PLAYWRIGHT_SERVER_READY_RETRY_DELAY_MS if needed, or set PLAYWRIGHT_SKIP_SERVER_PROBE=1 to bypass this preflight.\n",
      );
      process.exit(1);
    }
  }

  process.stdout.write(
    `${formatExistingServerRunnerSummary({
      phase: "Starting",
      specCount: process.argv.slice(2).length,
      baseURL: settings.explicitBaseURL,
      durationMs: 0,
      exitCode: 0,
    })}\n`,
  );

  const env = {
    ...process.env,
    PLAYWRIGHT_BASE_URL: settings.explicitBaseURL,
    PLAYWRIGHT_HOST: settings.resolvedHost,
    PLAYWRIGHT_MANAGE_WEB_SERVER: settings.manageWebServer,
    PLAYWRIGHT_REUSE_EXISTING_SERVER: settings.reuseExistingServer,
  };

  if (settings.resolvedPort) {
    env.PLAYWRIGHT_PORT = settings.resolvedPort;
  }

  const result = spawnSync(
    command,
    ["playwright", "test", "--config", playwrightConfigPath, ...process.argv.slice(2)],
    {
      cwd: appDir,
      env,
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    throw result.error;
  }

  const exitCode = result.status ?? 1;
  process.stdout.write(
    `${formatExistingServerRunnerSummary({
      phase: "Completed",
      specCount: process.argv.slice(2).length,
      baseURL: settings.explicitBaseURL,
      durationMs: Date.now() - startedAt,
      exitCode,
    })}\n`,
  );

  process.exit(exitCode);
}

await main();
