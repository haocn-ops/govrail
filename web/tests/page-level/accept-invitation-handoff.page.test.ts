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
  assert.match(
    source,
    /import \{\s*buildWorkspaceNavigationHref,\s*performWorkspaceSwitch,\s*\} from "@\/lib\/client-workspace-navigation";/s,
  );
  assert.match(
    source,
    /const continuityKeys = \[\s*"run_id",\s*"week8_focus",\s*"attention_organization",\s*"delivery_context",\s*"recent_track_key",\s*"recent_update_kind",\s*"evidence_count",\s*"recent_owner_label",\s*"recent_owner_display_name",\s*"recent_owner_email",\s*\];/s,
  );
  assert.match(
    source,
    /const continuitySearchParams = Object\.fromEntries\(\s*continuityKeys\.map\(\(key\) => \[key, searchParams\.get\(key\)\]\),\s*\) satisfies Record<string, string \| null>;/s,
  );
  assert.match(source, /return buildWorkspaceNavigationHref\(/);
  assert.match(source, /source: "onboarding",/);
  assert.match(source, /attention_workspace: acceptedWorkspace\.workspace_slug,/);
  assert.match(source, /delivery_context: "recent_activity",/);
  assert.match(source, /recent_owner_label: acceptedWorkspace\.display_name,/);
  assert.match(source, /recent_owner_display_name: acceptedWorkspace\.display_name,/);
  assert.match(source, /recent_owner_email: acceptedWorkspace\.owner_email,/);
  assert.match(source, /\{ preferExistingQuery: true \}/);
  assert.match(source, /"recent_owner_display_name"/);
  assert.match(source, /"recent_owner_email"/);
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
  assert.match(source, /const outcome = await performWorkspaceSwitch\(\{/);
  assert.match(source, /workspace_slug: acceptedWorkspace\.workspace_slug,/);
  assert.match(source, /if \(outcome\.status === "failed"\) \{/);
  assert.match(source, /router\.push\(pathname\);/);
  assert.match(source, /Open Week 8 checklist/);
  assert.match(source, /Review go-live drill/);
});
