import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const settingsPagePath = path.resolve(testDir, "../../app/(console)/settings/page.tsx");
const workspaceContextSurfaceNoticePath = path.resolve(
  testDir,
  "../../components/console/workspace-context-surface-notice.tsx",
);
const workspaceContextCalloutPath = path.resolve(testDir, "../../components/workspace-context-callout.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("settings page keeps self-serve billing lane framing navigation-only and evidence-linked", async () => {
  const source = await readSource(settingsPagePath);

  assert.match(source, /export const dynamic = "force-dynamic";/);
  assert.match(source, /type SettingsIntent = "upgrade" \| "manage-plan" \| "resolve-billing" \| "rollback" \| null;/);
  assert.match(source, /candidate === "rollback"/);
  assert.match(source, /<CardTitle>Enterprise evidence lane<\/CardTitle>/);
  assert.match(source, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(source, /import \{ WorkspaceContextSurfaceNotice \} from "@\/components\/console\/workspace-context-surface-notice";/);
  assert.match(
    source,
    /import \{[\s\S]*buildConsoleAdminReturnHref,[\s\S]*buildConsoleAdminReturnState,[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/s,
  );
  assert.match(source, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(source, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(
    source,
    /const highlightIntent = normalizeIntent\(searchParams\?\.intent\);/,
  );
  assert.match(
    source,
    /const initialCheckoutSessionId = Array\.isArray\(searchParams\?\.checkout_session_id\)\s*\?\s*searchParams\?\.checkout_session_id\[0\] \?\? null\s*:\s*searchParams\?\.checkout_session_id \?\? null;/s,
  );
  assert.match(
    source,
    /const adminReturnState = buildConsoleAdminReturnState\(\{\s*source: handoff\.source,\s*surface: handoff\.surface,\s*expectedSurface: "verification",\s*recentTrackKey: handoff\.recentTrackKey,\s*\}\);/s,
  );
  assert.match(
    source,
    /const adminReturnHref = buildConsoleAdminReturnHref\(\{\s*pathname: "\/admin",\s*handoff: runAwareHandoff,\s*workspaceSlug: workspaceContext\.workspace\.slug,\s*queueSurface: adminReturnState\.adminQueueSurface,\s*\}\);/s,
  );
  assert.match(source, /const buildSettingsPageHref = \(pathname: string\) =>/);
  assert.match(source, /buildConsoleRunAwareHandoffHref\(pathname, handoff, activeRunId\)/);
  assert.match(source, /const adminHref = adminReturnState\.showAdminReturn \? adminReturnHref : "\/admin";/);
  assert.match(
    source,
    /const adminLinkLabel = adminReturnState\.showAdminReturn \? adminReturnState\.adminReturnLabel : "Admin overview";/,
  );
  assert.match(source, /<WorkspaceContextSurfaceNotice[\s\S]*surfaceLabel="Settings"[\s\S]*sessionHref=\{buildSettingsPageHref\("\/session"\)\}/);
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="settings"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}[\s\S]*ownerDisplayName=\{runAwareHandoff\.recentOwnerDisplayName \?\? runAwareHandoff\.recentOwnerLabel\}[\s\S]*ownerEmail=\{runAwareHandoff\.recentOwnerEmail\}/,
  );
  assert.match(source, /<WorkspaceSettingsPanel[\s\S]*runId=\{activeRunId\}/);
  assert.match(source, /<WorkspaceSettingsPanel[\s\S]*highlightIntent=\{highlightIntent\}/s);
  assert.match(source, /<WorkspaceSettingsPanel[\s\S]*initialCheckoutSessionId=\{initialCheckoutSessionId\}/s);
  assert.match(
    source,
    /description="Review workspace tenancy, self-serve billing follow-up, subscription status, and retention defaults while keeping the verification\/go-live\/admin-readiness governance lane connected\."/,
  );
  assert.match(
    source,
    /Use Settings as the manual governance surface for self-serve billing follow-up, portal-return status,\s*audit export, SSO readiness, and dedicated-environment planning\./,
  );
  assert.match(
    source,
    /These controls only preserve workspace handoff context and surface billing\/status cues\.\s*They do not open\s*support workflows, trigger automatic remediation, or impersonate another role\./,
  );
  assert.match(source, /Review usage pressure/);
  assert.match(
    source,
    /href=\{buildSettingsPageHref\("\/verification\?surface=verification"\)\}[\s\S]*?>\s*Capture verification evidence\s*<\/Link>/s,
  );
  assert.match(source, /href=\{buildSettingsPageHref\("\/usage"\)\}/);
  assert.match(source, /href=\{buildSettingsPageHref\("\/go-live\?surface=go_live"\)\}/);
  assert.match(source, /href=\{adminHref\}/);
  assert.match(source, /<WorkspaceContextSurfaceNotice[\s\S]*surfaceLabel="Settings"/);
  assert.match(source, /sessionHref=\{buildSettingsPageHref\("\/session"\)\}/);
  assert.match(source, /Capture verification evidence/);
  assert.match(source, /Rehearse go-live readiness/);
  assert.match(source, /adminReturnLabel/);
  assert.match(source, /Admin overview/);
});

test("workspace context surface notice keeps metadata-vs-fallback checkpoint wording explicit", async () => {
  const source = await readSource(workspaceContextSurfaceNoticePath);

  assert.match(source, /<CardTitle>Workspace session checkpoint<\/CardTitle>/);
  assert.match(source, /Reconfirm the active session before/);
  assert.match(source, /Treat the current state as preview-only/);
  assert.match(source, /metadata-backed SaaS context/);
  assert.match(source, /Re-check session context/);
});

test("workspace context callout documents settings and verification usage surfaces", async () => {
  const source = await readSource(workspaceContextCalloutPath);

  assert.match(source, /"settings", "usage", "verification", "go-live"/);
  assert.match(source, /if \(surface === "settings"\) \{/);
  assert.match(
    source,
    /Confirm workspace identity before billing follow-up, SSO readiness, or dedicated-environment governance updates\./,
  );
  assert.match(source, /if \(surface === "verification"\) \{/);
  assert.match(
    source,
    /Confirm workspace identity before attaching verification notes, checklist evidence, or rollout readiness commentary\./,
  );
});
