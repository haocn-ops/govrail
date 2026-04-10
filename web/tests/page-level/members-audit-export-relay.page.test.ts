import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const membersPanelPath = path.resolve(testDir, "../../components/members/members-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Members panel keeps audit-export continuity reminder", async () => {
  const source = await readSource(membersPanelPath);

  assert.match(source, /Audit export continuity/);
  assert.match(
    source,
    /Governance roles should reopen the Latest export receipt from <code className="font-mono">\/settings\?intent=upgrade<\/code>/,
  );
  assert.match(
    source,
    /This is a navigation-only manual relay; the links keep workspace context intact but do not\s*auto-attach the\s*receipt or finish rollout steps on your behalf\./,
  );
  assert.match(source, /href="\/settings\?intent=upgrade"/);
  assert.match(source, /Capture verification evidence/);
  assert.match(source, /Return to go-live drill/);
});
