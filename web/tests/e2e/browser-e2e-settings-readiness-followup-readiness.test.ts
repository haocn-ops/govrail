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
  "tests/browser/settings-verification-admin-return.smoke.spec.ts",
  "tests/browser/settings-go-live-admin-return.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/settings-verification-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /settings -> verification -> admin keeps handoff continuity/,
      /\/settings\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_preview&delivery_context=recent_activity&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Workspace configuration/,
      /Admin follow-up context/,
      /Enterprise evidence lane/,
      /SSO evidence lane/,
      /Upgrade plan/,
      /intent=upgrade/,
      /Confirm usage evidence/,
      /Capture verification evidence/,
      /\/verification\\\?/,
      /surface=verification/,
      /delivery_context=recent_activity/,
      /recent_track_key=verification/,
      /recent_update_kind=verification/,
      /evidence_count=2/,
      /Week 8 launch checklist/,
      /Verification evidence lane/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /SaaS admin overview/,
      /Returned from Week 8 readiness/,
    ],
  },
  {
    path: "tests/browser/settings-go-live-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /settings -> go-live -> admin keeps handoff continuity/,
      /\/settings\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_preview&delivery_context=recent_activity&recent_track_key=go_live&recent_update_kind=go_live&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Workspace configuration/,
      /Admin follow-up context/,
      /Enterprise evidence lane/,
      /Dedicated environment evidence lane/,
      /Rehearse go-live readiness/,
      /Upgrade plan/,
      /intent=upgrade/,
      /Continue to go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /delivery_context=recent_activity/,
      /recent_track_key=go_live/,
      /recent_update_kind=go_live/,
      /evidence_count=2/,
      /Mock go-live drill/,
      /Session-aware drill lane/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /SaaS admin overview/,
      /Returned from Week 8 readiness/,
    ],
  },
] as const;

test("settings readiness follow-up batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  const expectedMain = `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`;
  const expectedExisting = `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`;

  assert.equal(webPackageJson.scripts?.["test:browser:settings-readiness-followup"], expectedMain);
  assert.equal(
    webPackageJson.scripts?.["test:browser:settings-readiness-followup:existing-server"],
    expectedExisting,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:settings-readiness-followup"],
    "npm --prefix web run test:browser:settings-readiness-followup --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:settings-readiness-followup:existing-server"],
    "npm --prefix web run test:browser:settings-readiness-followup:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:settings-readiness-followup/);
  assert.match(docsReadme, /settings -> verification -> admin/);
  assert.match(docsReadme, /settings -> go-live -> admin/);
  assert.match(executionPlan, /settings-readiness-followup/);
  assert.match(executionPlan, /settings -> go-live -> admin/);
});

for (const spec of smokeExpectations) {
  test(`settings readiness follow-up smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
