import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountsPanelPath = path.resolve(testDir, "../../components/service-accounts/service-accounts-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Service accounts panel keeps audit-export continuity reminder", async () => {
  const source = await readSource(serviceAccountsPanelPath);

  assert.match(source, /Audit export continuity/);
  assert.match(
    source,
    /Governance roles should reopen the Latest export receipt from <code className="font-mono">\/settings\?intent=upgrade<\/code>/,
  );
  assert.match(
    source,
    /This is a navigation-only manual relay; these links maintain the workspace context but do not automatically attach the receipt or finalize rollout steps for you\./,
  );
  assert.match(source, /href=\{buildVerificationChecklistHandoffHref\(\{[\s\S]*pathname: "\/settings\?intent=upgrade"/);
  assert.match(source, /Capture verification evidence/);
  assert.match(source, /Reopen go-live drill/);
});
