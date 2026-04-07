import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/session-members-verification-go-live-settings-verification-admin-return.smoke.spec.ts",
);

test(
  "browser readiness session->members->verification->go-live->settings->verification->admin smoke keeps return continuity explicit",
  async () => {
    const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

    assert.match(
      browserSmokeSpec,
      /session -> members -> verification -> go-live -> settings -> verification -> admin keeps readiness return continuity/,
    );
    assert.match(browserSmokeSpec, /Session and workspace access/);
    assert.match(browserSmokeSpec, /Review members and access/);
    assert.match(browserSmokeSpec, /Capture verification evidence/);
    assert.match(browserSmokeSpec, /Continue to go-live drill/);
    assert.match(browserSmokeSpec, /Review billing \+ settings/);
    assert.match(browserSmokeSpec, /intent=manage-plan/);
    assert.match(browserSmokeSpec, /Workspace configuration/);
    assert.match(browserSmokeSpec, /Return to admin readiness view/);
    assert.match(browserSmokeSpec, /readiness_returned=1/);
    assert.match(browserSmokeSpec, /recent_owner_display_name=Avery%20Ops/);
    assert.match(browserSmokeSpec, /recent_owner_email=avery\.ops%40govrail\.test/);
  },
);
