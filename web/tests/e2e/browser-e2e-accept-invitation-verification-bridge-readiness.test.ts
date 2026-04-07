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
  "tests/browser/onboarding-accept-invitation-verification-return.smoke.spec.ts",
  "tests/browser/onboarding-accept-invitation-verification-go-live-return.smoke.spec.ts",
  "tests/browser/members-accept-invitation-verification-return.smoke.spec.ts",
  "tests/browser/members-accept-invitation-verification-go-live-return.smoke.spec.ts",
] as const;

test("accept-invitation verification bridge browser batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  assert.equal(
    webPackageJson.scripts?.["test:browser:accept-invitation-verification-bridge"],
    `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`,
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:accept-invitation-verification-bridge:existing-server"],
    `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:accept-invitation-verification-bridge"],
    "npm --prefix web run test:browser:accept-invitation-verification-bridge --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:accept-invitation-verification-bridge:existing-server"],
    "npm --prefix web run test:browser:accept-invitation-verification-bridge:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:accept-invitation-verification-bridge/);
  assert.match(docsReadme, /onboarding -> accept-invitation -> verification/);
  assert.match(docsReadme, /members -> accept-invitation -> verification -> go-live/);
  assert.match(executionPlan, /accept-invitation-verification-bridge/);
  assert.match(executionPlan, /onboarding -> accept-invitation -> verification -> go-live/);
});
