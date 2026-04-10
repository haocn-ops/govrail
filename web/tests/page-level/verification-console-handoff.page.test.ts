import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const verificationPagePath = path.resolve(testDir, "../../app/(console)/verification/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("verification page keeps explicit run-aware session, checklist, admin-return, and delivery handoff contract", async () => {
  const source = await readSource(verificationPagePath);

  assert.match(
    source,
    /import \{[\s\S]*buildConsoleAdminReturnHref,[\s\S]*buildConsoleAdminReturnState,[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*buildConsoleVerificationChecklistHandoffArgs,[\s\S]*buildRecentDeliveryDescription,[\s\S]*buildRecentDeliveryMetadata,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/s,
  );
  assert.match(source, /import \{ buildVerificationChecklistHandoffHref \} from "@\/lib\/handoff-query";/);
  assert.match(source, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(source, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /const recentDeliveryMetadata = buildRecentDeliveryMetadata\(handoff\);/);
  assert.match(
    source,
    /const adminReturnState = buildConsoleAdminReturnState\(\{\s*source: handoff\.source,\s*surface: handoff\.surface,\s*expectedSurface: "verification",\s*recentTrackKey: handoff\.recentTrackKey,\s*\}\);/s,
  );
  assert.match(source, /const handoffHrefArgs = buildConsoleVerificationChecklistHandoffArgs\(runAwareHandoff\);/);
  assert.match(
    source,
    /const adminReturnHref = buildConsoleAdminReturnHref\(\{\s*pathname: "\/admin",\s*handoff: runAwareHandoff,\s*workspaceSlug: workspaceContext\.workspace\.slug,\s*queueSurface: adminReturnState\.adminQueueSurface,\s*\}\);/s,
  );
  assert.match(
    source,
    /const followUpSource =\s*adminReturnState\.showAttentionHandoff\s*\?\s*"admin-attention"\s*:\s*adminReturnState\.showReadinessHandoff\s*\?\s*"admin-readiness"\s*:\s*null;/s,
  );

  assert.match(
    source,
    /<WorkspaceContextSurfaceNotice[\s\S]*surfaceLabel="Verification"[\s\S]*sessionHref=\{buildConsoleRunAwareHandoffHref\("\/session", handoff, activeRunId\)\}/,
  );
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*payload=\{[\s\S]*source: followUpSource[\s\S]*week8Focus: handoff\.week8Focus[\s\S]*attentionOrganization: handoff\.attentionOrganization[\s\S]*deliveryContext: handoff\.deliveryContext[\s\S]*recentTrackKey: handoff\.recentTrackKey[\s\S]*recentUpdateKind: handoff\.recentUpdateKind[\s\S]*evidenceCount: handoff\.evidenceCount[\s\S]*ownerDisplayName: handoff\.recentOwnerDisplayName[\s\S]*ownerEmail: handoff\.recentOwnerEmail[\s\S]*surface="verification"/s,
  );

  assert.match(source, /<CardTitle>Verification evidence lane<\/CardTitle>/);
  assert.match(
    source,
    /href=\{buildVerificationChecklistHandoffHref\(\{ pathname: "\/playground", \.\.\.handoffHrefArgs \}\)\}[\s\S]*Review playground run/s,
  );
  assert.match(
    source,
    /href=\{buildVerificationChecklistHandoffHref\(\{ pathname: "\/usage", \.\.\.handoffHrefArgs \}\)\}[\s\S]*Confirm usage signal/s,
  );
  assert.match(
    source,
    /href=\{buildVerificationChecklistHandoffHref\(\{ pathname: "\/settings\?intent=manage-plan", \.\.\.handoffHrefArgs \}\)\}[\s\S]*Review settings \+ billing/s,
  );
  assert.match(
    source,
    /href=\{buildVerificationChecklistHandoffHref\(\{ pathname: "\/artifacts", \.\.\.handoffHrefArgs \}\)\}[\s\S]*Review artifacts evidence/s,
  );
  assert.match(
    source,
    /href=\{buildVerificationChecklistHandoffHref\(\{ pathname: "\/go-live\?surface=go_live", \.\.\.handoffHrefArgs \}\)\}[\s\S]*Continue to go-live drill/s,
  );
  assert.match(source, /href=\{adminReturnHref\}[\s\S]*\{adminReturnState\.adminReturnLabel\}/s);

  assert.match(
    source,
    /<Week8VerificationChecklist[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}[\s\S]*source=\{handoff\.source\}[\s\S]*runId=\{activeRunId\}[\s\S]*week8Focus=\{handoff\.week8Focus\}[\s\S]*attentionWorkspace=\{handoff\.attentionWorkspace\}[\s\S]*attentionOrganization=\{handoff\.attentionOrganization\}[\s\S]*deliveryContext=\{handoff\.deliveryContext\}[\s\S]*recentTrackKey=\{handoff\.recentTrackKey\}[\s\S]*recentUpdateKind=\{handoff\.recentUpdateKind\}[\s\S]*evidenceCount=\{handoff\.evidenceCount\}[\s\S]*recentOwnerLabel=\{handoff\.recentOwnerLabel\}[\s\S]*recentOwnerDisplayName=\{handoff\.recentOwnerDisplayName\}[\s\S]*recentOwnerEmail=\{handoff\.recentOwnerEmail\}/,
  );
  assert.match(
    source,
    /<WorkspaceDeliveryTrackPanel[\s\S]*sectionKey="verification"[\s\S]*title="Verification delivery notes"[\s\S]*source=\{handoff\.source\}[\s\S]*surface="verification"[\s\S]*runId=\{activeRunId\}[\s\S]*week8Focus=\{handoff\.week8Focus\}[\s\S]*attentionWorkspace=\{handoff\.attentionWorkspace\}[\s\S]*attentionOrganization=\{handoff\.attentionOrganization\}[\s\S]*deliveryContext=\{handoff\.deliveryContext\}[\s\S]*recentTrackKey=\{handoff\.recentTrackKey\}[\s\S]*recentUpdateKind=\{handoff\.recentUpdateKind\}[\s\S]*evidenceCount=\{handoff\.evidenceCount\}[\s\S]*recentOwnerLabel=\{handoff\.recentOwnerLabel\}[\s\S]*recentOwnerDisplayName=\{handoff\.recentOwnerDisplayName\}[\s\S]*recentOwnerEmail=\{handoff\.recentOwnerEmail\}/,
  );
});
