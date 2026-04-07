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

test("artifacts page uses shared console handoff plumbing for navigation CTAs", async () => {
  const source = await readSource(artifactsPagePath);

  assert.match(source, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    source,
    /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/,
  );
  assert.match(
    source,
    /import \{[\s\S]*buildConsoleAdminLinkState,[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/s,
  );
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const activeRunId = requestedRunId \?\? workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /const adminLinkState = buildConsoleAdminLinkState\(\{/);
  assert.match(source, /handoff: runAwareHandoff,/);
  assert.match(source, /runId: activeRunId,/);
  assert.match(source, /const adminHref = adminLinkState\.adminHref;/);
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="artifacts"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}[\s\S]*ownerDisplayName=\{recentOwnerDisplayName \?\? recentOwnerLabel\}/,
  );
  assert.match(source, /href=\{buildConsoleRunAwareHandoffHref\("\/settings\?intent=upgrade", runAwareHandoff, activeRunId\)\}/);
  assert.match(
    source,
    /href=\{buildConsoleRunAwareHandoffHref\(\s*"\/verification\?surface=verification",\s*runAwareHandoff,\s*activeRunId,\s*\)\}/s,
  );
  assert.match(source, /href=\{buildConsoleRunAwareHandoffHref\("\/go-live\?surface=go_live", runAwareHandoff, activeRunId\)\}/);
  assert.match(source, /href=\{adminHref\}/);
  assert.match(source, /adminLinkState\.adminLinkLabel/);
  assert.match(source, /requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\)/);
  assert.match(source, /requestControlPlanePageData<RunGraphResponse>\(`\/api\/control-plane\/runs\/\$\{activeRunId\}\/graph`\)/);
  assert.doesNotMatch(source, /function buildArtifactsHandoffHref\(/);
  assert.doesNotMatch(source, /function appendRunIdToHref\(/);
  assert.doesNotMatch(source, /function getBaseUrl\(\): string/);
  assert.doesNotMatch(source, /async function requestControlPlane/);
});
