import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const logsPagePath = path.resolve(testDir, "../../app/(console)/logs/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("logs page routes evidence CTAs through the shared console handoff helper", async () => {
  const source = await readSource(logsPagePath);

  assert.match(
    source,
    /import \{[\s\S]*buildConsoleAdminLinkState,[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/s,
  );
  assert.match(source, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\)/);
  assert.match(source, /const requestedRunId = getParam\(searchParams\?\.run_id\) \?\? getParam\(searchParams\?\.runId\);/);
  assert.match(
    source,
    /const activeRunId = requestedRunId \?\? workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/,
  );
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /const adminLinkState = buildConsoleAdminLinkState\(\{/);
  assert.match(source, /const adminHref = adminLinkState\.adminHref;/);
  assert.match(source, /href=\{buildConsoleRunAwareHandoffHref\(link\.path, runAwareHandoff, activeRunId\)\}/);
  assert.match(source, /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="logs"/);
  assert.match(source, /<LogStream runId=\{activeRunId\} \/>/);
  assert.match(source, /href=\{adminHref\}/);
  assert.match(source, /adminLinkState\.adminLinkLabel/);
  assert.doesNotMatch(source, /function buildLogsHandoffHref\(/);
  assert.doesNotMatch(source, /function appendRunIdToHref\(/);
});
