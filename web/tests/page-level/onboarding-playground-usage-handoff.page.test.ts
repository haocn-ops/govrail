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

  for (const source of [onboardingSource, playgroundSource, usageSource]) {
    assert.match(source, /const (?:handoffSource|source) = getParam\(searchParams\?\.source\);/);
    assert.match(source, /const handoffWorkspace = getParam\(searchParams\?\.attention_workspace\);/);
    assert.match(source, /const handoffOrganization = getParam\(searchParams\?\.attention_organization\);/);
    assert.match(source, /const week8Focus = getParam\(searchParams\?\.week8_focus\);/);
    assert.match(source, /const deliveryContext = getParam\(searchParams\?\.delivery_context\);/);
    assert.match(source, /const recentTrackKey = getParam\(searchParams\?\.recent_track_key\);/);
    assert.match(source, /const recentUpdateKind = getParam\(searchParams\?\.recent_update_kind\);/);
    assert.match(source, /const evidenceCountParam = getParam\(searchParams\?\.evidence_count\);/);
    assert.match(
      source,
      /const evidenceCount =\s*evidenceCountParam !== null && !Number\.isNaN\(Number\(evidenceCountParam\)\) \? Number\(evidenceCountParam\) : null;/s,
    );
    assert.match(
      source,
      /const ownerLabel =\s*getParam\(searchParams\?\.recent_owner_label\) \?\? getParam\(searchParams\?\.recent_owner_display_name\);/s,
    );
  }

  assert.match(onboardingSource, /const ownerEmail = getParam\(searchParams\?\.recent_owner_email\);/);
});

test("Onboarding/playground/usage pages keep admin follow-up surface wiring aligned with source contract", async () => {
  const [onboardingSource, playgroundSource, usageSource] = await Promise.all([
    readSource(onboardingPagePath),
    readSource(playgroundPagePath),
    readSource(usagePagePath),
  ]);

  assert.match(onboardingSource, /const showAttentionHandoff = handoffSource === "admin-attention";/);
  assert.match(onboardingSource, /const showReadinessHandoff = handoffSource === "admin-readiness";/);
  assert.match(onboardingSource, /source="admin-attention"[\s\S]*surface="onboarding"/);
  assert.match(onboardingSource, /source="admin-readiness"[\s\S]*surface="onboarding"/);

  assert.match(playgroundSource, /const showAttentionHandoff = source === "admin-attention";/);
  assert.match(playgroundSource, /const showReadinessHandoff = source === "admin-readiness";/);
  assert.match(playgroundSource, /source="admin-attention"[\s\S]*surface="playground"/);
  assert.match(playgroundSource, /source="admin-readiness"[\s\S]*surface="playground"/);

  assert.match(usageSource, /const showAttentionHandoff = source === "admin-attention";/);
  assert.match(usageSource, /const showReadinessHandoff = source === "admin-readiness";/);
  assert.match(usageSource, /source="admin-attention"[\s\S]*surface="usage"/);
  assert.match(usageSource, /source="admin-readiness"[\s\S]*surface="usage"/);
});

test("Playground and usage server pages source the checklist handoff helper from lib-safe imports", async () => {
  const [playgroundSource, usageSource] = await Promise.all([
    readSource(playgroundPagePath),
    readSource(usagePagePath),
  ]);

  assert.match(
    playgroundSource,
    /import \{ buildHandoffHref, buildVerificationChecklistHandoffHref \} from "@\/lib\/handoff-query";/,
  );
  assert.match(
    usageSource,
    /import \{ buildAdminReturnHref, buildHandoffHref, buildVerificationChecklistHandoffHref \} from "@\/lib\/handoff-query";/,
  );
});

test("Onboarding/playground/usage pages keep component prop passthrough for handoff continuity", async () => {
  const [onboardingSource, playgroundSource, usageSource] = await Promise.all([
    readSource(onboardingPagePath),
    readSource(playgroundPagePath),
    readSource(usagePagePath),
  ]);

  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*source=\{handoffSource\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*week8Focus=\{week8Focus\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*attentionWorkspace=\{handoffWorkspace\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*attentionOrganization=\{handoffOrganization\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*deliveryContext=\{deliveryContext\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*recentTrackKey=\{recentTrackKey\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*recentUpdateKind=\{recentUpdateKind\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*evidenceCount=\{evidenceCount\}/);
  assert.match(onboardingSource, /<WorkspaceOnboardingWizard[\s\S]*recentOwnerLabel=\{ownerLabel\}/);

  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*source=\{source\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*week8Focus=\{week8Focus\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*attentionWorkspace=\{handoffWorkspace\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*attentionOrganization=\{handoffOrganization\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*deliveryContext=\{deliveryContext\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*recentTrackKey=\{recentTrackKey\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*recentUpdateKind=\{recentUpdateKind\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*evidenceCount=\{evidenceCount\}/);
  assert.match(playgroundSource, /<PlaygroundPanel[\s\S]*recentOwnerLabel=\{ownerLabel\}/);

  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*source=\{source\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*week8Focus=\{week8Focus\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*attentionWorkspace=\{handoffWorkspace\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*attentionOrganization=\{handoffOrganization\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*deliveryContext=\{deliveryContext\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*recentTrackKey=\{recentTrackKey\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*recentUpdateKind=\{recentUpdateKind\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*evidenceCount=\{evidenceCount\}/);
  assert.match(usageSource, /<WorkspaceUsageDashboard[\s\S]*recentOwnerLabel=\{ownerLabel\}/);
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

  assert.match(usageSource, /const showAdminReturn = showReadinessHandoff \|\| showAttentionHandoff;/);
  assert.match(usageSource, /const adminReturnLabel = showAttentionHandoff \? "Return to admin queue" : "Return to admin readiness";/);
  assert.match(usageSource, /Re-check session context/);
  assert.match(usageSource, /Return to onboarding summary/);
  assert.match(usageSource, /Review artifacts evidence/);
  assert.match(usageSource, /Continue to go-live drill/);
});
