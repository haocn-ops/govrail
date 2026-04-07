import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(testDir, "../../app/(console)/egress/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Egress page keeps audit export continuity manual-relay guidance", async () => {
  const source = await readSource(pagePath);

  assert.match(source, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(
    source,
    /import \{[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*buildConsoleAdminLinkState,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/,
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
  assert.match(source, /const adminLinkState = buildConsoleAdminLinkState\(/);
  assert.match(source, /handoff: runAwareHandoff,/);
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="egress"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(source, /surface="egress"/);
  assert.match(source, /Audit export continuity/);
  assert.match(source, /Reopen the Latest export receipt/);
  assert.match(source, /<code className="font-mono">\/settings\?intent=upgrade<\/code>/);
  assert.match(source, /keep the same filename, filters, and SHA-256/);
  assert.match(source, /Navigation-only manual relay/);
  assert.match(source, /carry that proof into verification, go-live, and the admin follow-up surface/);
  assert.match(source, /this card keeps the workspace context stitched together/i);
  assert.match(source, /does not automate/);
  assert.match(source, /impersonate, or change workspace state/);
  assert.match(source, /Reopen audit export receipt/);
  assert.match(
    source,
    /buildConsoleRunAwareHandoffHref\("\/settings\?intent=upgrade", handoff, activeRunId\)/,
  );
  assert.match(
    source,
    /buildConsoleRunAwareHandoffHref\("\/verification\?surface=verification", handoff, activeRunId\)/,
  );
  assert.match(
    source,
    /buildConsoleRunAwareHandoffHref\("\/go-live\?surface=go_live", handoff, activeRunId\)/,
  );
  assert.match(source, /adminLinkState\.showAdminReturn/);
  assert.match(source, /href=\{adminLinkState.adminHref\}/);
  assert.match(source, />\s*\{adminLinkState\.adminLinkLabel\}\s*</);
});
