import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const settingsPanelPath = path.resolve(testDir, "../../components/settings/workspace-settings-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Settings panel keeps audit export continuity and verification/go-live relay CTA", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /Audit export continuity/);
  assert.match(source, /const auditExportAdminReturnActionsHref = "#settings-audit-export-admin-return";/);
  assert.match(source, /Navigation-only manual relay: these links preserve the workspace context but do not automatically attach the receipt or close rollout steps for you\./);
  assert.match(source, /<Link href=\{auditExportAdminReturnActionsHref\}>admin readiness return action below<\/Link>/);
  assert.match(source, /<div id="settings-audit-export-admin-return" className="flex flex-wrap gap-2">/);
  assert.match(source, /href=\{verificationHref\}[\s\S]*?>\s*Attach in verification\s*<\/Link>/s);
  assert.match(source, /href=\{goLiveHref\}[\s\S]*?>\s*Carry to go-live drill\s*<\/Link>/s);
  assert.match(
    source,
    /Keep this receipt with the downloaded file so verification, go-live, and admin follow-up all cite the\s+same export details\./,
  );
});
