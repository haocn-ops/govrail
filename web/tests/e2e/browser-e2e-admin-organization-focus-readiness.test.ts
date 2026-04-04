import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/admin-organization-focus-return.smoke.spec.ts",
);

test("browser organization-focus smoke keeps governance focus cues explicit without overstating coverage", async () => {
  const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

  assert.match(
    browserSmokeSpec,
    /admin organization focus branch -> verification -> admin keeps governance focus continuity/,
  );
  assert.match(browserSmokeSpec, /\/admin\?queue_surface=verification&attention_organization=org_preview/);
  assert.match(browserSmokeSpec, /Governance focus/);
  assert.match(browserSmokeSpec, /Preview Organization/);
  assert.match(browserSmokeSpec, /Focused organization/);
  assert.match(browserSmokeSpec, /Clear all focus/);
  assert.match(browserSmokeSpec, /Attention by organization/);
  assert.match(browserSmokeSpec, /Open verification checklist/);
  assert.match(browserSmokeSpec, /source=admin-attention/);
  assert.match(browserSmokeSpec, /surface=verification/);
  assert.match(browserSmokeSpec, /queue_returned=1/);
  assert.match(browserSmokeSpec, /Admin queue focus restored/);
  assert.match(browserSmokeSpec, /Organization focus is preserved for this return path so the same governance cluster stays in view\./);
});
