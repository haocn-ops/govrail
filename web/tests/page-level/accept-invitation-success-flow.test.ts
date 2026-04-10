import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildAcceptedWorkspaceOnboardingPath,
  formatAcceptedInvitationRoleLabel,
  getAcceptInvitationRoleLandingActions,
  getAcceptInvitationRoleLaneSummary,
  shouldContinueAcceptedWorkspaceSurfaceNavigation,
  type AcceptedWorkspace,
} from "@/lib/accept-invitation-success-flow";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const acceptInvitationPagePath = path.resolve(testDir, "../../app/accept-invitation/page.tsx");

const acceptedWorkspace: AcceptedWorkspace = {
  workspace_slug: "ws-ops",
  display_name: "Ops Workspace",
  organization_display_name: "Govrail Ops",
  role: "approver",
  owner_email: "avery.ops@govrail.test",
};

test("accept-invitation success helper keeps approver role lanes explicit", () => {
  assert.equal(formatAcceptedInvitationRoleLabel("workspace_owner"), "workspace owner");
  assert.match(getAcceptInvitationRoleLaneSummary("approver"), /Week 8 checklist/);
  assert.deepEqual(getAcceptInvitationRoleLandingActions("approver"), [
    { label: "Open Week 8 checklist", path: "/verification?surface=verification" },
    { label: "Review go-live drill", path: "/go-live?surface=go_live" },
    { label: "Review usage", path: "/usage" },
  ]);
});

test("accept-invitation success helper preserves explicit surface query and onboarding continuity", () => {
  const searchParams = new URLSearchParams({
    run_id: "run_123",
    week8_focus: "credentials",
    attention_organization: "org_preview",
    delivery_context: "verification",
    recent_track_key: "verification",
    recent_update_kind: "verification",
    evidence_count: "2",
    recent_owner_label: "Ops",
    recent_owner_display_name: "Avery Ops",
    recent_owner_email: "old.owner@govrail.test",
  });

  const href = buildAcceptedWorkspaceOnboardingPath({
    pathname: "/verification?surface=verification",
    acceptedWorkspace,
    searchParams,
  });

  const parsed = new URL(`https://example.test${href}`);
  assert.equal(parsed.pathname, "/verification");
  assert.equal(parsed.searchParams.get("surface"), "verification");
  assert.equal(parsed.searchParams.get("source"), "onboarding");
  assert.equal(parsed.searchParams.get("run_id"), "run_123");
  assert.equal(parsed.searchParams.get("week8_focus"), "credentials");
  assert.equal(parsed.searchParams.get("attention_workspace"), "ws-ops");
  assert.equal(parsed.searchParams.get("attention_organization"), "org_preview");
  assert.equal(parsed.searchParams.get("delivery_context"), "recent_activity");
  assert.equal(parsed.searchParams.get("recent_track_key"), "verification");
  assert.equal(parsed.searchParams.get("recent_update_kind"), "verification");
  assert.equal(parsed.searchParams.get("evidence_count"), "2");
  assert.equal(parsed.searchParams.get("recent_owner_label"), "Ops Workspace");
  assert.equal(parsed.searchParams.get("recent_owner_display_name"), "Ops Workspace");
  assert.equal(parsed.searchParams.get("recent_owner_email"), "avery.ops@govrail.test");
});

test("accept-invitation success helper falls back to the raw path without an accepted workspace", () => {
  const href = buildAcceptedWorkspaceOnboardingPath({
    pathname: "/usage",
    acceptedWorkspace: null,
    searchParams: new URLSearchParams(),
  });

  assert.equal(href, "/usage");
});

test("accept-invitation success helper only blocks navigation on failed workspace switches", () => {
  assert.equal(shouldContinueAcceptedWorkspaceSurfaceNavigation({ status: "switched" }), true);
  assert.equal(shouldContinueAcceptedWorkspaceSurfaceNavigation({ status: "continued_after_error" }), true);
  assert.equal(shouldContinueAcceptedWorkspaceSurfaceNavigation({ status: "failed" }), false);
});

test("accept-invitation page delegates success helpers for role lanes and workspace navigation", async () => {
  const source = await readFile(acceptInvitationPagePath, "utf8");

  assert.match(
    source,
    /import \{\s*buildAcceptedWorkspaceOnboardingPath,\s*formatAcceptedInvitationRoleLabel,\s*getAcceptInvitationRoleLandingActions,\s*getAcceptInvitationRoleLaneSummary,\s*shouldContinueAcceptedWorkspaceSurfaceNavigation,\s*type AcceptedWorkspace,\s*\} from "@\/lib\/accept-invitation-success-flow";/s,
  );
  assert.match(source, /const outcome = await performWorkspaceSwitch\(\{/);
  assert.match(source, /if \(!shouldContinueAcceptedWorkspaceSurfaceNavigation\(outcome\)\) \{/);
  assert.match(source, /Workspace role: \{formatAcceptedInvitationRoleLabel\(acceptedWorkspace\.role\)\}/);
  assert.match(source, /getAcceptInvitationRoleLaneSummary\(acceptedWorkspace\.role\)/);
  assert.match(source, /getAcceptInvitationRoleLandingActions\(acceptedWorkspace\.role\)/);
  assert.match(source, /buildAcceptedWorkspaceOnboardingPath\(\{\s*pathname: action\.path,\s*acceptedWorkspace,\s*searchParams,\s*\}\)/s);
});
