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
  "tests/browser/admin-attention-queue-return.smoke.spec.ts",
  "tests/browser/admin-attention-verification-go-live-return.smoke.spec.ts",
  "tests/browser/admin-recent-activity-verification-return.smoke.spec.ts",
  "tests/browser/admin-recent-activity-verification-go-live-return.smoke.spec.ts",
] as const;

const smokeExpectations = [
  {
    path: "tests/browser/admin-attention-queue-return.smoke.spec.ts",
    requiredPatterns: [
      /admin attention branch -> verification -> admin keeps minimal browser continuity/,
      /\/admin\?queue_surface=verification/,
      /SaaS admin overview/,
      /Recent delivery activity/,
      /Open verification checklist/,
      /\/verification\\\?/,
      /source=admin-attention/,
      /surface=verification/,
      /Week 8 launch checklist/,
      /Admin follow-up context/,
      /delivery_context=recent_activity/,
      /recent_update_kind/,
      /evidence_count/,
      /recent_owner_display_name/,
      /recent_owner_label/,
      /Last updated by \$\{recentOwnerLabel\}/,
      /Return to admin queue/,
      /queue_returned=1/,
      /queue_surface=verification/,
      /Admin queue focus restored/,
      /Focused return/,
    ],
  },
  {
    path: "tests/browser/admin-attention-verification-go-live-return.smoke.spec.ts",
    requiredPatterns: [
      /admin attention branch -> verification -> go-live -> admin keeps minimal browser continuity/,
      /\/admin\?queue_surface=verification/,
      /SaaS admin overview/,
      /Recent delivery activity/,
      /Open verification checklist/,
      /\/verification\\\?/,
      /source=admin-attention/,
      /surface=verification/,
      /Week 8 launch checklist/,
      /Admin follow-up context/,
      /delivery_context=recent_activity/,
      /recent_update_kind/,
      /evidence_count/,
      /recent_owner_display_name/,
      /recent_owner_label/,
      /Last updated by \$\{recentOwnerLabel\}/,
      /Continue to go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /Return to admin queue/,
      /queue_returned=1/,
      /queue_surface=go_live/,
      /Admin queue focus restored/,
      /Continue the governance review from the filtered queue/,
      /Clear follow-up return/,
    ],
  },
  {
    path: "tests/browser/admin-recent-activity-verification-return.smoke.spec.ts",
    requiredPatterns: [
      /admin recent delivery activity branch -> verification -> admin keeps recent-context browser continuity/,
      /\/admin\?queue_surface=verification/,
      /SaaS admin overview/,
      /Recent delivery activity/,
      /Open verification checklist/,
      /\/verification\\\?/,
      /source=admin-attention/,
      /surface=verification/,
      /delivery_context=recent_activity/,
      /Week 8 launch checklist/,
      /Admin follow-up context/,
      /You arrived here from the admin recent delivery activity snapshot\./,
      /Return to admin queue/,
      /queue_returned=1/,
      /queue_surface=verification/,
      /Admin queue focus restored/,
      /Focused return/,
    ],
  },
  {
    path: "tests/browser/admin-recent-activity-verification-go-live-return.smoke.spec.ts",
    requiredPatterns: [
      /admin recent delivery activity branch -> verification -> go-live -> admin keeps recent-context browser continuity/,
      /\/admin\?queue_surface=verification/,
      /SaaS admin overview/,
      /Recent delivery activity/,
      /Open verification checklist/,
      /\/verification\\\?/,
      /source=admin-attention/,
      /surface=verification/,
      /delivery_context=recent_activity/,
      /Week 8 launch checklist/,
      /Admin follow-up context/,
      /You arrived here from the admin recent delivery activity snapshot\./,
      /recent_track_key/,
      /recent_update_kind/,
      /evidence_count/,
      /recent_owner_display_name/,
      /recent_owner_label/,
      /Last updated by \$\{recentOwnerLabel\}/,
      /Continue to go-live drill/,
      /\/go-live\\\?/,
      /surface=go_live/,
      /Return to admin queue/,
      /queue_returned=1/,
      /queue_surface=go_live/,
      /Admin queue focus restored/,
      /Continue the governance review from the filtered queue/,
    ],
  },
] as const;

test("admin attention / recent activity follow-up batch stays wired into scripts and docs", async () => {
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
    webPackageJson.scripts?.["test:browser:admin-attention-recent-activity-followup"],
    expectedPrebuilt,
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:admin-attention-recent-activity-followup:existing-server"],
    expectedExisting,
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:admin-attention-recent-activity-followup"],
    "npm --prefix web run test:browser:admin-attention-recent-activity-followup --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:admin-attention-recent-activity-followup:existing-server"],
    "npm --prefix web run test:browser:admin-attention-recent-activity-followup:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:admin-attention-recent-activity-followup/);
  assert.match(docsReadme, /admin attention -> verification -> admin/);
  assert.match(docsReadme, /admin recent delivery activity -> verification -> go-live -> admin/);
  assert.match(executionPlan, /admin-attention-recent-activity-followup/);
  assert.match(executionPlan, /admin attention -> verification -> admin/);
  assert.match(executionPlan, /admin recent delivery activity -> verification -> go-live -> admin/);
});

for (const spec of smokeExpectations) {
  test(`admin attention / recent activity follow-up smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    for (const pattern of spec.requiredPatterns) {
      assert.match(source, pattern);
    }
  });
}
