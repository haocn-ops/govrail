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
const browserSpecPath = "tests/browser/launchpad-audit-export-verification-admin-return.smoke.spec.ts";

const smokeExpectations = [
  {
    path: browserSpecPath,
    requiredPatterns: [
      /launchpad audit export -> verification -> admin keeps readiness continuity/,
      /\/\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /SaaS Workspace Launch Hub/,
      /Audit export continuity/,
      /Carry proof to verification/,
      /\/verification\\\?/,
      /surface=verification/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_demo/,
      /recent_track_key=verification/,
      /recent_update_kind=verification/,
      /evidence_count=2/,
      /recent_owner_display_name=Avery(?:%20|\\\+)Ops/,
      /recent_owner_email=avery\.ops(?:%40|@)govrail\.test/,
      /Week 8 launch checklist/,
      /Verification evidence lane/,
      /Admin follow-up context/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /SaaS admin overview/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
] as const;

test("launchpad audit-export focused browser batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  assert.equal(
    webPackageJson.scripts?.["test:browser:launchpad-audit-export"],
    `node scripts/run-playwright-prebuilt-smoke.mjs ${browserSpecPath}`,
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:launchpad-audit-export:existing-server"],
    `node scripts/run-playwright-existing-server-smoke.mjs ${browserSpecPath}`,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:launchpad-audit-export"],
    "npm --prefix web run test:browser:launchpad-audit-export --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:launchpad-audit-export:existing-server"],
    "npm --prefix web run test:browser:launchpad-audit-export:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:launchpad-audit-export/);
  assert.match(docsReadme, /launchpad audit-export focused batch/);
  assert.match(executionPlan, /launchpad-audit-export/);
  assert.match(executionPlan, /launchpad root.*verification.*admin/);
});

for (const spec of smokeExpectations) {
  test(`launchpad audit-export focused browser batch keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
