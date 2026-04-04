import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const settingsPanelPath = path.resolve(testDir, "../../components/settings/workspace-settings-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("settings panel follow-up text links cancellation/resume to Week 8 evidence", async () => {
  const source = await readSource(settingsPanelPath);

  assert.ok(source.includes("Subscription will now end at the close of the current billing period."));
  assert.ok(source.includes("Automatic renewal has been restored for this subscription."));
  assert.ok(
    source.includes(
      "Document the billing update, audit export, or portal interaction so the verification/go-live evidence panels can cite the same timeline and you can return to the admin readiness lane.",
    ),
  );
  assert.ok(
    source.includes(
      "Once the billing action (upgrade, checkout, or portal return) is ready, use this panel to capture notes and evidence before you navigate back to verification, usage, or the go-live drill.",
    ),
  );
  assert.ok(source.includes("Return to Week 8 checklist"));
  assert.ok(source.includes("Continue to go-live drill"));
  assert.ok(source.includes("Return to admin readiness view"));
  assert.ok(source.includes("Resolve billing warning intent"));
  assert.ok(source.includes("Manage-plan billing intent"));
  assert.ok(source.includes("Upgrade intent"));
  assert.ok(source.includes("Open billing action lane"));
});
