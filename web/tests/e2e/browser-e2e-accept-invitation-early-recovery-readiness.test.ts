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
  "tests/browser/onboarding-accept-invitation-usage-return.smoke.spec.ts",
  "tests/browser/onboarding-accept-invitation-usage-settings-return.smoke.spec.ts",
  "tests/browser/members-accept-invitation-onboarding-return.smoke.spec.ts",
  "tests/browser/members-accept-invitation-onboarding-usage-return.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/onboarding-accept-invitation-usage-return.smoke.spec.ts",
    requiredPatterns: [
      /onboarding -> accept-invitation -> usage keeps invite continuity/,
      /\/onboarding\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Launch lane context/,
      /Invite-to-accept path/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /Token guidance/,
      /Accept invitation/,
      /\/session/,
      /Step 5: Confirm usage window/,
      /Workspace usage and plan posture/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_demo/,
      /delivery_context=week8/,
      /recent_track_key=verification/,
      /recent_update_kind=verification/,
      /evidence_count=2/,
      /recent_owner_display_name=Avery%20Ops/,
      /recent_owner_email=avery\.ops%40govrail\.test/,
    ],
  },
  {
    path: "tests/browser/onboarding-accept-invitation-usage-settings-return.smoke.spec.ts",
    requiredPatterns: [
      /onboarding -> accept-invitation -> usage -> \/settings\?intent=manage-plan keeps invite continuity/,
      /\/onboarding\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Launch lane context/,
      /Invite-to-accept path/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /Token guidance/,
      /Accept invitation/,
      /\/session/,
      /Step 5: Confirm usage window/,
      /Workspace usage and plan posture/,
      /Review plan limits in Settings/,
      /Workspace configuration/,
      /intent=manage-plan/,
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
    path: "tests/browser/members-accept-invitation-onboarding-return.smoke.spec.ts",
    requiredPatterns: [
      /members -> accept-invitation -> return -> onboarding keeps invite continuity/,
      /\/members\?source=onboarding&attention_workspace=preview&attention_organization=org_preview&delivery_context=recent_activity&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Owner&recent_owner_display_name=Preview%20Owner&recent_owner_email=preview\.owner%40govrail\.test/,
      /Workspace access/,
      /Manual onboarding handoff/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /Token guidance/,
      /Accept invitation/,
      /\/session/,
      /page\.goBack\(\)/,
      /Continue onboarding lane/,
      /Launch lane context/,
      /source=onboarding/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /delivery_context=recent_activity/,
      /recent_track_key=verification/,
      /recent_update_kind=verification/,
      /evidence_count=2/,
      /recent_owner_display_name=Preview%20Owner/,
      /recent_owner_email=preview\.owner%40govrail\.test/,
    ],
  },
  {
    path: "tests/browser/members-accept-invitation-onboarding-usage-return.smoke.spec.ts",
    requiredPatterns: [
      /members -> accept-invitation -> onboarding -> usage keeps invite recovery continuity/,
      /\/members\?source=onboarding&attention_workspace=preview&attention_organization=org_preview&delivery_context=recent_activity&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Owner&recent_owner_display_name=Preview%20Owner&recent_owner_email=preview\.owner%40govrail\.test/,
      /Workspace access/,
      /Manual onboarding handoff/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /Token guidance/,
      /Accept invitation/,
      /\/session/,
      /page\.goBack\(\)/,
      /Continue onboarding lane/,
      /Launch lane context/,
      /Step 5: Confirm usage window/,
      /Workspace usage and plan posture/,
      /source=onboarding/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /delivery_context=recent_activity/,
      /recent_track_key=verification/,
      /recent_update_kind=verification/,
      /evidence_count=2/,
      /recent_owner_display_name=Preview%20Owner/,
      /recent_owner_email=preview\.owner%40govrail\.test/,
    ],
  },
] as const;

test("accept-invitation early recovery batch stays wired into scripts and docs", async () => {
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
    webPackageJson.scripts?.["test:browser:accept-invitation-early-recovery"],
    expectedPrebuilt,
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:accept-invitation-early-recovery:existing-server"],
    expectedExisting,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:accept-invitation-early-recovery"],
    "npm --prefix web run test:browser:accept-invitation-early-recovery --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:accept-invitation-early-recovery:existing-server"],
    "npm --prefix web run test:browser:accept-invitation-early-recovery:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:accept-invitation-early-recovery/);
  assert.match(docsReadme, /onboarding -> accept-invitation -> usage/);
  assert.match(docsReadme, /onboarding -> accept-invitation -> usage -> \/settings\?intent=manage-plan/);
  assert.match(docsReadme, /members -> accept-invitation -> return -> onboarding/);
  assert.match(docsReadme, /members -> accept-invitation -> onboarding -> usage/);
  assert.match(executionPlan, /accept-invitation-early-recovery/);
  assert.match(executionPlan, /members -> accept-invitation -> onboarding -> usage/);
});

for (const spec of smokeExpectations) {
  test(`accept-invitation early recovery smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
