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
const browserSpecPath = "tests/browser/launchpad-session-onboarding.smoke.spec.ts";

const smokeExpectations = [
  {
    path: browserSpecPath,
    requiredPatterns: [
      /launchpad -> session -> onboarding -> usage -> \/settings\?intent=manage-plan -> verification -> go-live -> admin keeps minimal browser continuity/,
      /\/\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Owner&recent_owner_display_name=Preview%20Owner&recent_owner_email=preview\.owner%40govrail\.test/,
      /SaaS Workspace Launch Hub/,
      /Return to session checkpoint/,
      /\/session\\\?/,
      /Session and workspace access/,
      /Open onboarding/,
      /\/onboarding\\\?/,
      /Launch lane context/,
      /Confirm session context/,
      /Trusted session reminder/,
      /Step 5: Confirm usage window/,
      /\/usage\\\?/,
      /Workspace usage and plan posture/,
      /Review plan limits in Settings/,
      /\/settings\\\?/,
      /intent=manage-plan/,
      /Workspace configuration/,
      /Enterprise evidence lane/,
      /Capture verification evidence/,
      /\/verification\\\?/,
      /surface=verification/,
      /Week 8 launch checklist/,
      /Verification evidence lane/,
      /Continue to go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /Mock go-live drill/,
      /Session-aware drill lane/,
      /Return to admin readiness view/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
      /recent_owner_display_name=Preview(?:\\\+|%20)Owner/,
      /recent_owner_email=preview\.owner(?:%40|@)govrail\.test/,
    ],
  },
] as const;

test("launchpad session onboarding focused browser batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  assert.equal(
    webPackageJson.scripts?.["test:browser:launchpad-session-onboarding"],
    `node scripts/run-playwright-prebuilt-smoke.mjs ${browserSpecPath}`,
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:launchpad-session-onboarding:existing-server"],
    `node scripts/run-playwright-existing-server-smoke.mjs ${browserSpecPath}`,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:launchpad-session-onboarding"],
    "npm --prefix web run test:browser:launchpad-session-onboarding --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:launchpad-session-onboarding:existing-server"],
    "npm --prefix web run test:browser:launchpad-session-onboarding:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:launchpad-session-onboarding/);
  assert.match(docsReadme, /single-spec focused batch/);
  assert.match(executionPlan, /launchpad-session-onboarding/);
  assert.match(
    executionPlan,
    /launchpad -> session -> onboarding -> usage -> \/settings\?intent=manage-plan -> verification -> go-live -> admin/,
  );
});

for (const spec of smokeExpectations) {
  test(`launchpad session onboarding focused browser batch keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
