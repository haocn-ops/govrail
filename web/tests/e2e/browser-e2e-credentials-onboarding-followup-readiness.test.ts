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

const smokeExpectations = [
  {
    path: "tests/browser/admin-readiness-credentials-onboarding-verification-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness credentials branch -> onboarding -> verification -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=credentials&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Governance focus/,
      /Credentials/,
      /Preview Organization/,
      /Preview Workspace/,
      /Clear all focus/,
      /Week 8 readiness summary/,
      /Drill-down active: Credentials/,
      /Open onboarding flow/,
      /\/onboarding\\\?/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Admin follow-up context/,
      /Launch lane context/,
      /Focus Credentials/,
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
    path: "tests/browser/admin-readiness-credentials-onboarding-go-live-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness credentials branch -> onboarding -> go-live -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=credentials&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Governance focus/,
      /Credentials/,
      /Preview Organization/,
      /Preview Workspace/,
      /Clear all focus/,
      /Week 8 readiness summary/,
      /Drill-down active: Credentials/,
      /Open onboarding flow/,
      /\/onboarding\\\?/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Admin follow-up context/,
      /Launch lane context/,
      /Focus Credentials/,
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
  {
    path: "tests/browser/admin-readiness-credentials-onboarding-members-verification-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness credentials branch -> onboarding -> members -> verification -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=credentials&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Governance focus/,
      /Credentials/,
      /Preview Organization/,
      /Preview Workspace/,
      /Clear all focus/,
      /Week 8 readiness summary/,
      /Drill-down active: Credentials/,
      /Open onboarding flow/,
      /\/onboarding\\\?/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Admin follow-up context/,
      /Launch lane context/,
      /Focus Credentials/,
      /Step 1: Invite first members/,
      /\/members\\\?/,
      /Workspace access/,
      /Manual onboarding handoff/,
      /Capture verification evidence/,
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
    path: "tests/browser/admin-readiness-credentials-onboarding-service-accounts-verification-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness credentials branch -> onboarding -> service-accounts -> verification -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=credentials&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Governance focus/,
      /Credentials/,
      /Preview Organization/,
      /Preview Workspace/,
      /Clear all focus/,
      /Week 8 readiness summary/,
      /Drill-down active: Credentials/,
      /Open onboarding flow/,
      /\/onboarding\\\?/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Admin follow-up context/,
      /Launch lane context/,
      /Focus Credentials/,
      /Step 2: Create service account/,
      /\/service-accounts\\\?/,
      /Machine identities/,
      /Credential sequence/,
      /Step 5: Capture verification evidence/,
      /\/verification\\\?/,
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
    path: "tests/browser/admin-readiness-credentials-onboarding-api-keys-verification-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness credentials branch -> onboarding -> api-keys -> verification -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=credentials&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Governance focus/,
      /Credentials/,
      /Preview Organization/,
      /Preview Workspace/,
      /Clear all focus/,
      /Week 8 readiness summary/,
      /Drill-down active: Credentials/,
      /Open onboarding flow/,
      /\/onboarding\\\?/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Admin follow-up context/,
      /Launch lane context/,
      /Focus Credentials/,
      /Step 3: Issue API key/,
      /\/api-keys\\\?/,
      /Credential lifecycle/,
      /Credential sequence/,
      /Step 5: Record verification evidence/,
      /\/verification\\\?/,
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
    path: "tests/browser/admin-readiness-credentials-onboarding-playground-verification-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness credentials branch -> onboarding -> playground -> verification -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=credentials&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Governance focus/,
      /Credentials/,
      /Preview Organization/,
      /Preview Workspace/,
      /Clear all focus/,
      /Week 8 readiness summary/,
      /Drill-down active: Credentials/,
      /Open onboarding flow/,
      /\/onboarding\\\?/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Admin follow-up context/,
      /Launch lane context/,
      /Focus Credentials/,
      /Step 4: Run playground demo/,
      /\/playground\\\?/,
      /Prompt, invoke, inspect/,
      /Plan-limit checkpoint/,
      /Capture verification evidence/,
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

for (const spec of smokeExpectations) {
  test(`credentials onboarding follow-up smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
