import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../..");
const runnerPath = path.resolve(repoRoot, "scripts/run-playwright-existing-server-smoke.mjs");

async function createStubNpxDir(): Promise<{ binDir: string; logPath: string }> {
  const binDir = await mkdtemp(path.join(os.tmpdir(), "govrail-existing-server-npx-"));
  const stubPath = path.join(binDir, process.platform === "win32" ? "npx.cmd" : "npx");
  const logPath = path.join(binDir, "stub-log.jsonl");

  const script = process.platform === "win32"
    ? `@echo off
node "%~dp0\\npx-stub.js" %*
`
    : `#!/usr/bin/env node
require("./npx-stub.js");
`;
  await writeFile(stubPath, script, { mode: 0o755 });
  await writeFile(
    path.join(binDir, "npx-stub.js"),
    `const fs = require("node:fs");

const logPath = process.env.STUB_LOG_PATH;
if (logPath) {
  fs.appendFileSync(
    logPath,
    JSON.stringify({
      argv: process.argv.slice(2),
      cwd: process.cwd(),
      env: {
        PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL,
        PLAYWRIGHT_HOST: process.env.PLAYWRIGHT_HOST,
        PLAYWRIGHT_PORT: process.env.PLAYWRIGHT_PORT,
        PLAYWRIGHT_MANAGE_WEB_SERVER: process.env.PLAYWRIGHT_MANAGE_WEB_SERVER,
        PLAYWRIGHT_REUSE_EXISTING_SERVER: process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER,
      },
    }) + "\\n",
  );
}

process.stdout.write("stub playwright summary\\n");
process.stderr.write("stub playwright stderr\\n");
process.exit(0);
`,
  );

  return { binDir, logPath };
}

test("existing-server runner forwards playwright stdout/stderr and preserves existing-server env", async () => {
  const { binDir, logPath } = await createStubNpxDir();

  const result = await execFileAsync("node", [runnerPath, "tests/browser/settings-verification-admin-return.smoke.spec.ts"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      STUB_LOG_PATH: logPath,
      PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3106/console",
      PLAYWRIGHT_SKIP_SERVER_PROBE: "1",
    },
  });

  assert.match(result.stdout, /stub playwright summary/);
  assert.match(result.stderr, /stub playwright stderr/);

  const invocations = (await readFile(logPath, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      argv: string[];
      cwd: string;
      env: Record<string, string | undefined>;
    });

  assert.equal(invocations.length, 1);
  assert.equal(invocations[0]?.cwd, repoRoot);
  assert.deepEqual(invocations[0]?.argv, [
    "playwright",
    "test",
    "--config",
    path.resolve(repoRoot, "playwright.config.ts"),
    "tests/browser/settings-verification-admin-return.smoke.spec.ts",
  ]);
  assert.equal(invocations[0]?.env.PLAYWRIGHT_BASE_URL, "http://127.0.0.1:3106/console");
  assert.equal(invocations[0]?.env.PLAYWRIGHT_HOST, "127.0.0.1");
  assert.equal(invocations[0]?.env.PLAYWRIGHT_PORT, "3106");
  assert.equal(invocations[0]?.env.PLAYWRIGHT_MANAGE_WEB_SERVER, "0");
  assert.equal(invocations[0]?.env.PLAYWRIGHT_REUSE_EXISTING_SERVER, "1");
});
