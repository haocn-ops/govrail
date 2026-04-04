import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/admin-focus-chip-clear.smoke.spec.ts",
);

test("browser focus-chip smoke keeps per-chip clear cues explicit without overstating coverage", async () => {
  const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

  assert.match(
    browserSmokeSpec,
    /admin focus chips clear one dimension at a time without dropping broader governance continuity/,
  );
  assert.match(
    browserSmokeSpec,
    /\/admin\?queue_surface=verification&attention_organization=org_preview&attention_workspace=preview&queue_returned=1/,
  );
  assert.match(browserSmokeSpec, /Governance focus/);
  assert.match(browserSmokeSpec, /Preview Organization/);
  assert.match(browserSmokeSpec, /Preview Workspace/);
  assert.match(browserSmokeSpec, /Returned from follow-up/);
  assert.match(browserSmokeSpec, /Follow-up return/);
  assert.match(browserSmokeSpec, /Clear all focus/);
  assert.match(browserSmokeSpec, /Admin queue focus restored/);
  assert.match(browserSmokeSpec, /attention_organization=org_preview/);
  assert.match(browserSmokeSpec, /queue_surface=verification/);
  assert.match(browserSmokeSpec, /queue_returned=1/);
  assert.match(browserSmokeSpec, /attention_workspace=preview/);
});
