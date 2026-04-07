import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/session-members-verification-settings-admin-return.smoke.spec.ts",
);

test(
  "browser readiness session->members->verification->settings->admin smoke keeps return continuity explicit",
  async () => {
    const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

    assert.match(
      browserSmokeSpec,
      /session -> members -> verification -> settings -> admin keeps readiness return continuity/,
    );
    assert.match(
      browserSmokeSpec,
      /\/session\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_preview&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
    );
    assert.match(browserSmokeSpec, /Session and workspace access/);
    assert.match(browserSmokeSpec, /Before entering a managed lane/);
    assert.match(browserSmokeSpec, /Review members and access/);
    assert.match(browserSmokeSpec, /Workspace access/);
    assert.match(browserSmokeSpec, /Admin follow-up context/);
    assert.match(browserSmokeSpec, /Manual onboarding handoff/);
    assert.match(browserSmokeSpec, /Capture verification evidence/);
    assert.match(browserSmokeSpec, /surface=verification/);
    assert.match(browserSmokeSpec, /Week 8 launch checklist/);
    assert.match(browserSmokeSpec, /Verification evidence lane/);
    assert.match(browserSmokeSpec, /Review settings \+ billing/);
    assert.match(browserSmokeSpec, /Workspace configuration/);
    assert.match(browserSmokeSpec, /Return to admin readiness view/);
    assert.match(browserSmokeSpec, /readiness_returned=1/);
    assert.match(browserSmokeSpec, /SaaS admin overview/);
    assert.match(browserSmokeSpec, /Returned from Week 8 readiness/);
    assert.match(browserSmokeSpec, /Focus restored/);
    assert.match(browserSmokeSpec, /Clear readiness focus/);
    assert.match(browserSmokeSpec, /week8_focus=credentials/);
    assert.match(browserSmokeSpec, /attention_workspace=preview/);
    assert.match(browserSmokeSpec, /attention_organization=org_preview/);
    assert.match(browserSmokeSpec, /recent_track_key=verification/);
    assert.match(browserSmokeSpec, /recent_update_kind=verification/);
    assert.match(browserSmokeSpec, /evidence_count=2/);
    assert.match(browserSmokeSpec, /recent_owner_display_name=Avery%20Ops/);
    assert.match(browserSmokeSpec, /recent_owner_email=avery\.ops%40govrail\.test/);
  },
);
