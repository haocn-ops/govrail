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
  "tests/browser/onboarding-members-accept-invitation.smoke.spec.ts",
  "tests/browser/onboarding-accept-invitation-session-return.smoke.spec.ts",
  "tests/browser/onboarding-accept-invitation-static.smoke.spec.ts",
  "tests/browser/members-accept-invitation-static.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/onboarding-members-accept-invitation.smoke.spec.ts",
    requiredPatterns: [
      /onboarding -> members -> accept-invitation keeps readiness browser continuity/,
      /\/onboarding\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Launch lane context/,
      /Workspace access/,
      /Manual onboarding handoff/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /Token guidance/,
      /Accept invitation/,
      /\/session/,
      /source=admin-readiness/,
      /recent_owner_display_name=Avery(?:\\\+|%20)Ops/,
      /recent_owner_email=avery\.ops(?:%40|@)govrail\.test/,
    ],
  },
  {
    path: "tests/browser/onboarding-accept-invitation-session-return.smoke.spec.ts",
    requiredPatterns: [
      /onboarding -> accept-invitation, then return -> session keeps invite continuity/,
      /\/onboarding\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Launch lane context/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /Token guidance/,
      /Accept invitation/,
      /\/session/,
      /page\.goBack\(\)/,
      /\/session\\\?/,
      /source=admin-readiness/,
      /recent_owner_display_name=Avery(?:\\\+|%20)Ops/,
      /recent_owner_email=avery\.ops(?:%40|@)govrail\.test/,
    ],
  },
  {
    path: "tests/browser/onboarding-accept-invitation-static.smoke.spec.ts",
    requiredPatterns: [
      /onboarding -> accept-invitation keeps invite-to-accept static cues/,
      /\/onboarding\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
      /Launch lane context/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /Token guidance/,
      /Accept invitation/,
      /\/session/,
      /source=admin-readiness/,
      /recent_owner_display_name=Avery(?:\\\+|%20)Ops/,
      /recent_owner_email=avery\.ops(?:%40|@)govrail\.test/,
    ],
  },
  {
    path: "tests/browser/members-accept-invitation-static.smoke.spec.ts",
    requiredPatterns: [
      /members -> accept-invitation keeps static redemption cues and continuity/,
      /\/members\?source=onboarding&attention_workspace=preview&attention_organization=org_preview&delivery_context=recent_activity&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Owner&recent_owner_display_name=Preview%20Owner&recent_owner_email=preview\.owner%40govrail\.test/,
      /Workspace access/,
      /Manual onboarding handoff/,
      /Open accept-invitation/,
      /Accept workspace invitation/,
      /Token guidance/,
      /Accept invitation/,
      /\/session/,
      /source=onboarding/,
      /recent_owner_display_name=Preview(?:\\\+|%20)Owner/,
      /recent_owner_email=preview\.owner(?:%40|@)govrail\.test/,
    ],
  },
] as const;

test("accept-invitation entry continuity batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  const prebuilt = `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`;
  const existing = `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`;

  assert.equal(webPackageJson.scripts?.["test:browser:accept-invitation-entry-continuity"], prebuilt);
  assert.equal(
    webPackageJson.scripts?.["test:browser:accept-invitation-entry-continuity:existing-server"],
    existing,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:accept-invitation-entry-continuity"],
    "npm --prefix web run test:browser:accept-invitation-entry-continuity --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:accept-invitation-entry-continuity:existing-server"],
    "npm --prefix web run test:browser:accept-invitation-entry-continuity:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:accept-invitation-entry-continuity/);
  assert.match(docsReadme, /onboarding -> members -> accept-invitation/);
  assert.match(docsReadme, /onboarding -> accept-invitation, then return -> session/);
  assert.match(docsReadme, /members -> accept-invitation \(static\)/);
  assert.match(executionPlan, /accept-invitation-entry-continuity/);
  assert.match(executionPlan, /onboarding -> accept-invitation \(static\)/);
});

for (const spec of smokeExpectations) {
  test(`accept-invitation entry continuity smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
