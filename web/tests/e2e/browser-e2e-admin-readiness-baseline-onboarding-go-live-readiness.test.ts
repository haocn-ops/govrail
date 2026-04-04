import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/admin-readiness-baseline-onboarding-go-live-return.smoke.spec.ts",
);

test("browser readiness baseline onboarding->go-live smoke keeps continuity explicit without overstating coverage", async () => {
  const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

  assert.match(
    browserSmokeSpec,
    /admin readiness baseline branch -> onboarding -> go-live -> admin keeps readiness browser continuity/,
  );
  assert.match(
    browserSmokeSpec,
    /\/admin\?week8_focus=baseline&attention_organization=org_preview&attention_workspace=preview/,
  );
  assert.match(browserSmokeSpec, /Governance focus/);
  assert.match(browserSmokeSpec, /Baseline gaps/);
  assert.match(browserSmokeSpec, /Preview Organization/);
  assert.match(browserSmokeSpec, /Preview Workspace/);
  assert.match(browserSmokeSpec, /Clear all focus/);
  assert.match(browserSmokeSpec, /Week 8 readiness summary/);
  assert.match(browserSmokeSpec, /Drill-down active: Baseline gaps/);
  assert.match(browserSmokeSpec, /Open onboarding flow/);
  assert.match(browserSmokeSpec, /Finish onboarding/);
  assert.match(browserSmokeSpec, /Step 7: Rehearse go-live/);
  assert.match(browserSmokeSpec, /surface=go_live/);
  assert.match(browserSmokeSpec, /source=admin-readiness/);
  assert.match(browserSmokeSpec, /week8_focus=baseline/);
  assert.match(browserSmokeSpec, /attention_workspace=preview/);
  assert.match(browserSmokeSpec, /attention_organization=org_preview/);
  assert.match(browserSmokeSpec, /Mock go-live drill/);
  assert.match(browserSmokeSpec, /Admin follow-up context/);
  assert.match(browserSmokeSpec, /Focus Baseline gaps/);
  assert.match(browserSmokeSpec, /Return to admin readiness view/);
  assert.match(browserSmokeSpec, /readiness_returned=1/);
  assert.match(browserSmokeSpec, /Returned from Week 8 readiness/);
  assert.match(browserSmokeSpec, /Clear readiness focus/);
});
