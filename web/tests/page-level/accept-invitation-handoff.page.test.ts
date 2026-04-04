import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const acceptInvitationPagePath = path.resolve(testDir, "../../app/accept-invitation/page.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("accept-invitation page keeps onboarding continuity query keys and preserves existing surface query", async () => {
  const source = await readSource(acceptInvitationPagePath);

  assert.match(source, /function buildOnboardingPath\(pathname: string\): string \{/);
  assert.match(source, /if \(!acceptedWorkspace\) \{\s*return pathname;\s*\}/s);
  assert.match(source, /const \[basePath, rawQuery\] = pathname\.split\("\?", 2\);/);
  assert.match(source, /const params = new URLSearchParams\(rawQuery \?\? ""\);/);
  assert.match(
    source,
    /const continuityKeys = \[\s*"week8_focus",\s*"attention_organization",\s*"delivery_context",\s*"recent_track_key",\s*"recent_update_kind",\s*"evidence_count",\s*"recent_owner_label",\s*"recent_owner_display_name",\s*"recent_owner_email",\s*\];/s,
  );
  assert.match(source, /for \(const key of continuityKeys\) \{\s*const value = searchParams\.get\(key\);/s);
  assert.match(source, /if \(value && !params\.has\(key\)\) \{\s*params\.set\(key, value\);\s*\}/s);
  assert.match(source, /params\.set\("source", "onboarding"\);/);
  assert.match(source, /params\.set\("attention_workspace", acceptedWorkspace\.workspace_slug\);/);
  assert.match(source, /params\.set\("delivery_context", "recent_activity"\);/);
  assert.match(source, /params\.set\("recent_owner_label", acceptedWorkspace\.display_name\);/);
  assert.match(source, /const value = searchParams\.get\(key\);/);
  assert.match(source, /if \(value && !params\.has\(key\)\) \{\s*params\.set\(key, value\);\s*\}/s);
  assert.match(source, /"recent_owner_display_name"/);
  assert.match(source, /"recent_owner_email"/);
  assert.match(source, /const query = params\.toString\(\);/);
  assert.match(source, /return query \? `\$\{basePath\}\?\$\{query\}` : basePath;/);
});

test("accept-invitation suggested actions keep explicit verification/go-live surface paths", async () => {
  const source = await readSource(acceptInvitationPagePath);

  assert.match(source, /function getRoleLandingActions\(role: string\): WorkspaceLandingAction\[] \{/);
  assert.match(source, /\{ label: "Confirm members", path: "\/members" \}/);
  assert.match(source, /\{ label: "Run a demo", path: "\/playground" \}/);
  assert.match(source, /\{ label: "Open verification", path: "\/verification\?surface=verification" \}/);
  assert.match(source, /\{ label: "Open Week 8 checklist", path: "\/verification\?surface=verification" \}/);
  assert.match(source, /\{ label: "Review go-live drill", path: "\/go-live\?surface=go_live" \}/);
  assert.match(source, /onClick=\{\(\) => void openWorkspaceSurface\(buildOnboardingPath\(action\.path\)\)\}/);
  assert.match(source, /Open Week 8 checklist/);
  assert.match(source, /Review go-live drill/);
});
