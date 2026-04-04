import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/admin-attention-verification-go-live-return.smoke.spec.ts",
);

test("browser recent-delivery branch smoke keeps admin recent activity -> verification -> go-live -> admin cues explicit without overstating coverage", async () => {
  const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

  assert.match(
    browserSmokeSpec,
    /admin attention branch -> verification -> go-live -> admin keeps minimal browser continuity/,
  );
  assert.match(browserSmokeSpec, /Recent delivery activity/);
  assert.match(browserSmokeSpec, /Open verification checklist/);
  assert.match(browserSmokeSpec, /Continue to go-live drill/);
  assert.match(browserSmokeSpec, /delivery_context=recent_activity/);
  assert.match(browserSmokeSpec, /queue_returned=1/);
  assert.match(browserSmokeSpec, /Admin queue focus restored/);
});
