import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const webPackageJsonPath = path.resolve(webDir, "package.json");
const rootPackageJsonPath = path.resolve(webDir, "..", "package.json");
const docsReadmePath = path.resolve(webDir, "../docs/README.md");
const executionPlanPath = path.resolve(webDir, "../docs/saas_v1_execution_plan_zh.md");
const verificationUrlPattern = /toHaveURL\(\/\\\/verification\\\?\/\)/;
const goLiveUrlPattern = /toHaveURL\(\/\\\/go-live\\\?\/\)/;

const smokeExpectations = [
  {
    destination: "verification",
    path: "tests/browser/settings-verification-admin-return.smoke.spec.ts",
    title: "Workspace configuration",
    continuityHeading: "Enterprise evidence lane",
    action: "Capture verification evidence",
    deliveryContext: "recent_activity",
  },
  {
    destination: "verification",
    path: "tests/browser/usage-verification-admin-return.smoke.spec.ts",
    title: "Workspace usage and plan posture",
    continuityHeading: "Evidence loop follow-through",
    action: "Refresh verification notes",
    deliveryContext: "week8",
  },
  {
    destination: "verification",
    path: "tests/browser/go-live-delivery-admin-return.smoke.spec.ts",
    title: "Mock go-live drill",
    continuityHeading: "Go-live delivery notes",
    action: "Return to verification",
    deliveryContext: "recent_activity",
    recentTrackKey: "go_live",
    recentUpdateKind: "go_live",
    expectsVerificationDeliveryPanel: true,
  },
  {
    destination: "go-live",
    path: "tests/browser/settings-go-live-admin-return.smoke.spec.ts",
    title: "Workspace configuration",
    continuityHeading: "Enterprise evidence lane",
    action: "Rehearse go-live readiness",
    deliveryContext: "recent_activity",
    recentTrackKey: "go_live",
    recentUpdateKind: "go_live",
  },
  {
    destination: "go-live",
    path: "tests/browser/usage-verification-go-live-admin-return.smoke.spec.ts",
    title: "Workspace usage and plan posture",
    continuityHeading: "Evidence loop follow-through",
    action: "Refresh verification notes",
    deliveryContext: "week8",
    recentTrackKey: "verification",
    recentUpdateKind: "verification",
  },
  {
    destination: "go-live",
    path: "tests/browser/verification-delivery-admin-return.smoke.spec.ts",
    title: "Week 8 launch checklist",
    continuityHeading: "Verification delivery notes",
    action: "Continue to go-live drill",
    deliveryContext: "recent_activity",
    recentTrackKey: "verification",
    recentUpdateKind: "verification",
    expectsGoLiveDeliveryPanel: true,
  },
] as const;

test("mainline console focused browser batches stay wired into scripts and docs", async () => {
  const webPackageJson = JSON.parse(await readFile(webPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");

  assert.equal(
    webPackageJson.scripts?.["test:browser:mainline-console-verification"],
    "node scripts/run-playwright-prebuilt-smoke.mjs tests/browser/settings-verification-admin-return.smoke.spec.ts tests/browser/usage-verification-admin-return.smoke.spec.ts tests/browser/go-live-delivery-admin-return.smoke.spec.ts",
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:mainline-console-verification:existing-server"],
    "node scripts/run-playwright-existing-server-smoke.mjs tests/browser/settings-verification-admin-return.smoke.spec.ts tests/browser/usage-verification-admin-return.smoke.spec.ts tests/browser/go-live-delivery-admin-return.smoke.spec.ts",
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:mainline-console-go-live"],
    "node scripts/run-playwright-prebuilt-smoke.mjs tests/browser/settings-go-live-admin-return.smoke.spec.ts tests/browser/usage-verification-go-live-admin-return.smoke.spec.ts tests/browser/verification-delivery-admin-return.smoke.spec.ts",
  );
  assert.equal(
    webPackageJson.scripts?.["test:browser:mainline-console-go-live:existing-server"],
    "node scripts/run-playwright-existing-server-smoke.mjs tests/browser/settings-go-live-admin-return.smoke.spec.ts tests/browser/usage-verification-go-live-admin-return.smoke.spec.ts tests/browser/verification-delivery-admin-return.smoke.spec.ts",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:mainline-console-verification"],
    "npm --prefix web run test:browser:mainline-console-verification --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:mainline-console-verification:existing-server"],
    "npm --prefix web run test:browser:mainline-console-verification:existing-server --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:mainline-console-go-live"],
    "npm --prefix web run test:browser:mainline-console-go-live --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:mainline-console-go-live:existing-server"],
    "npm --prefix web run test:browser:mainline-console-go-live:existing-server --",
  );

  assert.match(docsReadme, /web:test:browser:mainline-console-verification/);
  assert.match(docsReadme, /web:test:browser:mainline-console-go-live/);
  assert.match(docsReadme, /settings \/ usage \/ verification \/ go-live/);
  assert.match(executionPlan, /mainline-console-verification/);
  assert.match(executionPlan, /mainline-console-go-live/);
  assert.match(executionPlan, /settings \/ usage \/ verification \/ go-live/);
});

for (const spec of smokeExpectations) {
  test(`mainline console ${spec.destination} smoke keeps ${spec.path} explicit without overstating coverage`, async () => {
    const source = await readFile(path.resolve(webDir, spec.path), "utf8");

    assert.match(source, /source=admin-readiness/);
    assert.match(source, /week8_focus=credentials/);
    assert.match(source, /attention_workspace=preview/);
    assert.match(source, /attention_organization=org_preview/);
    assert.match(source, new RegExp(`delivery_context=${spec.deliveryContext}`));
    assert.match(source, new RegExp(`recent_track_key=${spec.recentTrackKey ?? "verification"}`));
    assert.match(source, new RegExp(`recent_update_kind=${spec.recentUpdateKind ?? "verification"}`));
    assert.match(source, /evidence_count=2/);
    assert.match(source, /recent_owner_label=Ops/);
    assert.match(source, /recent_owner_display_name=Avery%20Ops/);
    assert.match(source, /recent_owner_email=avery\.ops%40govrail\.test/);
    assert.match(source, new RegExp(spec.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(source, new RegExp(spec.continuityHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(source, /Admin follow-up context/);
    assert.match(source, new RegExp(spec.action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    if (spec.destination === "verification") {
      if (spec.expectsVerificationDeliveryPanel) {
        assert.match(source, /Week 8 launch checklist/);
        assert.match(source, /Verification delivery notes/);
      } else {
        assert.match(source, verificationUrlPattern);
        assert.match(source, /surface=verification/);
        assert.match(source, /Week 8 launch checklist/);
        assert.match(source, /Verification evidence lane/);
      }
    } else {
      if (spec.expectsGoLiveDeliveryPanel) {
        assert.match(source, goLiveUrlPattern);
        assert.match(source, /Mock go-live drill/);
        assert.match(source, /Go-live delivery notes/);
      } else {
        assert.match(source, goLiveUrlPattern);
        assert.match(source, /surface=go_live/);
        assert.match(source, /Mock go-live drill/);
        assert.match(source, /Session-aware drill lane/);
      }
    }
    assert.match(source, /Return to admin readiness view/);
    assert.match(source, /readiness_returned=1/);
    assert.match(source, /Returned from Week 8 readiness/);
  });
}
