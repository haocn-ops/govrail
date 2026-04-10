import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(testDir, "../../app/(console)/api-keys/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("API keys page uses shared console handoff helpers and keeps admin follow-up copy", async () => {
  const source = await readSource(pagePath);

  assert.match(source, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    source,
    /import \{ buildConsoleHandoffHref, parseConsoleHandoffState \} from "@\/lib\/console-handoff";/,
  );
  assert.match(source, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(source, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="api-keys"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(source, /surface="api-keys"/);
  assert.match(
    source,
    /const serviceAccountsHref = buildConsoleHandoffHref\("\/service-accounts", runAwareHandoff\);/,
  );
  assert.match(source, /const usageHref = buildConsoleHandoffHref\("\/usage", runAwareHandoff\);/);
  assert.match(source, /const settingsHref = buildConsoleHandoffHref\("\/settings\?intent=manage-plan", runAwareHandoff\);/);
  assert.match(source, /const playgroundHref = buildConsoleHandoffHref\("\/playground", runAwareHandoff\);/);
  assert.match(source, /const verificationHref = buildConsoleHandoffHref\("\/verification\?surface=verification", runAwareHandoff\);/);
  assert.match(source, /recentOwnerLabel=\{recentOwnerLabel\}/);
  assert.match(source, /recentOwnerDisplayName=\{recentOwnerDisplayName\}/);
  assert.match(source, /recentOwnerEmail=\{recentOwnerEmail\}/);
  assert.match(source, /Manual governance checkpoint/);
});
