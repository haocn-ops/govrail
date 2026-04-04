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

test("settings panel keeps resolve-billing intent, portal return, and past-due messaging aligned", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /"resolve-billing": \{[\s\S]*?title: "Resolve billing warning intent"/);
  assert.match(source, /body:\s*"This path lands you in settings to resolve past-due or warning statuses\./);
  assert.match(source, /actions:\s*\[\s*\{ label: "Return to Week 8 checklist", href: verificationHref \}/);
  assert.match(
    source,
    /"Once the billing action \(upgrade, checkout, or portal return\) is ready, use this panel to capture notes and evidence before you navigate back to verification, usage, or the go-live drill\./,
  );
  assert.match(
    source,
    /"Document the billing update, audit export, or portal interaction so the verification\/go-live evidence panels can cite the same timeline and you can return to the admin readiness lane\."/,
  );
  assert.match(source, /"Open the billing provider portal to manage payment methods, invoices, and renewal settings\."/);
  assert.match(
    source,
    /"Manage renewal timing directly in this workspace while provider portal access is unavailable\."/,
  );
  assert.match(source, />\s*Open billing action lane\s*</);
});
