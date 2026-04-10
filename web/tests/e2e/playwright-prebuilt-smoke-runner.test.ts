import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../..");
const runnerPath = path.resolve(repoRoot, "scripts/run-playwright-prebuilt-smoke.mjs");

async function createStubNpxDir(): Promise<{ binDir: string; logPath: string }> {
  const binDir = await mkdtemp(path.join(os.tmpdir(), "govrail-playwright-npx-"));
  const stubPath = path.join(binDir, "npx");
  const logPath = path.join(binDir, "stub-log.jsonl");
  await writeFile(
    stubPath,
    `#!/usr/bin/env node
const fs = require("node:fs");

const logPath = process.env.STUB_LOG_PATH;
const mode = process.env.STUB_MODE ?? "success";
let invocation = 1;

if (logPath && fs.existsSync(logPath)) {
  invocation = fs.readFileSync(logPath, "utf8").trim().split("\\n").filter(Boolean).length + 1;
}

if (logPath) {
  fs.appendFileSync(
    logPath,
    JSON.stringify({
      invocation,
      argv: process.argv.slice(2),
      env: {
        PLAYWRIGHT_HOST: process.env.PLAYWRIGHT_HOST,
        PLAYWRIGHT_PORT: process.env.PLAYWRIGHT_PORT,
        PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL,
        PLAYWRIGHT_MANAGE_WEB_SERVER: process.env.PLAYWRIGHT_MANAGE_WEB_SERVER,
        PLAYWRIGHT_REUSE_EXISTING_SERVER: process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER,
      },
    }) + "\\n",
  );
}

if (mode === "retry-once" && invocation === 1) {
  process.stderr.write("listen EADDRINUSE 127.0.0.1\\n");
  process.exit(1);
}

if (mode === "always-fail") {
  process.stderr.write("listen EADDRINUSE 127.0.0.1\\n");
  process.exit(1);
}

process.stdout.write("stub playwright success\\n");
`,
    { mode: 0o755 },
  );

  return { binDir, logPath };
}

async function readStubLog(logPath: string): Promise<
  Array<{
    invocation: number;
    argv: string[];
    env: Record<string, string | undefined>;
  }>
> {
  const content = await readFile(logPath, "utf8");
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      invocation: number;
      argv: string[];
      env: Record<string, string | undefined>;
    });
}

test("prebuilt smoke runner fails fast on invalid PLAYWRIGHT_BASE_URL", async () => {
  const { binDir, logPath } = await createStubNpxDir();

  await assert.rejects(
    execFileAsync("node", [runnerPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        STUB_LOG_PATH: logPath,
        PLAYWRIGHT_BASE_URL: "://bad-url",
      },
    }),
    (error: Error & { stderr?: string }) => {
      assert.match(error.stderr ?? "", /Invalid PLAYWRIGHT_BASE_URL: :\/\/bad-url/);
      return true;
    },
  );

  await assert.rejects(readFile(logPath, "utf8"), /ENOENT/);
});

test("prebuilt smoke runner passes focused args through with existing-server env defaults", async () => {
  const { binDir, logPath } = await createStubNpxDir();

  const result = await execFileAsync(
    "node",
    [runnerPath, "tests/browser/settings-verification-admin-return.smoke.spec.ts"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        STUB_LOG_PATH: logPath,
        PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3106/console",
      },
    },
  );

  assert.match(result.stdout, /stub playwright success/);
  const invocations = await readStubLog(logPath);
  assert.equal(invocations.length, 1);
  assert.deepEqual(invocations[0]?.argv, [
    "playwright",
    "test",
    "--config",
    "playwright.config.ts",
    "tests/browser/settings-verification-admin-return.smoke.spec.ts",
  ]);
  assert.equal(invocations[0]?.env.PLAYWRIGHT_PORT, "3106");
  assert.equal(invocations[0]?.env.PLAYWRIGHT_BASE_URL, "http://127.0.0.1:3106/console");
  assert.equal(invocations[0]?.env.PLAYWRIGHT_MANAGE_WEB_SERVER, "0");
  assert.equal(invocations[0]?.env.PLAYWRIGHT_REUSE_EXISTING_SERVER, "1");
});

test("prebuilt smoke runner retries the next candidate port on startup bind failures", async () => {
  const { binDir, logPath } = await createStubNpxDir();

  const result = await execFileAsync(
    "node",
    [runnerPath, "tests/browser/usage-verification-admin-return.smoke.spec.ts"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        STUB_LOG_PATH: logPath,
        STUB_MODE: "retry-once",
        PLAYWRIGHT_PORT_CANDIDATES: "3005,3105",
      },
    },
  );

  assert.match(result.stdout, /stub playwright success/);
  const invocations = await readStubLog(logPath);
  assert.equal(invocations.length, 2);
  assert.equal(invocations[0]?.env.PLAYWRIGHT_PORT, "3005");
  assert.equal(invocations[1]?.env.PLAYWRIGHT_PORT, "3105");
  assert.deepEqual(invocations[1]?.argv, [
    "playwright",
    "test",
    "--config",
    "playwright.config.ts",
    "tests/browser/usage-verification-admin-return.smoke.spec.ts",
  ]);
});
