import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const goLivePagePath = path.resolve(testDir, "../../app/(console)/go-live/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("go-live page keeps explicit admin-return, drill, and delivery-panel handoff contract", async () => {
  const source = await readSource(goLivePagePath);

  assert.match(
    source,
    /import \{[\s\S]*buildConsoleAdminReturnHref,[\s\S]*buildConsoleAdminReturnState,[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*buildRecentDeliveryDescription,[\s\S]*buildRecentDeliveryMetadata,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/s,
  );
  assert.match(source, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(source, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /const goLiveMetadata = buildRecentDeliveryMetadata\(handoff\);/);
  assert.match(source, /const recentTrackKey = goLiveMetadata\.recentTrackKey;/);
  assert.match(source, /const recentUpdateKind = goLiveMetadata\.recentUpdateKind;/);
  assert.match(source, /const recentEvidenceCount = goLiveMetadata\.recentEvidenceCount;/);
  assert.match(source, /const recentOwnerLabel = handoff\.recentOwnerLabel;/);
  assert.match(source, /const recentOwnerDisplayName = handoff\.recentOwnerDisplayName;/);
  assert.match(source, /const recentOwnerEmail = handoff\.recentOwnerEmail;/);
  assert.match(
    source,
    /const adminReturnState = buildConsoleAdminReturnState\(\{\s*source: handoff\.source,\s*surface: handoff\.surface,\s*expectedSurface: "go_live",\s*recentTrackKey: handoff\.recentTrackKey,\s*\}\);/s,
  );
  assert.match(
    source,
    /const adminReturnHref = buildConsoleAdminReturnHref\(\{\s*pathname: "\/admin",\s*handoff: runAwareHandoff,\s*workspaceSlug: workspaceContext\.workspace\.slug,\s*queueSurface: adminReturnState\.adminQueueSurface,\s*\}\);/s,
  );
  assert.match(
    source,
    /const followUpSource =\s*adminReturnState\.showAttentionHandoff\s*\?\s*"admin-attention"\s*:\s*adminReturnState\.showReadinessHandoff\s*\?\s*"admin-readiness"\s*:\s*null;/s,
  );
  assert.match(source, /const adminHref = adminReturnState\.showAdminReturn \? adminReturnHref : "\/admin";/);
  assert.match(
    source,
    /const adminLinkLabel = adminReturnState\.showAdminReturn \? adminReturnState\.adminReturnLabel : "Admin overview";/,
  );

  assert.match(
    source,
    /<WorkspaceContextSurfaceNotice[\s\S]*surfaceLabel="Go-live drill"[\s\S]*sessionHref=\{buildConsoleRunAwareHandoffHref\("\/session", handoff, activeRunId\)\}/,
  );
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*payload=\{[\s\S]*source: followUpSource[\s\S]*week8Focus: handoff\.week8Focus[\s\S]*attentionOrganization: handoff\.attentionOrganization[\s\S]*deliveryContext: handoff\.deliveryContext[\s\S]*recentTrackKey[\s\S]*recentUpdateKind[\s\S]*evidenceCount: recentEvidenceCount[\s\S]*ownerDisplayName: recentOwnerDisplayName[\s\S]*ownerEmail: recentOwnerEmail[\s\S]*surface="go_live"/s,
  );

  assert.match(source, /<CardTitle>Session-aware drill lane<\/CardTitle>/);
  assert.match(source, /const verificationHref = buildConsoleRunAwareHandoffHref\("\/verification\?surface=verification", handoff, activeRunId\);/);
  assert.match(source, /const usageHref = buildConsoleRunAwareHandoffHref\("\/usage", handoff, activeRunId\);/);
  assert.match(source, /const billingSettingsHref = buildConsoleRunAwareHandoffHref\("\/settings\?intent=manage-plan", handoff, activeRunId\);/);
  assert.match(source, /const upgradeSettingsHref = buildConsoleRunAwareHandoffHref\("\/settings\?intent=upgrade", handoff, activeRunId\);/);
  assert.match(source, /const playgroundHref = buildConsoleRunAwareHandoffHref\("\/playground", handoff, activeRunId\);/);
  assert.match(source, /const artifactsHref = buildConsoleRunAwareHandoffHref\("\/artifacts", handoff, activeRunId\);/);
  assert.match(source, /const deliveryTrackHref = "#go-live-delivery-track";/);
  assert.match(source, /href=\{verificationHref\}[\s\S]*Reopen verification evidence/s);
  assert.match(source, /href=\{usageHref\}[\s\S]*Confirm usage posture/s);
  assert.match(source, /href=\{billingSettingsHref\}[\s\S]*Review billing \+ settings/s);
  assert.match(source, /href=\{playgroundHref\}[\s\S]*Revisit playground run/s);
  assert.match(source, /href=\{artifactsHref\}[\s\S]*Inspect artifacts evidence/s);

  assert.match(source, /<CardTitle>Governance recap<\/CardTitle>/);
  assert.match(source, /href=\{upgradeSettingsHref\}[\s\S]*Settings upgrade intent/s);
  assert.match(source, /copy that note into Verification's evidence lane/);
  assert.match(source, /<Link href=\{deliveryTrackHref\}>delivery tracker here<\/Link>/);
  assert.match(source, /<Link href=\{adminHref\}>\{adminLinkLabel\}<\/Link>/);

  assert.match(
    source,
    /<MockGoLiveDrillPanel[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}[\s\S]*source=\{handoff\.source\}[\s\S]*runId=\{activeRunId\}[\s\S]*week8Focus=\{handoff\.week8Focus\}[\s\S]*attentionWorkspace=\{handoff\.attentionWorkspace\}[\s\S]*attentionOrganization=\{handoff\.attentionOrganization\}[\s\S]*deliveryContext=\{handoff\.deliveryContext\}[\s\S]*recentTrackKey=\{recentTrackKey\}[\s\S]*recentUpdateKind=\{recentUpdateKind\}[\s\S]*evidenceCount=\{recentEvidenceCount\}[\s\S]*recentOwnerLabel=\{recentOwnerLabel\}[\s\S]*recentOwnerDisplayName=\{recentOwnerDisplayName\}[\s\S]*recentOwnerEmail=\{recentOwnerEmail\}/,
  );
  assert.match(
    source,
    /<div id="go-live-delivery-track">[\s\S]*<WorkspaceDeliveryTrackPanel[\s\S]*sectionKey="go_live"[\s\S]*title="Go-live delivery notes"[\s\S]*source=\{handoff\.source\}[\s\S]*surface="go_live"[\s\S]*runId=\{activeRunId\}[\s\S]*week8Focus=\{handoff\.week8Focus\}[\s\S]*attentionWorkspace=\{handoff\.attentionWorkspace\}[\s\S]*attentionOrganization=\{handoff\.attentionOrganization\}[\s\S]*deliveryContext=\{handoff\.deliveryContext\}[\s\S]*recentTrackKey=\{recentTrackKey\}[\s\S]*recentUpdateKind=\{recentUpdateKind\}[\s\S]*evidenceCount=\{recentEvidenceCount\}[\s\S]*recentOwnerLabel=\{recentOwnerLabel\}[\s\S]*recentOwnerDisplayName=\{recentOwnerDisplayName\}[\s\S]*recentOwnerEmail=\{recentOwnerEmail\}/,
  );
});

test("go-live drill panel reflects delivery-track status in drill summary and handoff steps", async () => {
  const panelPath = path.resolve(testDir, "../../components/go-live/mock-go-live-drill-panel.tsx");
  const source = await readSource(panelPath);

  assert.match(source, /import type \{ ControlPlaneDeliveryTrackSection \} from "@\/lib\/control-plane-types";/);
  assert.match(source, /import \{ fetchCurrentWorkspace, fetchWorkspaceDeliveryTrack \} from "@\/services\/control-plane";/);
  assert.match(source, /const deliveryTrackQueryKey = \["workspace-delivery-track", workspaceSlug\];/);
  assert.match(source, /const \{ data: deliveryTrack \} = useQuery\(\{/);
  assert.match(source, /queryKey: deliveryTrackQueryKey,/);
  assert.match(source, /queryFn: fetchWorkspaceDeliveryTrack,/);
  assert.match(source, /const verificationDelivery = deliveryTrack\?\.verification \?\? null;/);
  assert.match(source, /const goLiveDelivery = deliveryTrack\?\.go_live \?\? null;/);
  assert.match(source, /function drillStateFromDeliverySection\(/);
  assert.match(source, /function deliveryStatusLabel\(/);
  assert.match(source, /function hasDeliverySectionNotes\(/);
  assert.match(source, /function hasDeliverySectionEvidence\(/);
  assert.match(source, /function goLiveEvidenceSummary\(/);
  assert.match(source, /const hasGoLiveEvidenceLinks = \(goLiveDelivery\?\.evidence_links\.length \?\? 0\) > 0;/);
  assert.match(source, /const hasGoLiveNotes = hasDeliverySectionNotes\(goLiveDelivery\);/);
  assert.match(source, /const hasGoLiveEvidenceRecord = hasDeliverySectionEvidence\(goLiveDelivery\);/);
  assert.match(
    source,
    /state:\s*drillStateFromDeliverySection\(verificationDelivery\) \?\?[\s\S]*onboarding\?\.checklist\.demo_run_created \? "ready" : "attention"/s,
  );
  assert.match(
    source,
    /state:\s*goLiveDelivery\?\.status === "complete" \|\| hasGoLiveEvidenceLinks\s*\?\s*"ready"\s*:\s*hasGoLiveNotes \|\| onboarding\?\.checklist\.demo_run_created/s,
  );
  assert.match(
    source,
    /state:\s*goLiveDelivery\?\.status === "complete"\s*\?\s*"ready"\s*:\s*goLiveDelivery\?\.status === "in_progress"[\s\S]*hasGoLiveEvidenceRecord/s,
  );
  assert.match(source, /Verification track/);
  assert.match(source, /Go-live track/);
  assert.match(source, /Go-live evidence/);
  assert.match(source, /Notes recorded, links still missing/);
  assert.match(source, /No notes or evidence links recorded/);
  assert.match(source, /evidenceLinkCount === 1 \? "link" : "links"/);
  assert.match(source, /evidence \$\{evidenceLinkCount === 1 \? "link" : "links"\} recorded/);
});
