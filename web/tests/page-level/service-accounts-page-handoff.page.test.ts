import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(testDir, "../../app/(console)/service-accounts/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("service-accounts page uses shared console handoff plumbing for credential lanes", async () => {
  const source = await readSource(pagePath);

  assert.match(
    source,
    /import \{\s*buildConsoleHandoffHref,\s*parseConsoleHandoffState,\s*resolveConsoleRecentTrackKey,\s*type ConsoleHandoffState,\s*\} from "@\/lib\/console-handoff";/s,
  );
  assert.match(source, /function buildServiceAccountsHandoffHref\(pathname: string, handoff: ConsoleHandoffState\): string/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /const usageHref = buildServiceAccountsHandoffHref\("\/usage", runAwareHandoff\);/);
  assert.match(source, /const settingsHref = buildServiceAccountsHandoffHref\("\/settings\?intent=manage-plan", runAwareHandoff\);/);
  assert.match(source, /const apiKeysHref = buildServiceAccountsHandoffHref\("\/api-keys", runAwareHandoff\);/);
  assert.match(source, /const playgroundHref = buildServiceAccountsHandoffHref\("\/playground", runAwareHandoff\);/);
  assert.match(source, /const verificationHref = buildServiceAccountsHandoffHref\("\/verification\?surface=verification", runAwareHandoff\);/);
  assert.match(source, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="service-accounts"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(source, /surface="service-accounts"/);
  assert.match(source, /recentOwnerLabel=\{runAwareHandoff\.recentOwnerLabel\}/);
  assert.match(source, /recentOwnerDisplayName=\{runAwareHandoff\.recentOwnerDisplayName\}/);
  assert.match(source, /recentOwnerEmail=\{runAwareHandoff\.recentOwnerEmail\}/);
  assert.match(source, /This sequence is still navigation-only across the console\./);
});
