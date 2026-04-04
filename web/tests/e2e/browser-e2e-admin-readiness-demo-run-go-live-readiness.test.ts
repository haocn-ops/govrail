import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/admin-readiness-demo-run-verification-go-live-return.smoke.spec.ts",
);

test("browser readiness demo-run go-live smoke keeps verification/go-live/admin continuity explicit without overstating coverage", async () => {
  const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

  assert.match(
    browserSmokeSpec,
    /admin readiness demo-run branch -> verification -> go-live -> admin keeps readiness browser continuity/,
  );
  assert.match(
    browserSmokeSpec,
    /\/admin\?week8_focus=demo_run&attention_organization=org_preview&attention_workspace=preview/,
  );
  assert.match(browserSmokeSpec, /Governance focus/);
  assert.match(browserSmokeSpec, /Week 8 readiness summary/);
  assert.match(browserSmokeSpec, /Demo run/);
  assert.match(browserSmokeSpec, /Open Week 8 checklist/);
  assert.match(browserSmokeSpec, /Continue to go-live drill/);
  assert.match(browserSmokeSpec, /surface=verification/);
  assert.match(browserSmokeSpec, /surface=go_live/);
  assert.match(browserSmokeSpec, /source=admin-readiness/);
  assert.match(browserSmokeSpec, /Return to admin readiness view/);
  assert.match(browserSmokeSpec, /Returned from Week 8 readiness/);
  assert.match(browserSmokeSpec, /Clear readiness focus/);
});
