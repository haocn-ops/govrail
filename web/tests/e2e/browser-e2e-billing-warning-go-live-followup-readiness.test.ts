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
  "tests/browser/admin-readiness-billing-warning-settings-go-live-usage-return.smoke.spec.ts",
  "tests/browser/admin-readiness-billing-warning-settings-go-live-playground-return.smoke.spec.ts",
  "tests/browser/admin-readiness-billing-warning-settings-go-live-artifacts-return.smoke.spec.ts",
  "tests/browser/admin-readiness-billing-warning-settings-go-live-settings-return.smoke.spec.ts",
  "tests/browser/admin-readiness-billing-warning-settings-go-live-verification-return.smoke.spec.ts",
  "tests/browser/admin-readiness-billing-warning-settings-go-live-verification-settings-return.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/admin-readiness-billing-warning-settings-go-live-usage-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness billing warning branch -> settings -> go-live -> usage -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=billing_warning&attention_organization=org_preview&attention_workspace=preview/,
      /Week 8 readiness summary/,
      /Open billing warning flow/,
      /\/settings\\\?/,
      /intent=resolve-billing/,
      /source=admin-readiness/,
      /week8_focus=billing_warning/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Workspace configuration/,
      /Enterprise evidence lane/,
      /Rehearse go-live readiness/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Billing warning/,
      /Confirm usage posture/,
      /\/usage\\\?/,
      /Workspace usage and plan posture/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-billing-warning-settings-go-live-playground-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness billing warning branch -> settings -> go-live -> playground -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=billing_warning&attention_organization=org_preview&attention_workspace=preview/,
      /Week 8 readiness summary/,
      /Open billing warning flow/,
      /\/settings\\\?/,
      /intent=resolve-billing/,
      /source=admin-readiness/,
      /week8_focus=billing_warning/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Workspace configuration/,
      /Enterprise evidence lane/,
      /Rehearse go-live readiness/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Billing warning/,
      /Revisit playground run/,
      /\/playground\\\?/,
      /Prompt, invoke, inspect/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-billing-warning-settings-go-live-artifacts-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness billing warning branch -> settings -> go-live -> artifacts -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=billing_warning&attention_organization=org_preview&attention_workspace=preview/,
      /Week 8 readiness summary/,
      /Open billing warning flow/,
      /\/settings\\\?/,
      /intent=resolve-billing/,
      /source=admin-readiness/,
      /week8_focus=billing_warning/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Workspace configuration/,
      /Enterprise evidence lane/,
      /Rehearse go-live readiness/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Billing warning/,
      /Inspect artifacts evidence/,
      /\/artifacts\\\?/,
      /Generated output and evidence/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-billing-warning-settings-go-live-settings-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness billing warning branch -> settings -> go-live -> settings -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=billing_warning&attention_organization=org_preview&attention_workspace=preview/,
      /Week 8 readiness summary/,
      /Open billing warning flow/,
      /\/settings\\\?/,
      /intent=resolve-billing/,
      /source=admin-readiness/,
      /week8_focus=billing_warning/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Workspace configuration/,
      /Enterprise evidence lane/,
      /Rehearse go-live readiness/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Billing warning/,
      /Review billing \+ settings/,
      /\/settings\\\?/,
      /intent=manage-plan/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-billing-warning-settings-go-live-verification-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness billing warning branch -> settings -> go-live -> verification -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=billing_warning&attention_organization=org_preview&attention_workspace=preview/,
      /Week 8 readiness summary/,
      /Open billing warning flow/,
      /\/settings\\\?/,
      /intent=resolve-billing/,
      /source=admin-readiness/,
      /week8_focus=billing_warning/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Workspace configuration/,
      /Enterprise evidence lane/,
      /Rehearse go-live readiness/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Billing warning/,
      /Reopen verification evidence/,
      /\/verification\\\?/,
      /surface=verification/,
      /Week 8 launch checklist/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-billing-warning-settings-go-live-verification-settings-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness billing warning branch -> settings -> go-live -> verification -> settings -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=billing_warning&attention_organization=org_preview&attention_workspace=preview/,
      /Week 8 readiness summary/,
      /Open billing warning flow/,
      /\/settings\\\?/,
      /intent=resolve-billing/,
      /source=admin-readiness/,
      /week8_focus=billing_warning/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Workspace configuration/,
      /Enterprise evidence lane/,
      /Rehearse go-live readiness/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Billing warning/,
      /Reopen verification evidence/,
      /\/verification\\\?/,
      /surface=verification/,
      /Week 8 launch checklist/,
      /Review settings \+ billing/,
      /\/settings\\\?/,
      /intent=manage-plan/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
] as const;

test("billing-warning go-live follow-up batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  const expectedPrebuilt = `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`;
  const expectedExisting = `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`;

  assert.equal(
    webPackageJson.scripts?.["test:browser:billing-warning-go-live-followup"],
    expectedPrebuilt,
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:billing-warning-go-live-followup:existing-server"],
    expectedExisting,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:billing-warning-go-live-followup"],
    "npm --prefix web run test:browser:billing-warning-go-live-followup --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:billing-warning-go-live-followup:existing-server"],
    "npm --prefix web run test:browser:billing-warning-go-live-followup:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:billing-warning-go-live-followup/);
  assert.match(docsReadme, /billing_warning -> settings -> go-live -> usage -> admin/);
  assert.match(docsReadme, /billing_warning -> settings -> go-live -> playground -> admin/);
  assert.match(docsReadme, /billing_warning -> settings -> go-live -> verification -> settings -> admin/);
  assert.match(executionPlan, /billing-warning-go-live-followup/);
  assert.match(executionPlan, /billing_warning -> settings -> go-live -> verification -> settings -> admin/);
});

for (const spec of smokeExpectations) {
  test(`billing-warning go-live follow-up smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
