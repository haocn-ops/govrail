import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/onboarding-accept-invitation-verification-settings-go-live-settings-admin-return.smoke.spec.ts",
);

test(
  "browser readiness onboarding->accept-invitation->verification->settings->go-live->settings->admin smoke keeps return continuity explicit",
  async () => {
    const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

    assert.match(
      browserSmokeSpec,
      /onboarding -> accept-invitation -> verification -> settings -> go-live -> settings -> admin keeps readiness return continuity/,
    );
    assert.match(browserSmokeSpec, /Launch lane context/);
    assert.match(browserSmokeSpec, /Invite-to-accept path/);
    assert.match(browserSmokeSpec, /Open accept-invitation/);
    assert.match(browserSmokeSpec, /Accept workspace invitation/);
    assert.match(browserSmokeSpec, /Token guidance/);
    assert.match(browserSmokeSpec, /Accept invitation/);
    assert.match(browserSmokeSpec, /page\.goBack\(\)/);
    assert.match(browserSmokeSpec, /Step 6: Capture verification evidence/);
    assert.match(browserSmokeSpec, /Review settings \+ billing/);
    assert.match(browserSmokeSpec, /intent=manage-plan/);
    assert.match(browserSmokeSpec, /Rehearse go-live readiness/);
    assert.match(browserSmokeSpec, /surface=go_live/);
    assert.match(browserSmokeSpec, /Review billing \+ settings/);
    assert.match(browserSmokeSpec, /Workspace configuration/);
    assert.match(browserSmokeSpec, /Return to admin readiness view/);
    assert.match(browserSmokeSpec, /readiness_returned=1/);
    assert.match(browserSmokeSpec, /recent_owner_display_name=Avery%20Ops/);
    assert.match(browserSmokeSpec, /recent_owner_email=avery\.ops%40govrail\.test/);
  },
);
