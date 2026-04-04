import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const settingsPanelPath = path.resolve(testDir, "../../components/settings/workspace-settings-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("settings panel keeps subscription action feedback copy lockstep with evidence handoff", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /normalizedCode === "billing_subscription_managed_by_provider"\)\s*\{\s*return args\.action === "cancel"\s*\?\s*"This subscription is managed in the billing provider portal\. Open billing portal from this page to change cancellation timing\."\s*:\s*"This subscription is managed in the billing provider portal\. Open billing portal from this page to restore renewal settings\.";/s,
  );
  assert.match(
    source,
    /normalizedCode === "billing_subscription_not_cancellable"\)\s*\{\s*return "This subscription can no longer be scheduled for cancellation from this workspace\.";/s,
  );
  assert.match(
    source,
    /normalizedCode === "billing_subscription_not_resumable"\)\s*\{\s*return "This subscription must be replaced through checkout before renewal can resume\.";/s,
  );
  assert.match(
    source,
    /normalizedCode === "billing_subscription_missing"\)\s*\{\s*return "No workspace subscription is available to update right now\. Refresh settings and retry\.";/s,
  );

  assert.match(
    source,
    /setSubscriptionAction\(\{[\s\S]*?notice: "Subscription will now end at the close of the current billing period\."[\s\S]*?\}\);/s,
  );
  assert.match(
    source,
    /setSubscriptionAction\(\{[\s\S]*?notice: "Automatic renewal has been restored for this subscription\."[\s\S]*?\}\);/s,
  );

  assert.match(
    source,
    /subscriptionAction\.notice \?\s*\(\s*<p className="text-xs text-emerald-700">\{subscriptionAction\.notice\}<\/p>\s*\)\s*:\s*null/s,
  );
  assert.match(
    source,
    /These navigation cues keep checkout, portal, and audit evidence linked to the same workspace timeline; they do not open support workflows, automate remediation, or impersonate any role\./,
  );
});
