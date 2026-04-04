import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const verificationBranchSpecPath = path.resolve(
  webDir,
  "tests/browser/admin-attention-queue-return.smoke.spec.ts",
);
const goLiveBranchSpecPath = path.resolve(
  webDir,
  "tests/browser/admin-attention-verification-go-live-return.smoke.spec.ts",
);

test("browser attention-branch smoke keeps verification/admin queue return cues explicit without overstating coverage", async () => {
  const browserSmokeSpec = await readFile(verificationBranchSpecPath, "utf8");

  assert.match(
    browserSmokeSpec,
    /admin attention branch -> verification -> admin keeps minimal browser continuity/,
  );
  assert.match(browserSmokeSpec, /\/admin\?queue_surface=verification/);
  assert.match(browserSmokeSpec, /Open verification checklist/);
  assert.match(browserSmokeSpec, /source=admin-attention/);
  assert.match(browserSmokeSpec, /surface=verification/);
  assert.match(browserSmokeSpec, /Return to admin queue/);
  assert.match(browserSmokeSpec, /queue_returned=1/);
  assert.match(browserSmokeSpec, /Admin queue focus restored/);
});

test("browser attention-branch smoke keeps verification/go-live/admin queue return cues explicit without overstating coverage", async () => {
  const browserSmokeSpec = await readFile(goLiveBranchSpecPath, "utf8");

  assert.match(
    browserSmokeSpec,
    /admin attention branch -> verification -> go-live -> admin keeps minimal browser continuity/,
  );
  assert.match(browserSmokeSpec, /\/admin\?queue_surface=verification/);
  assert.match(browserSmokeSpec, /Open verification checklist/);
  assert.match(browserSmokeSpec, /source=admin-attention/);
  assert.match(browserSmokeSpec, /surface=verification/);
  assert.match(browserSmokeSpec, /Continue to go-live drill/);
  assert.match(browserSmokeSpec, /surface=go_live/);
  assert.match(browserSmokeSpec, /Return to admin queue/);
  assert.match(browserSmokeSpec, /queue_surface=go_live/);
  assert.match(browserSmokeSpec, /queue_returned=1/);
  assert.match(browserSmokeSpec, /Admin queue focus restored/);
});
