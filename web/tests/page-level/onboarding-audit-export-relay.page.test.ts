import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const onboardingWizardPath = path.resolve(testDir, "../../components/onboarding/workspace-onboarding-wizard.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("onboarding wizard keeps audit-export continuity relay explicit for first-demo follow-up", async () => {
  const source = await readSource(onboardingWizardPath);

  assert.match(
    source,
    /const latestDemoRun = onboardingState\?\.latest_demo_run \?\? null;/,
  );
  assert.match(source, /const activeRunId = latestDemoRun\?\.run_id \?\? runId \?\? null;/);
  assert.match(
    source,
    /const settingsAuditExportHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/settings\?intent=upgrade",\s*\.\.\.handoffHrefArgs,\s*\}\);/s,
  );
  assert.match(source, /Audit export continuity/);
  assert.match(
    source,
    /Keep the Latest export receipt from \/settings in play: reuse the same filename, filters, and SHA-256/,
  );
  assert.match(source, /Reopen audit export receipt/);
  assert.match(source, /Capture verification evidence/);
  assert.match(
    source,
    /This is navigation-only and a manual relay; the links do not attach the receipt automatically or resolve/,
  );
});
