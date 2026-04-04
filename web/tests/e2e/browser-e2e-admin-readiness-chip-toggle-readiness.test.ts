import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/admin-readiness-chip-toggle.smoke.spec.ts",
);

test("browser readiness chip toggle smoke keeps admin-only focus clear/toggle cues explicit without overstating coverage", async () => {
  const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

  assert.match(
    browserSmokeSpec,
    /admin readiness chip clear\/toggle keeps broader governance focus continuity/,
  );
  assert.match(
    browserSmokeSpec,
    /\/admin\?week8_focus=baseline&attention_organization=org_preview&attention_workspace=preview/,
  );
  assert.match(browserSmokeSpec, /Governance focus/);
  assert.match(browserSmokeSpec, /Week 8 readiness summary/);
  assert.match(browserSmokeSpec, /Baseline gaps/);
  assert.match(browserSmokeSpec, /Preview Organization/);
  assert.match(browserSmokeSpec, /Preview Workspace/);
  assert.match(browserSmokeSpec, /Drill-down active: Baseline gaps/);
  assert.match(browserSmokeSpec, /Clear readiness focus/);
  assert.match(browserSmokeSpec, /No drill-down active/);
  assert.match(browserSmokeSpec, /week8_focus=credentials/);
  assert.match(browserSmokeSpec, /Drill-down active: Credentials/);
  assert.match(browserSmokeSpec, /attention_organization=org_preview/);
  assert.match(browserSmokeSpec, /attention_workspace=preview/);
  assert.doesNotMatch(browserSmokeSpec, /Return to admin readiness view/);
});
