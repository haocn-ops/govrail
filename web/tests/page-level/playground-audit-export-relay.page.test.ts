import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const playgroundPanelPath = path.resolve(testDir, "../../components/playground/playground-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Playground panel keeps audit-export continuity relay guidance", async () => {
  const source = await readSource(playgroundPanelPath);

  assert.match(source, /Audit export continuity/);
  assert.match(
    source,
    /After the first demo run, reopen the Latest export receipt from[\s\S]*?filename, filters, and SHA-256 stay/,
  );
  assert.match(
    source,
    /Navigation-only manual relay:[\s\S]*?resolve rollout steps for you\./,
  );
  assert.match(source, /href=\{settingsUpgradeHref\}/);
  assert.match(source, /Continue verification evidence/);
  assert.match(source, /Reopen go-live lane/);
});
