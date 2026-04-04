import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const dashboardPagePath = path.resolve(testDir, "../../app/(console)/page.tsx");
const launchpadPath = path.resolve(testDir, "../../components/home/workspace-launchpad.tsx");
const onboardingWizardPath = path.resolve(testDir, "../../components/onboarding/workspace-onboarding-wizard.tsx");
const sessionPagePath = path.resolve(testDir, "../../app/(console)/session/page.tsx");
const sessionPanelPath = path.resolve(testDir, "../../components/session/session-access-panel.tsx");
const topbarPath = path.resolve(testDir, "../../components/topbar.tsx");
const workspaceSwitcherPath = path.resolve(testDir, "../../components/workspace-switcher.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("launchpad and dashboard keep session-aware launch hub guidance", async () => {
  const [dashboardSource, launchpadSource] = await Promise.all([
    readSource(dashboardPagePath),
    readSource(launchpadPath),
  ]);

  assert.match(
    dashboardSource,
    /description="Use this as the operator-facing launch state machine: confirm session\/workspace context, inspect readiness and plan posture, then continue through the right manual lane for this workspace\."/,
  );
  assert.match(dashboardSource, /const source = getParam\(searchParams\?\.source\);/);
  assert.match(dashboardSource, /const handoffWorkspace = getParam\(searchParams\?\.attention_workspace\);/);
  assert.match(dashboardSource, /const handoffOrganization = getParam\(searchParams\?\.attention_organization\);/);
  assert.match(dashboardSource, /const week8Focus = getParam\(searchParams\?\.week8_focus\);/);
  assert.match(dashboardSource, /const deliveryContext = getParam\(searchParams\?\.delivery_context\);/);
  assert.match(dashboardSource, /const recentTrackKey = getParam\(searchParams\?\.recent_track_key\);/);
  assert.match(dashboardSource, /const recentUpdateKind = getParam\(searchParams\?\.recent_update_kind\);/);
  assert.match(dashboardSource, /const evidenceCountParam = getParam\(searchParams\?\.evidence_count\);/);
  assert.match(dashboardSource, /workspaceRole=\{workspaceContext\.workspace\.subject_roles \?\? null\}/);
  assert.match(dashboardSource, /contextSourceLabel=\{workspaceContext\.source_detail\.label\}/);
  assert.match(dashboardSource, /source=\{source\}/);
  assert.match(dashboardSource, /week8Focus=\{week8Focus\}/);
  assert.match(dashboardSource, /attentionWorkspace=\{handoffWorkspace\}/);
  assert.match(dashboardSource, /attentionOrganization=\{handoffOrganization\}/);
  assert.match(dashboardSource, /deliveryContext=\{deliveryContext\}/);
  assert.match(dashboardSource, /recentTrackKey=\{recentTrackKey\}/);
  assert.match(dashboardSource, /recentUpdateKind=\{recentUpdateKind\}/);
  assert.match(dashboardSource, /evidenceCount=\{evidenceCount\}/);
  assert.match(dashboardSource, /recentOwnerLabel=\{ownerLabel\}/);

  assert.match(launchpadSource, /import \{ buildVerificationChecklistHandoffHref \} from "@\/components\/verification\/week8-verification-checklist";/);
  assert.match(launchpadSource, /import \{ buildAdminReturnHref, resolveAdminQueueSurface \} from "@\/lib\/handoff-query";/);
  assert.match(launchpadSource, /const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>\[0], "pathname"> = \{/);
  assert.match(launchpadSource, /source: normalizedSource,/);
  assert.match(launchpadSource, /const showAdminAttention = normalizedSource === "admin-attention";/);
  assert.match(launchpadSource, /const showAdminReadiness = normalizedSource === "admin-readiness";/);
  assert.match(launchpadSource, /const adminReturnLabel = showAdminAttention \? "Return to admin queue" : "Return to admin readiness view";/);
  assert.match(launchpadSource, /const adminReturnHref =/);
  assert.match(launchpadSource, /buildAdminReturnHref\("\/admin", \{/);
  assert.match(launchpadSource, /function buildLaunchpadHref\(pathname: string\): string \{/);
  assert.match(launchpadSource, /return buildVerificationChecklistHandoffHref\(\{ pathname, \.\.\.handoffHrefArgs \}\);/);
  assert.match(launchpadSource, /<CardTitle>\{showAdminAttention \? "Admin attention follow-up" : "Admin readiness follow-up"\}<\/CardTitle>/);
  assert.match(launchpadSource, /This remains navigation-only context\./);
  assert.match(launchpadSource, /Return to admin queue/);
  assert.match(launchpadSource, /Return to admin readiness view/);
  assert.match(launchpadSource, /<CardTitle>Manual launch state machine<\/CardTitle>/);
  assert.match(launchpadSource, /Step 0: confirm session context/);
  assert.match(launchpadSource, /Step 3: relay evidence/);
  assert.match(launchpadSource, /<CardTitle>Plan and usage checkpoint<\/CardTitle>/);
  assert.match(launchpadSource, /Review plan and billing lane/);
  assert.match(launchpadSource, /Return to session checkpoint/);
  assert.match(launchpadSource, /This hub is still navigation-only\./);
  assert.match(launchpadSource, /const roleAwareStep = roleGuidance\(/);
  assert.match(launchpadSource, /<p className="text-\[0\.65rem\] uppercase tracking-\[0\.2em\] text-muted">Role\/session-aware lane<\/p>/);
  assert.match(launchpadSource, /<p className="text-\[0\.65rem\] uppercase tracking-\[0\.2em\] text-muted">Session\/context checkpoint<\/p>/);
  assert.match(launchpadSource, /Trusted session guidance still applies here:/);
  assert.match(launchpadSource, /href=\{buildLaunchpadHref\("\/session"\)\}/);
  assert.match(launchpadSource, /href=\{buildLaunchpadHref\("\/usage"\)\}/);
  assert.match(launchpadSource, /href=\{buildLaunchpadHref\("\/settings\?intent=manage-plan"\)\}/);
  assert.match(launchpadSource, /href=\{buildLaunchpadHref\("\/verification\?surface=verification"\)\}/);
  assert.match(launchpadSource, /href=\{buildLaunchpadHref\(toSurfacePath\(entry\.surface\)\)\}/);
  assert.match(launchpadSource, /import \{ buildAdminReturnHref, resolveAdminQueueSurface \} from "@\/lib\/handoff-query";/);
  assert.match(launchpadSource, /const showAdminAttention = normalizedSource === "admin-attention";/);
  assert.match(launchpadSource, /const showAdminReadiness = normalizedSource === "admin-readiness";/);
  assert.match(
    launchpadSource,
    /const adminReturnHref =[\s\S]*buildAdminReturnHref\("\/admin", \{[\s\S]*source: normalizedSource,[\s\S]*queueSurface: showAdminAttention \? resolveAdminQueueSurface\(recentTrackKey\) : null,[\s\S]*week8Focus,[\s\S]*attentionWorkspace: attentionWorkspace \?\? workspaceSlug,[\s\S]*attentionOrganization,[\s\S]*deliveryContext,[\s\S]*recentUpdateKind: normalizeRecentUpdateKind\(recentUpdateKind\),[\s\S]*evidenceCount,[\s\S]*recentOwnerLabel,[\s\S]*\}\)/,
  );
  assert.match(launchpadSource, /Admin attention follow-up/);
  assert.match(launchpadSource, /Admin readiness follow-up/);
  assert.match(launchpadSource, /Return to admin queue/);
  assert.match(launchpadSource, /Return to admin readiness view/);
  assert.match(
    launchpadSource,
    /This remains navigation-only context\. It does not impersonate a member, trigger support automation, or[\s\S]*auto-resolve readiness issues for you\./,
  );
});

test("onboarding wizard keeps step-0 checkpoint and manual evidence relay guidance", async () => {
  const source = await readSource(onboardingWizardPath);

  assert.match(source, /<CardTitle>Step 0\. Confirm session and launch context<\/CardTitle>/);
  assert.match(source, /Open session checkpoint/);
  assert.match(source, /Review usage pressure/);
  assert.match(source, /Review plan and billing lane/);
  assert.match(source, /const usageSummary = workspaceQuery\.data\?\.usage \?\? null;/);
  assert.match(source, /const billingSummary = workspaceQuery\.data\?\.billing_summary \?\? null;/);
  assert.match(source, /<p className="font-medium text-foreground">Plan and usage awareness<\/p>/);
  assert.match(source, /Open usage checkpoint/);
  assert.match(source, /Open settings billing lane/);
  assert.match(source, /Return to session checkpoint/);
  assert.match(source, /The clean manual relay is: Playground proves the run,/);
  assert.match(source, /Usage confirms the signal,/);
  assert.match(source, /Verification records[\s\S]*the notes,/);
  assert.match(source, /Go-live rehearses the next gate,/);
  assert.match(source, /Session remains the safe place to re-check context if[\s\S]*anything feels off\./);
});

test("session surfaces and topbar keep role-aware navigation-only context guidance", async () => {
  const [sessionPageSource, sessionPanelSource, topbarSource, workspaceSwitcherSource] = await Promise.all([
    readSource(sessionPagePath),
    readSource(sessionPanelPath),
    readSource(topbarPath),
    readSource(workspaceSwitcherPath),
  ]);

  assert.match(sessionPageSource, /Treat this page as the Week 3 checkpoint for all managed SaaS follow-up\./);
  assert.match(sessionPageSource, /Trusted session guidance:/);
  assert.match(sessionPageSource, /Review usage window/);
  assert.match(sessionPanelSource, /Manual context checklist/);
  assert.match(sessionPanelSource, /Role-aware next lanes/);
  assert.match(sessionPanelSource, /All context changes remain manual here; nothing impersonates another role or runs support automation\./);

  assert.match(topbarSource, /function nextLaneFromRole\(raw: string \| null \| undefined\): \{ label: string; href: string \}/);
  assert.match(topbarSource, /Session access/);
  assert.match(topbarSource, /review context details on \/session/);
  assert.match(topbarSource, /local-only context/);
  assert.match(topbarSource, /The next-lane shortcut is guidance only and/);
  assert.match(topbarSource, /does not change roles or impersonate another operator\./);

  assert.match(workspaceSwitcherSource, /function workspaceCountLabel\(count: number\): string \{/);
  assert.match(workspaceSwitcherSource, /reachable workspace/);
  assert.match(workspaceSwitcherSource, /This switcher only changes the manual workspace context for the console\./);
});
