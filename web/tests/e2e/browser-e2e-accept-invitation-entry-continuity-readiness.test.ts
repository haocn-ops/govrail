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
  "tests/browser/onboarding-members-accept-invitation.smoke.spec.ts",
  "tests/browser/onboarding-accept-invitation-session-return.smoke.spec.ts",
  "tests/browser/onboarding-accept-invitation-static.smoke.spec.ts",
  "tests/browser/members-accept-invitation-static.smoke.spec.ts",
] as const;

test("accept-invitation entry continuity batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  const prebuilt = `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`;
  const existing = `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`;

  assert.equal(webPackageJson.scripts?.["test:browser:accept-invitation-entry-continuity"], prebuilt);
  assert.equal(
    webPackageJson.scripts?.["test:browser:accept-invitation-entry-continuity:existing-server"],
    existing,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:accept-invitation-entry-continuity"],
    "npm --prefix web run test:browser:accept-invitation-entry-continuity --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:accept-invitation-entry-continuity:existing-server"],
    "npm --prefix web run test:browser:accept-invitation-entry-continuity:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:accept-invitation-entry-continuity/);
  assert.match(docsReadme, /onboarding -> members -> accept-invitation/);
  assert.match(docsReadme, /onboarding -> accept-invitation, then return -> session/);
  assert.match(docsReadme, /members -> accept-invitation \(static\)/);
  assert.match(executionPlan, /accept-invitation-entry-continuity/);
  assert.match(executionPlan, /onboarding -> accept-invitation \(static\)/);
});
