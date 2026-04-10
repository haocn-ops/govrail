import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const agentsPagePath = path.resolve(testDir, "../../app/(console)/agents/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("agents page keeps governance continuity callout", async () => {
  const source = await readSource(agentsPagePath);

  assert.match(
    source,
    /import \{[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*buildConsoleAdminLinkState,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(source, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(source, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(source, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /const adminLinkState = buildConsoleAdminLinkState\(\{/);
  assert.match(source, /handoff: runAwareHandoff,/);
  assert.match(source, /runId: activeRunId,/);
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="agents"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(source, /surface="agents"/);
  assert.match(source, /Governance continuity/);
  assert.match(source, /Latest export receipt/);
  assert.match(source, /\/settings\?intent=upgrade/);
  assert.match(source, /filename,[\s\S]*filters,[\s\S]*SHA-256/);
  assert.match(source, /verification/);
  assert.match(source, /go-live/);
  assert.match(source, /admin/);
  assert.match(source, /Navigation-only manual relay/);
  assert.match(source, /\{ label: "Reopen Latest export receipt", path: "\/settings\?intent=upgrade" \}/);
  assert.match(source, /\{ label: "Carry proof to verification", path: "\/verification\?surface=verification" \}/);
  assert.match(source, /\{ label: "Align go-live drill", path: "\/go-live\?surface=go_live" \}/);
  assert.match(source, /href=\{buildConsoleRunAwareHandoffHref\(link\.path,\s*handoff,\s*activeRunId\)\}/);
  assert.match(source, /href=\{adminLinkState.adminHref\}/);
  assert.match(source, />\s*\{adminLinkState\.adminLinkLabel\}\s*</);
});
