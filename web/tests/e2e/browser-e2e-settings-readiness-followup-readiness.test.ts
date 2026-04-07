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

const specs = [
  "tests/browser/settings-verification-admin-return.smoke.spec.ts",
  "tests/browser/settings-go-live-admin-return.smoke.spec.ts",
] as const;

test("settings readiness follow-up batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  const expectedMain = `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`;
  const expectedExisting = `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`;

  assert.equal(webPackageJson.scripts?.["test:browser:settings-readiness-followup"], expectedMain);
  assert.equal(
    webPackageJson.scripts?.["test:browser:settings-readiness-followup:existing-server"],
    expectedExisting,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:settings-readiness-followup"],
    "npm --prefix web run test:browser:settings-readiness-followup --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:settings-readiness-followup:existing-server"],
    "npm --prefix web run test:browser:settings-readiness-followup:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:settings-readiness-followup/);
  assert.match(docsReadme, /settings -> verification -> admin/);
  assert.match(docsReadme, /settings -> go-live -> admin/);
  assert.match(executionPlan, /settings-readiness-followup/);
  assert.match(executionPlan, /settings -> go-live -> admin/);
});
