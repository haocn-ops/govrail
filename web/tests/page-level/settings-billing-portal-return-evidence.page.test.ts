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

test("settings panel keeps portal-return notices coupled to billing evidence handoff continuity", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /const billingActionHref = billingSummary\?\.action\s*\?\s*buildSettingsHref\(\{\s*pathname: billingSummary\.action\.href,\s*\.\.\.handoffHrefArgs,\s*\}\)\s*:\s*null;/s,
  );
  assert.match(
    source,
    /const showBillingFollowUpCard =\s*!intentCard && \(normalizedSource \|\| checkout\.session \|\| subscriptionAction\.notice \|\| auditExport\.notice\);/,
  );
  assert.match(source, /title: normalizedSource === "onboarding" \? "Onboarding billing evidence" : "Billing evidence handoff"/);
  assert.match(
    source,
    /Document the billing update, audit export, or portal interaction so the verification\/go-live evidence panels can cite the same timeline and you can return to the admin readiness lane\./,
  );
  assert.match(
    source,
    /actions:\s*normalizedSource === "onboarding"\s*\?\s*\[[\s\S]*?\]\s*:\s*\[\s*\{ label: "Return to Week 8 checklist", href: verificationHref \},\s*\{ label: "Continue to go-live drill", href: goLiveHref \},\s*\{ label: "Return to admin readiness view", href: adminReturnHref \},\s*\]/s,
  );
  assert.match(source, /subscriptionAction\.notice \? \(\s*<p className="text-xs text-emerald-700">\{subscriptionAction\.notice\}<\/p>\s*\) : null/s);
  assert.match(
    source,
    /setSubscriptionAction\(\{\s*openingPortal: false,\s*cancelling: false,\s*resuming: false,\s*error: null,\s*notice: "Subscription will now end at the close of the current billing period\.",/s,
  );
  assert.match(
    source,
    /setSubscriptionAction\(\{\s*openingPortal: false,\s*cancelling: false,\s*resuming: false,\s*error: null,\s*notice: "Automatic renewal has been restored for this subscription\.",/s,
  );
  assert.match(
    source,
    /These navigation cues keep checkout, portal, and audit evidence linked to the same workspace timeline; they do not open support workflows, automate remediation, or impersonate any role\./,
  );
});
