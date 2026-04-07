import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const webPackageJsonPath = path.resolve(webDir, "package.json");
const rootPackageJsonPath = path.resolve(webDir, "..", "package.json");
const docsReadmePath = path.resolve(webDir, "../docs/README.md");
const executionPlanPath = path.resolve(webDir, "../docs/saas_v1_execution_plan_zh.md");
const browserSpecPath = "tests/browser/launchpad-session-onboarding.smoke.spec.ts";

test("launchpad session onboarding focused browser batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  assert.equal(
    webPackageJson.scripts?.["test:browser:launchpad-session-onboarding"],
    `node scripts/run-playwright-prebuilt-smoke.mjs ${browserSpecPath}`,
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:launchpad-session-onboarding:existing-server"],
    `node scripts/run-playwright-existing-server-smoke.mjs ${browserSpecPath}`,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:launchpad-session-onboarding"],
    "npm --prefix web run test:browser:launchpad-session-onboarding --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:launchpad-session-onboarding:existing-server"],
    "npm --prefix web run test:browser:launchpad-session-onboarding:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:launchpad-session-onboarding/);
  assert.match(docsReadme, /single-spec focused batch/);
  assert.match(executionPlan, /launchpad-session-onboarding/);
  assert.match(
    executionPlan,
    /launchpad -> session -> onboarding -> usage -> settings -> verification -> go-live -> admin/,
  );
});
