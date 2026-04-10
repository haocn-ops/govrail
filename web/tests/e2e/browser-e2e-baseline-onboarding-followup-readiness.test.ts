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
  "tests/browser/admin-readiness-baseline-onboarding-return.smoke.spec.ts",
  "tests/browser/admin-readiness-baseline-onboarding-verification-return.smoke.spec.ts",
  "tests/browser/admin-readiness-baseline-onboarding-go-live-return.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/admin-readiness-baseline-onboarding-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness baseline branch -> onboarding -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=baseline&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Governance focus/,
      /Baseline gaps/,
      /Preview Organization/,
      /Preview Workspace/,
      /Clear all focus/,
      /Week 8 readiness summary/,
      /Drill-down active: Baseline gaps/,
      /Open onboarding flow/,
      /Week 8 readiness follow-up/,
      /Finish onboarding/,
      /\/onboarding\\\?/,
      /source=admin-readiness/,
      /week8_focus=baseline/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Admin follow-up context/,
      /Launch lane context/,
      /Focus Baseline gaps/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
      /Clear readiness focus/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-baseline-onboarding-verification-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness baseline branch -> onboarding -> verification -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=baseline&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Governance focus/,
      /Baseline gaps/,
      /Preview Organization/,
      /Preview Workspace/,
      /Clear all focus/,
      /Week 8 readiness summary/,
      /Drill-down active: Baseline gaps/,
      /Open onboarding flow/,
      /Week 8 readiness follow-up/,
      /Finish onboarding/,
      /\/onboarding\\\?/,
      /source=admin-readiness/,
      /week8_focus=baseline/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Admin follow-up context/,
      /Launch lane context/,
      /Focus Baseline gaps/,
      /Step 6: Capture verification evidence/,
      /\/verification\\\?/,
      /surface=verification/,
      /Week 8 launch checklist/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
      /Clear readiness focus/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-baseline-onboarding-go-live-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness baseline branch -> onboarding -> go-live -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=baseline&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Governance focus/,
      /Baseline gaps/,
      /Preview Organization/,
      /Preview Workspace/,
      /Clear all focus/,
      /Week 8 readiness summary/,
      /Drill-down active: Baseline gaps/,
      /Open onboarding flow/,
      /Week 8 readiness follow-up/,
      /Finish onboarding/,
      /\/onboarding\\\?/,
      /source=admin-readiness/,
      /week8_focus=baseline/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Admin follow-up context/,
      /Launch lane context/,
      /Focus Baseline gaps/,
      /Step 7: Rehearse go-live/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /Mock go-live drill/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
      /Clear readiness focus/,
    ],
  },
] as const;

test("baseline onboarding follow-up browser batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  assert.equal(
    webPackageJson.scripts?.["test:browser:baseline-onboarding-followup"],
    `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`,
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:baseline-onboarding-followup:existing-server"],
    `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:baseline-onboarding-followup"],
    "npm --prefix web run test:browser:baseline-onboarding-followup --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:baseline-onboarding-followup:existing-server"],
    "npm --prefix web run test:browser:baseline-onboarding-followup:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:baseline-onboarding-followup/);
  assert.match(docsReadme, /admin readiness baseline -> onboarding -> admin/);
  assert.match(docsReadme, /baseline -> onboarding -> verification -> admin/);
  assert.match(docsReadme, /baseline -> onboarding -> go-live -> admin/);
  assert.match(executionPlan, /baseline-onboarding-followup/);
  assert.match(executionPlan, /admin readiness baseline -> onboarding/);
});

for (const spec of smokeExpectations) {
  test(`baseline onboarding follow-up smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
