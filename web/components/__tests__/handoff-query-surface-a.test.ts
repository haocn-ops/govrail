import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const onboardingWizardPath = path.resolve(testDir, "../onboarding/workspace-onboarding-wizard.tsx");
const playgroundPanelPath = path.resolve(testDir, "../playground/playground-panel.tsx");
const usageDashboardPath = path.resolve(testDir, "../usage/workspace-usage-dashboard.tsx");

test("source-contract(slot-a): onboarding handoff href uses shared helper with existing-query preservation", async () => {
  const source = await readFile(onboardingWizardPath, "utf8");

  assert.match(
    source,
    /import \{ buildVerificationChecklistHandoffHref \} from "@\/lib\/handoff-query";/,
  );
  assert.match(
    source,
    /const latestDemoRun = onboardingState\?\.latest_demo_run \?\? null;/,
  );
  assert.match(source, /const activeRunId = latestDemoRun\?\.run_id \?\? runId \?\? null;/);
  assert.match(
    source,
    /const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>\[0\], "pathname"> = \{\s*source: normalizedSource,\s*runId: activeRunId,\s*week8Focus,\s*attentionWorkspace,\s*attentionOrganization,\s*deliveryContext,\s*recentTrackKey,\s*recentUpdateKind,\s*evidenceCount,\s*recentOwnerLabel,\s*recentOwnerDisplayName,\s*recentOwnerEmail,\s*\};/s,
  );
  assert.match(
    source,
    /const onboardingGuideHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: toSurfacePath\(onboardingGuide\.surface\),\s*\.\.\.handoffHrefArgs,\s*\}\);/s,
  );
  assert.match(
    source,
    /const recommendedNextHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: toSurfacePath\(recommendedNext\.surface\),\s*\.\.\.handoffHrefArgs,\s*\}\);/s,
  );
  assert.match(
    source,
    /const verificationChecklistHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/verification\?surface=verification",\s*\.\.\.handoffHrefArgs,\s*\}\);/s,
  );
  assert.match(
    source,
    /const sessionCheckpointHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/session",\s*\.\.\.handoffHrefArgs,\s*\}\);/s,
  );
  assert.match(
    source,
    /const usageCheckpointHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/usage",\s*\.\.\.handoffHrefArgs,\s*\}\);/s,
  );
  assert.match(
    source,
    /const settingsBillingHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/settings\?intent=manage-plan",\s*\.\.\.handoffHrefArgs,\s*\}\);/s,
  );
  assert.match(
    source,
    /const settingsAuditExportHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/settings\?intent=upgrade",\s*\.\.\.handoffHrefArgs,\s*\}\);/s,
  );
  assert.match(
    source,
    /const goLiveDrillHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/go-live\?surface=go_live",\s*\.\.\.handoffHrefArgs,\s*\}\);/s,
  );
});

test("source-contract(slot-a): playground + usage handoff href builders delegate to shared helper", async () => {
  const [playgroundSource, usageSource] = await Promise.all([
    readFile(playgroundPanelPath, "utf8"),
    readFile(usageDashboardPath, "utf8"),
  ]);

  assert.match(
    playgroundSource,
    /import \{ buildVerificationChecklistHandoffHref \} from "@\/lib\/handoff-query";/,
  );
  assert.match(
    playgroundSource,
    /const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>\[0\], "pathname"> = \{\s*source: normalizedSource,\s*week8Focus,\s*attentionWorkspace,\s*attentionOrganization,\s*deliveryContext: normalizedDeliveryContext,\s*recentTrackKey: normalizedRecentTrackKey,\s*recentUpdateKind,\s*evidenceCount,\s*recentOwnerLabel,\s*recentOwnerDisplayName,\s*recentOwnerEmail,\s*\};/s,
  );
  assert.match(
    playgroundSource,
    /const buildRunAwarePlaygroundHref = \(pathname: string\): string =>\s*buildVerificationChecklistHandoffHref\(\{ pathname, \.\.\.handoffHrefArgs, runId: activeRunId \}\);/s,
  );
  assert.match(playgroundSource, /const usageHref = buildRunAwarePlaygroundHref\("\/usage"\);/);
  assert.match(
    playgroundSource,
    /const settingsHref = buildRunAwarePlaygroundHref\("\/settings\?intent=manage-plan"\);/,
  );
  assert.match(
    playgroundSource,
    /const settingsUpgradeHref = buildRunAwarePlaygroundHref\("\/settings\?intent=upgrade"\);/,
  );
  assert.match(playgroundSource, /const serviceAccountsHref = buildRunAwarePlaygroundHref\("\/service-accounts"\);/);
  assert.match(playgroundSource, /const apiKeysHref = buildRunAwarePlaygroundHref\("\/api-keys"\);/);
  assert.match(playgroundSource, /const verificationHref = buildRunAwarePlaygroundHref\("\/verification\?surface=verification"\);/);
  assert.match(
    playgroundSource,
    /href=\{buildRunAwarePlaygroundHref\(toSurfacePath\(onboardingGuide\.actionSurface\)\)\}/,
  );
  assert.match(playgroundSource, /href=\{usageHref\}[\s\S]*Review usage pressure/s);
  assert.match(playgroundSource, /href=\{settingsHref\}[\s\S]*Confirm plan and billing/s);
  assert.match(playgroundSource, /href=\{verificationHref\}[\s\S]*Prepare verification handoff/s);

  assert.match(
    usageSource,
    /import \{ buildAdminReturnHref, buildVerificationChecklistHandoffHref \} from "@\/lib\/handoff-query";/,
  );
  assert.match(
    usageSource,
    /const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>\[0\], "pathname"> = \{\s*source: normalizedSource,\s*week8Focus,\s*attentionWorkspace,\s*attentionOrganization,\s*deliveryContext: normalizeDeliveryContext\(deliveryContext\),\s*recentTrackKey: normalizeRecentTrackKey\(recentTrackKey\),\s*recentUpdateKind: normalizeRecentUpdateKind\(recentUpdateKind\),\s*evidenceCount,\s*recentOwnerLabel,\s*recentOwnerDisplayName,\s*recentOwnerEmail,\s*\};/s,
  );
  assert.match(usageSource, /const latestDemoRun = onboardingState\?\.latest_demo_run \?\? null;/);
  assert.match(usageSource, /const activeRunId = latestDemoRun\?\.run_id \?\? runId \?\? null;/);
  assert.match(
    usageSource,
    /const buildRunAwareUsageHref = \(pathname: string\): string =>\s*buildVerificationChecklistHandoffHref\(\{ pathname, \.\.\.handoffHrefArgs, runId: activeRunId \}\);/s,
  );
  assert.match(usageSource, /buildRunAwareUsageHref\("\/playground"\)/);
  assert.match(
    usageSource,
    /const verificationHref = buildRunAwareUsageHref\("\/verification\?surface=verification"\);/,
  );
  assert.match(usageSource, /const artifactsHref = buildRunAwareUsageHref\("\/artifacts"\);/);
  assert.match(usageSource, /const settingsHref = buildRunAwareUsageHref\("\/settings"\);/);
  assert.match(usageSource, /const settingsUpgradeHref = buildRunAwareUsageHref\("\/settings\?intent=upgrade"\);/);
  assert.match(usageSource, /buildRunAwareUsageHref\(action\.path\)/);
  assert.match(usageSource, /href=\{verificationHref\}[\s\S]*Capture verification evidence/s);
  assert.match(usageSource, /href=\{verificationHref\}[\s\S]*Reopen verification evidence/s);
});
