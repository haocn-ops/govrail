import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/admin-recent-activity-verification-return.smoke.spec.ts",
);

test("browser recent-delivery smoke keeps admin recent activity verification cues explicit without overstating coverage", async () => {
  const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

  assert.match(
    browserSmokeSpec,
    /admin recent delivery activity branch -> verification -> admin keeps recent-context browser continuity/,
  );
  assert.match(browserSmokeSpec, /\/admin\?queue_surface=verification/);
  assert.match(browserSmokeSpec, /Recent delivery activity/);
  assert.match(browserSmokeSpec, /Open verification checklist/);
  assert.match(browserSmokeSpec, /source=admin-attention/);
  assert.match(browserSmokeSpec, /surface=verification/);
  assert.match(browserSmokeSpec, /delivery_context=recent_activity/);
  assert.match(browserSmokeSpec, /You arrived here from the admin recent delivery activity snapshot\./);
  assert.match(browserSmokeSpec, /Return to admin queue/);
  assert.match(browserSmokeSpec, /queue_returned=1/);
  assert.match(browserSmokeSpec, /Admin queue focus restored/);
});
