import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(webDir, "tests/browser/launchpad-session-members-verification.smoke.spec.ts");

test("browser readiness launchpad->session->members->verification smoke keeps continuity explicit", async () => {
  const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

  assert.match(
    browserSmokeSpec,
    /launchpad -> session -> members -> verification keeps minimal browser continuity/,
  );
  assert.match(
    browserSmokeSpec,
    /\/\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
  );
  assert.match(browserSmokeSpec, /SaaS Workspace Launch Hub/);
  assert.match(browserSmokeSpec, /Return to session checkpoint/);
  assert.match(browserSmokeSpec, /Session and workspace access/);
  assert.match(browserSmokeSpec, /Review members and access/);
  assert.match(browserSmokeSpec, /source=admin-readiness/);
  assert.match(browserSmokeSpec, /week8_focus=credentials/);
  assert.match(browserSmokeSpec, /attention_workspace=preview/);
  assert.match(browserSmokeSpec, /attention_organization=org_demo/);
  assert.match(browserSmokeSpec, /Workspace access/);
  assert.match(browserSmokeSpec, /Manual onboarding handoff/);
  assert.match(browserSmokeSpec, /Capture verification evidence/);
  assert.match(browserSmokeSpec, /surface=verification/);
  assert.match(browserSmokeSpec, /Week 8 launch checklist/);
  assert.match(browserSmokeSpec, /Verification evidence lane/);
  assert.match(browserSmokeSpec, /Admin follow-up context/);
  assert.match(browserSmokeSpec, /Focus Credentials/);
  assert.match(browserSmokeSpec, /recent_owner_display_name=Avery%20Ops/);
  assert.match(browserSmokeSpec, /recent_owner_email=avery\.ops%40govrail\.test/);
});
