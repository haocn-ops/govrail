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
  "tests/browser/egress-verification-admin-return.smoke.spec.ts",
  "tests/browser/egress-verification-go-live-admin-return.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/egress-verification-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /egress -> verification -> admin keeps readiness return continuity/,
      /\/egress\?source=admin-readiness&week8_focus=credentials&attention_workspace=egress-demo&attention_organization=org_egress&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=1&recent_owner_display_name=Egress%20Operator&recent_owner_email=egress\.operator%40govrail\.test/,
      /Outbound permission control/,
      /Audit export continuity/,
      /Navigation-only manual relay/,
      /Continue verification evidence/,
      /\/verification\\\?/,
      /surface=verification/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=egress-demo/,
      /attention_organization=org_egress/,
      /recent_track_key=verification/,
      /recent_update_kind=verification/,
      /evidence_count=1/,
      /recent_owner_display_name=Egress(?:\\\+|%20)Operator/,
      /recent_owner_email=egress\.operator(?:%40|@)govrail\.test/,
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
    path: "tests/browser/egress-verification-go-live-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /egress -> verification -> go-live -> admin keeps readiness browser continuity/,
      /\/egress\?source=admin-readiness&week8_focus=credentials&attention_workspace=egress-demo&attention_organization=org_egress&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=1&recent_owner_display_name=Egress%20Operator&recent_owner_email=egress\.operator%40govrail\.test/,
      /Outbound permission control/,
      /Audit export continuity/,
      /Navigation-only manual relay/,
      /Continue verification evidence/,
      /\/verification\\\?/,
      /surface=verification/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=egress-demo/,
      /attention_organization=org_egress/,
      /recent_track_key=verification/,
      /recent_update_kind=verification/,
      /evidence_count=1/,
      /recent_owner_display_name=Egress(?:\\\+|%20)Operator/,
      /recent_owner_email=egress\.operator(?:%40|@)govrail\.test/,
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

test("egress verification follow-up batch stays wired into scripts and docs", async () => {
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

  assert.equal(webPackageJson.scripts?.["test:browser:egress-verification-followup"], expectedPrebuilt);
  assert.equal(
    webPackageJson.scripts?.["test:browser:egress-verification-followup:existing-server"],
    expectedExisting,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:egress-verification-followup"],
    "npm --prefix web run test:browser:egress-verification-followup --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:egress-verification-followup:existing-server"],
    "npm --prefix web run test:browser:egress-verification-followup:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:egress-verification-followup/);
  assert.match(docsReadme, /egress -> verification -> admin/);
  assert.match(docsReadme, /egress -> verification -> go-live -> admin/);
  assert.match(executionPlan, /egress-verification-followup/);
  assert.match(executionPlan, /egress -> verification -> go-live -> admin/);
});

for (const spec of smokeExpectations) {
  test(`egress verification follow-up smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
