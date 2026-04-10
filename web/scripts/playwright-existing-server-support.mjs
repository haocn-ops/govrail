const defaultReadyPath = "/api/control-plane/health";
const defaultReadyTimeoutMs = 10_000;
const defaultReadyRetries = 4;
const defaultReadyRetryDelayMs = 1_000;

function formatSeconds(durationMs) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function parsePositiveInteger(value, fallback) {
  const parsedValue = Number(value ?? fallback);
  return Number.isFinite(parsedValue) && parsedValue > 0
    ? Math.floor(parsedValue)
    : fallback;
}

export function parseExistingServerSettings(env = process.env) {
  const explicitBaseURL = env.PLAYWRIGHT_BASE_URL ?? null;

  if (!explicitBaseURL) {
    throw new Error(
      "[playwright-existing-server-smoke] PLAYWRIGHT_BASE_URL is required when reusing an existing server.",
    );
  }

  let resolvedHost = env.PLAYWRIGHT_HOST ?? null;
  let resolvedPort = env.PLAYWRIGHT_PORT ?? null;

  try {
    const url = new URL(explicitBaseURL);
    resolvedHost ??= url.hostname || null;
    resolvedPort ??= url.port || null;
  } catch {
    throw new Error(
      `[playwright-existing-server-smoke] Invalid PLAYWRIGHT_BASE_URL: ${explicitBaseURL}`,
    );
  }

  return {
    explicitBaseURL,
    resolvedHost: resolvedHost ?? "127.0.0.1",
    resolvedPort,
    readyPath: env.PLAYWRIGHT_SERVER_READY_PATH ?? defaultReadyPath,
    readyTimeoutMs: parsePositiveInteger(
      env.PLAYWRIGHT_SERVER_READY_TIMEOUT_MS,
      defaultReadyTimeoutMs,
    ),
    readyRetries: parsePositiveInteger(
      env.PLAYWRIGHT_SERVER_READY_RETRIES,
      defaultReadyRetries,
    ),
    readyRetryDelayMs: parsePositiveInteger(
      env.PLAYWRIGHT_SERVER_READY_RETRY_DELAY_MS,
      defaultReadyRetryDelayMs,
    ),
    skipServerProbe: env.PLAYWRIGHT_SKIP_SERVER_PROBE === "1",
    manageWebServer: env.PLAYWRIGHT_MANAGE_WEB_SERVER ?? "0",
    reuseExistingServer: env.PLAYWRIGHT_REUSE_EXISTING_SERVER ?? "1",
  };
}

export function buildExistingServerProbeURL(baseURL, readyPath = defaultReadyPath) {
  return new URL(readyPath || defaultReadyPath, baseURL).toString();
}

export async function probeExistingServerReadiness({
  probeURL,
  timeoutMs = defaultReadyTimeoutMs,
  retries = defaultReadyRetries,
  retryDelayMs = defaultReadyRetryDelayMs,
  fetchImpl = fetch,
  waitImpl = async (delayMs) => {
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  },
}) {
  let lastResult = {
    ok: false,
    error: "probe did not run",
  };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(probeURL, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          "cache-control": "no-cache",
        },
      });

      lastResult = {
        ok: response.status >= 200 && response.status < 400,
        status: response.status,
      };
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? `timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : String(error);

      lastResult = {
        ok: false,
        error: message,
      };
    } finally {
      clearTimeout(timer);
    }

    if (lastResult.ok || attempt === retries) {
      return lastResult;
    }

    await waitImpl(retryDelayMs);
  }

  return lastResult;
}

export function formatExistingServerRunnerSummary(args) {
  const specLabel = args.specCount === 1 ? "1 spec" : `${args.specCount} specs`;
  const durationLabel = formatSeconds(args.durationMs);
  return `[playwright-existing-server-smoke] ${args.phase} ${specLabel} against ${args.baseURL} in ${durationLabel} (exit ${args.exitCode}).`;
}
