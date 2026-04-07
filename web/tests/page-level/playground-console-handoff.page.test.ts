import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const playgroundPagePath = path.resolve(testDir, "../../app/(console)/playground/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Playground page uses the shared console handoff helper for continuity", async () => {
  const source = await readSource(playgroundPagePath);

  assert.match(
    source,
    /import \{\s*buildConsoleRunAwareHandoffHref,\s*parseConsoleHandoffState,\s*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(source, /import \{ requestControlPlanePageData \} from "@\/lib\/server-control-plane-page-fetch";/);
  assert.match(source, /const handoff = parseConsoleHandoffState\(searchParams\);/);
  assert.match(source, /const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>\("\/api\/control-plane\/workspace"\);/);
  assert.match(source, /const activeRunId = workspace\?\.onboarding\?\.latest_demo_run\?\.run_id \?\? handoff\.runId \?\? null;/);
  assert.match(
    source,
    /const buildRunAwarePlaygroundHref = \(pathname: string\): string =>\s*buildConsoleRunAwareHandoffHref\(pathname, handoff, activeRunId\);/s,
  );
  assert.match(source, /const usageCheckpointHref = buildRunAwarePlaygroundHref\("\/usage"\);/);
  assert.match(source, /const verificationHref = buildRunAwarePlaygroundHref\("\/verification\?surface=verification"\);/);
  assert.match(source, /href=\{usageCheckpointHref\}/);
  assert.match(source, /href=\{verificationHref\}/);
});
