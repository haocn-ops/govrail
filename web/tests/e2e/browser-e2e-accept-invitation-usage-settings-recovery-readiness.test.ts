import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const docsReadmePath = path.resolve(webDir, "../docs/README.md");
const executionPlanPath = path.resolve(webDir, "../docs/saas_v1_execution_plan_zh.md");
const specs = [
  "tests/browser/onboarding-accept-invitation-usage-settings-return.smoke.spec.ts",
  "tests/browser/onboarding-accept-invitation-usage-settings-go-live-admin-return.smoke.spec.ts",
  "tests/browser/onboarding-accept-invitation-usage-settings-verification-admin-return.smoke.spec.ts",
  "tests/browser/onboarding-accept-invitation-usage-settings-verification-go-live-admin-return.smoke.spec.ts",
] as const;

test("accept-invitation usage/settings recovery readability stays wired into docs", async () => {
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  assert.match(docsReadme, /onboarding -> accept-invitation -> usage -> settings -> admin/);
  assert.match(docsReadme, /members -> accept-invitation -> onboarding -> usage -> settings -> admin/);
  assert.match(docsReadme, /usage -> settings -> verification -> admin/);
  assert.match(executionPlan, /accept-invitation\s+.*usage\s+.*settings/);
  assert.match(executionPlan, /accept-invitation-usage-settings/);
  for (const spec of specs) {
    const specPath = path.resolve(webDir, spec);
    const source = await readFile(specPath, "utf8");
    assert.match(spec, /usage-settings/);
    assert.match(source, /accept-invitation/);
  }
});
