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
  "tests/browser/admin-readiness-credentials-onboarding-verification-return.smoke.spec.ts",
  "tests/browser/admin-readiness-credentials-onboarding-go-live-return.smoke.spec.ts",
  "tests/browser/admin-readiness-credentials-onboarding-members-verification-return.smoke.spec.ts",
  "tests/browser/admin-readiness-credentials-onboarding-service-accounts-verification-return.smoke.spec.ts",
  "tests/browser/admin-readiness-credentials-onboarding-api-keys-verification-return.smoke.spec.ts",
  "tests/browser/admin-readiness-credentials-onboarding-playground-verification-return.smoke.spec.ts",
] as const;

test("credentials onboarding follow-up browser batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  assert.equal(
    webPackageJson.scripts?.["test:browser:credentials-onboarding-followup"],
    `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`,
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:credentials-onboarding-followup:existing-server"],
    `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:credentials-onboarding-followup"],
    "npm --prefix web run test:browser:credentials-onboarding-followup --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:credentials-onboarding-followup:existing-server"],
    "npm --prefix web run test:browser:credentials-onboarding-followup:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:credentials-onboarding-followup/);
  assert.match(docsReadme, /credentials -> onboarding -> verification -> admin/);
  assert.match(docsReadme, /credentials -> onboarding -> go-live -> admin/);
  assert.match(docsReadme, /credentials -> onboarding -> api-keys -> verification -> admin/);
  assert.match(executionPlan, /credentials-onboarding-followup/);
  assert.match(executionPlan, /admin readiness credentials -> onboarding/);
});
