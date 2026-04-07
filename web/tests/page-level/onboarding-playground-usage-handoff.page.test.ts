import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const onboardingPagePath = path.resolve(testDir, "../../app/(console)/onboarding/page.tsx");
const playgroundPagePath = path.resolve(testDir, "../../app/(console)/playground/page.tsx");
const usagePagePath = path.resolve(testDir, "../../app/(console)/usage/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Onboarding/playground/usage pages keep source + recent metadata query parsing continuity contract", async () => {
  const [onboardingSource, playgroundSource, usageSource] = await Promise.all([
    readSource(onboardingPagePath),
    readSource(playgroundPagePath),
    readSource(usagePagePath),
  ]);

  assert.match(
    onboardingSource,
    /import \{ buildConsoleRunAwareHandoffHref, parseConsoleHandoffState \} from "@\/lib\/console-handoff";/,
  );
  assert.match(onboardingSource, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(
    onboardingSource,
    /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/,
  );
  assert.match(onboardingSource, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(onboardingSource, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(onboardingSource, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(onboardingSource, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(onboardingSource, /const handoffSource = runAwareHandoff\.source;/);
  assert.match(
    onboardingSource,
    /const buildRunAwareOnboardingHref = \(pathname: string\): string =>\s*buildConsoleRunAwareHandoffHref\(pathname, handoff, activeRunId\);/s,
  );
  assert.match(onboardingSource, /runId=\{activeRunId\}/);
  assert.match(
    onboardingSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="onboarding"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(onboardingSource, /href=\{buildRunAwareOnboardingHref\("\/session"\)\}/);
  assert.match(onboardingSource, /href=\{buildRunAwareOnboardingHref\("\/members"\)\}/);
  assert.match(onboardingSource, /href=\{buildRunAwareOnboardingHref\("\/service-accounts"\)\}/);
  assert.match(onboardingSource, /href=\{buildRunAwareOnboardingHref\("\/api-keys"\)\}/);
  assert.match(onboardingSource, /href=\{buildRunAwareOnboardingHref\("\/playground"\)\}/);
  assert.match(onboardingSource, /href=\{buildRunAwareOnboardingHref\("\/usage"\)\}/);
  assert.match(onboardingSource, /href=\{buildRunAwareOnboardingHref\("\/verification\?surface=verification"\)\}/);
  assert.match(onboardingSource, /href=\{buildRunAwareOnboardingHref\("\/go-live\?surface=go_live"\)\}/);
  assert.match(onboardingSource, /href=\{buildRunAwareOnboardingHref\("\/accept-invitation"\)\}/);

  assert.match(
    playgroundSource,
    /import \{\s*buildConsoleRunAwareHandoffHref,\s*parseConsoleHandoffState,\s*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(playgroundSource, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(playgroundSource, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(playgroundSource, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(playgroundSource, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(playgroundSource, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(
    playgroundSource,
    /const buildRunAwarePlaygroundHref = \(pathname: string\): string =>\s*buildConsoleRunAwareHandoffHref\(pathname, handoff, activeRunId\);/s,
  );
  assert.match(playgroundSource, /const usageCheckpointHref = buildRunAwarePlaygroundHref\("\/usage"\);/);
  assert.match(playgroundSource, /const verificationHref = buildRunAwarePlaygroundHref\("\/verification\?surface=verification"\);/);

  assert.match(
    usageSource,
    /import \{\s*buildConsoleAdminReturnHref,\s*buildConsoleHandoffHref,\s*buildConsoleVerificationChecklistHandoffArgs,\s*buildConsoleAdminReturnState,\s*parseConsoleHandoffState,\s*\} from "@\/lib\/console-handoff";/s,
  );
  assert.match(usageSource, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(usageSource, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(usageSource, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(
    usageSource,
    /const adminReturnState = buildConsoleAdminReturnState\(\{\s*source: handoff\.source,\s*surface: handoff\.surface,\s*expectedSurface: "verification",\s*recentTrackKey: handoff\.recentTrackKey,\s*\}\);/s,
  );
  assert.match(usageSource, /const handoffHrefArgs = buildConsoleVerificationChecklistHandoffArgs\(runAwareHandoff\);/);
  assert.match(
    usageSource,
    /const settingsPlanHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/settings\?intent=manage-plan",\s*\.\.\.handoffHrefArgs,\s*\}\);/s,
  );
  assert.match(
    usageSource,
    /const settingsBillingHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/settings\?intent=resolve-billing",\s*\.\.\.handoffHrefArgs,\s*\}\);/s,
  );
  assert.match(
    usageSource,
    /const adminReturnHref = buildConsoleAdminReturnHref\(\{\s*pathname: "\/admin",\s*handoff: runAwareHandoff,\s*workspaceSlug: workspaceContext\.workspace\.slug,\s*queueSurface: adminReturnState\.adminQueueSurface,\s*\}\);/s,
  );
  assert.match(usageSource, /const sessionHref = buildConsoleHandoffHref\("\/session", runAwareHandoff\);/);
  assert.match(usageSource, /href=\{settingsPlanHref\}[\s\S]*Review plan limits in Settings/s);
  assert.match(usageSource, /href=\{settingsBillingHref\}[\s\S]*Resolve billing warning/s);
  assert.match(usageSource, /href=\{adminReturnHref\}[\s\S]*\{adminReturnState\.adminReturnLabel\}/s);
});

test("Onboarding/playground/usage pages keep admin follow-up surface wiring aligned with source contract", async () => {
  const [onboardingSource, playgroundSource, usageSource] = await Promise.all([
    readSource(onboardingPagePath),
    readSource(playgroundPagePath),
    readSource(usagePagePath),
  ]);

  assert.match(onboardingSource, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    onboardingSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="onboarding"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );

  assert.match(
    playgroundSource,
    /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/,
  );
  assert.match(
    playgroundSource,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="playground"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );

  assert.match(usageSource, /adminReturnState\.showAttentionHandoff/);
  assert.match(usageSource, /adminReturnState\.showReadinessHandoff/);
  assert.match(usageSource, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    usageSource,
    /const followUpSource =\s*adminReturnState\.showAttentionHandoff\s*\?\s*"admin-attention"\s*:\s*adminReturnState\.showReadinessHandoff\s*\?\s*"admin-readiness"\s*:\s*null;/s,
  );
  assert.match(
    usageSource,
    /<ConsoleAdminFollowUp[\s\S]*payload=\{[\s\S]*source: followUpSource[\s\S]*surface="usage"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
});

test("Playground and usage server pages source the checklist handoff helper from lib-safe imports", async () => {
  const [playgroundSource, usageSource] = await Promise.all([
    readSource(playgroundPagePath),
    readSource(usagePagePath),
  ]);

  assert.match(
    playgroundSource,
    /import \{\s*buildConsoleRunAwareHandoffHref,\s*parseConsoleHandoffState,\s*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(playgroundSource, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(
    usageSource,
    /import \{ buildVerificationChecklistHandoffHref \} from "@\/lib\/handoff-query";/,
  );
});

test("Onboarding/playground/usage pages keep component prop passthrough for handoff continuity", async () => {
  const [onboardingSource, playgroundSource, usageSource] = await Promise.all([
    readSource(onboardingPagePath),
    readSource(playgroundPagePath),
    readSource(usagePagePath),
  ]);

  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*source=\{handoffSource\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*runId=\{activeRunId\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*week8Focus=\{handoff\.week8Focus\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*attentionWorkspace=\{handoff\.attentionWorkspace\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*attentionOrganization=\{handoff\.attentionOrganization\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*deliveryContext=\{handoff\.deliveryContext\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*recentTrackKey=\{handoff\.recentTrackKey\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*recentUpdateKind=\{handoff\.recentUpdateKind\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*evidenceCount=\{handoff\.evidenceCount\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*recentOwnerLabel=\{handoff\.recentOwnerLabel\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*recentOwnerDisplayName=\{handoff\.recentOwnerDisplayName\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*recentOwnerEmail=\{handoff\.recentOwnerEmail\}/);

  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*source=\{source\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*week8Focus=\{week8Focus\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*attentionWorkspace=\{attentionWorkspace\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*attentionOrganization=\{attentionOrganization\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*deliveryContext=\{deliveryContext\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*recentTrackKey=\{recentTrackKey\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*recentUpdateKind=\{recentUpdateKind\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*evidenceCount=\{evidenceCount\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*recentOwnerLabel=\{recentOwnerLabel\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*recentOwnerDisplayName=\{recentOwnerDisplayName\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*recentOwnerEmail=\{recentOwnerEmail\}/);

  assert.match(usageSource, /<WorkspaceContextSurfaceNotice[\s\S]*surfaceLabel="Usage"/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*source=\{handoff\.source\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*runId=\{activeRunId\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*week8Focus=\{handoff\.week8Focus\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*attentionWorkspace=\{handoff\.attentionWorkspace\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*attentionOrganization=\{handoff\.attentionOrganization\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*deliveryContext=\{handoff\.deliveryContext\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*recentTrackKey=\{handoff\.recentTrackKey\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*recentUpdateKind=\{handoff\.recentUpdateKind\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*evidenceCount=\{handoff\.evidenceCount\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*recentOwnerLabel=\{handoff\.recentOwnerLabel\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*recentOwnerDisplayName=\{handoff\.recentOwnerDisplayName\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*recentOwnerEmail=\{handoff\.recentOwnerEmail\}/);
});

test("Onboarding, playground, and usage pages expose manual checkpoint lanes with shared navigation wording", async () => {
  const [onboardingSource, playgroundSource, usageSource] = await Promise.all([
    readSource(onboardingPagePath),
    readSource(playgroundPagePath),
    readSource(usagePagePath),
  ]);

  assert.match(onboardingSource, /Confirm session context/);
  assert.match(onboardingSource, /Step 1: Invite first members/);
  assert.match(onboardingSource, /Step 5: Confirm usage window/);
  assert.match(onboardingSource, /Step 6: Capture verification evidence/);
  assert.match(onboardingSource, /Step 7: Rehearse go-live/);
  assert.match(onboardingSource, /Trusted session reminder:/);

  assert.match(playgroundSource, /<CardTitle>Plan-limit checkpoint<\/CardTitle>/);
  assert.match(playgroundSource, /Review usage pressure/);
  assert.match(playgroundSource, /Review plan and billing lane/);
  assert.match(playgroundSource, /Capture verification evidence/);

  assert.match(usageSource, /const adminReturnState = buildConsoleAdminReturnState\(\{/);
  assert.match(usageSource, /Re-check session context/);
  assert.match(usageSource, /Return to onboarding summary/);
  assert.match(usageSource, /Review artifacts evidence/);
  assert.match(usageSource, /Continue to go-live drill/);
});
