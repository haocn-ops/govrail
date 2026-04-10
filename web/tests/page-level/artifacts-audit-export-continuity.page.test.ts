import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const artifactsPagePath = path.resolve(testDir, "../../app/(console)/artifacts/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("artifacts page keeps audit export continuity callout", async () => {
  const source = await readSource(artifactsPagePath);

  assert.match(source, /const adminLinkState = buildConsoleAdminLinkState\(\{/);
  assert.match(source, /const requestedRunId = getParam\(searchParams\?\.run_id\) \?\? getParam\(searchParams\?\.runId\);/);
  assert.match(
    source,
    /const activeRunId = requestedRunId \?\? workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/,
  );
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /const adminHref = adminLinkState\.adminHref;/);
  assert.match(source, /const adminHandoffActionsHref = "#artifacts-admin-handoff";/);
  assert.match(source, /Audit export continuity/);
  assert.match(source, /Reopen the Latest export receipt from/);
  assert.match(source, /<code className="font-mono">\/settings\?intent=upgrade<\/code>/);
  assert.match(source, /filename, filters, and SHA-256/);
  assert.match(source, /verification, go-live, and the\{" "\}\s*<Link href=\{adminHandoffActionsHref\}>returned admin handoff<\/Link>/);
  assert.match(source, /Navigation-only manual relay/);
  assert.match(source, /<div id="artifacts-admin-handoff" className="flex flex-wrap gap-2">/);
  assert.match(source, /Reopen audit export receipt/);
  assert.match(source, /Confirm verification evidence/);
  assert.match(source, /Reopen go-live drill/);
  assert.match(source, /buildConsoleRunAwareHandoffHref\("\/settings\?intent=upgrade", runAwareHandoff, activeRunId\)/);
  assert.match(source, /href=\{adminHref\}/);
  assert.match(source, /adminLinkState\.adminLinkLabel/);
});
