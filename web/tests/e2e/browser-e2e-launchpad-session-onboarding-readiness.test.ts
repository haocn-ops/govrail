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

test("launchpad session onboarding focused browser batch keeps smoke continuity explicit", async () => {
  const source = await readFile(path.resolve(webDir, browserSpecPath), "utf8");

  assert.match(
    source,
    /launchpad -> session -> onboarding -> usage -> \/settings\?intent=manage-plan -> verification -> go-live -> admin keeps minimal browser continuity/,
  );
  assert.match(
    source,
    /\/\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Owner&recent_owner_display_name=Preview%20Owner&recent_owner_email=preview\.owner%40govrail\.test/,
  );
  assert.match(source, /SaaS Workspace Launch Hub/);
  assert.match(source, /Return to session checkpoint/);
  assert.match(source, /\/session\\\?/);
  assert.match(source, /Session and workspace access/);
  assert.match(source, /Open onboarding/);
  assert.match(source, /\/onboarding\\\?/);
  assert.match(source, /Launch lane context/);
  assert.match(source, /Confirm session context/);
  assert.match(source, /Trusted session reminder/);
  assert.match(source, /Step 5: Confirm usage window/);
  assert.match(source, /\/usage\\\?/);
  assert.match(source, /Workspace usage and plan posture/);
  assert.match(source, /Review plan limits in Settings/);
  assert.match(source, /\/settings\\\?/);
  assert.match(source, /intent=manage-plan/);
  assert.match(source, /Workspace configuration/);
  assert.match(source, /Enterprise evidence lane/);
  assert.match(source, /Capture verification evidence/);
  assert.match(source, /\/verification\\\?/);
  assert.match(source, /surface=verification/);
  assert.match(source, /Week 8 launch checklist/);
  assert.match(source, /Verification evidence lane/);
  assert.match(source, /Continue to go-live drill/);
  assert.match(source, /\/go-live\\\?/);
  assert.match(source, /surface=go_live/);
  assert.match(source, /Mock go-live drill/);
  assert.match(source, /Session-aware drill lane/);
  assert.match(source, /Return to admin readiness view/);
  assert.match(source, /readiness_returned=1/);
  assert.match(source, /Returned from Week 8 readiness/);
  assert.match(source, /Focus restored/);
  assert.match(source, /recent_owner_display_name=Preview(?:\\\+|%20)Owner/);
  assert.match(source, /recent_owner_email=preview\.owner(?:%40|@)govrail\.test/);
});
