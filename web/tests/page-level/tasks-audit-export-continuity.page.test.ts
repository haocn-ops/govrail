import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(testDir, "../../app/(console)/tasks/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("tasks page keeps audit export continuity and run-aware handoff guidance", async () => {
  const source = await readSource(pagePath);

  assert.match(source, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    source,
    /import \{[\s\S]*buildConsoleAdminLinkState,[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(
    source,
    /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/,
  );
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId \};/);
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="tasks"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(source, /surface="tasks"/);
  assert.match(source, /Audit export continuity/);
  assert.match(source, /Latest export receipt/);
  assert.match(source, /\/settings\?intent=upgrade/);
  assert.match(source, /filename, filters, and SHA-256/);
  assert.match(source, /verification, go-live, and the admin follow-up loop/);
  assert.match(source, /Manual relay only/);
  assert.match(source, /buildConsoleRunAwareHandoffHref\("\/settings\?intent=upgrade", runAwareHandoff, runId\)/);
  assert.match(
    source,
    /buildConsoleRunAwareHandoffHref\(\s*"\/verification\?surface=verification",\s*runAwareHandoff,\s*runId,\s*\)/s,
  );
  assert.match(source, /buildConsoleRunAwareHandoffHref\("\/go-live\?surface=go_live", runAwareHandoff, runId\)/);
  assert.match(source, /const adminLinkState = buildConsoleAdminLinkState\(\{/);
  assert.match(source, /handoff: runAwareHandoff,/);
  assert.match(source, /const adminHref = adminLinkState\.adminHref;/);
  assert.match(source, /href=\{adminHref\}/);
  assert.match(source, /adminLinkState\.adminLinkLabel/);
  assert.match(source, /buildConsoleRunAwareHandoffHref\("\/logs", runAwareHandoff, run\.run_id\)/);
  assert.match(source, /buildConsoleRunAwareHandoffHref\("\/artifacts", runAwareHandoff, run\.run_id\)/);
  assert.match(source, /buildConsoleRunAwareHandoffHref\("\/playground", runAwareHandoff, null\)/);
  assert.doesNotMatch(source, /function buildTasksHandoffHref\(/);
  assert.match(source, /requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\)/);
  assert.match(source, /requestControlPlanePageData<RunDetailResponse>\(`\/api\/control-plane\/runs\/\$\{runId\}`\)/);
  assert.doesNotMatch(source, /function getBaseUrl\(\): string/);
  assert.doesNotMatch(source, /async function requestControlPlane/);
});
