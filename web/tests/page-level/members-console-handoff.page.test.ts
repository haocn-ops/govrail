import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(testDir, "../../app/(console)/members/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Members page uses shared console handoff helpers while preserving invitation continuity", async () => {
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
  assert.match(source, /const source = handoff\.source;/);
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="members"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(source, /href=\{buildConsoleHandoffHref\("\/accept-invitation", runAwareHandoff\)\}/);
  assert.match(source, /href=\{buildConsoleHandoffHref\("\/session", runAwareHandoff\)\}/);
  assert.match(source, /href=\{buildConsoleHandoffHref\("\/onboarding", runAwareHandoff\)\}/);
  assert.match(source, /href=\{buildConsoleHandoffHref\("\/usage", runAwareHandoff\)\}/);
  assert.match(source, /href=\{buildConsoleHandoffHref\("\/verification\?surface=verification", runAwareHandoff\)\}/);
  assert.match(source, /href=\{buildConsoleHandoffHref\("\/service-accounts", runAwareHandoff\)\}/);
  assert.match(source, /<CreateInvitationForm[\s\S]*handoffArgs=\{runAwareHandoff\}/);
  assert.match(source, /<InvitationsPanel[\s\S]*handoffArgs=\{runAwareHandoff\}/);
  assert.match(source, /<MembersPanel[\s\S]*handoff=\{runAwareHandoff\}/);
});
