import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/members-accept-invitation-verification-settings-admin-return.smoke.spec.ts",
);

test(
  "browser readiness members->accept-invitation->verification->settings->admin smoke keeps return continuity explicit",
  async () => {
    const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

    assert.match(
      browserSmokeSpec,
      /members -> accept-invitation -> verification -> settings -> admin keeps readiness return continuity/,
    );
    assert.match(
      browserSmokeSpec,
      /\/members\?source=admin-readiness&week8_focus=credentials&attention_workspace=preview&attention_organization=org_demo&delivery_context=week8&recent_track_key=verification&recent_update_kind=verification&evidence_count=2&recent_owner_label=Ops&recent_owner_display_name=Avery%20Ops&recent_owner_email=avery\.ops%40govrail\.test/,
    );
    assert.match(browserSmokeSpec, /Workspace access/);
    assert.match(browserSmokeSpec, /Admin follow-up context/);
    assert.match(browserSmokeSpec, /Manual onboarding handoff/);
    assert.match(browserSmokeSpec, /Open accept-invitation/);
    assert.match(browserSmokeSpec, /Accept workspace invitation/);
    assert.match(browserSmokeSpec, /Token guidance/);
    assert.match(browserSmokeSpec, /Accept invitation/);
    assert.match(browserSmokeSpec, /\/session/);
    assert.match(browserSmokeSpec, /page\.goBack\(\)/);
    assert.match(browserSmokeSpec, /Capture verification evidence/);
    assert.match(browserSmokeSpec, /surface=verification/);
    assert.match(browserSmokeSpec, /Week 8 launch checklist/);
    assert.match(browserSmokeSpec, /Verification evidence lane/);
    assert.match(browserSmokeSpec, /Review settings \+ billing/);
    assert.match(browserSmokeSpec, /intent=manage-plan/);
    assert.match(browserSmokeSpec, /Workspace configuration/);
    assert.match(browserSmokeSpec, /recent_owner_display_name=Avery%20Ops/);
    assert.match(browserSmokeSpec, /recent_owner_email=avery\.ops%40govrail\.test/);
    assert.match(browserSmokeSpec, /Return to admin readiness view/);
    assert.match(browserSmokeSpec, /readiness_returned=1/);
    assert.match(browserSmokeSpec, /SaaS admin overview/);
    assert.match(browserSmokeSpec, /Returned from Week 8 readiness/);
    assert.match(browserSmokeSpec, /Focus restored/);
    assert.match(browserSmokeSpec, /Clear readiness focus/);
  },
);
