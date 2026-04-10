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
  "tests/browser/onboarding-accept-invitation-verification-settings-go-live-admin-return.smoke.spec.ts",
  "tests/browser/members-accept-invitation-verification-settings-go-live-admin-return.smoke.spec.ts",
  "tests/browser/onboarding-accept-invitation-verification-settings-go-live-verification-admin-return.smoke.spec.ts",
  "tests/browser/members-accept-invitation-verification-settings-go-live-verification-admin-return.smoke.spec.ts",
  "tests/browser/onboarding-accept-invitation-verification-settings-go-live-verification-settings-admin-return.smoke.spec.ts",
  "tests/browser/members-accept-invitation-verification-settings-go-live-verification-settings-admin-return.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/onboarding-accept-invitation-verification-settings-go-live-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /onboarding -> accept-invitation -> verification -> settings -> go-live -> admin keeps readiness return continuity/,
      /\/onboarding\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Launch lane context/,
      /Invite-to-accept path/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /Token guidance/,
      /Accept invitation/,
      /\/session/,
      /Step 6: Capture verification evidence/,
      /surface=verification/,
      /Week 8 launch checklist/,
      /Verification evidence lane/,
      /Review settings \+ billing/,
      /intent=manage-plan/,
      /Workspace configuration/,
      /Rehearse go-live readiness/,
      /surface=go_live/,
      /Mock go-live drill/,
      /Session-aware drill lane/,
      /Return to admin readiness view/,
      /readiness_returned=1/,
      /SaaS admin overview/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
      /Clear readiness focus/,
      /recent_owner_display_name=Avery%20Ops/,
      /recent_owner_email=avery\.ops%40govrail\.test/,
    ],
  },
  {
    path: "tests/browser/members-accept-invitation-verification-settings-go-live-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /members -> accept-invitation -> verification -> settings -> go-live -> admin keeps readiness return continuity/,
      /\/members\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Workspace access/,
      /Admin follow-up context/,
      /Manual onboarding handoff/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /Token guidance/,
      /Accept invitation/,
      /\/session/,
      /page\.goBack\(\)/,
      /Capture verification evidence/,
      /surface=verification/,
      /Week 8 launch checklist/,
      /Verification evidence lane/,
      /Review settings \+ billing/,
      /intent=manage-plan/,
      /Workspace configuration/,
      /Rehearse go-live readiness/,
      /surface=go_live/,
      /Mock go-live drill/,
      /Session-aware drill lane/,
      /Return to admin readiness view/,
      /readiness_returned=1/,
      /SaaS admin overview/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
      /Clear readiness focus/,
      /recent_owner_display_name=Avery%20Ops/,
      /recent_owner_email=avery\.ops%40govrail\.test/,
    ],
  },
  {
    path: "tests/browser/onboarding-accept-invitation-verification-settings-go-live-verification-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /onboarding -> accept-invitation -> verification -> settings -> go-live -> verification -> admin keeps readiness return continuity/,
      /\/onboarding\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Launch lane context/,
      /Invite-to-accept path/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /page\.goBack\(\)/,
      /Step 6: Capture verification evidence/,
      /Review settings \+ billing/,
      /intent=manage-plan/,
      /Rehearse go-live readiness/,
      /Reopen verification evidence/,
      /surface=go_live/,
      /surface=verification/,
      /Return to admin readiness view/,
      /readiness_returned=1/,
      /recent_owner_display_name=Avery%20Ops/,
      /recent_owner_email=avery\.ops%40govrail\.test/,
    ],
  },
  {
    path: "tests/browser/members-accept-invitation-verification-settings-go-live-verification-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /members -> accept-invitation -> verification -> settings -> go-live -> verification -> admin keeps readiness return continuity/,
      /Workspace access/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /page\.goBack\(\)/,
      /Capture verification evidence/,
      /Review settings \+ billing/,
      /intent=manage-plan/,
      /Rehearse go-live readiness/,
      /Reopen verification evidence/,
      /Return to admin readiness view/,
      /readiness_returned=1/,
      /recent_owner_display_name=Avery%20Ops/,
      /recent_owner_email=avery\.ops%40govrail\.test/,
    ],
  },
  {
    path: "tests/browser/onboarding-accept-invitation-verification-settings-go-live-verification-settings-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /onboarding -> accept-invitation -> verification -> settings -> go-live -> verification -> settings -> admin keeps readiness return continuity/,
      /\/onboarding\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Launch lane context/,
      /Invite-to-accept path/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /Token guidance/,
      /Accept invitation/,
      /\/session/,
      /page\.goBack\(\)/,
      /Step 6: Capture verification evidence/,
      /surface=verification/,
      /Week 8 launch checklist/,
      /Verification evidence lane/,
      /Review settings \+ billing/,
      /intent=manage-plan/,
      /Workspace configuration/,
      /Rehearse go-live readiness/,
      /surface=go_live/,
      /Mock go-live drill/,
      /Session-aware drill lane/,
      /Reopen verification evidence/,
      /Return to admin readiness view/,
      /readiness_returned=1/,
      /SaaS admin overview/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
      /Clear readiness focus/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_demo/,
      /recent_track_key=verification/,
      /recent_update_kind=verification/,
      /evidence_count=2/,
      /recent_owner_display_name=Avery%20Ops/,
      /recent_owner_email=avery\.ops%40govrail\.test/,
    ],
  },
  {
    path: "tests/browser/members-accept-invitation-verification-settings-go-live-verification-settings-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /members -> accept-invitation -> verification -> settings -> go-live -> verification -> settings -> admin keeps readiness return continuity/,
      /\/members\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Workspace access/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /page\.goBack\(\)/,
      /Capture verification evidence/,
      /Review settings \+ billing/,
      /intent=manage-plan/,
      /Rehearse go-live readiness/,
      /Reopen verification evidence/,
      /Workspace configuration/,
      /Return to admin readiness view/,
      /readiness_returned=1/,
      /recent_owner_display_name=Avery%20Ops/,
      /recent_owner_email=avery\.ops%40govrail\.test/,
    ],
  },
] as const;

test("accept-invitation verification settings-go-live followup batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  const expected = `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`;
  const expectedExisting = `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`;

  assert.equal(
    webPackageJson.scripts?.["test:browser:accept-invitation-verification-settings-go-live-followup"],
    expected,
  );
  assert.equal(
    webPackageJson.scripts?.[
      "test:browser:accept-invitation-verification-settings-go-live-followup:existing-server"
    ],
    expectedExisting,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:accept-invitation-verification-settings-go-live-followup"],
    "npm --prefix web run test:browser:accept-invitation-verification-settings-go-live-followup --",
  );
  assert.equal(
    rootPackageJson.scripts?.[
      "web:test:browser:accept-invitation-verification-settings-go-live-followup:existing-server"
    ],
    "npm --prefix web run test:browser:accept-invitation-verification-settings-go-live-followup:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:accept-invitation-verification-settings-go-live-followup/);
  assert.match(
    docsReadme,
    /onboarding -> accept-invitation -> verification -> settings -> go-live -> admin/,
  );
  assert.match(
    docsReadme,
    /members -> accept-invitation -> verification -> settings -> go-live -> admin/,
  );
  assert.match(
    docsReadme,
    /onboarding -> accept-invitation -> verification -> settings -> go-live -> verification -> admin/,
  );
  assert.match(
    docsReadme,
    /members -> accept-invitation -> verification -> settings -> go-live -> verification -> admin/,
  );
  assert.match(
    docsReadme,
    /onboarding -> accept-invitation -> verification -> settings -> go-live -> verification -> settings -> admin/,
  );
  assert.match(
    docsReadme,
    /members -> accept-invitation -> verification -> settings -> go-live -> verification -> settings -> admin/,
  );
  assert.match(executionPlan, /accept-invitation-verification-settings-go-live-followup/);
  assert.match(
    executionPlan,
    /members -> accept-invitation -> verification -> settings -> go-live -> admin/,
  );
  assert.match(
    executionPlan,
    /members -> accept-invitation -> verification -> settings -> go-live -> verification -> settings -> admin/,
  );
});

for (const spec of smokeExpectations) {
  test(`accept-invitation verification settings-go-live followup smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
