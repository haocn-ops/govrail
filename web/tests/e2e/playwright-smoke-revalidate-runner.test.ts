import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveSmokeRevalidateCommands,
  runSmokeRevalidate,
} from "../../scripts/run-playwright-smoke-revalidate.mjs";

test("resolveSmokeRevalidateCommands runs build before delegating to prebuilt smoke runner", () => {
  const commands = resolveSmokeRevalidateCommands({
    argv: ["tests/browser/settings-verification-admin-return.smoke.spec.ts"],
    platform: "linux",
    execPath: "/usr/local/bin/node",
  });

  assert.deepEqual(commands, [
    {
      command: "npm",
      args: ["run", "test:browser:build"],
    },
    {
      command: "/usr/local/bin/node",
      args: [
        "scripts/run-playwright-prebuilt-smoke.mjs",
        "tests/browser/settings-verification-admin-return.smoke.spec.ts",
      ],
    },
  ]);
});

test("resolveSmokeRevalidateCommands uses npm.cmd on Windows", () => {
  const commands = resolveSmokeRevalidateCommands({
    argv: [],
    platform: "win32",
    execPath: "C:\\node\\node.exe",
  });

  assert.equal(commands[0]?.command, "npm.cmd");
  assert.equal(commands[1]?.command, "C:\\node\\node.exe");
});

test("runSmokeRevalidate executes build first and passes env/stdio through", () => {
  const calls: Array<{
    command: string;
    args: string[];
    stdio: string;
    env: NodeJS.ProcessEnv;
  }> = [];
  const env = { TEST_ENV: "1" };

  const status = runSmokeRevalidate({
    argv: ["tests/browser/usage-verification-admin-return.smoke.spec.ts"],
    env,
    platform: "linux",
    execPath: "/usr/local/bin/node",
    run(command, args, options) {
      calls.push({
        command,
        args,
        stdio: String(options?.stdio),
        env: options?.env as NodeJS.ProcessEnv,
      });
      return { status: 0 };
    },
  });

  assert.equal(status, 0);
  assert.deepEqual(calls, [
    {
      command: "npm",
      args: ["run", "test:browser:build"],
      stdio: "inherit",
      env,
    },
    {
      command: "/usr/local/bin/node",
      args: [
        "scripts/run-playwright-prebuilt-smoke.mjs",
        "tests/browser/usage-verification-admin-return.smoke.spec.ts",
      ],
      stdio: "inherit",
      env,
    },
  ]);
});

test("runSmokeRevalidate stops on the first non-zero step and returns its status", () => {
  const calls: string[] = [];

  const status = runSmokeRevalidate({
    run(command) {
      calls.push(command);
      return { status: 7 };
    },
  });

  assert.equal(status, 7);
  assert.deepEqual(calls, ["npm"]);
});

test("runSmokeRevalidate rethrows child process errors", () => {
  assert.throws(
    () =>
      runSmokeRevalidate({
        run() {
          return { status: 1, error: new Error("spawn failed") };
        },
      }),
    /spawn failed/,
  );
});
