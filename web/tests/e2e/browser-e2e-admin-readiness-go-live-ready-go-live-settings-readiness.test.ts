import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/admin-readiness-go-live-ready-go-live-settings-return.smoke.spec.ts",
);

test("browser readiness go-live-ready go-live->settings smoke keeps continuity explicit without overstating coverage", async () => {
  const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

  assert.match(
    browserSmokeSpec,
    /admin readiness go-live-ready branch -> go-live -> settings -> admin keeps readiness browser continuity/,
  );
  assert.match(browserSmokeSpec, /Open mock go-live drill/);
  assert.match(browserSmokeSpec, /Review billing \+ settings/);
  assert.match(browserSmokeSpec, /intent=manage-plan/);
  assert.match(browserSmokeSpec, /intent=manage-plan/);
  assert.match(browserSmokeSpec, /intent=manage-plan/);
  assert.match(browserSmokeSpec, /surface=go_live/);
  assert.match(browserSmokeSpec, /source=admin-readiness/);
  assert.match(browserSmokeSpec, /week8_focus=go_live_ready/);
  assert.match(browserSmokeSpec, /attention_workspace=preview/);
  assert.match(browserSmokeSpec, /attention_organization=org_preview/);
  assert.match(browserSmokeSpec, /Workspace configuration/);
  assert.match(browserSmokeSpec, /Return to admin readiness view/);
  assert.match(browserSmokeSpec, /readiness_returned=1/);
  assert.match(browserSmokeSpec, /Returned from Week 8 readiness/);
});
