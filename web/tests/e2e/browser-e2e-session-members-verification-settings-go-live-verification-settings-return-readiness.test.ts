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
  "tests/browser/session-members-verification-settings-go-live-verification-settings-admin-return.smoke.spec.ts",
  "tests/browser/launchpad-session-members-verification-settings-go-live-verification-settings-admin-return.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/session-members-verification-settings-go-live-verification-settings-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /session -> members -> verification -> settings -> go-live -> verification -> settings -> admin keeps readiness return continuity/,
      /\/session\?source=admin-readiness/,
      /week8_focus=credentials/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /recent_owner_display_name=Avery(?:\+|%20)Ops/,
      /recent_owner_email=avery\.ops(?:%40|@)govrail\.test/,
      /Session and workspace access/,
      /Before entering a managed lane/,
      /Review members and access/,
      /Workspace access/,
      /Manual onboarding handoff/,
      /Capture verification evidence/,
      /surface=verification/,
      /Verification evidence lane/,
      /\/settings\\\?/,
      /intent=manage-plan/,
      /Workspace configuration/,
      /Rehearse go-live readiness/,
      /Mock go-live drill/,
      /Session-aware drill lane/,
      /Reopen verification evidence/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Focus restored/,
      /Clear readiness focus/,
      /SaaS admin overview/,
    ],
  },
  {
    path: "tests/browser/launchpad-session-members-verification-settings-go-live-verification-settings-admin-return.smoke.spec.ts",
    requiredPatterns: [
      /launchpad -> session -> members -> verification -> settings -> go-live -> verification -> settings -> admin keeps readiness return continuity/,
      /\/\?source=admin-readiness/,
      /SaaS Workspace Launch Hub/,
      /Return to session checkpoint/,
      /attention_workspace=preview/,
      /attention_organization=org_demo/,
      /Review members and access/,
      /Workspace access/,
      /Manual onboarding handoff/,
      /Capture verification evidence/,
      /surface=verification/,
      /Verification evidence lane/,
      /Admin follow-up context/,
      /Focus Credentials/,
      /\/settings\\\?/,
      /intent=manage-plan/,
      /Workspace configuration/,
      /Rehearse go-live readiness/,
      /Mock go-live drill/,
      /Session-aware drill lane/,
      /Reopen verification evidence/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Focus restored/,
      /Clear readiness focus/,
      /SaaS admin overview/,
    ],
  },
] as const;

test("session-members settings-go-live verification-settings return batch stays wired into scripts and docs", async () => {
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
    webPackageJson.scripts?.["test:browser:session-members-verification-settings-go-live-verification-settings-return"],
    expectedPrebuilt,
  );
  assert.equal(
    webPackageJson.scripts?.[
      "test:browser:session-members-verification-settings-go-live-verification-settings-return:existing-server"
    ],
    expectedExisting,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:session-members-verification-settings-go-live-verification-settings-return"],
    "npm --prefix web run test:browser:session-members-verification-settings-go-live-verification-settings-return --",
  );
  assert.equal(
    rootPackageJson.scripts?.[
      "web:test:browser:session-members-verification-settings-go-live-verification-settings-return:existing-server"
    ],
    "npm --prefix web run test:browser:session-members-verification-settings-go-live-verification-settings-return:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:session-members-verification-settings-go-live-verification-settings-return/);
  assert.match(
    docsReadme,
    /session -> members -> verification -> settings -> go-live -> verification -> settings -> admin/,
  );
  assert.match(
    docsReadme,
    /launchpad -> session -> members -> verification -> settings -> go-live -> verification -> settings -> admin/,
  );
  assert.match(executionPlan, /session-members-verification-settings-go-live-verification-settings-return/);
  assert.match(
    executionPlan,
    /session -> members -> verification -> settings -> go-live -> verification -> settings -> admin/,
  );
  assert.match(
    executionPlan,
    /launchpad -> session -> members -> verification -> settings -> go-live -> verification -> settings -> admin/,
  );
});

for (const spec of smokeExpectations) {
  test(`session-members verification settings go-live return smoke keeps ${spec.path} explicit`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
