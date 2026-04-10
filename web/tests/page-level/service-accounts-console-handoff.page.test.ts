import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(testDir, "../../app/(console)/service-accounts/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("service accounts page adopts shared console handoff helpers with audit-export continuity", async () => {
  const source = await readSource(pagePath);

  assert.match(source, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    source,
    /import \{[\s\S]*buildConsoleHandoffHref[\s\S]*parseConsoleHandoffState[\s\S]*type ConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(source, /import \{ resolveConsoleRecentTrackKey \} from "@\/lib\/console-handoff";/);
  assert.match(source, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(source, /function buildServiceAccountsHandoffHref\(pathname: string, handoff: ConsoleHandoffState\): string/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /type WorkspaceDetailResponse = \{/);
  assert.match(
    source,
    /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/,
  );
  assert.match(source, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /const recentTrackKey = resolveConsoleRecentTrackKey\(runAwareHandoff\.recentTrackKey\);/);
  assert.match(source, /const source = runAwareHandoff\.source;/);
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="service-accounts"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(source, /surface="service-accounts"/);
  assert.match(source, /Audit export continuity/);
  assert.match(source, /Manual governance checkpoint/);
  assert.match(source, /const usageHref = buildServiceAccountsHandoffHref\("\/usage", runAwareHandoff\);/);
  assert.match(source, /const settingsHref = buildServiceAccountsHandoffHref\("\/settings\?intent=manage-plan", runAwareHandoff\);/);
  assert.match(source, /const apiKeysHref = buildServiceAccountsHandoffHref\("\/api-keys", runAwareHandoff\);/);
  assert.match(source, /const playgroundHref = buildServiceAccountsHandoffHref\("\/playground", runAwareHandoff\);/);
  assert.match(source, /buildServiceAccountsHandoffHref\("\/api-keys", runAwareHandoff\)/);
  assert.match(source, /buildServiceAccountsHandoffHref\("\/playground", runAwareHandoff\)/);
  assert.match(source, /href=\{usageHref\}/);
  assert.match(source, /href=\{settingsHref\}/);
  assert.match(source, /href=\{verificationHref\}/);
  assert.match(source, /const verificationHref = buildServiceAccountsHandoffHref\("\/verification\?surface=verification", runAwareHandoff\);/);
  assert.match(source, /const goLiveHref = buildServiceAccountsHandoffHref\("\/go-live\?surface=go_live", runAwareHandoff\);/);
  assert.match(source, /const adminHref = buildServiceAccountsHandoffHref\("\/admin", runAwareHandoff\);/);
  assert.match(source, /const adminFollowUpActionsHref = "#service-accounts-admin-follow-up";/);
  assert.match(source, /href=\{goLiveHref\}/);
  assert.match(source, /href=\{adminHref\}/);
  assert.match(source, /Reopen audit export receipt/);
  assert.match(source, /Continue verification evidence/);
  assert.match(source, /href=\{buildServiceAccountsHandoffHref\("\/settings\?intent=upgrade", runAwareHandoff\)\}/);
  assert.match(source, /href=\{buildServiceAccountsHandoffHref\("\/verification\?surface=verification", runAwareHandoff\)\}/);
  assert.match(source, /<Link href=\{adminFollowUpActionsHref\}>admin follow-up<\/Link>/);
  assert.match(source, /<div id="service-accounts-admin-follow-up" className="flex flex-wrap gap-2">/);
  assert.match(source, /Reopen go-live drill/);
  assert.match(source, /Return to admin follow-up/);
  assert.match(source, /Navigation-only manual relay:/);
  assert.match(source, /These links\s+keep navigation context together only/);
  assert.match(source, /recentTrackKey=\{recentTrackKey\}/);
  assert.match(source, /week8Focus=\{runAwareHandoff\.week8Focus\}/);
  assert.match(source, /attentionWorkspace=\{runAwareHandoff\.attentionWorkspace\}/);
  assert.match(source, /attentionOrganization=\{runAwareHandoff\.attentionOrganization\}/);
  assert.match(source, /deliveryContext=\{runAwareHandoff\.deliveryContext\}/);
  assert.match(source, /recentUpdateKind=\{runAwareHandoff\.recentUpdateKind\}/);
  assert.match(source, /evidenceCount=\{runAwareHandoff\.evidenceCount\}/);
  assert.match(source, /recentOwnerLabel=\{runAwareHandoff\.recentOwnerLabel\}/);
  assert.match(source, /recentOwnerDisplayName=\{runAwareHandoff\.recentOwnerDisplayName\}/);
  assert.match(source, /recentOwnerEmail=\{runAwareHandoff\.recentOwnerEmail\}/);
});
