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
  "tests/browser/admin-readiness-credentials-onboarding-usage-settings-return.smoke.spec.ts",
  "tests/browser/admin-readiness-credentials-onboarding-usage-settings-verification-return.smoke.spec.ts",
  "tests/browser/admin-readiness-credentials-onboarding-usage-settings-go-live-return.smoke.spec.ts",
] as const;

const expectedSpecTitlePatterns = [
  /admin readiness credentials branch -> onboarding -> usage -> \/settings\?intent=manage-plan -> admin keeps readiness browser continuity/,
  /admin readiness credentials branch -> onboarding -> usage -> \/settings\?intent=manage-plan -> verification -> admin keeps readiness browser continuity/,
  /admin readiness credentials branch -> onboarding -> usage -> \/settings\?intent=manage-plan -> go-live -> admin keeps readiness browser continuity/,
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/admin-readiness-credentials-onboarding-usage-settings-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness credentials branch -> onboarding -> usage -> \/settings\?intent=manage-plan -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=credentials&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Drill-down active: Credentials/,
      /Open onboarding flow/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Admin follow-up context/,
      /Launch lane context/,
      /Focus Credentials/,
      /Step 5: Confirm usage window/,
      /\/usage\\\?/,
      /Workspace usage and plan posture/,
      /Review plan limits in Settings/,
      /\/settings\\\?/,
      /intent=manage-plan/,
      /Workspace configuration/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-credentials-onboarding-usage-settings-verification-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness credentials branch -> onboarding -> usage -> \/settings\?intent=manage-plan -> verification -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=credentials&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Drill-down active: Credentials/,
      /Open onboarding flow/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Step 5: Confirm usage window/,
      /\/usage\\\?/,
      /Workspace usage and plan posture/,
      /\/settings\\\?/,
      /intent=manage-plan/,
      /Workspace configuration/,
      /Capture verification evidence/,
      /\/verification\\\?/,
      /surface=verification/,
      /Week 8 launch checklist/,
      /Admin follow-up context/,
      /Focus Credentials/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-credentials-onboarding-usage-settings-go-live-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness credentials branch -> onboarding -> usage -> \/settings\?intent=manage-plan -> go-live -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=credentials&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Drill-down active: Credentials/,
      /Open onboarding flow/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Step 5: Confirm usage window/,
      /\/usage\\\?/,
      /Workspace usage and plan posture/,
      /\/settings\\\?/,
      /intent=manage-plan/,
      /Workspace configuration/,
      /Rehearse go-live readiness/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Credentials/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
] as const;

test("credentials settings follow-up browser batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  assert.equal(
    webPackageJson.scripts?.["test:browser:credentials-settings-followup"],
    `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`,
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:credentials-settings-followup:existing-server"],
    `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:credentials-settings-followup"],
    "npm --prefix web run test:browser:credentials-settings-followup --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:credentials-settings-followup:existing-server"],
    "npm --prefix web run test:browser:credentials-settings-followup:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:credentials-settings-followup/);
  assert.match(
    docsReadme,
    /admin readiness credentials -> onboarding -> usage -> \/settings\?intent=manage-plan -> admin/,
  );
  assert.match(executionPlan, /credentials-settings-followup/);
  assert.match(
    executionPlan,
    /admin readiness credentials -> onboarding -> usage -> \/settings\?intent=manage-plan -> verification -> admin/,
  );
  assert.match(
    executionPlan,
    /admin readiness credentials -> onboarding -> usage -> \/settings\?intent=manage-plan -> go-live -> admin/,
  );

  for (const [index, spec] of specs.entries()) {
    const specPath = path.resolve(webDir, spec);
    const source = await readFile(specPath, "utf8");
    assert.match(source, expectedSpecTitlePatterns[index]);
    assert.match(source, /intent=manage-plan/);
  }
});

for (const spec of smokeExpectations) {
  test(`credentials settings follow-up smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
