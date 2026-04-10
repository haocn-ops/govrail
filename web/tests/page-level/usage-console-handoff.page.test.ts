import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const usagePagePath = path.resolve(testDir, "../../app/(console)/usage/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("usage page keeps explicit admin-return, evidence-loop, and dashboard handoff contract", async () => {
  const source = await readSource(usagePagePath);

  assert.match(
    source,
    /import \{[\s\S]*buildConsoleAdminReturnHref,[\s\S]*buildConsoleHandoffHref,[\s\S]*buildConsoleVerificationChecklistHandoffArgs,[\s\S]*buildConsoleAdminReturnState,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/s,
  );
  assert.match(source, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(source, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(
    source,
    /const adminReturnState = buildConsoleAdminReturnState\(\{\s*source: handoff\.source,\s*surface: handoff\.surface,\s*expectedSurface: "verification",\s*recentTrackKey: handoff\.recentTrackKey,\s*\}\);/s,
  );
  assert.match(source, /const handoffHrefArgs = buildConsoleVerificationChecklistHandoffArgs\(runAwareHandoff\);/);
  assert.match(
    source,
    /const buildRunAwareUsagePageHref = \(pathname: string\): string =>\s*buildVerificationChecklistHandoffHref\(\{ pathname, \.\.\.handoffHrefArgs, runId: activeRunId \}\);/s,
  );
  assert.match(
    source,
    /const adminReturnHref = buildConsoleAdminReturnHref\(\{\s*pathname: "\/admin",\s*handoff: runAwareHandoff,\s*workspaceSlug: workspaceContext\.workspace\.slug,\s*queueSurface: adminReturnState\.adminQueueSurface,\s*\}\);/s,
  );
  assert.match(source, /const sessionHref = buildConsoleHandoffHref\("\/session", runAwareHandoff\);/);
  assert.match(
    source,
    /const followUpSource =\s*adminReturnState\.showAttentionHandoff\s*\?\s*"admin-attention"\s*:\s*adminReturnState\.showReadinessHandoff\s*\?\s*"admin-readiness"\s*:\s*null;/s,
  );

  assert.match(
    source,
    /<WorkspaceContextSurfaceNotice[\s\S]*surfaceLabel="Usage"[\s\S]*sessionHref=\{sessionHref\}/,
  );
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*payload=\{[\s\S]*source: followUpSource[\s\S]*week8Focus: handoff\.week8Focus[\s\S]*attentionOrganization: handoff\.attentionOrganization[\s\S]*deliveryContext: handoff\.deliveryContext[\s\S]*recentTrackKey: handoff\.recentTrackKey[\s\S]*recentUpdateKind: handoff\.recentUpdateKind[\s\S]*evidenceCount: handoff\.evidenceCount[\s\S]*ownerDisplayName: handoff\.recentOwnerDisplayName \?\? handoff\.recentOwnerLabel[\s\S]*ownerEmail: handoff\.recentOwnerEmail[\s\S]*surface="usage"/s,
  );

  assert.match(source, /<CardTitle>Plan limit governance lane<\/CardTitle>/);
  assert.match(source, /href=\{settingsPlanHref\}[\s\S]*Review plan limits in Settings/s);
  assert.match(source, /href=\{settingsBillingHref\}[\s\S]*Resolve billing warning/s);
  assert.match(source, /href=\{adminReturnHref\}[\s\S]*\{adminReturnState\.adminReturnLabel\}/s);

  assert.match(source, /<CardTitle>First demo evidence lane<\/CardTitle>/);
  assert.match(source, /const onboardingHref = buildRunAwareUsagePageHref\("\/onboarding"\);/);
  assert.match(source, /href=\{buildRunAwareUsagePageHref\("\/playground"\)\}[\s\S]*Go to playground run/s);
  assert.match(source, /const verificationEvidenceHref = buildVerificationChecklistHandoffHref\(\{/);
  assert.match(source, /pathname: "\/verification\?surface=verification"/);
  assert.match(source, /auditReceiptFilename=\{handoff\.auditReceiptFilename\}/);
  assert.match(source, /auditReceiptExportedAt=\{handoff\.auditReceiptExportedAt\}/);
  assert.match(source, /auditReceiptFromDate=\{handoff\.auditReceiptFromDate\}/);
  assert.match(source, /auditReceiptToDate=\{handoff\.auditReceiptToDate\}/);
  assert.match(source, /auditReceiptSha256=\{handoff\.auditReceiptSha256\}/);

  assert.match(source, /<CardTitle>Evidence loop follow-through<\/CardTitle>/);
  assert.match(source, /const artifactsEvidenceHref = buildVerificationChecklistHandoffHref\(\{/);
  assert.match(source, /pathname: "\/artifacts"/);
  assert.match(source, /const goLiveHref = buildVerificationChecklistHandoffHref\(\{/);
  assert.match(source, /pathname: "\/go-live\?surface=go_live"/);

  assert.match(
    source,
    /<WorkspaceUsageDashboard[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}[\s\S]*source=\{handoff\.source\}[\s\S]*runId=\{activeRunId\}[\s\S]*week8Focus=\{handoff\.week8Focus\}[\s\S]*attentionWorkspace=\{handoff\.attentionWorkspace\}[\s\S]*attentionOrganization=\{handoff\.attentionOrganization\}[\s\S]*deliveryContext=\{handoff\.deliveryContext\}[\s\S]*recentTrackKey=\{handoff\.recentTrackKey\}[\s\S]*recentUpdateKind=\{handoff\.recentUpdateKind\}[\s\S]*evidenceCount=\{handoff\.evidenceCount\}[\s\S]*recentOwnerLabel=\{handoff\.recentOwnerLabel\}[\s\S]*recentOwnerDisplayName=\{handoff\.recentOwnerDisplayName\}[\s\S]*recentOwnerEmail=\{handoff\.recentOwnerEmail\}[\s\S]*auditReceiptFilename=\{handoff\.auditReceiptFilename\}[\s\S]*auditReceiptExportedAt=\{handoff\.auditReceiptExportedAt\}[\s\S]*auditReceiptFromDate=\{handoff\.auditReceiptFromDate\}[\s\S]*auditReceiptToDate=\{handoff\.auditReceiptToDate\}[\s\S]*auditReceiptSha256=\{handoff\.auditReceiptSha256\}/,
  );
});
