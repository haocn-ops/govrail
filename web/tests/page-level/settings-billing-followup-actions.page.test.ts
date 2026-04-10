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

test("settings intent cards keep follow-up links mapped to evidence surfaces", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /"manage-plan": \{[\s\S]*?\{ label: "Back to Week 8 checklist", href: verificationHref \}/s,
  );
  assert.match(
    source,
    /"manage-plan": \{[\s\S]*?\{ label: "Review usage pressure", href: usageHref \}/s,
  );
  assert.match(
    source,
    /"resolve-billing": \{[\s\S]*?\{ label: "Return to Week 8 checklist", href: verificationHref \}/s,
  );
  assert.match(
    source,
    /"resolve-billing": \{[\s\S]*?\{ label: "Return to admin readiness view", href: adminReturnHref \}/s,
  );
  assert.match(
    source,
    /upgrade: \{[\s\S]*?\{ label: "Continue to go-live drill", href: goLiveHref \}/s,
  );
  assert.match(
    source,
    /upgrade: \{[\s\S]*?\{ label: "Confirm usage evidence", href: usageHref \}/s,
  );
  assert.match(
    source,
    /rollback: \{[\s\S]*?\{ label: "Retry playground run", href: playgroundHref \}/s,
  );
  assert.match(
    source,
    /rollback: \{[\s\S]*?\{ label: "Capture recovery evidence", href: verificationHref \}/s,
  );
  assert.match(
    source,
    /rollback: \{[\s\S]*?\{ label: "Confirm usage impact", href: usageHref \}/s,
  );
  assert.match(
    source,
    /rollback: \{[\s\S]*?\{ label: "Return to admin readiness view", href: adminReturnHref \}/s,
  );
  assert.match(source, /title: "Rollback guidance intent"/);
  assert.match(source, /highlights:\s*\[/);
  assert.match(source, /\{ label: "Current run", value: latestDemoRun\?\.run_id \?\? runId \?\? "No demo run linked" \}/);
  assert.match(source, /\{ label: "Run status", value: rollbackStatusLabel \}/);
  assert.match(
    source,
    /\{\s*label: "Latest hint",\s*value: latestDemoRunHint\?\.status_label \?\? "Record the recovery decision in verification notes\.",\s*\}/,
  );
  assert.match(source, /Navigation only: this rollback lane preserves run-aware handoff context across playground, verification, usage, and admin\./);
  assert.match(
    source,
    /"Document the billing update, audit export, or portal interaction so the verification\/go-live evidence panels can cite the same timeline and you can return to the admin readiness lane\.",/,
  );
});

test("billing follow-up card keeps verification plus go-live targets paired", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /normalizedSource === "onboarding"[\s\S]*?\{ label: "Capture verification evidence", href: verificationHref \}[\s\S]*?\{ label: "Review usage pressure", href: usageHref \}/s,
  );
  assert.match(
    source,
    /normalizedSource === "onboarding"[\s\S]*?\{ label: "Return to Week 8 checklist", href: verificationHref \}/s,
  );
  assert.match(
    source,
    /normalizedSource === "onboarding"[\s\S]*?\{ label: "Continue to go-live drill", href: goLiveHref \}/s,
  );
  assert.match(
    source,
    /footnote:\s*"These navigation cues keep checkout, portal, and audit evidence linked to the same workspace timeline; they do not open support workflows, automate remediation, or impersonate any role\."/,
  );
});

test("billing follow-up body text keeps verification and go-live evidence signals coupled with admin readiness", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /billingFollowUpCard = showBillingFollowUpCard\s*\?\s*\{\s*title:[\s\S]*?body:\s*normalizedSource === "onboarding"\s*\?\s*"Once the billing action \(upgrade, checkout, or portal return\) is ready, use this panel to capture notes and evidence before you navigate back to verification, usage, or the go-live drill\."\s*:\s*"Document the billing update, audit export, or portal interaction so the verification\/go-live evidence panels can cite the same timeline and you can return to the admin readiness lane\."\s*[\s\S]*?footnote:/s,
  );
});

test("follow-up href builders keep verification, usage, admin, and go-live routes explicit", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /type SettingsPanelIntent = "upgrade" \| "manage-plan" \| "resolve-billing" \| "rollback";/);
  assert.match(source, /intent\?: SettingsPanelIntent;/);
  assert.match(source, /function buildSettingsIntentHref\(\s*intent: SettingsPanelIntent,/s);
  assert.match(source, /const adminReturnHref = buildAdminReturnHref\("\/admin",\s*\{[\s\S]*runId,/);
  assert.match(source, /attentionWorkspace: attentionWorkspace \?\? workspaceSlug,/);
  assert.match(source, /attentionOrganization,/);
  assert.match(source, /deliveryContext: normalizedDeliveryContext,/);
  assert.match(source, /recentTrackKey: normalizedRecentTrackKey,/);
  assert.match(source, /recentUpdateKind: normalizedRecentUpdateKind,/);
  assert.match(source, /evidenceCount: normalizedEvidenceCount,/);
  assert.match(source, /const usageHref = buildSettingsHref\(\{ pathname: "\/usage",/s);
  assert.match(source, /const playgroundHref = buildSettingsHref\(\{ pathname: "\/playground",/s);
  assert.match(source, /const verificationHref = buildSettingsHref\(\{ pathname: "\/verification\?surface=verification",/s);
  assert.match(source, /const goLiveHref = buildSettingsHref\(\{ pathname: "\/go-live\?surface=go_live",/s);
});

test("billing highlight contract stays coupled to intent-matched billing actions", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /const billingActionHref = billingSummary\?\.action\s*\?\s*buildSettingsHref\(\{/s);
  assert.match(
    source,
    /const highlightBillingCard = intentMatchesAction\(\s*highlightIntent,\s*billingActionHref \?\? billingSummary\?\.action\?\.href,\s*\);/s,
  );
  assert.match(
    source,
    /<Card className=\{highlightBillingCard \? "border-amber-300 shadow-\[0_0_0_1px_rgba\(245,158,11,0\.35\)\]" : undefined\}>/,
  );
});

test("billing live actions refresh enterprise readiness queries alongside workspace settings", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /async function invalidateBillingAndEnterpriseQueries\(\): Promise<void> \{\s*await Promise\.all\(\[\s*queryClient\.invalidateQueries\(\{\s*queryKey: \["workspace-settings", workspaceSlug\],\s*\}\),\s*queryClient\.invalidateQueries\(\{\s*queryKey: \["workspace-sso-readiness", workspaceSlug\],\s*\}\),\s*queryClient\.invalidateQueries\(\{\s*queryKey: \["workspace-dedicated-environment-readiness", workspaceSlug\],\s*\}\),\s*\]\);\s*\}/s,
  );
  assert.match(source, /await invalidateBillingAndEnterpriseQueries\(\);/);
  assert.match(
    source,
    /const payload = await completeBillingCheckoutSession\(checkout\.session\.session_id\);[\s\S]*?await invalidateBillingAndEnterpriseQueries\(\);/s,
  );
  assert.match(
    source,
    /await cancelBillingSubscription\(\);[\s\S]*?await invalidateBillingAndEnterpriseQueries\(\);/s,
  );
  assert.match(
    source,
    /await resumeBillingSubscription\(\);[\s\S]*?await invalidateBillingAndEnterpriseQueries\(\);/s,
  );
});
