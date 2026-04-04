import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const settingsPagePath = path.resolve(testDir, "../../app/(console)/settings/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("settings page keeps self-serve billing lane framing navigation-only and evidence-linked", async () => {
  const source = await readSource(settingsPagePath);

  assert.match(source, /<CardTitle>Enterprise evidence lane<\/CardTitle>/);
  assert.match(source, /const buildSettingsPageHref = \(pathname: string\) =>/);
  assert.match(source, /buildHandoffHref\(pathname, handoffArgs, \{ preserveExistingQuery: true \}\)/);
  assert.match(
    source,
    /description="Review workspace tenancy, self-serve billing follow-up, subscription status, and retention defaults while keeping the verification\/go-live\/admin-readiness governance lane connected\."/,
  );
  assert.match(
    source,
    /Use Settings as the manual governance surface for self-serve billing follow-up, portal-return status,\s*audit export, SSO readiness, and dedicated-environment planning\./,
  );
  assert.match(
    source,
    /These controls only preserve workspace handoff context and surface billing\/status cues\.\s*They do not open\s*support workflows, trigger automatic remediation, or impersonate another role\./,
  );
  assert.match(source, /Review usage pressure/);
  assert.match(
    source,
    /href=\{buildSettingsPageHref\("\/verification\?surface=verification"\)\}[\s\S]*?>\s*Capture verification evidence\s*<\/Link>/s,
  );
  assert.match(source, /href=\{buildSettingsPageHref\("\/usage"\)\}/);
  assert.match(source, /href=\{buildSettingsPageHref\("\/go-live\?surface=go_live"\)\}/);
  assert.match(source, /href=\{buildSettingsPageHref\("\/admin"\)\}/);
  assert.match(source, /Capture verification evidence/);
  assert.match(source, /Rehearse go-live readiness/);
  assert.match(source, /Return to admin readiness view/);
});
