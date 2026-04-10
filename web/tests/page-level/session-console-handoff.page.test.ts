import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sessionPagePath = path.resolve(testDir, "../../app/(console)/session/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Session page uses shared console handoff helpers for managed-lane CTAs", async () => {
  const source = await readSource(sessionPagePath);

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
  assert.match(source, /const onboardingHref = buildConsoleHandoffHref\("\/onboarding", runAwareHandoff\);/);
  assert.match(source, /const settingsHref = buildConsoleHandoffHref\("\/settings", runAwareHandoff\);/);
  assert.match(source, /const membersHref = buildConsoleHandoffHref\("\/members", runAwareHandoff\);/);
  assert.match(source, /const usageHref = buildConsoleHandoffHref\("\/usage", runAwareHandoff\);/);
  assert.match(source, /const playgroundHref = buildConsoleHandoffHref\("\/playground", runAwareHandoff\);/);
  assert.match(source, /const artifactsHref = buildConsoleHandoffHref\("\/artifacts", runAwareHandoff\);/);
  assert.match(source, /const verificationHref = buildConsoleHandoffHref\("\/verification\?surface=verification", runAwareHandoff\);/);
  assert.match(source, /const goLiveHref = buildConsoleHandoffHref\("\/go-live\?surface=go_live", runAwareHandoff\);/);
  assert.match(source, /const showAttentionHandoff = source === "admin-attention";/);
  assert.match(source, /const showReadinessHandoff = source === "admin-readiness";/);
  assert.match(source, /<SessionAccessPanel workspaceContext=\{workspaceContext\} handoff=\{runAwareHandoff\} \/>/);
});
