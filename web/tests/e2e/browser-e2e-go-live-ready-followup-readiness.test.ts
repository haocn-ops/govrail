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
  "tests/browser/admin-readiness-go-live-ready-go-live-return.smoke.spec.ts",
  "tests/browser/admin-readiness-go-live-ready-go-live-verification-return.smoke.spec.ts",
  "tests/browser/admin-readiness-go-live-ready-go-live-verification-settings-return.smoke.spec.ts",
  "tests/browser/admin-readiness-go-live-ready-go-live-settings-return.smoke.spec.ts",
  "tests/browser/admin-readiness-go-live-ready-go-live-usage-return.smoke.spec.ts",
  "tests/browser/admin-readiness-go-live-ready-go-live-playground-return.smoke.spec.ts",
  "tests/browser/admin-readiness-go-live-ready-go-live-artifacts-return.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/admin-readiness-go-live-ready-go-live-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness go-live-ready branch -> go-live -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=go_live_ready&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Governance focus/,
      /Go-live ready/,
      /Week 8 readiness summary/,
      /Drill-down active: Go-live ready/,
      /Open mock go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /source=admin-readiness/,
      /week8_focus=go_live_ready/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Go-live ready/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
      /Clear readiness focus/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-go-live-ready-go-live-verification-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness go-live-ready branch -> go-live -> verification -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=go_live_ready&attention_organization=org_preview&attention_workspace=preview/,
      /Week 8 readiness summary/,
      /Open mock go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /source=admin-readiness/,
      /week8_focus=go_live_ready/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Go-live ready/,
      /Reopen verification evidence/,
      /\/verification\\\?/,
      /surface=verification/,
      /Week 8 launch checklist/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-go-live-ready-go-live-verification-settings-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness go-live-ready branch -> go-live -> verification -> settings -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=go_live_ready&attention_organization=org_preview&attention_workspace=preview/,
      /Week 8 readiness summary/,
      /Open mock go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /source=admin-readiness/,
      /week8_focus=go_live_ready/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Go-live ready/,
      /Reopen verification evidence/,
      /\/verification\\\?/,
      /surface=verification/,
      /Week 8 launch checklist/,
      /Review settings \+ billing/,
      /\/settings\\\?/,
      /intent=manage-plan/,
      /Workspace configuration/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-go-live-ready-go-live-settings-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness go-live-ready branch -> go-live -> settings -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=go_live_ready&attention_organization=org_preview&attention_workspace=preview/,
      /Week 8 readiness summary/,
      /Open mock go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /source=admin-readiness/,
      /week8_focus=go_live_ready/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Go-live ready/,
      /Review billing \+ settings/,
      /\/settings\\\?/,
      /intent=manage-plan/,
      /Workspace configuration/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-go-live-ready-go-live-usage-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness go-live-ready branch -> go-live -> usage -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=go_live_ready&attention_organization=org_preview&attention_workspace=preview/,
      /Week 8 readiness summary/,
      /Open mock go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /source=admin-readiness/,
      /week8_focus=go_live_ready/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Go-live ready/,
      /Confirm usage posture/,
      /\/usage\\\?/,
      /Workspace usage and plan posture/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-go-live-ready-go-live-playground-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness go-live-ready branch -> go-live -> playground -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=go_live_ready&attention_organization=org_preview&attention_workspace=preview/,
      /Week 8 readiness summary/,
      /Open mock go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /source=admin-readiness/,
      /week8_focus=go_live_ready/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Go-live ready/,
      /Revisit playground run/,
      /\/playground\\\?/,
      /Prompt, invoke, inspect/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-go-live-ready-go-live-artifacts-return.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness go-live-ready branch -> go-live -> artifacts -> admin keeps readiness browser continuity/,
      /\/admin\?week8_focus=go_live_ready&attention_organization=org_preview&attention_workspace=preview/,
      /Week 8 readiness summary/,
      /Open mock go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /source=admin-readiness/,
      /week8_focus=go_live_ready/,
      /attention_workspace=preview/,
      /attention_organization=org_preview/,
      /Mock go-live drill/,
      /Admin follow-up context/,
      /Focus Go-live ready/,
      /Inspect artifacts evidence/,
      /\/artifacts\\\?/,
      /Generated output and evidence/,
      /Return to admin readiness view/,
      /\/admin\\\?/,
      /readiness_returned=1/,
      /Returned from Week 8 readiness/,
      /Focus restored/,
    ],
  },
] as const;

test("go-live-ready follow-up browser batch stays wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  assert.equal(
    webPackageJson.scripts?.["test:browser:go-live-ready-followup"],
    `node scripts/run-playwright-prebuilt-smoke.mjs ${specs.join(" ")}`,
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:go-live-ready-followup:existing-server"],
    `node scripts/run-playwright-existing-server-smoke.mjs ${specs.join(" ")}`,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:go-live-ready-followup"],
    "npm --prefix web run test:browser:go-live-ready-followup --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:go-live-ready-followup:existing-server"],
    "npm --prefix web run test:browser:go-live-ready-followup:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:go-live-ready-followup/);
  assert.match(docsReadme, /go-live-ready-followup/);
  assert.match(docsReadme, /go_live_ready -> go-live -> verification -> settings -> admin/);
  assert.match(docsReadme, /go_live_ready -> go-live -> usage -> admin/);
  assert.match(docsReadme, /go_live_ready -> go-live -> playground -> admin/);

  assert.match(executionPlan, /go-live-ready-followup/);
  assert.match(executionPlan, /admin readiness go_live_ready -> go-live/);
  assert.match(executionPlan, /go-live-ready family/);
});

for (const spec of smokeExpectations) {
  test(`go-live-ready follow-up smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
