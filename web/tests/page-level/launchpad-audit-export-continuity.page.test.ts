import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(testDir, "../../app/(console)/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("launchpad root page keeps audit export continuity and admin follow-up framing", async () => {
  const source = await readSource(pagePath);

  assert.match(source, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(source, /import \{ Card, CardContent, CardHeader, CardTitle \} from "@\/components\/ui\/card";/);
  assert.match(
    source,
    /import \{[\s\S]*buildConsoleAdminLinkState,[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(source, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(source, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /const adminLinkState = buildConsoleAdminLinkState\(/);
  assert.match(source, /handoff: runAwareHandoff,/);
  assert.match(source, /runId: activeRunId,/);
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="launchpad"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(source, /surface="launchpad"/);
  assert.match(source, /Audit export continuity/);
  assert.match(source, /Latest export receipt/);
  assert.match(source, /\/settings\?intent=upgrade/);
  assert.match(source, /filename, filters, and SHA-256/);
  assert.match(source, /verification, go-live, or the admin follow-up loop/);
  assert.match(source, /do not automate follow-up, impersonate another user, or change/);
  assert.match(source, /\{ label: "Reopen Latest export receipt", path: "\/settings\?intent=upgrade" \}/);
  assert.match(source, /\{ label: "Carry proof to verification", path: "\/verification\?surface=verification" \}/);
  assert.match(source, /\{ label: "Align go-live drill", path: "\/go-live\?surface=go_live" \}/);
  assert.match(source, /href=\{buildConsoleRunAwareHandoffHref\(link\.path, runAwareHandoff, activeRunId\)\}/);
  assert.match(source, /href=\{adminLinkState.adminHref\}/);
  assert.match(source, />\s*\{adminLinkState\.adminLinkLabel\}\s*</);
});
