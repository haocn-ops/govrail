import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const panelPath = path.resolve(testDir, "../../components/api-keys/api-keys-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("API keys panel keeps audit-export continuity cue for first-run governance", async () => {
  const source = await readSource(panelPath);

  assert.match(source, /Audit export continuity/);
  assert.match(
    source,
    /After you pair an API key with a service account, reopen the Latest export receipt in[\s\S]*?<code className="font-mono">\/settings\?intent=upgrade<\/code>, capture the filename, filters, and SHA-256/,
  );
  assert.match(
    source,
    /Navigation-only manual relay: these links preserve the workspace context but do not automatically attach the audit export or finish rollout steps for you\./,
  );
  assert.match(
    source,
    /href=\{buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/settings\?intent=upgrade",\s*\.\.\.handoffHrefArgs\s*\}\)\}/,
  );
  assert.match(source, /Capture verification evidence/);
  assert.match(source, /Reopen go-live drill/);
});
