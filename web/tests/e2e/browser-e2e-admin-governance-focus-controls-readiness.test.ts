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
  "tests/browser/admin-focus-chip-clear.smoke.spec.ts",
  "tests/browser/admin-organization-focus-return.smoke.spec.ts",
  "tests/browser/admin-readiness-chip-toggle.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/admin-focus-chip-clear.smoke.spec.ts",
    requiredPatterns: [
      /admin focus chips clear one dimension at a time without dropping broader governance continuity/,
      /\/admin\?queue_surface=verification&attention_organization=org_preview&attention_workspace=preview&queue_returned=1/,
      /SaaS admin overview/,
      /Governance focus/,
      /Preview Organization/,
      /Preview Workspace/,
      /Returned from follow-up/,
      /Clear all focus/,
      /Clear/,
      /queue_surface=verification/,
      /attention_organization=org_preview/,
      /queue_returned=1/,
      /Follow-up return/,
    ],
  },
  {
    path: "tests/browser/admin-organization-focus-return.smoke.spec.ts",
    requiredPatterns: [
      /admin organization focus branch -> verification -> admin keeps governance focus continuity/,
      /\/admin\?queue_surface=verification&attention_organization=org_preview/,
      /Attention by organization/,
      /Open verification checklist/,
      /\/verification\?/,
      /source=admin-attention/,
      /surface=verification/,
      /attention_organization=org_preview/,
      /Week 8 launch checklist/,
      /Admin follow-up context/,
      /Admin queue focus restored/,
      /Organization focus is preserved for this return path so the same governance cluster stays in view\./,
      /Clear all focus/,
      /\/admin$/,
    ],
  },
  {
    path: "tests/browser/admin-readiness-chip-toggle.smoke.spec.ts",
    requiredPatterns: [
      /admin readiness chip clear\/toggle keeps broader governance focus continuity/,
      /\/admin\?week8_focus=baseline&attention_organization=org_preview&attention_workspace=preview/,
      /SaaS admin overview/,
      /Governance focus/,
      /Week 8 readiness summary/,
      /Baseline gaps/,
      /Drill-down active: Baseline gaps/,
      /Clear readiness focus/,
      /attention_organization=org_preview/,
      /attention_workspace=preview/,
      /No drill-down active/,
      /week8_focus=credentials/,
      /Credentials ready/,
      /Drill-down active: Credentials/,
      /Credentials/,
    ],
  },
] as const;

test("admin governance focus controls batch stays wired into scripts and docs", async () => {
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

  assert.equal(
    webPackageJson.scripts?.["test:browser:admin-governance-focus-controls"],
    expectedMain,
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:admin-governance-focus-controls:existing-server"],
    expectedExisting,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:admin-governance-focus-controls"],
    "npm --prefix web run test:browser:admin-governance-focus-controls --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:admin-governance-focus-controls:existing-server"],
    "npm --prefix web run test:browser:admin-governance-focus-controls:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:admin-governance-focus-controls/);
  assert.match(docsReadme, /focus chips clear one dimension at a time/);
  assert.match(docsReadme, /organization focus branch -> verification -> admin/);
  assert.match(docsReadme, /readiness chip clear\/toggle/);

  assert.match(executionPlan, /admin governance focus controls/);
  assert.match(executionPlan, /organization focus branch -> verification -> admin/);
  assert.match(executionPlan, /focus chips clear one dimension at a time/);
});

for (const spec of smokeExpectations) {
  test(`admin governance focus controls smoke keeps ${spec.path} explicit`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
