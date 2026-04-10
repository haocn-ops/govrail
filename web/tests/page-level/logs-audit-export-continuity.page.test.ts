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

test("logs page keeps audit export continuity callout", async () => {
  const source = await readSource(logsPagePath);

  assert.match(
    source,
    /import \{[\s\S]*buildConsoleAdminLinkState,[\s\S]*buildConsoleRunAwareHandoffHref,[\s\S]*parseConsoleHandoffState[\s\S]*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(source, /import \{ ConsoleAdminFollowUp \} from "@\/components\/admin\/console-admin-follow-up";/);
  assert.match(source, /Audit export continuity/);
  assert.match(source, /Reopen the Latest export receipt on \/settings\?intent=upgrade/);
  assert.match(source, /copy the filename, filters, and SHA-256/);
  assert.match(source, /keep that evidence note with you when you move through verification, go-live, and admin so every surface references the identical export/);
  assert.match(source, /This is a navigation-only manual relay/);
  assert.match(source, /requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\)/);
  assert.match(source, /const activeRunId = requestedRunId \?\? workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(source, /const runAwareHandoff = \{ \.\.\.handoff, runId: activeRunId \};/);
  assert.match(source, /const adminLinkState = buildConsoleAdminLinkState\(\{/);
  assert.match(source, /handoff: runAwareHandoff,/);
  assert.match(source, /runId: activeRunId,/);
  assert.match(source, /const adminHref = adminLinkState\.adminHref;/);
  assert.match(source, /const adminReturnActionsHref = "#logs-admin-return-actions";/);
  assert.match(
    source,
    /<ConsoleAdminFollowUp[\s\S]*handoff=\{runAwareHandoff\}[\s\S]*surface="logs"[\s\S]*workspaceSlug=\{workspaceContext\.workspace\.slug\}/,
  );
  assert.match(source, /{ label: "Reopen Latest export receipt", path: "\/settings\?intent=upgrade" }/);
  assert.match(source, /{ label: "Carry proof to verification", path: "\/verification\?surface=verification" }/);
  assert.match(source, /{ label: "Align go-live drill", path: "\/go-live\?surface=go_live" }/);
  assert.match(source, /<Link href=\{adminReturnActionsHref\}>admin return action below<\/Link>/);
  assert.match(source, /<div id="logs-admin-return-actions" className="flex flex-wrap gap-2">/);
  assert.match(source, /href=\{buildConsoleRunAwareHandoffHref\(link\.path, runAwareHandoff, activeRunId\)\}/);
  assert.match(source, /href=\{adminHref\}/);
  assert.match(source, /adminLinkState\.adminLinkLabel/);
  assert.match(source, /<LogStream runId=\{activeRunId\} \/>/);
});
