import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/admin-readiness-billing-warning-settings-verification-go-live-verification-settings-return.smoke.spec.ts",
);

test(
  "browser readiness billing-warning settings->verification->go-live->verification->settings smoke keeps continuity explicit without overstating coverage",
  async () => {
    const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

    assert.match(
      browserSmokeSpec,
      /admin readiness billing warning branch -> settings -> verification -> go-live -> verification -> settings -> admin keeps readiness browser continuity/,
    );
    assert.match(browserSmokeSpec, /intent=resolve-billing/);
    assert.match(browserSmokeSpec, /Capture verification evidence/);
    assert.match(browserSmokeSpec, /Continue to go-live drill/);
    assert.match(browserSmokeSpec, /Reopen verification evidence/);
    assert.match(browserSmokeSpec, /Review settings \+ billing/);
  assert.match(browserSmokeSpec, /intent=manage-plan/);
    assert.match(browserSmokeSpec, /surface=verification/);
    assert.match(browserSmokeSpec, /surface=go_live/);
    assert.match(browserSmokeSpec, /source=admin-readiness/);
    assert.match(browserSmokeSpec, /week8_focus=billing_warning/);
    assert.match(browserSmokeSpec, /attention_workspace=preview/);
    assert.match(browserSmokeSpec, /attention_organization=org_preview/);
    assert.match(browserSmokeSpec, /Workspace configuration/);
    assert.match(browserSmokeSpec, /Focus Billing warning/);
    assert.match(browserSmokeSpec, /Return to admin readiness view/);
    assert.match(browserSmokeSpec, /readiness_returned=1/);
    assert.match(browserSmokeSpec, /Returned from Week 8 readiness/);
    assert.match(browserSmokeSpec, /Clear readiness focus/);
  },
);
