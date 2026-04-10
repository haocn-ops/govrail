import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const verificationPagePath = path.resolve(testDir, "../../app/(console)/verification/page.tsx");
const goLivePagePath = path.resolve(testDir, "../../app/(console)/go-live/page.tsx");
const goLivePanelPath = path.resolve(testDir, "../../components/go-live/mock-go-live-drill-panel.tsx");
const settingsPagePath = path.resolve(testDir, "../../app/(console)/settings/page.tsx");
const settingsPanelPath = path.resolve(testDir, "../../components/settings/workspace-settings-panel.tsx");
const handoffHelperPath = path.resolve(testDir, "../../lib/console-handoff.ts");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Verification page keeps console handoff helper contract and admin return continuity", async () => {
  const source = await readSource(verificationPagePath);

  assert.match(
    source,
    /import \{\s*buildConsoleAdminReturnHref,\s*buildConsoleAdminReturnState,\s*buildConsoleRunAwareHandoffHref,\s*buildConsoleVerificationChecklistHandoffArgs,\s*buildRecentDeliveryDescription,\s*buildRecentDeliveryMetadata,\s*parseConsoleHandoffState,\s*\} from "@\/lib\/console-handoff";/s,
  );
  assert.match(source, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(source, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /const recentDeliveryMetadata = buildRecentDeliveryMetadata\(handoff\);/);
  assert.match(source, /const handoffHrefArgs = buildConsoleVerificationChecklistHandoffArgs\(runAwareHandoff\);/);
  assert.match(source, /recentOwnerDisplayName=\{handoff\.recentOwnerDisplayName\}/);
  assert.match(source, /recentOwnerEmail=\{handoff\.recentOwnerEmail\}/);
  assert.match(source, /auditReceiptFilename=\{handoff\.auditReceiptFilename\}/);
  assert.match(source, /auditReceiptExportedAt=\{handoff\.auditReceiptExportedAt\}/);
  assert.match(source, /auditReceiptSha256=\{handoff\.auditReceiptSha256\}/);
  assert.match(source, /<Week8VerificationChecklist[\s\S]*runId=\{activeRunId\}/);
  assert.match(
    source,
    /<WorkspaceDeliveryTrackPanel[\s\S]*runId=\{activeRunId\}[\s\S]*recentOwnerLabel=\{handoff\.recentOwnerLabel\}[\s\S]*recentOwnerDisplayName=\{handoff\.recentOwnerDisplayName\}[\s\S]*recentOwnerEmail=\{handoff\.recentOwnerEmail\}[\s\S]*auditReceiptFilename=\{handoff\.auditReceiptFilename\}[\s\S]*auditReceiptExportedAt=\{handoff\.auditReceiptExportedAt\}[\s\S]*auditReceiptSha256=\{handoff\.auditReceiptSha256\}/,
  );
  assert.match(
    source,
    /const adminReturnState = buildConsoleAdminReturnState\(\{\s*source: handoff\.source,\s*surface: handoff\.surface,\s*expectedSurface: "verification",\s*recentTrackKey: handoff\.recentTrackKey,\s*\}\);/s,
  );
  assert.match(
    source,
    /const adminReturnHref = buildConsoleAdminReturnHref\(\{\s*pathname: "\/admin",\s*handoff: runAwareHandoff,\s*workspaceSlug: workspaceContext\.workspace\.slug,\s*queueSurface: adminReturnState\.adminQueueSurface,\s*\}\);/s,
  );

  assert.match(source, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    source,
    /const followUpSource =\s*adminReturnState\.showAttentionHandoff\s*\?\s*"admin-attention"\s*:\s*adminReturnState\.showReadinessHandoff\s*\?\s*"admin-readiness"\s*:\s*null;/s,
  );
  assert.match(source, /<ConsoleAdminFollowUp[\s\S]*payload=\{/);
  assert.match(source, /source: followUpSource/);
  assert.match(source, /surface="verification"/);
  assert.match(source, /\{adminReturnState\.showAdminReturn \? \(/);
  assert.match(source, /href=\{adminReturnHref\}/);
  assert.match(source, /\{adminReturnState\.adminReturnLabel\}/);

  assert.match(source, /<WorkspaceContextSurfaceNotice[\s\S]*surfaceLabel="Verification"/);
  assert.match(
    source,
    /sessionHref=\{buildConsoleRunAwareHandoffHref\("\/session", handoff, activeRunId\)\}/,
  );
  assert.match(source, /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}/);
});

test("Verification page keeps explicit go_live continuation link contract", async () => {
  const [source, checklistSource, settingsSource, settingsPanelSource] = await Promise.all([
    readSource(verificationPagePath),
    readSource(path.resolve(testDir, "../../components/verification/week8-verification-checklist.tsx")),
    readSource(settingsPagePath),
    readSource(settingsPanelPath),
  ]);

  assert.match(source, /import \{ buildVerificationChecklistHandoffHref \} from "@\/lib\/handoff-query";/);
  assert.match(source, /<CardTitle>Verification evidence lane<\/CardTitle>/);
  assert.match(source, /buildVerificationChecklistHandoffHref\(\{ pathname: "\/settings\?intent=manage-plan", \.\.\.handoffHrefArgs \}\)/);
  assert.match(source, />\s*Review settings \+ billing\s*<\/Link>/);
  assert.match(source, /buildVerificationChecklistHandoffHref\(\{ pathname: "\/go-live\?surface=go_live", \.\.\.handoffHrefArgs \}\)/);
  assert.match(source, />\s*Continue to go-live drill\s*<\/Link>/);
  assert.match(checklistSource, /<CardTitle>Latest demo run context<\/CardTitle>/);
  assert.match(checklistSource, /runId\?: string \| null;/);
  assert.match(checklistSource, /const activeRunId = latestDemoRun\?\.run_id \?\? runId \?\? null;/);
  assert.match(checklistSource, /runId: activeRunId,/);
  assert.match(checklistSource, /import \{ AuditExportReceiptCallout \} from "@\/components\/audit-export-receipt-callout";/);
  assert.match(checklistSource, /import \{ resolveAuditExportReceiptSummary \} from "@\/lib\/audit-export-receipt";/);
  assert.match(checklistSource, /auditReceiptFilename\?: string \| null;/);
  assert.match(checklistSource, /const auditExportReceipt = resolveAuditExportReceiptSummary\(/);
  assert.match(checklistSource, /<AuditExportReceiptCallout[\s\S]*title="Audit export continuity"/);
  assert.match(
    checklistSource,
    /const buildRunAwareChecklistHref = \(pathname: string\): string =>\s*buildVerificationChecklistHandoffHref\(\{ pathname, \.\.\.handoffHrefArgs, runId: activeRunId \}\);/s,
  );
  assert.match(
    checklistSource,
    /buildSettingsIntentHref\("manage-plan", normalizedSource, activeRunId,/,
  );
  assert.match(checklistSource, /href=\{buildRunAwareChecklistHref\(primarySurface\)\}/);
  assert.match(checklistSource, /href=\{buildRunAwareChecklistHref\("\/artifacts"\)\}/);
  assert.match(checklistSource, /href=\{buildRunAwareChecklistHref\("\/settings\?intent=rollback"\)\}/);
  assert.match(checklistSource, /href="#verification-delivery-track"/);
  assert.match(checklistSource, /Review delivery tracking below/);
  assert.match(checklistSource, /import \{ buildRecentDeliveryDescription \} from "@\/lib\/console-handoff";/);
  assert.match(
    checklistSource,
    /const recentDeliveryMetadata = \{[\s\S]*recentTrackKey: normalizedRecentTrackKey,[\s\S]*recentUpdateKind: normalizedRecentUpdateKind,[\s\S]*recentEvidenceCount: evidenceCount \?\? null,[\s\S]*recentOwnerLabel: recentOwnerDisplayName \?\? recentOwnerLabel \?\? recentOwnerEmail \?\? null,[\s\S]*\};/s,
  );
  assert.match(
    checklistSource,
    /const hasRecentDeliveryMetadata =[\s\S]*recentDeliveryMetadata\.recentTrackKey !== null[\s\S]*recentDeliveryMetadata\.recentUpdateKind !== null[\s\S]*recentDeliveryMetadata\.recentEvidenceCount !== null[\s\S]*recentDeliveryMetadata\.recentOwnerLabel !== null;/s,
  );
  assert.match(
    checklistSource,
    /const recentDeliverySummary = hasRecentDeliveryMetadata[\s\S]*buildRecentDeliveryDescription\(\s*"Keep verification notes aligned before moving to go-live\.",[\s\S]*recentDeliveryMetadata,[\s\S]*\)\s*:\s*null;/s,
  );
  assert.match(checklistSource, /recentDeliverySummary \? \(/);
  assert.match(checklistSource, /<CardTitle>Recent delivery handoff<\/CardTitle>/);
  assert.match(checklistSource, /<p className="text-muted">\{recentDeliverySummary\}<\/p>/);
  assert.match(source, /<div id="verification-delivery-track">[\s\S]*<WorkspaceDeliveryTrackPanel/s);
  assert.match(settingsSource, /type SettingsIntent = "upgrade" \| "manage-plan" \| "resolve-billing" \| "rollback" \| null;/);
  assert.match(settingsSource, /candidate === "rollback"/);
  assert.match(settingsPanelSource, /title: "Rollback guidance intent"/);
  assert.match(settingsPanelSource, /\{ label: "Retry playground run", href: playgroundHref \}/);
  assert.match(settingsPanelSource, /\{ label: "Capture recovery evidence", href: verificationHref \}/);
});

test("Go-live page keeps console handoff helper contract and explicit surface query continuity", async () => {
  const source = await readSource(goLivePagePath);

  assert.match(
    source,
    /import \{\s*buildConsoleAdminReturnHref,\s*buildConsoleAdminReturnState,\s*buildConsoleRunAwareHandoffHref,\s*buildRecentDeliveryDescription,\s*buildRecentDeliveryMetadata,\s*parseConsoleHandoffState,\s*\} from "@\/lib\/console-handoff";/s,
  );
  assert.match(source, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(source, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /const goLiveMetadata = buildRecentDeliveryMetadata\(handoff\);/);
  assert.match(
    source,
    /const adminReturnState = buildConsoleAdminReturnState\(\{\s*source: handoff\.source,\s*surface: handoff\.surface,\s*expectedSurface: "go_live",\s*recentTrackKey: handoff\.recentTrackKey,\s*\}\);/s,
  );
  assert.match(source, /const verificationHref = buildConsoleRunAwareHandoffHref\("\/verification\?surface=verification", handoff, activeRunId\);/);
  assert.match(source, /const usageHref = buildConsoleRunAwareHandoffHref\("\/usage", handoff, activeRunId\);/);
  assert.match(source, /const billingSettingsHref = buildConsoleRunAwareHandoffHref\("\/settings\?intent=manage-plan", handoff, activeRunId\);/);
  assert.match(source, /const upgradeSettingsHref = buildConsoleRunAwareHandoffHref\("\/settings\?intent=upgrade", handoff, activeRunId\);/);
  assert.match(source, /const playgroundHref = buildConsoleRunAwareHandoffHref\("\/playground", handoff, activeRunId\);/);
  assert.match(source, /const artifactsHref = buildConsoleRunAwareHandoffHref\("\/artifacts", handoff, activeRunId\);/);
  assert.match(source, /const deliveryTrackHref = "#go-live-delivery-track";/);
  assert.match(source, /href=\{billingSettingsHref\}[\s\S]*?>\s*Review billing \+ settings\s*<\/Link>/s);
  assert.match(source, /href=\{upgradeSettingsHref\}[\s\S]*?> Settings upgrade intent<\/Link>/s);
  assert.match(source, /<Link href=\{deliveryTrackHref\}>delivery tracker here<\/Link>/);
  assert.match(source, /<div id="go-live-delivery-track">[\s\S]*<WorkspaceDeliveryTrackPanel/s);
  assert.match(
    source,
    /<WorkspaceDeliveryTrackPanel[\s\S]*runId=\{activeRunId\}[\s\S]*recentOwnerLabel=\{recentOwnerLabel\}[\s\S]*recentOwnerDisplayName=\{recentOwnerDisplayName\}[\s\S]*recentOwnerEmail=\{recentOwnerEmail\}[\s\S]*auditReceiptFilename=\{handoff\.auditReceiptFilename\}[\s\S]*auditReceiptExportedAt=\{handoff\.auditReceiptExportedAt\}[\s\S]*auditReceiptSha256=\{handoff\.auditReceiptSha256\}/,
  );
  assert.match(
    source,
    /const adminReturnHref = buildConsoleAdminReturnHref\(\{\s*pathname: "\/admin",\s*handoff: runAwareHandoff,\s*workspaceSlug: workspaceContext\.workspace\.slug,\s*queueSurface: adminReturnState\.adminQueueSurface,\s*\}\);/s,
  );
  assert.match(source, /const adminHref = adminReturnState\.showAdminReturn \? adminReturnHref : "\/admin";/);
  assert.match(
    source,
    /const adminLinkLabel = adminReturnState\.showAdminReturn \? adminReturnState\.adminReturnLabel : "Admin overview";/,
  );
  assert.match(source, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    source,
    /const followUpSource =\s*adminReturnState\.showAttentionHandoff\s*\?\s*"admin-attention"\s*:\s*adminReturnState\.showReadinessHandoff\s*\?\s*"admin-readiness"\s*:\s*null;/s,
  );

  assert.match(source, /<WorkspaceContextSurfaceNotice[\s\S]*surfaceLabel="Go-live drill"/);
  assert.match(source, /sessionHref=\{buildConsoleRunAwareHandoffHref\("\/session", handoff, activeRunId\)\}/);
  assert.match(source, /<ConsoleAdminFollowUp[\s\S]*payload=\{/);
  assert.match(source, /source: followUpSource/);
  assert.match(source, /surface="go_live"/);
  assert.match(source, /\{adminReturnState\.showAdminReturn \? \(/);
  assert.match(source, /\{adminReturnState\.adminReturnLabel\}/);
});

test("Delivery description stitching stays centralized in console handoff helper", async () => {
  const [verificationSource, goLiveSource, helperSource] = await Promise.all([
    readSource(verificationPagePath),
    readSource(goLivePagePath),
    readSource(handoffHelperPath),
  ]);

  assert.match(verificationSource, /const recentDeliveryMetadata = buildRecentDeliveryMetadata\(handoff\);/);
  assert.match(verificationSource, /const verificationDeliveryDescription = buildRecentDeliveryDescription\(/);
  assert.match(goLiveSource, /const goLiveMetadata = buildRecentDeliveryMetadata\(handoff\);/);
  assert.match(goLiveSource, /const goLiveDeliveryDescription = buildRecentDeliveryDescription\(/);

  assert.match(helperSource, /const parts: string\[\] = \[\];/);
  assert.match(helperSource, /const trackLabel = formatTrackLabel\(metadata\.recentTrackKey\);/);
  assert.match(helperSource, /const updateLabel = describeUpdateKind\(metadata\.recentUpdateKind\);/);
  assert.match(
    helperSource,
    /`\$\{metadata\.recentEvidenceCount\} evidence \$\{metadata\.recentEvidenceCount === 1 \? "item" : "items"\}`/,
  );
  assert.match(helperSource, /parts\.push\(`handled by \$\{metadata\.recentOwnerLabel\}`\);/);
  assert.match(helperSource, /return `\$\{base\} Latest admin handoff: \$\{parts\.join\(" · "\)\}\.`;/);
});

test("Go-live drill panel keeps verification handoff link surface semantics for admin-attention continuity", async () => {
  const source = await readSource(goLivePanelPath);

  assert.match(
    source,
    /import \{ buildAdminReturnHref, buildVerificationChecklistHandoffHref \} from "@\/lib\/handoff-query";/,
  );
  assert.match(source, /type DeliveryContext = "recent_activity" \| "week8";/);
  assert.match(source, /return value === "recent_activity" \|\| value === "week8" \? value : null;/);
  assert.match(source, /recentOwnerDisplayName\?: string \| null;/);
  assert.match(source, /recentOwnerEmail\?: string \| null;/);
  assert.match(source, /const latestDemoRun = onboarding\?\.latest_demo_run \?\? null;/);
  assert.match(source, /runId\?: string \| null;/);
  assert.match(source, /const activeRunId = latestDemoRun\?\.run_id \?\? runId \?\? null;/);
  assert.match(
    source,
    /const adminReturnLabel =\s*normalizedSource === "admin-attention"\s*\?\s*"Return to admin queue"\s*:\s*normalizedSource === "admin-readiness"\s*\?\s*"Return to admin readiness view"\s*:\s*"Return to admin overview";/s,
  );
  assert.match(source, /recentOwnerDisplayName,/);
  assert.match(source, /recentOwnerEmail,/);
  assert.match(source, /auditReceiptFilename\?: string \| null;/);
  assert.match(source, /auditReceiptExportedAt\?: string \| null;/);
  assert.match(source, /auditReceiptSha256\?: string \| null;/);
  assert.match(source, /runId: activeRunId,/);
  assert.match(source, /href: buildHref\("\/verification\?surface=verification"\),/);
  assert.match(source, /<CardTitle>Audit export continuity<\/CardTitle>/);
  assert.match(source, /const auditExportReceipt = resolveAuditExportReceiptSummary\(/);
  assert.match(source, /<AuditExportReceiptCallout[\s\S]*Carry the same receipt into go-live notes and the admin handoff/s);
  assert.match(
    source,
    /Before closing the drill, reopen the Latest export receipt from \/settings and confirm the same filename,/,
  );
  assert.match(source, /Reopen audit export receipt/);
  assert.match(source, /Reopen verification evidence/);
  assert.match(source, /\{adminReturnLabel\}/);
  assert.match(
    source,
    /Navigation only: these links preserve workspace context, but they do not attach the receipt automatically or/,
  );
  assert.match(source, /title: "Admin return path reviewed"/);
  assert.match(source, /matching admin follow-up lane/);
});
