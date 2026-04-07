import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const browserSpecPath = path.resolve(
  webDir,
  "tests/browser/launchpad-audit-export-verification-admin-return.smoke.spec.ts",
);

test(
  "browser readiness launchpad audit-export verification->admin smoke keeps run-aware continuity explicit",
  async () => {
    const browserSmokeSpec = await readFile(browserSpecPath, "utf8");

    assert.match(
      browserSmokeSpec,
      /launchpad audit export -> verification -> admin keeps readiness continuity/,
    );
    assert.match(browserSmokeSpec, /SaaS Workspace Launch Hub/);
    assert.match(browserSmokeSpec, /Audit export continuity/);
    assert.match(browserSmokeSpec, /Carry proof to verification/);
    assert.match(browserSmokeSpec, /Return to admin readiness view/);
    assert.match(browserSmokeSpec, /recent_owner_display_name=Avery(?:%20|\\\+)Ops/);
    assert.match(browserSmokeSpec, /recent_owner_email=avery\.ops(?:%40|@)govrail\.test/);
    assert.match(browserSmokeSpec, /Week 8 launch checklist/);
    assert.match(browserSmokeSpec, /Verification evidence lane/);
    assert.match(browserSmokeSpec, /readiness_returned=1/);
    assert.match(browserSmokeSpec, /Returned from Week 8 readiness/);
    assert.match(browserSmokeSpec, /Focus restored/);
  },
);
