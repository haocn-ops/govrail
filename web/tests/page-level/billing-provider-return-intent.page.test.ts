import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(testDir, "../../../src/app.ts");
const settingsPanelPath = path.resolve(testDir, "../../components/settings/workspace-settings-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("billing portal return intent stays aligned with settings manage/resolve guidance", async () => {
  const appSource = await readSource(appPath);

  assert.match(
    appSource,
    /const returnIntent = currentSubscription\.status === "past_due" \? "resolve-billing" : "manage-plan";/,
  );
  assert.match(appSource, /manage_plan_href: "\/settings\?intent=manage-plan"/);

  const settingsSource = await readSource(settingsPanelPath);
  assert.match(settingsSource, /"resolve-billing": \{[\s\S]*?title: "Resolve billing warning intent"/s);
  assert.match(settingsSource, /"manage-plan": \{[\s\S]*?title: "Manage-plan billing intent"/s);
  assert.match(settingsSource, /buildSettingsIntentHref/);
  assert.match(
    settingsSource,
    /"manage-plan": \{[\s\S]*?\{ label: "Back to Week 8 checklist", href: verificationHref \}[\s\S]*?\{ label: "Review usage pressure", href: usageHref \}/s,
  );
  assert.match(
    settingsSource,
    /"resolve-billing": \{[\s\S]*?\{ label: "Return to Week 8 checklist", href: verificationHref \}[\s\S]*?\{ label: "Return to admin readiness view", href: adminReturnHref \}/s,
  );
  assert.match(
    settingsSource,
    /Document the billing update, audit export, or portal interaction so the verification\/go-live evidence panels can cite the same timeline and you can return to the admin readiness lane\./,
  );
  assert.match(settingsSource, /const session = await createBillingPortalSession\(\{\s*return_url: window\.location\.href,\s*\}\);/s);
  assert.match(settingsSource, /Open billing action lane/);
});
