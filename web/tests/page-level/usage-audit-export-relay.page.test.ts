import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const usageDashboardPath = path.resolve(testDir, "../../components/usage/workspace-usage-dashboard.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("usage dashboard keeps audit export continuity lane explicit", async () => {
  const source = await readSource(usageDashboardPath);

  assert.match(source, /import \{ buildAdminReturnHref, buildVerificationChecklistHandoffHref \} from "@\/lib\/handoff-query";/);
  assert.match(source, /type DeliveryContext = "recent_activity" \| "week8";/);
  assert.match(source, /return value === "recent_activity" \|\| value === "week8" \? value : null;/);
  assert.match(source, /const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>\[0], "pathname"> = \{/);
  assert.match(
    source,
    /const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>\[0], "pathname"> = \{[\s\S]*source: normalizedSource,[\s\S]*week8Focus,[\s\S]*attentionWorkspace,[\s\S]*attentionOrganization,[\s\S]*deliveryContext: normalizeDeliveryContext\(deliveryContext\),[\s\S]*recentTrackKey: normalizeRecentTrackKey\(recentTrackKey\),[\s\S]*recentUpdateKind: normalizeRecentUpdateKind\(recentUpdateKind\),[\s\S]*evidenceCount,[\s\S]*recentOwnerLabel,[\s\S]*recentOwnerDisplayName,[\s\S]*recentOwnerEmail,[\s\S]*\};/s,
  );
  assert.match(source, /const latestDemoRun = onboardingState\?\.latest_demo_run \?\? null;/);
  assert.match(source, /runId\?: string \| null;/);
  assert.match(source, /const activeRunId = latestDemoRun\?\.run_id \?\? runId \?\? null;/);
  assert.match(
    source,
    /const buildRunAwareUsageHref = \(pathname: string\): string =>\s*buildVerificationChecklistHandoffHref\(\{ pathname, \.\.\.handoffHrefArgs, runId: activeRunId \}\);/s,
  );
  assert.match(source, /const verificationHref = buildRunAwareUsageHref\("\/verification\?surface=verification"\);/);
  assert.match(source, /const artifactsHref = buildRunAwareUsageHref\("\/artifacts"\);/);
  assert.match(source, /const settingsHref = buildRunAwareUsageHref\("\/settings"\);/);
  assert.match(source, /const settingsUpgradeHref = buildRunAwareUsageHref\("\/settings\?intent=upgrade"\);/);
  assert.match(source, /const adminHref = buildAdminReturnHref\("\/admin", \{/);
  assert.match(
    source,
    /const adminHref = buildAdminReturnHref\("\/admin", \{[\s\S]*source: normalizedSource,[\s\S]*runId: activeRunId,[\s\S]*queueSurface: normalizeRecentTrackKey\(recentTrackKey\),[\s\S]*week8Focus,[\s\S]*attentionWorkspace: attentionWorkspace \?\? workspaceSlug,[\s\S]*attentionOrganization,[\s\S]*deliveryContext: normalizeDeliveryContext\(deliveryContext\),[\s\S]*recentTrackKey: normalizeRecentTrackKey\(recentTrackKey\),[\s\S]*recentUpdateKind: normalizeRecentUpdateKind\(recentUpdateKind\),[\s\S]*evidenceCount,[\s\S]*recentOwnerLabel,[\s\S]*recentOwnerDisplayName,[\s\S]*recentOwnerEmail,[\s\S]*\}\);/s,
  );
  assert.match(source, /const adminReturnLabel =/);
  assert.match(
    source,
    /const adminReturnLabel =[\s\S]*normalizedSource === "admin-attention"[\s\S]*"Return to admin queue"[\s\S]*normalizedSource === "admin-readiness"[\s\S]*"Return to admin readiness view"[\s\S]*"Return to admin overview";/s,
  );
  assert.match(source, /const ownerSummary = metadata\.ownerDisplayName \?\? metadata\.ownerEmail \?\? metadata\.ownerLabel \?\? null;/);
  assert.match(source, /lines\.push\(`Latest handoff owner: \$\{ownerSummary\}`\);/);
  assert.match(source, /title: "Admin queue usage follow-up"/);
  assert.match(source, /title: "Onboarding usage checkpoint"/);
  assert.match(source, /\{ label: "Review billing \+ settings", path: "\/settings\?intent=manage-plan" \}/);
  assert.match(source, /\{ label: "Review billing \+ features", path: "\/settings\?intent=manage-plan" \}/);
  assert.match(source, /<CardTitle>Audit export continuity<\/CardTitle>/);
  assert.match(
    source,
    /Usage verifies the run, but the same Latest export receipt \(filename, filters, SHA-256\) from \/settings[\s\S]*needs to show up again in verification and the admin handoff/,
  );
  assert.match(source, /<CardTitle>Evidence relay<\/CardTitle>/);
  assert.match(source, /href=\{verificationHref\}[\s\S]*Capture verification evidence/s);
  assert.match(source, /href=\{artifactsHref\}[\s\S]*Review artifacts/s);
  assert.match(source, /href=\{settingsHref\}[\s\S]*Review settings posture/s);
  assert.match(source, /href=\{adminHref\}[\s\S]*\{adminReturnLabel\}/s);
  assert.match(source, /href=\{settingsUpgradeHref\}/);
  assert.match(source, /Reopen audit export receipt/);
  assert.match(source, /Reopen verification evidence/);
  assert.match(source, /<CardTitle>Audit export continuity<\/CardTitle>[\s\S]*href=\{adminHref\}[\s\S]*\{adminReturnLabel\}/s);
  assert.match(source, /admin-attention/);
  assert.match(source, /Return to admin queue/);
  assert.match(source, /Return to admin readiness view/);
  assert.match(source, /Return to admin overview/);
  assert.match(
    source,
    /Navigation-only manual relay: these links preserve workspace context but do not auto-attach the receipt or\s*resolve rollout issues for you\./,
  );
});
