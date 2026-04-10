import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const verificationChecklistPath = path.resolve(testDir, "../../components/verification/week8-verification-checklist.tsx");
const goLivePanelPath = path.resolve(testDir, "../../components/go-live/mock-go-live-drill-panel.tsx");
const apiKeysPanelPath = path.resolve(testDir, "../../components/api-keys/api-keys-panel.tsx");
const playgroundPanelPath = path.resolve(testDir, "../../components/playground/playground-panel.tsx");
const serviceAccountsPanelPath = path.resolve(testDir, "../../components/service-accounts/service-accounts-panel.tsx");
const usageDashboardPath = path.resolve(testDir, "../../components/usage/workspace-usage-dashboard.tsx");
const handoffQueryPath = path.resolve(testDir, "../../lib/handoff-query.ts");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

function assertMatchesAny(source: string, patterns: RegExp[], message: string): void {
  assert.ok(
    patterns.some((pattern) => pattern.test(source)),
    `${message}: expected one of ${patterns.map((pattern) => pattern.toString()).join(" | ")}`,
  );
}

test("verification checklist exposes shared handoff builder and forwards continuity query keys to lib helper", async () => {
  const [checklistSource, handoffQuerySource] = await Promise.all([
    readSource(verificationChecklistPath),
    readSource(handoffQueryPath),
  ]);

  assertMatchesAny(
    handoffQuerySource,
    [/export function buildVerificationChecklistHandoffHref\(args: VerificationChecklistHandoffArgs\): string \{/],
    "canonical verification handoff builder presence",
  );
  assert.match(handoffQuerySource, /return buildHandoffHref\(/);
  assert.match(
    handoffQuerySource,
    /if \(source !== "admin-readiness" && source !== "admin-attention" && source !== "onboarding"\) \{\s*return pathname;\s*\}/s,
  );
  assert.match(handoffQuerySource, /week8Focus/);
  assert.match(handoffQuerySource, /runId/);
  assert.match(handoffQuerySource, /attentionWorkspace/);
  assert.match(handoffQuerySource, /attentionOrganization/);
  assert.match(handoffQuerySource, /deliveryContext:/);
  assert.match(handoffQuerySource, /recentTrackKey: resolveAdminQueueSurface\(recentTrackKey\),/);
  assert.match(handoffQuerySource, /recentUpdateKind: normalizedRecentUpdateKind,/);
  assert.match(handoffQuerySource, /evidenceCount,/);
  assert.match(handoffQuerySource, /recentOwnerLabel,/);
  assert.match(handoffQuerySource, /recentOwnerDisplayName,/);
  assert.match(handoffQuerySource, /recentOwnerEmail,/);
  assert.match(handoffQuerySource, /searchParams\.set\("run_id", args\.runId\);/);
  assert.match(handoffQuerySource, /preserveExistingQuery: true/);

  assert.match(checklistSource, /buildVerificationChecklistHandoffHref/);
  assert.match(checklistSource, /type DeliveryContext = "recent_activity" \| "week8";/);
  assert.match(
    checklistSource,
    /return value === "recent_activity" \|\| value === "week8" \? value : null;/,
  );
  assert.match(checklistSource, /return buildAdminReturnHref\("\/admin", \{/);
  assert.match(checklistSource, /runId: args\.runId,/);
  assert.match(checklistSource, /queueSurface: args\.recentTrackKey,/);
  assert.match(checklistSource, /runId\?: string \| null;/);
  assert.match(checklistSource, /const activeRunId = latestDemoRun\?\.run_id \?\? runId \?\? null;/);
  assert.match(checklistSource, /href: buildAdminEvidenceHref\(\{[\s\S]*runId: activeRunId,[\s\S]*\}\),/s);
  assert.match(
    checklistSource,
    /const buildRunAwareChecklistHref = \(pathname: string\): string =>\s*buildVerificationChecklistHandoffHref\(\{ pathname, \.\.\.handoffHrefArgs, runId: activeRunId \}\);/s,
  );
  assert.match(checklistSource, /runId: activeRunId,/);
  assert.match(checklistSource, /buildSettingsIntentHref\("manage-plan", normalizedSource, activeRunId,/);
  assert.match(checklistSource, /"\/verification\?surface=verification"/);
  assert.match(checklistSource, /"\/go-live\?surface=go_live"/);
});

test("go-live, api-keys, playground, service-accounts, and usage panels reuse checklist shared handoff helper for continuity", async () => {
  const [goLiveSource, apiKeysSource, playgroundSource, serviceAccountsSource, usageSource] = await Promise.all([
    readSource(goLivePanelPath),
    readSource(apiKeysPanelPath),
    readSource(playgroundPanelPath),
    readSource(serviceAccountsPanelPath),
    readSource(usageDashboardPath),
  ]);

  assert.match(goLiveSource, /buildVerificationChecklistHandoffHref/);
  assert.match(goLiveSource, /buildVerificationChecklistHandoffHref\(\{/);
  assert.match(goLiveSource, /const latestDemoRun = onboarding\?\.latest_demo_run \?\? null;/);
  assert.match(goLiveSource, /runId\?: string \| null;/);
  assert.match(goLiveSource, /const activeRunId = latestDemoRun\?\.run_id \?\? runId \?\? null;/);
  assert.match(goLiveSource, /recentOwnerDisplayName/);
  assert.match(goLiveSource, /recentOwnerEmail/);
  assert.match(goLiveSource, /runId: activeRunId,/);
  assert.match(goLiveSource, /href: buildHref\("\/verification\?surface=verification"\),/);
  assert.match(goLiveSource, /buildAdminReturnHref\("\/admin", \{/);

  assert.match(apiKeysSource, /buildVerificationChecklistHandoffHref/);
  assert.match(apiKeysSource, /return "\/verification\?surface=verification";/);
  assert.match(apiKeysSource, /type DeliveryContext = "recent_activity" \| "week8";/);
  assert.match(apiKeysSource, /return value === "recent_activity" \|\| value === "week8" \? value : null;/);
  assert.match(apiKeysSource, /const latestDemoRun = workspaceQuery\.data\?\.onboarding\?\.latest_demo_run \?\? null;/);
  assert.match(apiKeysSource, /const activeRunId = latestDemoRun\?\.run_id \?\? null;/);
  assert.match(apiKeysSource, /runId: activeRunId,/);
  assert.match(apiKeysSource, /buildVerificationChecklistHandoffHref\(\{ pathname: "\/service-accounts"/);
  assert.match(apiKeysSource, /buildVerificationChecklistHandoffHref\(\{ pathname: "\/playground"/);
  assert.match(
    apiKeysSource,
    /buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/verification\?surface=verification",/s,
  );
  assert.match(apiKeysSource, /return "\/go-live\?surface=go_live";/);

  assert.match(playgroundSource, /buildVerificationChecklistHandoffHref/);
  assert.match(playgroundSource, /type DeliveryContext = "recent_activity" \| "week8";/);
  assert.match(playgroundSource, /return value === "recent_activity" \|\| value === "week8" \? value : null;/);
  assert.match(playgroundSource, /const activeRunId = invokeMutation\.data\?\.run_id \?\? latestDemoRun\?\.run_id \?\? null;/);
  assert.match(
    playgroundSource,
    /const buildRunAwarePlaygroundHref = \(pathname: string\): string =>\s*buildVerificationChecklistHandoffHref\(\{ pathname, \.\.\.handoffHrefArgs, runId: activeRunId \}\);/s,
  );
  assert.match(playgroundSource, /const usageHref = buildRunAwarePlaygroundHref\("\/usage"\);/);
  assert.match(playgroundSource, /const verificationHref = buildRunAwarePlaygroundHref\("\/verification\?surface=verification"\);/);
  assert.match(
    playgroundSource,
    /href=\{buildRunAwarePlaygroundHref\(toSurfacePath\(onboardingGuide\.actionSurface\)\)\}/,
  );

  assert.match(serviceAccountsSource, /buildVerificationChecklistHandoffHref/);
  assert.match(serviceAccountsSource, /return "\/verification\?surface=verification";/);
  assert.match(serviceAccountsSource, /const latestDemoRun = workspaceQuery\.data\?\.onboarding\?\.latest_demo_run \?\? null;/);
  assert.match(serviceAccountsSource, /const activeRunId = latestDemoRun\?\.run_id \?\? null;/);
  assert.match(serviceAccountsSource, /runId: activeRunId,/);
  assert.match(serviceAccountsSource, /buildVerificationChecklistHandoffHref\(\{ pathname: action\.path/);
  assert.match(serviceAccountsSource, /buildVerificationChecklistHandoffHref\(\{ pathname: "\/service-accounts"/);
  assert.match(serviceAccountsSource, /buildVerificationChecklistHandoffHref\(\{ pathname: "\/playground"/);
  assert.match(
    serviceAccountsSource,
    /buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/verification\?surface=verification",/s,
  );
  assert.match(serviceAccountsSource, /return "\/go-live\?surface=go_live";/);

  assert.match(usageSource, /buildVerificationChecklistHandoffHref/);
  assert.match(usageSource, /\{ label: "Capture verification evidence", path: "\/verification\?surface=verification" \}/);
  assert.match(usageSource, /const latestDemoRun = onboardingState\?\.latest_demo_run \?\? null;/);
  assert.match(usageSource, /runId\?: string \| null;/);
  assert.match(usageSource, /const activeRunId = latestDemoRun\?\.run_id \?\? runId \?\? null;/);
  assert.match(
    usageSource,
    /const buildRunAwareUsageHref = \(pathname: string\): string =>\s*buildVerificationChecklistHandoffHref\(\{ pathname, \.\.\.handoffHrefArgs, runId: activeRunId \}\);/s,
  );
  assert.match(
    usageSource,
    /const verificationHref = buildRunAwareUsageHref\("\/verification\?surface=verification"\);/,
  );
  assert.match(usageSource, /buildRunAwareUsageHref\(action\.path\)/);
});
