import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const acceptInvitationPagePath = path.resolve(testDir, "../../app/accept-invitation/page.tsx");
const acceptInvitationSuccessFlowPath = path.resolve(testDir, "../../lib/accept-invitation-success-flow.ts");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("accept-invitation page keeps onboarding continuity query keys and preserves existing surface query", async () => {
  const source = await readSource(acceptInvitationPagePath);

  assert.match(
    source,
    /import \{\s*buildAcceptedWorkspaceOnboardingPath,\s*formatAcceptedInvitationRoleLabel,\s*getAcceptInvitationRoleLandingActions,\s*getAcceptInvitationRoleLaneSummary,\s*shouldContinueAcceptedWorkspaceSurfaceNavigation,\s*type AcceptedWorkspace,\s*\} from "@\/lib\/accept-invitation-success-flow";/s,
  );
  assert.doesNotMatch(source, /type AcceptedWorkspace = \{/);
  assert.match(
    source,
    /buildAcceptedWorkspaceOnboardingPath\(\{\s*pathname: action\.path,\s*acceptedWorkspace,\s*searchParams,\s*\}\)/s,
  );
});

test("accept-invitation suggested actions keep explicit verification/go-live surface paths", async () => {
  const [source, helperSource] = await Promise.all([
    readSource(acceptInvitationPagePath),
    readSource(acceptInvitationSuccessFlowPath),
  ]);

  assert.match(source, /getAcceptInvitationRoleLandingActions\(acceptedWorkspace\.role\)/);
  assert.match(source, /const outcome = await performWorkspaceSwitch\(\{/);
  assert.match(source, /workspace_slug: acceptedWorkspace\.workspace_slug,/);
  assert.match(source, /if \(!shouldContinueAcceptedWorkspaceSurfaceNavigation\(outcome\)\) \{/);
  assert.match(source, /router\.push\(pathname\);/);
  assert.match(source, /formatAcceptedInvitationRoleLabel\(acceptedWorkspace\.role\)/);
  assert.match(source, /getAcceptInvitationRoleLaneSummary\(acceptedWorkspace\.role\)/);
  assert.match(helperSource, /\{ label: "Open Week 8 checklist", path: "\/verification\?surface=verification" \}/);
  assert.match(helperSource, /\{ label: "Review go-live drill", path: "\/go-live\?surface=go_live" \}/);
  assert.match(helperSource, /\{ label: "Confirm members", path: "\/members" \}/);
  assert.match(helperSource, /\{ label: "Run a demo", path: "\/playground" \}/);
});
