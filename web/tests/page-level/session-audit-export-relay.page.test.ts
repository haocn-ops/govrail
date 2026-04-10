import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sessionPanelPath = path.resolve(testDir, "../../components/session/session-access-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Session access panel keeps audit-export continuity guidance", async () => {
  const source = await readSource(sessionPanelPath);

  assert.match(source, /Audit export continuity/);
  assert.match(
    source,
    /Trusted metadata sessions should reuse the same Latest export receipt from \/settings/,
  );
  assert.match(
    source,
    /Navigation-only manual relay: these links keep the workspace context intact but do not auto-attach the audit\s*export or resolve rollout steps for you\./,
  );
  assert.match(source, /Continue to verification evidence/);
  assert.match(source, /Reopen go-live lane/);
  assert.match(
    source,
    /const settingsAuditExportHref = buildConsoleHandoffHref\("\/settings\?intent=upgrade", handoff\);/,
  );
  assert.match(
    source,
    /const verificationEvidenceHref = buildConsoleHandoffHref\("\/verification\?surface=verification", handoff\);/,
  );
  assert.match(
    source,
    /const goLiveLaneHref = buildConsoleHandoffHref\("\/go-live\?surface=go_live", handoff\);/,
  );
});
