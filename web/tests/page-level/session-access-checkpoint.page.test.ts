import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sessionPagePath = path.resolve(testDir, "../../app/(console)/session/page.tsx");
const sessionPanelPath = path.resolve(testDir, "../../components/session/session-access-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("session page keeps manual checkpoint framing and explicit verification/go-live surface links", async () => {
  const source = await readSource(sessionPagePath);

  assert.match(source, /title="Session and workspace access"/);
  assert.match(
    source,
    /Confirm the current SaaS identity, the active workspace context, and which workspaces this console session can reach\./,
  );
  assert.match(source, /Treat this page as the Week 3 checkpoint for all managed SaaS follow-up\./);
  assert.match(
    source,
    /import \{ buildConsoleHandoffHref, parseConsoleHandoffState \} from "@\/lib\/console-handoff";/,
  );
  assert.match(
    source,
    /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/,
  );
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(
    source,
    /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/,
  );
  assert.match(source, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /const verificationHref = buildConsoleHandoffHref\("\/verification\?surface=verification", runAwareHandoff\);/);
  assert.match(source, /Continue verification/);
  assert.match(source, /const goLiveHref = buildConsoleHandoffHref\("\/go-live\?surface=go_live", runAwareHandoff\);/);
  assert.match(source, /Review go-live drill/);
  assert.match(
    source,
    /Trusted session guidance: only metadata-backed SaaS session context should be treated as a trusted launch[\s\S]*point for members, onboarding, usage, verification, or go-live follow-up\./,
  );
  assert.match(
    source,
    /These links only preserve the current console context\.[\s\S]*They do not impersonate another user, change[\s\S]*workspace access, or trigger support-side remediation\./,
  );
  assert.match(
    source,
    /The SaaS plan depends on server-side session resolution instead of trusting arbitrary tenant input from the[\s\S]*browser\./,
  );
});

test("session access panel keeps role-aware lane mapping and visibility-only guardrails", async () => {
  const source = await readSource(sessionPanelPath);

  assert.match(source, /primaryHref: "\/verification\?surface=verification"/);
  assert.match(source, /secondaryHref: "\/go-live\?surface=go_live"/);
  assert.match(source, /primaryHref: "\/playground"/);
  assert.match(source, /secondaryHref: "\/usage"/);
  assert.match(source, /primaryHref: "\/members"/);
  assert.match(source, /secondaryHref: "\/settings"/);
  assert.match(source, /const lanePrimaryHref = buildConsoleHandoffHref\(lane\.primaryHref, handoff\);/);
  assert.match(source, /const laneSecondaryHref = buildConsoleHandoffHref\(lane\.secondaryHref, handoff\);/);
  assert.match(source, /href=\{lanePrimaryHref\}/);
  assert.match(source, /href=\{laneSecondaryHref\}/);

  assert.match(
    source,
    /This page is only a visibility surface\.[\s\S]*It does not impersonate another user, change roles, or open support automation\./,
  );
  assert.match(source, /Manual context checklist/);
  assert.match(
    source,
    /1\) confirm identity and role scope, 2\) confirm the active workspace and tenant, 3\) confirm the context[\s\S]*source is the one you expect, then 4\) continue into onboarding, billing, verification, or go-live\./,
  );
  assert.match(source, /Session safety signals/);
  assert.match(source, /Workspace reachable/);
  assert.match(source, /Metadata-backed context/);
  assert.match(source, /Role-aware next lanes/);
  assert.match(
    source,
    /All context changes remain manual here; nothing impersonates another role or runs support automation\./,
  );
});

test("session access panel keeps fallback and local-only warning copy for non-metadata contexts", async () => {
  const source = await readSource(sessionPanelPath);

  assert.match(
    source,
    /This session context is local-only, so treat it as a manual preview checkpoint rather than a fully metadata-backed access proof\./,
  );
  assert.match(
    source,
    /Workspace context is using a fallback source\. Confirm identity and workspace carefully before creating credentials or attaching evidence\./,
  );
  assert.match(
    source,
    /Live session data is unavailable, so this panel is showing the current workspace-context fallback list\./,
  );
  assert.match(
    source,
    /Changing the workspace remains manual\.[\s\S]*This page does not edit membership, elevate access, or impersonate[\s\S]*a different user when you move between workspaces\./,
  );
});
