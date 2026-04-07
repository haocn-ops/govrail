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
  "tests/browser/agents-verification-admin-return.smoke.spec.ts",
  "tests/browser/agents-verification-go-live-admin-return.smoke.spec.ts",
] as const;

test("agents verification follow-up batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  const expectedPrebuilt = `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`;
  const expectedExistingServer = `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`;

  assert.equal(webPackageJson.scripts?.["test:browser:agents-verification-followup"], expectedPrebuilt);
  assert.equal(
    webPackageJson.scripts?.["test:browser:agents-verification-followup:existing-server"],
    expectedExistingServer,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:agents-verification-followup"],
    "npm --prefix web run test:browser:agents-verification-followup --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:agents-verification-followup:existing-server"],
    "npm --prefix web run test:browser:agents-verification-followup:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:agents-verification-followup/);
  assert.match(docsReadme, /agents -> verification -> admin/);
  assert.match(docsReadme, /agents -> verification -> go-live -> admin/);
  assert.match(executionPlan, /agents-verification-followup/);
  assert.match(executionPlan, /agents -> verification -> go-live -> admin/);
});
