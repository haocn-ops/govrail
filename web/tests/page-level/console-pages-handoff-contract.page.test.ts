import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const adminPagePath = path.resolve(testDir, "../../app/(console)/admin/page.tsx");
const agentsPagePath = path.resolve(testDir, "../../app/(console)/agents/page.tsx");
const artifactsPagePath = path.resolve(testDir, "../../app/(console)/artifacts/page.tsx");
const dashboardPagePath = path.resolve(testDir, "../../app/(console)/page.tsx");
const egressPagePath = path.resolve(testDir, "../../app/(console)/egress/page.tsx");
const logsPagePath = path.resolve(testDir, "../../app/(console)/logs/page.tsx");
const membersPagePath = path.resolve(testDir, "../../app/(console)/members/page.tsx");
const onboardingPagePath = path.resolve(testDir, "../../app/(console)/onboarding/page.tsx");
const apiKeysPagePath = path.resolve(testDir, "../../app/(console)/api-keys/page.tsx");
const serviceAccountsPagePath = path.resolve(testDir, "../../app/(console)/service-accounts/page.tsx");
const settingsPagePath = path.resolve(testDir, "../../app/(console)/settings/page.tsx");
const tasksPagePath = path.resolve(testDir, "../../app/(console)/tasks/page.tsx");
const adminFocusBarPath = path.resolve(testDir, "../../components/admin/admin-focus-bar.tsx");
const adminFollowUpNoticePath = path.resolve(testDir, "../../components/admin/admin-follow-up-notice.tsx");
const consoleAdminFollowUpPath = path.resolve(testDir, "../../components/admin/console-admin-follow-up.tsx");
const adminReadinessReturnBannerPath = path.resolve(testDir, "../../components/admin/admin-readiness-return-banner.tsx");
const verificationChecklistPath = path.resolve(testDir, "../../components/verification/week8-verification-checklist.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

function assertMatchesAny(source: string, patterns: RegExp[], message: string): void {
  assert.ok(
    patterns.some((pattern) => pattern.test(source)),
    `${message}: expected one of ${patterns.map((pattern) => pattern.toString()).join(" | ")}`,
  );
}

test("Artifacts and logs pages keep shared handoff helper usage and run_id continuity contract", async () => {
  const artifactsSource = await readSource(artifactsPagePath);
  const logsSource = await readSource(logsPagePath);

  assert.match(
    artifactsSource,
    /import \{[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(
    logsSource,
    /import \{[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/,
  );

  assert.match(artifactsSource, /const activeRunId = requestedRunId \?\? workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(artifactsSource, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(logsSource, /const activeRunId = requestedRunId \?\? workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(logsSource, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(artifactsSource, /href=\{buildConsoleRunAwareHandoffHref\(link\.path, runAwareHandoff, activeRunId\)\}/);
  assert.match(logsSource, /href=\{buildConsoleRunAwareHandoffHref\(link\.path, runAwareHandoff, activeRunId\)\}/);
  assert.doesNotMatch(artifactsSource, /function buildArtifactsHandoffHref\(/);
  assert.doesNotMatch(logsSource, /function buildLogsHandoffHref\(/);
  assert.doesNotMatch(artifactsSource, /function appendRunIdToHref\(/);
  assert.doesNotMatch(logsSource, /function appendRunIdToHref\(/);
});

test("Agents and egress pages keep shared governance continuity with console handoff state", async () => {
  const [agentsSource, egressSource, consoleAdminFollowUpSource] = await Promise.all([
    readSource(agentsPagePath),
    readSource(egressPagePath),
    readSource(consoleAdminFollowUpPath),
  ]);

  assert.match(
    agentsSource,
    /import \{[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*buildConsoleAdminLinkState,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(agentsSource, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(agentsSource, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(agentsSource, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(agentsSource, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(agentsSource, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(agentsSource, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(
    agentsSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="agents"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(agentsSource, /surface="agents"/);
  assert.match(agentsSource, /href=\{buildConsoleRunAwareHandoffHref\(link\.path,\s*handoff,\s*activeRunId\)\}/);
  assert.match(agentsSource, /const adminLinkState = buildConsoleAdminLinkState\(/);
  assert.match(agentsSource, /handoff: runAwareHandoff,/);
  assert.match(agentsSource, /runId: activeRunId,/);
  assert.match(agentsSource, /href=\{adminLinkState.adminHref\}/);
  assert.match(agentsSource, />\s*\{adminLinkState\.adminLinkLabel\}\s*</);
  assert.match(agentsSource, /Navigation-only manual relay/);

  assert.match(egressSource, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    egressSource,
    /import \{[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*buildConsoleAdminLinkState,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(
    egressSource,
    /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/,
  );
  assert.match(egressSource, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(
    egressSource,
    /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/,
  );
  assert.match(egressSource, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(egressSource, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(
    egressSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="egress"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(egressSource, /surface="egress"/);
  assert.match(egressSource, /buildConsoleRunAwareHandoffHref\("\/settings\?intent=upgrade", handoff, activeRunId\)/);
  assert.match(egressSource, /buildConsoleRunAwareHandoffHref\("\/verification\?surface=verification", handoff, activeRunId\)/);
  assert.match(egressSource, /buildConsoleRunAwareHandoffHref\("\/go-live\?surface=go_live", handoff, activeRunId\)/);
  assert.match(egressSource, /const adminLinkState = buildConsoleAdminLinkState\(/);
  assert.match(egressSource, /handoff: runAwareHandoff,/);
  assert.match(egressSource, /adminLinkState\.showAdminReturn/);
  assert.match(egressSource, /href=\{adminLinkState.adminHref\}/);
  assert.match(egressSource, />\s*\{adminLinkState\.adminLinkLabel\}\s*</);
  assert.match(egressSource, /Navigation-only manual relay/);

  assert.match(
    consoleAdminFollowUpSource,
    /import \{\s*AdminFollowUpNotice,\s*type AdminFollowUpSurface,\s*\} from "@\/components\/admin\/admin-follow-up-notice";/s,
  );
  assert.match(
    consoleAdminFollowUpSource,
    /import \{\s*buildConsoleAdminFollowUpPayload,\s*type ConsoleAdminFollowUpPayload,\s*type ConsoleHandoffState,\s*\} from "@\/lib\/console-handoff";/s,
  );
  assert.match(consoleAdminFollowUpSource, /payload:\s*payloadOverride,/);
  assert.match(consoleAdminFollowUpSource, /const defaultPayload = buildConsoleAdminFollowUpPayload\(\{/);
  assert.match(
    consoleAdminFollowUpSource,
    /const payload = payloadOverride\s*\?\s*\{[\s\S]*\.\.\.\(defaultPayload \?\? \{\}\),[\s\S]*\.\.\.payloadOverride,[\s\S]*ownerDisplayName: payloadOverride\.ownerDisplayName \?\? defaultPayload\?\.ownerDisplayName \?\? null,[\s\S]*ownerEmail: payloadOverride\.ownerEmail \?\? defaultPayload\?\.ownerEmail \?\? null,[\s\S]*\}\s*:\s*defaultPayload;/s,
  );
  assert.match(consoleAdminFollowUpSource, /buildConsoleAdminFollowUpPayload\(\{/);
  assert.match(consoleAdminFollowUpSource, /handoff,/);
  assert.match(consoleAdminFollowUpSource, /ownerDisplayName = handoff\.recentOwnerDisplayName \?\? handoff\.recentOwnerLabel/);
  assert.match(consoleAdminFollowUpSource, /ownerEmail = handoff\.recentOwnerEmail/);
  assert.match(consoleAdminFollowUpSource, /if \(!payload\) \{/);
  assert.match(consoleAdminFollowUpSource, /surface=\{surface\}/);
  assert.match(consoleAdminFollowUpSource, /workspaceSlug=\{workspaceSlug\}/);
  assert.match(consoleAdminFollowUpSource, /sourceWorkspaceSlug=\{handoff\.attentionWorkspace\}/);
  assert.match(consoleAdminFollowUpSource, /runId=\{handoff\.runId\}/);
  assert.match(consoleAdminFollowUpSource, /auditReceiptFilename=\{handoff\.auditReceiptFilename\}/);
  assert.match(consoleAdminFollowUpSource, /auditReceiptExportedAt=\{handoff\.auditReceiptExportedAt\}/);
  assert.match(consoleAdminFollowUpSource, /auditReceiptFromDate=\{handoff\.auditReceiptFromDate\}/);
  assert.match(consoleAdminFollowUpSource, /auditReceiptToDate=\{handoff\.auditReceiptToDate\}/);
  assert.match(consoleAdminFollowUpSource, /auditReceiptSha256=\{handoff\.auditReceiptSha256\}/);
  assert.match(consoleAdminFollowUpSource, /\{\.\.\.payload\}/);

  const adminFollowUpNoticeSource = await readSource(adminFollowUpNoticePath);
  assert.match(adminFollowUpNoticeSource, /import \{ AuditExportReceiptCallout \} from "@\/components\/audit-export-receipt-callout";/);
  assert.match(adminFollowUpNoticeSource, /import \{ resolveAuditExportReceiptSummary \} from "@\/lib\/audit-export-receipt";/);
  assert.match(adminFollowUpNoticeSource, /auditReceiptFilename\?: string \| null;/);
  assert.match(adminFollowUpNoticeSource, /auditReceiptExportedAt\?: string \| null;/);
  assert.match(adminFollowUpNoticeSource, /auditReceiptFromDate\?: string \| null;/);
  assert.match(adminFollowUpNoticeSource, /auditReceiptToDate\?: string \| null;/);
  assert.match(adminFollowUpNoticeSource, /auditReceiptSha256\?: string \| null;/);
  assert.match(adminFollowUpNoticeSource, /const auditExportReceipt = resolveAuditExportReceiptSummary\(\{/);
  assert.match(adminFollowUpNoticeSource, /<AuditExportReceiptCallout[\s\S]*title="Audit export continuity"/s);
  assert.match(
    adminFollowUpNoticeSource,
    /Keep the same receipt visible in the admin handoff so the final queue or readiness review cites the same export already used in verification and go-live\./,
  );
});

test("Launchpad and tasks pages keep audit-export continuity on shared console handoff state", async () => {
  const [dashboardSource, tasksSource] = await Promise.all([
    readSource(dashboardPagePath),
    readSource(tasksPagePath),
  ]);

  assert.match(dashboardSource, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(dashboardSource, /import \{ Card, CardContent, CardHeader, CardTitle \} from "@\/components\/ui\/card";/);
  assert.match(
    dashboardSource,
    /import \{[\s\S]*buildConsoleAdminLinkState,[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(dashboardSource, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(dashboardSource, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(
    dashboardSource,
    /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/,
  );
  assert.match(dashboardSource, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(dashboardSource, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(dashboardSource, /const adminLinkState = buildConsoleAdminLinkState\(/);
  assert.match(dashboardSource, /handoff: runAwareHandoff,/);
  assert.match(dashboardSource, /runId: activeRunId,/);
  assert.match(
    dashboardSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="launchpad"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(dashboardSource, /surface="launchpad"/);
  assert.match(
    dashboardSource,
    /href=\{buildConsoleRunAwareHandoffHref\(link\.path, runAwareHandoff, activeRunId\)\}/,
  );
  assert.match(dashboardSource, /href=\{adminLinkState.adminHref\}/);
  assert.match(dashboardSource, />\s*\{adminLinkState\.adminLinkLabel\}\s*</);
  assert.match(dashboardSource, /Latest export receipt/);

  assert.match(tasksSource, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    tasksSource,
    /import \{[\s\S]*buildConsoleAdminLinkState,[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(tasksSource, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(tasksSource, /const runAwareHandoff = \{ \.\.\.handoff, runId \};/);
  assert.match(tasksSource, /const adminLinkState = buildConsoleAdminLinkState\(\{/);
  assert.match(
    tasksSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="tasks"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(tasksSource, /surface="tasks"/);
  assert.match(tasksSource, /buildConsoleRunAwareHandoffHref\("\/logs", runAwareHandoff, run\.run_id\)/);
  assert.match(tasksSource, /buildConsoleRunAwareHandoffHref\("\/artifacts", runAwareHandoff, run\.run_id\)/);
  assert.match(
    tasksSource,
    /buildConsoleRunAwareHandoffHref\(\s*"\/verification\?surface=verification",\s*runAwareHandoff,\s*runId,\s*\)/s,
  );
  assert.match(tasksSource, /handoff: runAwareHandoff,/);
  assert.match(tasksSource, /const adminHref = adminLinkState\.adminHref;/);
  assert.match(tasksSource, /href=\{adminHref\}/);
  assert.match(tasksSource, />\s*\{adminLinkState\.adminLinkLabel\}\s*</);
  assert.doesNotMatch(tasksSource, /function buildTasksHandoffHref\(/);
  assert.match(tasksSource, /Latest export receipt/);
});

test("Admin follow-up notice keeps shared admin-return continuity across week8 and recent-activity contexts", async () => {
  const source = await readSource(adminFollowUpNoticePath);

  assert.match(
    source,
    /function normalizeDeliveryContext\(value\?: string \| null\): "recent_activity" \| "week8" \| null \{/,
  );
  assert.match(source, /return value === "recent_activity" \|\| value === "week8" \? value : null;/);
  assert.match(source, /const normalizedDeliveryContext = normalizeDeliveryContext\(deliveryContext\);/);
  assert.match(source, /deliveryContext: deliveryContext \?\? null,/);
  assert.match(
    source,
    /const returnHref = buildAdminReturnHref\("\/admin", \{[\s\S]*source,[\s\S]*queueSurface,[\s\S]*week8Focus,[\s\S]*attentionWorkspace: returnWorkspaceSlug,[\s\S]*attentionOrganization,[\s\S]*deliveryContext: normalizedDeliveryContext,[\s\S]*recentTrackKey: normalizedRecentTrackKey,[\s\S]*recentUpdateKind: normalizedRecentUpdateKind,[\s\S]*evidenceCount: normalizedEvidenceCount,[\s\S]*recentOwnerLabel,[\s\S]*recentOwnerDisplayName: ownerDisplayName \?\? null,[\s\S]*recentOwnerEmail: ownerEmail \?\? null,[\s\S]*\}\);/s,
  );
});

test("Artifacts and logs pages keep verification/go-live/logs/settings link mapping on shared handoff args", async () => {
  const artifactsSource = await readSource(artifactsPagePath);
  const logsSource = await readSource(logsPagePath);

  assert.match(artifactsSource, /\{ label: "Continue to verification", path: "\/verification\?surface=verification" \}/);
  assert.match(artifactsSource, /\{ label: "Inspect go-live drill", path: "\/go-live\?surface=go_live" \}/);
  assert.match(artifactsSource, /\{ label: "Review logs", path: "\/logs" \}/);
  assert.match(artifactsSource, /\{ label: "Inspect settings handoff", path: "\/settings" \}/);
  assert.match(artifactsSource, /href=\{buildConsoleRunAwareHandoffHref\(link\.path, runAwareHandoff, activeRunId\)\}/);
  assert.match(artifactsSource, /href=\{buildConsoleRunAwareHandoffHref\("\/playground", runAwareHandoff, activeRunId\)\}/);

  assert.match(logsSource, /\{ label: "Review artifacts", path: "\/artifacts" \}/);
  assert.match(logsSource, /\{ label: "Capture verification evidence", path: "\/verification\?surface=verification" \}/);
  assert.match(logsSource, /\{ label: "Continue the go-live drill", path: "\/go-live\?surface=go_live" \}/);
  assert.match(logsSource, /\{ label: "Review settings handoff", path: "\/settings" \}/);
  assert.match(logsSource, /href=\{buildConsoleRunAwareHandoffHref\(link\.path, runAwareHandoff, activeRunId\)\}/);
});

test("Members and service-accounts pages keep shared handoff helper and onboarding continuation mapping", async () => {
  const membersSource = await readSource(membersPagePath);
  const apiKeysSource = await readSource(apiKeysPagePath);
  const serviceAccountsSource = await readSource(serviceAccountsPagePath);

  assert.match(
    membersSource,
    /import \{ buildConsoleHandoffHref, parseConsoleHandoffState \} from "@\/lib\/console-handoff";/,
  );
  assert.match(apiKeysSource, /import \{ buildConsoleHandoffHref, parseConsoleHandoffState \} from "@\/lib\/console-handoff";/);
  assert.match(membersSource, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(apiKeysSource, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(
    serviceAccountsSource,
    /import \{[\s\S]*buildConsoleHandoffHref,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(serviceAccountsSource, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);

  assert.match(membersSource, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(membersSource, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(membersSource, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(membersSource, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(membersSource, /href=\{buildConsoleHandoffHref\("\/accept-invitation", runAwareHandoff\)\}/);
  assert.match(membersSource, /href=\{buildConsoleHandoffHref\("\/session", runAwareHandoff\)\}/);
  assert.match(membersSource, /href=\{buildConsoleHandoffHref\("\/service-accounts", runAwareHandoff\)\}/);
  assert.match(membersSource, /<CardTitle>Manual onboarding handoff<\/CardTitle>/);
  assert.match(membersSource, /Self-serve invite lane/);

  assert.match(apiKeysSource, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(apiKeysSource, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(apiKeysSource, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(apiKeysSource, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(apiKeysSource, /const serviceAccountsHref = buildConsoleHandoffHref\("\/service-accounts", runAwareHandoff\);/);
  assert.match(apiKeysSource, /const verificationHref = buildConsoleHandoffHref\("\/verification\?surface=verification", runAwareHandoff\);/);
  assert.match(apiKeysSource, /recentOwnerLabel=\{recentOwnerLabel\}/);

  assert.match(serviceAccountsSource, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(
    serviceAccountsSource,
    /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/,
  );
  assert.match(serviceAccountsSource, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(serviceAccountsSource, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(
    serviceAccountsSource,
    /const apiKeysHref = build(?:Console|ServiceAccounts)HandoffHref\("\/api-keys",\s*runAwareHandoff\);/,
  );
  assert.match(
    serviceAccountsSource,
    /function buildServiceAccountsHandoffHref\(pathname: string, handoff: ConsoleHandoffState\): string \{/,
  );
  assert.match(serviceAccountsSource, /recentTrackKey=\{recentTrackKey\}/);
  assert.match(serviceAccountsSource, /recentUpdateKind=\{runAwareHandoff\.recentUpdateKind\}/);
  assert.match(serviceAccountsSource, /evidenceCount=\{runAwareHandoff\.evidenceCount\}/);
  assert.match(serviceAccountsSource, /recentOwnerLabel=\{runAwareHandoff\.recentOwnerLabel\}/);
});

test("Console pages keep onboarding/admin-readiness/admin-attention source wiring aligned with follow-up metadata", async () => {
  const artifactsSource = await readSource(artifactsPagePath);
  const logsSource = await readSource(logsPagePath);
  const agentsSource = await readSource(agentsPagePath);
  const egressSource = await readSource(egressPagePath);
  const membersSource = await readSource(membersPagePath);
  const onboardingSource = await readSource(onboardingPagePath);
  const apiKeysSource = await readSource(apiKeysPagePath);
  const serviceAccountsSource = await readSource(serviceAccountsPagePath);
  const settingsSource = await readSource(settingsPagePath);
  const consoleAdminFollowUpSource = await readSource(consoleAdminFollowUpPath);

  assert.match(artifactsSource, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    artifactsSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="artifacts"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}[\s\S]*ownerDisplayName=\{recentOwnerDisplayName \?\? recentOwnerLabel\}/,
  );
  assert.match(
    logsSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="logs"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );

  for (const source of [logsSource, agentsSource, egressSource, membersSource, onboardingSource, settingsSource]) {
    assert.match(
      source,
      /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/,
    );
    assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
    assertMatchesAny(
      source,
      [/<ConsoleAdminFollowUp[\s\S]*handoff=\{handoff\}/, /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}/],
      "console admin follow-up handoff continuity",
    );
  }

  assert.match(consoleAdminFollowUpSource, /buildConsoleAdminFollowUpPayload\(\{/);
  assert.match(consoleAdminFollowUpSource, /sourceWorkspaceSlug=\{handoff\.attentionWorkspace\}/);
  assert.match(consoleAdminFollowUpSource, /\{\.\.\.payload\}/);

  assert.match(membersSource, /const source = handoff\.source;/);
  assert.match(membersSource, /const showOnboardingFlow = source === "onboarding";/);
  assert.match(
    membersSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="members"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );

  assert.match(
    onboardingSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="onboarding"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );

  assert.match(apiKeysSource, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    apiKeysSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="api-keys"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );

  assert.match(serviceAccountsSource, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(serviceAccountsSource, /const showOnboardingContext = source === "onboarding";/);
  assert.match(
    serviceAccountsSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="service-accounts"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(
    settingsSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="settings"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}[\s\S]*ownerDisplayName=\{runAwareHandoff\.recentOwnerDisplayName \?\? runAwareHandoff\.recentOwnerLabel\}[\s\S]*ownerEmail=\{runAwareHandoff\.recentOwnerEmail\}/,
  );
});

test("Console pages keep query parsing and handoff-arg continuity for source and recent metadata", async () => {
  const artifactsSource = await readSource(artifactsPagePath);
  const membersSource = await readSource(membersPagePath);
  const apiKeysSource = await readSource(apiKeysPagePath);
  const serviceAccountsSource = await readSource(serviceAccountsPagePath);

  for (const source of [artifactsSource, membersSource, apiKeysSource, serviceAccountsSource]) {
    assertMatchesAny(
      source,
      [/getParam\(searchParams\?\.source\)/, /parseConsoleHandoffState\(searchParams\)/],
      "source continuity extraction",
    );
    assertMatchesAny(
      source,
      [/attention_workspace/, /attentionWorkspace/, /handoff(?:Args)?=\{handoff\}/, /handoff(?:Args)?=\{runAwareHandoff\}/],
      "attention workspace continuity",
    );
    assertMatchesAny(
      source,
      [/attention_organization/, /attentionOrganization/, /handoff(?:Args)?=\{handoff\}/, /handoff(?:Args)?=\{runAwareHandoff\}/],
      "attention organization continuity",
    );
    assertMatchesAny(
      source,
      [/week8_focus/, /week8Focus/, /handoff(?:Args)?=\{handoff\}/, /handoff(?:Args)?=\{runAwareHandoff\}/],
      "Week 8 focus continuity",
    );
    assertMatchesAny(
      source,
      [/delivery_context/, /deliveryContext/, /handoff(?:Args)?=\{handoff\}/, /handoff(?:Args)?=\{runAwareHandoff\}/],
      "delivery context continuity",
    );
    assertMatchesAny(
      source,
      [/recent_track_key/, /recentTrackKey/, /handoff(?:Args)?=\{handoff\}/, /handoff(?:Args)?=\{runAwareHandoff\}/],
      "recent track continuity",
    );
    assertMatchesAny(
      source,
      [/recent_update_kind/, /recentUpdateKind/, /handoff(?:Args)?=\{handoff\}/, /handoff(?:Args)?=\{runAwareHandoff\}/],
      "recent update continuity",
    );
    assertMatchesAny(
      source,
      [/evidence_count/, /evidenceCount/, /handoff(?:Args)?=\{handoff\}/, /handoff(?:Args)?=\{runAwareHandoff\}/],
      "evidence count continuity",
    );
    assertMatchesAny(
      source,
      [
        /recent_owner_label/,
        /recentOwnerLabel/,
        /recentOwnerDisplayName/,
        /ownerDisplayName/,
        /handoff(?:Args)?=\{handoff\}/,
        /handoff(?:Args)?=\{runAwareHandoff\}/,
      ],
      "owner continuity",
    );
  }

  assert.match(artifactsSource, /href=\{buildConsoleRunAwareHandoffHref\(link\.path, runAwareHandoff, activeRunId\)\}/);
  assert.match(apiKeysSource, /const verificationHref = buildConsoleHandoffHref\("\/verification\?surface=verification", runAwareHandoff\);/);
  assert.match(membersSource, /href=\{buildConsoleHandoffHref\("\/verification\?surface=verification", runAwareHandoff\)\}/);
  assert.match(
    serviceAccountsSource,
    /const handoff = parseConsoleHandoffState\(searchParams\);[\s\S]*const apiKeysHref = build(?:Console|ServiceAccounts)HandoffHref\("\/api-keys", runAwareHandoff\);/,
  );
  assert.match(
    membersSource,
    /href=\{buildConsoleHandoffHref\("\/accept-invitation", runAwareHandoff\)\}/,
  );
});

test("Artifacts/logs verification and go-live links keep explicit-surface contract when enabled, otherwise remain canonical base paths", async () => {
  const [artifactsSource, logsSource] = await Promise.all([
    readSource(artifactsPagePath),
    readSource(logsPagePath),
  ]);

  const artifactsHasExplicitVerification = /path: "\/verification\?surface=verification"/.test(artifactsSource);
  const logsHasExplicitVerification = /path: "\/verification\?surface=verification"/.test(logsSource);

  if (artifactsHasExplicitVerification) {
    assert.match(artifactsSource, /\{ label: "Continue to verification", path: "\/verification\?surface=verification" \}/);
    assert.match(artifactsSource, /\{ label: "Inspect go-live drill", path: "\/go-live\?surface=go_live" \}/);
  } else {
    assert.match(artifactsSource, /\{ label: "Continue to verification", path: "\/verification" \}/);
    assert.match(artifactsSource, /\{ label: "Inspect go-live drill", path: "\/go-live" \}/);
  }

  if (logsHasExplicitVerification) {
    assert.match(logsSource, /\{ label: "Capture verification evidence", path: "\/verification\?surface=verification" \}/);
    assert.match(logsSource, /\{ label: "Continue the go-live drill", path: "\/go-live\?surface=go_live" \}/);
  } else {
    assert.match(logsSource, /\{ label: "Capture verification evidence", path: "\/verification" \}/);
    assert.match(logsSource, /\{ label: "Continue the go-live drill", path: "\/go-live" \}/);
  }

  assert.match(artifactsSource, /href=\{buildConsoleRunAwareHandoffHref\(link\.path, runAwareHandoff, activeRunId\)\}/);
  assert.match(logsSource, /href=\{buildConsoleRunAwareHandoffHref\(link\.path, runAwareHandoff, activeRunId\)\}/);
});

test("Artifacts and logs pages keep audit-export continuity as a navigation-only manual relay", async () => {
  const [artifactsSource, logsSource] = await Promise.all([
    readSource(artifactsPagePath),
    readSource(logsPagePath),
  ]);

  for (const source of [artifactsSource, logsSource]) {
    assert.match(source, /Audit export continuity/);
    assert.match(source, /\/settings\?intent=upgrade/);
    assert.match(source, /filename, filters, and SHA-256/);
    assert.match(source, /verification/);
    assert.match(source, /go-live/);
    assert.match(source, /admin/);
  }

  assertMatchesAny(
    artifactsSource,
    [
      /Navigation-only manual relay/,
      /manual evidence relay/,
      /The handoff is still manual/,
    ],
    "artifacts manual relay wording",
  );
  assertMatchesAny(
    logsSource,
    [
      /This is a navigation-only manual relay/,
      /Navigation-only manual relay/,
      /manual evidence relay/,
      /The handoff is still manual/,
    ],
    "logs manual relay wording",
  );
});

test("Members onboarding next-step keeps label, onboarding gating, and shared handoff continuity", async () => {
  const source = await readSource(membersPagePath);

  assert.match(
    source,
    /Next: create a service account, issue an API key, then run in the playground to capture the trace for verification\./,
  );
  assert.match(source, /const showOnboardingFlow = source === "onboarding";/);
  assert.match(source, /\{showOnboardingFlow \? \(/);
  assert.match(source, /href=\{buildConsoleHandoffHref\("\/service-accounts", runAwareHandoff\)\}/);
  assert.match(source, /Next: service accounts/);
  assert.match(source, /Walk the newcomer through this manual lane:/);
  assert.match(source, /Confirm session context/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /href=\{buildConsoleHandoffHref\("\/accept-invitation", runAwareHandoff\)\}/);
  assert.match(source, /<CreateInvitationForm[\s\S]*handoffArgs=\{runAwareHandoff\}/);
  assert.match(source, /<InvitationsPanel[\s\S]*handoffArgs=\{runAwareHandoff\}/);
});

test("Admin-focused console contracts keep governance-only cues, explicit return labels, and Week 8 query parsing", async () => {
  const [adminPageSource, adminFocusBarSource, adminFollowUpNoticeSource, adminReadinessReturnBannerSource, verificationChecklistSource] =
    await Promise.all([
      readSource(adminPagePath),
      readSource(adminFocusBarPath),
      readSource(adminFollowUpNoticePath),
      readSource(adminReadinessReturnBannerPath),
      readSource(verificationChecklistPath),
    ]);

  assertMatchesAny(
    adminPageSource,
    [/parseConsoleHandoffState\(searchParams\)/, /const requestedSurface = getParam\(searchParams\?\.queue_surface\);/],
    "admin query parsing source",
  );
  assertMatchesAny(
    adminPageSource,
    [/resolveAdminQueueSurface\(/, /requestedSurface === "verification"/],
    "admin queue surface normalization",
  );
  assertMatchesAny(
    adminPageSource,
    [/const queueReturned = getConsoleParam\(searchParams\?\.queue_returned\) === "1";/, /const queueReturned = getParam\(searchParams\?\.queue_returned\) === "1";/],
    "queue-returned continuity",
  );
  assertMatchesAny(
    adminPageSource,
    [/const readinessReturned = getConsoleParam\(searchParams\?\.readiness_returned\) === "1";/, /const readinessReturned = getParam\(searchParams\?\.readiness_returned\) === "1";/],
    "readiness-returned continuity",
  );
  assert.match(adminPageSource, /initialSurfaceFilter=\{normalizedSurface\}/);
  assert.match(adminPageSource, /initialReadinessFocus=\{normalizedReadinessFocus\}/);
  assertMatchesAny(
    adminPageSource,
    [/attentionWorkspaceSlug=\{handoff\.attentionWorkspace\}/, /attentionWorkspaceSlug=\{attentionWorkspace\}/],
    "attention workspace prop wiring",
  );
  assertMatchesAny(
    adminPageSource,
    [/attentionOrganizationId=\{handoff\.attentionOrganization\}/, /attentionOrganizationId=\{attentionOrganization\}/],
    "attention organization prop wiring",
  );
  assert.match(adminPageSource, /queueReturned=\{queueReturned\}/);
  assert.match(adminPageSource, /readinessReturned=\{readinessReturned\}/);

  assert.match(
    adminFocusBarSource,
    /These chips preserve the current admin review scope across readiness drill-down, workspace follow-up, and[\s\S]*return navigation\./,
  );
  assert.match(
    adminFocusBarSource,
    /Navigation only: changing or clearing focus restores the admin view state, but it does not automate any[\s\S]*remediation or alter workspace data by itself\./,
  );
  assert.match(adminReadinessReturnBannerSource, /<span>Returned from Week 8 readiness<\/span>/);
  assert.match(adminReadinessReturnBannerSource, /<Badge variant="default">Focus restored<\/Badge>/);
  assert.match(
    adminReadinessReturnBannerSource,
    /Use this banner after you come back from onboarding, verification, settings, usage, or the mock go-live[\s\S]*drill\./,
  );
  assert.match(
    adminReadinessReturnBannerSource,
    /It restores the filtered admin view only; it does not imply that any follow-up was auto-resolved\./,
  );

  assert.match(adminFollowUpNoticeSource, /const baseReturnLabel = isReadinessFlow \? "Return to admin readiness view" : "Return to admin queue";/);
  assert.match(adminFollowUpNoticeSource, /returnLabel = trackLabel \? `\$\{baseReturnLabel\} \(continue \$\{trackLabel\}\)` : baseReturnLabel;/);
  assert.match(adminFollowUpNoticeSource, /returnHref = buildAdminReturnHref\("\/admin", \{/);
  assert.match(adminFollowUpNoticeSource, /queueSurface,/);
  assert.match(adminFollowUpNoticeSource, /This is navigation-only context and does not change identity, impersonate a member, or automate remediation\./);
  assert.match(adminFollowUpNoticeSource, /Treat this as the manual admin → workspace surface → admin loop/);

  assert.match(verificationChecklistSource, /Each step stays navigation-only—no automation, support,/);
  assert.match(verificationChecklistSource, /or impersonation is implied\./);
  assert.match(verificationChecklistSource, /Each link simply switches context back to the workspace and carries the readiness/);
  assert.match(verificationChecklistSource, /Audit export evidence note/);
  assert.match(
    verificationChecklistSource,
    /After downloading the Latest export receipt on \/settings, copy the evidence note/,
  );
  assert.match(verificationChecklistSource, /Reopen audit export receipt/);
  assert.match(verificationChecklistSource, /Review delivery tracking below/);
  assert.match(verificationChecklistSource, /delivery tracking panel on this page before you continue on to go-live/);
});
