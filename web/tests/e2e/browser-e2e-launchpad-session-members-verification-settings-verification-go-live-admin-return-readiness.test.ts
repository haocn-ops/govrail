import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/launchpad-session-members-verification-settings-verification-go-live-admin-return.smoke.spec.ts",
);

test(
  "browser readiness launchpad->session->members->verification->settings->verification->go-live->admin smoke keeps return continuity explicit",
  async () => {
    const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

    assert.match(
      browserSmokeSpec,
      /launchpad -> session -> members -> verification -> settings -> verification -> go-live -> admin keeps readiness return continuity/,
    );
    assert.match(browserSmokeSpec, /SaaS Workspace Launch Hub/);
    assert.match(browserSmokeSpec, /Return to session checkpoint/);
    assert.match(browserSmokeSpec, /Review members and access/);
    assert.match(browserSmokeSpec, /Capture verification evidence/);
    assert.match(browserSmokeSpec, /Review settings \+ billing/);
    assert.match(browserSmokeSpec, /Continue to go-live drill/);
    assert.match(browserSmokeSpec, /surface=go_live/);
    assert.match(browserSmokeSpec, /Mock go-live drill/);
    assert.match(browserSmokeSpec, /Return to admin readiness view/);
    assert.match(browserSmokeSpec, /readiness_returned=1/);
    assert.match(browserSmokeSpec, /recent_owner_display_name=Avery%20Ops/);
    assert.match(browserSmokeSpec, /recent_owner_email=avery\.ops%40govrail\.test/);
  },
);
