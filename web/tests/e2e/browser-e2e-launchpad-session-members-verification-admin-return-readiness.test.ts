import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/launchpad-session-members-verification-admin-return.smoke.spec.ts",
);

test(
  "browser readiness launchpad->session->members->verification->admin smoke keeps return continuity explicit",
  async () => {
    const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

    assert.match(
      browserSmokeSpec,
      /launchpad -> session -> members -> verification -> admin keeps readiness return continuity/,
    );
    assert.match(browserSmokeSpec, /SaaS Workspace Launch Hub/);
    assert.match(browserSmokeSpec, /Return to session checkpoint/);
    assert.match(browserSmokeSpec, /Session and workspace access/);
    assert.match(browserSmokeSpec, /Review members and access/);
    assert.match(browserSmokeSpec, /Workspace access/);
    assert.match(browserSmokeSpec, /Capture verification evidence/);
    assert.match(browserSmokeSpec, /surface=verification/);
    assert.match(browserSmokeSpec, /Week 8 launch checklist/);
    assert.match(browserSmokeSpec, /Return to admin readiness view/);
    assert.match(browserSmokeSpec, /readiness_returned=1/);
    assert.match(browserSmokeSpec, /Returned from Week 8 readiness/);
    assert.match(browserSmokeSpec, /Focus restored/);
    assert.match(browserSmokeSpec, /Clear readiness focus/);
    assert.match(browserSmokeSpec, /recent_owner_display_name=Avery%20Ops/);
    assert.match(browserSmokeSpec, /recent_owner_email=avery\.ops%40govrail\.test/);
  },
);
