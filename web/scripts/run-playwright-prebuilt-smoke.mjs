import { createServer } from "node:net";
import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const host = process.env.PLAYWRIGHT_HOST ?? "127.0.0.1";
const explicitPort = process.env.PLAYWRIGHT_PORT ?? null;
const explicitBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? null;
const fallbackPorts = ["3005", "3105", "3106", "3205"];
const envCandidatePorts = parseEnvCandidatePorts();

const parsedRangeStart = Number(process.env.PLAYWRIGHT_PORT_RANGE_START ?? "3005");
const parsedRangeEnd = Number(process.env.PLAYWRIGHT_PORT_RANGE_END ?? "3405");
const parsedRangeStep = Number(process.env.PLAYWRIGHT_PORT_RANGE_STEP ?? "1");
const parsedCandidateLimit = Number(process.env.PLAYWRIGHT_PORT_CANDIDATE_LIMIT ?? "6");

const portRangeStart = Number.isFinite(parsedRangeStart)
  ? Math.max(1, Math.floor(parsedRangeStart))
  : 3005;
const portRangeStep =
  Number.isFinite(parsedRangeStep) && parsedRangeStep > 0
    ? Math.floor(parsedRangeStep)
    : 1;
const portCandidateLimit =
  Number.isFinite(parsedCandidateLimit) && parsedCandidateLimit > 0
    ? Math.floor(parsedCandidateLimit)
    : 6;
const portRangeEnd = Number.isFinite(parsedRangeEnd)
  ? Math.max(portRangeStart, Math.floor(parsedRangeEnd))
  : portRangeStart + portRangeStep * 10;

function parseEnvCandidatePorts() {
  if (!process.env.PLAYWRIGHT_PORT_CANDIDATES) {
    return [];
  }

  return process.env.PLAYWRIGHT_PORT_CANDIDATES.split(",")
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0 && Number.isFinite(Number(candidate)));
}

function resolveExplicitBaseURLPort() {
  if (!explicitBaseURL) {
    return null;
  }

  try {
    const url = new URL(explicitBaseURL);
    return url.port || null;
  } catch {
    throw new Error(`[playwright-prebuilt-smoke] Invalid PLAYWRIGHT_BASE_URL: ${explicitBaseURL}`);
  }
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    const onError = () => {
      server.close();
      resolve(false);
    };
    const onListening = () => {
      server.close(() => resolve(true));
    };
    server.once("error", onError);
    server.once("listening", onListening);
    try {
      server.listen({ host, port });
    } catch {
      resolve(false);
    }
  });
}

async function collectDynamicCandidatePorts() {
  const ports = [];

  for (
    let port = portRangeStart;
    port <= portRangeEnd && ports.length < portCandidateLimit;
    port += portRangeStep
  ) {
    if (await isPortAvailable(port)) {
      ports.push(String(port));
    }
  }

  return ports.length > 0 ? ports : fallbackPorts;
}

async function determineCandidatePorts() {
  if (explicitPort) {
    return [explicitPort];
  }

  if (explicitBaseURL) {
    return [resolveExplicitBaseURLPort() ?? fallbackPorts[0]];
  }

  if (envCandidatePorts.length > 0) {
    return envCandidatePorts;
  }

  return await collectDynamicCandidatePorts();
}

function runWithPort(port) {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${host}:${port}`;
  const env = {
    ...process.env,
    PLAYWRIGHT_HOST: host,
    PLAYWRIGHT_PORT: port,
    PLAYWRIGHT_BASE_URL: baseURL,
    PLAYWRIGHT_WEB_SERVER_COMMAND:
      process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ??
      `npm run start -- --hostname ${host} --port ${port}`,
    PLAYWRIGHT_WEB_SERVER_TIMEOUT_MS:
      process.env.PLAYWRIGHT_WEB_SERVER_TIMEOUT_MS ?? "120000",
    PLAYWRIGHT_MANAGE_WEB_SERVER:
      process.env.PLAYWRIGHT_MANAGE_WEB_SERVER ?? (process.env.PLAYWRIGHT_BASE_URL ? "0" : "1"),
    PLAYWRIGHT_REUSE_EXISTING_SERVER:
      process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER ?? (process.env.PLAYWRIGHT_BASE_URL ? "1" : "0"),
  };

  return spawnSync(
    command,
    ["playwright", "test", "--config", "playwright.config.ts", ...process.argv.slice(2)],
    {
      stdio: "pipe",
      env,
      encoding: "utf8",
    },
  );
}

async function main() {
  const candidatePorts = await determineCandidatePorts();

  for (let index = 0; index < candidatePorts.length; index += 1) {
    const port = candidatePorts[index];
    const result = runWithPort(port);

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    if (result.error) {
      throw result.error;
    }

    if (result.status === 0) {
      process.exit(0);
    }

    const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const canRetry =
      explicitPort === null &&
      index < candidatePorts.length - 1 &&
      /(listen EPERM|EADDRINUSE|address already in use)/i.test(combinedOutput);

    if (canRetry) {
      continue;
    }

    if (/(listen EPERM)/i.test(combinedOutput)) {
      process.stderr.write(
        "\n[playwright-prebuilt-smoke] Local web-server startup is blocked in this environment. " +
          "Reuse an already running server with PLAYWRIGHT_BASE_URL (and optionally PLAYWRIGHT_PORT / PLAYWRIGHT_REUSE_EXISTING_SERVER=1), " +
          "or run the focused smoke in an environment that permits listening on localhost.\n",
      );
    }

    process.exit(result.status ?? 1);
  }

  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
