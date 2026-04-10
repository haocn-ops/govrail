import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function resolveSmokeRevalidateCommands({
  argv = process.argv.slice(2),
  platform = process.platform,
  execPath = process.execPath,
} = {}) {
  const npmCommand = platform === "win32" ? "npm.cmd" : "npm";

  return [
    {
      command: npmCommand,
      args: ["run", "test:browser:build"],
    },
    {
      command: execPath,
      args: ["scripts/run-playwright-prebuilt-smoke.mjs", ...argv],
    },
  ];
}

export function runSmokeRevalidate({
  argv = process.argv.slice(2),
  env = process.env,
  platform = process.platform,
  execPath = process.execPath,
  run = spawnSync,
} = {}) {
  for (const step of resolveSmokeRevalidateCommands({ argv, platform, execPath })) {
    const result = run(step.command, step.args, {
      stdio: "inherit",
      env,
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  return 0;
}

const isMainModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  const status = runSmokeRevalidate();
  if (status !== 0) {
    process.exit(status);
  }
}
