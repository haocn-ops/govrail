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
  "tests/browser/usage-verification-admin-return.smoke.spec.ts",
  "tests/browser/usage-verification-go-live-admin-return.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/usage-verification-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /usage -> verification -> admin keeps readiness return continuity/,
      /\/usage\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_preview&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Workspace usage and plan posture/,
      /Admin follow-up context/,
      /Evidence loop follow-through/,
      /Refresh verification notes/,
      /\/verification\\\?/,
      /surface=verification/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /recent_track_key=verification/,
      /recent_update_kind=verification/,
      /evidence_count=2/,
      /recent_owner_display_name=Avery(?:\\\+|%20)Ops/,
      /recent_owner_email=avery\.ops(?:%40|@)govrail\.test/,
      /Week 8 launch checklist/,
      /Verification evidence lane/,
      /Focus Credentials/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /SaaS admin overview/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
      /Clear readiness focus/,
    ],
  },
  {
    path: "tests/browser/usage-verification-go-live-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /usage -> verification -> go-live -> admin keeps readiness browser continuity/,
      /\/usage\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_preview&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Workspace usage and plan posture/,
      /Admin follow-up context/,
      /Evidence loop follow-through/,
      /Refresh verification notes/,
      /\/verification\\\?/,
      /surface=verification/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /recent_track_key=verification/,
      /recent_update_kind=verification/,
      /evidence_count=2/,
      /recent_owner_display_name=Avery(?:\\\+|%20)Ops/,
      /recent_owner_email=avery\.ops(?:%40|@)govrail\.test/,
      /Week 8 launch checklist/,
      /Verification evidence lane/,
      /Focus Credentials/,
      /Continue to go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /Mock go-live drill/,
      /Session-aware drill lane/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /SaaS admin overview/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
      /Clear readiness focus/,
    ],
  },
] as const;

test("usage verification follow-up batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  const expectedPrebuilt = `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`;
  const expectedExistingServer = `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`;

  assert.equal(webPackageJson.scripts?.["test:browser:usage-verification-followup"], expectedPrebuilt);
  assert.equal(
    webPackageJson.scripts?.["test:browser:usage-verification-followup:existing-server"],
    expectedExistingServer,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:usage-verification-followup"],
    "npm --prefix web run test:browser:usage-verification-followup --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:usage-verification-followup:existing-server"],
    "npm --prefix web run test:browser:usage-verification-followup:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:usage-verification-followup/);
  assert.match(docsReadme, /usage -> verification -> admin/);
  assert.match(docsReadme, /usage -> verification -> go-live -> admin/);
assert.match(executionPlan, /usage-verification-followup/);
assert.match(executionPlan, /usage -> verification -> go-live -> admin/);
});

for (const spec of smokeExpectations) {
  test(`usage verification follow-up smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
