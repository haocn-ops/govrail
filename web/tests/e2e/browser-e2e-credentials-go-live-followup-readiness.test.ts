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
  "tests/browser/agents-go-live-admin-return.smoke.spec.ts",
  "tests/browser/api-keys-go-live-admin-return.smoke.spec.ts",
  "tests/browser/service-accounts-go-live-admin-return.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/agents-go-live-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /agents -> go-live -> admin keeps readiness return continuity/,
      /\/agents\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_preview&delivery_context=week8&recent_track_key=go_live&recent_update_kind=go_live&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Agent lifecycle management/,
      /Admin follow-up context/,
      /Governance continuity/,
      /Align go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /recent_track_key=go_live/,
      /recent_update_kind=go_live/,
      /evidence_count=2/,
      /recent_owner_display_name=Avery(?:\\\+|%20)Ops/,
      /recent_owner_email=avery\.ops(?:%40|@)govrail\.test/,
      /Mock go-live drill/,
      /Session-aware drill lane/,
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
    path: "tests/browser/api-keys-go-live-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /api-keys -> go-live -> admin keeps readiness return continuity/,
      /\/api-keys\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_preview&delivery_context=week8&recent_track_key=go_live&recent_update_kind=go_live&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Credential lifecycle/,
      /Admin follow-up context/,
      /Audit export continuity/,
      /Reopen go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /recent_track_key=go_live/,
      /recent_update_kind=go_live/,
      /evidence_count=2/,
      /recent_owner_display_name=Avery(?:\\\+|%20)Ops/,
      /recent_owner_email=avery\.ops(?:%40|@)govrail\.test/,
      /Mock go-live drill/,
      /Session-aware drill lane/,
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
    path: "tests/browser/service-accounts-go-live-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /service-accounts -> go-live -> admin keeps readiness return continuity/,
      /\/service-accounts\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_preview&delivery_context=week8&recent_track_key=go_live&recent_update_kind=go_live&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Machine identities/,
      /Admin follow-up context/,
      /Audit export continuity/,
      /Reopen go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /recent_track_key=go_live/,
      /recent_update_kind=go_live/,
      /evidence_count=2/,
      /recent_owner_display_name=Avery(?:\\\+|%20)Ops/,
      /recent_owner_email=avery\.ops(?:%40|@)govrail\.test/,
      /Mock go-live drill/,
      /Session-aware drill lane/,
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
] as const;

test("credentials go-live follow-up batch stays wired into scripts and docs", async () => {
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

  assert.equal(webPackageJson.scripts?.["test:browser:credentials-go-live-followup"], expectedPrebuilt);
  assert.equal(
    webPackageJson.scripts?.["test:browser:credentials-go-live-followup:existing-server"],
    expectedExisting,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:credentials-go-live-followup"],
    "npm --prefix web run test:browser:credentials-go-live-followup --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:credentials-go-live-followup:existing-server"],
    "npm --prefix web run test:browser:credentials-go-live-followup:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:credentials-go-live-followup/);
  assert.match(docsReadme, /agents -> go-live -> admin/);
  assert.match(docsReadme, /api-keys -> go-live -> admin/);
  assert.match(docsReadme, /service-accounts -> go-live -> admin/);
  assert.match(executionPlan, /credentials-go-live-followup/);
  assert.match(executionPlan, /service-accounts -> go-live -> admin/);
});

for (const spec of smokeExpectations) {
  test(`credentials go-live follow-up smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
