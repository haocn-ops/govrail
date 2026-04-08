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
  "tests/browser/go-live-delivery-admin-return.smoke.spec.ts",
  "tests/browser/verification-delivery-admin-return.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/go-live-delivery-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /go-live delivery panel -> verification -> admin keeps readiness continuity/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Go-live delivery notes/,
      /Admin readiness evidence handoff/,
      /navigation focus only/i,
      /Return to verification/,
      /\/verification\\\?/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /delivery_context=recent_activity/,
      /recent_track_key=go_live/,
      /recent_update_kind=go_live/,
      /evidence_count=2/,
      /recent_owner_display_name=Avery(?:\+|%20)Ops/,
      /recent_owner_email=avery\.ops(?:%40|@)govrail\.test/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /SaaS admin overview/,
      /Returned from Week 8 readiness/,
    ],
  },
  {
    path: "tests/browser/verification-delivery-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /verification delivery panel -> go-live -> admin keeps readiness continuity/,
      /Week 8 launch checklist/,
      /Admin follow-up context/,
      /Verification delivery notes/,
      /Admin readiness evidence handoff/,
      /navigation focus only/i,
      /Continue to go-live drill/,
      /\/go-live\\\?/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /delivery_context=recent_activity/,
      /recent_track_key=verification/,
      /recent_update_kind=verification/,
      /evidence_count=2/,
      /recent_owner_display_name=Avery(?:\+|%20)Ops/,
      /recent_owner_email=avery\.ops(?:%40|@)govrail\.test/,
      /Mock go-live drill/,
      /Go-live delivery notes/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /SaaS admin overview/,
      /Returned from Week 8 readiness/,
    ],
  },
] as const;

test("delivery-panel cross return batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  assert.equal(
    webPackageJson.scripts?.["test:browser:delivery-panel-cross-return"],
    `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`,
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:delivery-panel-cross-return:existing-server"],
    `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:delivery-panel-cross-return"],
    "npm --prefix web run test:browser:delivery-panel-cross-return --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:delivery-panel-cross-return:existing-server"],
    "npm --prefix web run test:browser:delivery-panel-cross-return:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:delivery-panel-cross-return/);
  assert.match(docsReadme, /go-live -> delivery -> admin/);
  assert.match(docsReadme, /verification -> delivery -> admin/);
  assert.match(executionPlan, /delivery-panel cross return/);
  assert.match(executionPlan, /go-live -> delivery -> admin/);
});

for (const spec of smokeExpectations) {
  test(`delivery-panel cross return smoke keeps ${spec.path} explicit`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
