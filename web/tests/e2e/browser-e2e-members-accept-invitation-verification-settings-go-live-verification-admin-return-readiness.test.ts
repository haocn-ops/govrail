import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/members-accept-invitation-verification-settings-go-live-verification-admin-return.smoke.spec.ts",
);

test(
  "browser readiness members->accept-invitation->verification->settings->go-live->verification->admin smoke keeps return continuity explicit",
  async () => {
    const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

    assert.match(
      browserSmokeSpec,
      /members -> accept-invitation -> verification -> settings -> go-live -> verification -> admin keeps readiness return continuity/,
    );
    assert.match(browserSmokeSpec, /Workspace access/);
    assert.match(browserSmokeSpec, /Open accept-invitation/);
    assert.match(browserSmokeSpec, /Accept workspace invitation/);
    assert.match(browserSmokeSpec, /page\.goBack\(\)/);
    assert.match(browserSmokeSpec, /Capture verification evidence/);
    assert.match(browserSmokeSpec, /Review settings \+ billing/);
    assert.match(browserSmokeSpec, /intent=manage-plan/);
    assert.match(browserSmokeSpec, /Rehearse go-live readiness/);
    assert.match(browserSmokeSpec, /Reopen verification evidence/);
    assert.match(browserSmokeSpec, /Return to admin readiness view/);
    assert.match(browserSmokeSpec, /readiness_returned=1/);
    assert.match(browserSmokeSpec, /recent_owner_display_name=Avery%20Ops/);
    assert.match(browserSmokeSpec, /recent_owner_email=avery\.ops%40govrail\.test/);
  },
);
