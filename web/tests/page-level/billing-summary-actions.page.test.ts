import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(testDir, "../../../src/app.ts");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("billing summary keeps Stripe-first upgrade and resolve/manage intent semantics aligned", async () => {
  const source = await readSource(appPath);

  assert.match(
    source,
    /"This workspace is on the free plan\. You can now start Stripe-hosted self-serve checkout for Pro\."/,
  );
  assert.match(
    source,
    /"This workspace is on the free plan\. A test-only mock checkout flow is configured for non-production validation\."/,
  );
  assert.match(
    source,
    /"This workspace is on the free plan\. Configure a production self-serve billing provider before operators can upgrade in product\."/,
  );
  assert.match(
    source,
    /const selfServeReasonCode =\s*!checkoutProvider && !allowMockCheckout \? "billing_self_serve_not_configured" : null;/,
  );
  assert.match(source, /self_serve_reason_code: actionReady \? null : selfServeReasonCode,/);
  assert.match(
    source,
    /label: isPaidPlan\s*\? "Coordinate plan changes"\s*:\s*actionReady && checkoutProviderIsStripe\s*\? "Upgrade to Pro"\s*:\s*actionReady && checkoutProviderIsMock\s*\? "Run test checkout flow"\s*:\s*"Prepare self-serve upgrade"/s,
  );
  assert.match(source, /href: isPaidPlan \? "\/settings\?intent=manage-plan" : "\/settings\?intent=upgrade"/);

  assert.match(source, /status_label: "Billing attention needed"/);
  assert.match(
    source,
    /label: resolveBillingSelfServeEnabled \? "Resolve billing" : "Coordinate billing recovery"/,
  );
  assert.match(source, /self_serve_reason_code: resolveBillingSelfServeEnabled \? null : selfServeReasonCode,/);
  assert.match(source, /href: "\/settings\?intent=resolve-billing"/);

  assert.match(source, /status_label: "Scheduled to end"/);
  assert.match(
    source,
    /label: manageSelfServeEnabled \? "Manage scheduled cancellation" : "Coordinate renewal"/,
  );
  assert.match(source, /self_serve_reason_code: manageSelfServeEnabled \? null : selfServeReasonCode,/);
  assert.match(source, /description: "The workspace is scheduled to leave its current plan at the end of the billing window\."/);
  assert.match(source, /availability: manageSelfServeEnabled \? "ready" : "staged"/);
  assert.match(source, /href: "\/settings\?intent=manage-plan"/);

  assert.match(source, /status_label: "Subscription paused"/);
  assert.match(
    source,
    /description: "The current subscription is paused and should be resumed or replaced before go-live\."/,
  );
  assert.match(
    source,
    /label: manageSelfServeEnabled \? "Manage paused subscription" : "Coordinate resume"/,
  );
  assert.match(source, /self_serve_reason_code: manageSelfServeEnabled \? null : selfServeReasonCode,/);
  assert.match(source, /availability: manageSelfServeEnabled \? "ready" : "staged"/);
  assert.match(source, /href: "\/settings\?intent=manage-plan"/);

  assert.match(source, /status_label: "Subscription cancelled"/);
  assert.match(
    source,
    /description: "The previous paid subscription is no longer active for this workspace\."/,
  );
  assert.match(
    source,
    /label:\s*replacementUpgradeReady\s*\?\s*checkoutProviderIsStripe\s*\?\s*"Choose a new plan"/,
  );
  assert.match(
    source,
    /checkoutProviderIsMock\s*\?\s*"Run replacement test flow"/,
  );
  assert.match(
    source,
    /"Start replacement plan flow"/,
  );
  assert.match(
    source,
    /"Prepare replacement plan"/,
  );
  assert.match(source, /self_serve_reason_code: replacementUpgradeReady \? null : selfServeReasonCode,/);
  assert.match(source, /availability: replacementUpgradeReady \? "ready" : "staged"/);
  assert.match(source, /self_serve_reason_code: activeManageReady \? null : selfServeReasonCode,/);
});
