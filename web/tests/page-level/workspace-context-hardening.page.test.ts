import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const topbarPath = path.resolve(testDir, "../../components/topbar.tsx");
const membersPanelPath = path.resolve(testDir, "../../components/members/members-panel.tsx");
const settingsPanelPath = path.resolve(testDir, "../../components/settings/workspace-settings-panel.tsx");
const workspaceContextCalloutPath = path.resolve(testDir, "../../components/workspace-context-callout.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Topbar keeps fallback-aware context badge and warning semantics", async () => {
  const source = await readSource(topbarPath);

  assert.match(source, /variant=\{sourceDetail\.is_fallback \? "default" : "subtle"\}/);
  assert.match(source, /context: \{sourceDetail\.label\}/);
  assert.match(source, /variant=\{sourceDetail\.session_checkpoint_required \? "default" : "subtle"\}/);
  assert.match(source, /\{sourceDetail\.checkpoint_label\}/);
  assert.match(
    source,
    /sourceDetail\.warning \?\s*\(\s*<Badge variant="default">review context details on \/session<\/Badge>\s*\)\s*:\s*null/s,
  );
  assert.match(source, /sourceDetail\.local_only \? <Badge variant="default">local-only context<\/Badge> : null/);
  assert.match(source, /const nextLane = nextLaneFromRole\(workspaceContext\.workspace\.subject_roles\);/);
  assert.match(
    source,
    /Live metadata is unavailable, so treat this as preview data until the workspace context route on\s+<code className="font-mono">\/session<\/code>\s+confirms a metadata-backed identity and tenant before you follow any guidance\./,
  );
});

test("workspace context route shares warning header when fallback warns", async () => {
  const source = await readSource(path.resolve(testDir, "../../app/api/workspace-context/route.ts"));

  assert.match(source, /response\.headers\.set\("x-govrail-workspace-context-warning",/);
  assert.match(source, /request\.headers\.get\("x-authenticated-subject"\)\s*\?\?\s*request\.headers\.get\("cf-access-authenticated-user-email"\)/s);
  assert.doesNotMatch(source, /x-subject-id/);
});

test("workspace context callout keeps reusable source/fallback/session guardrails contract", async () => {
  const source = await readSource(workspaceContextCalloutPath);

  assert.match(
    source,
    /export const WORKSPACE_CONTEXT_CALLOUT_SURFACES = \["settings", "usage", "verification", "go-live"\] as const;/,
  );
  assert.match(source, /export function WorkspaceContextCallout\(/);
  assert.match(source, /variant=\{sourceDetail\.is_fallback \? "default" : "subtle"\}/);
  assert.match(source, /context: \{sourceDetail\.label\}/);
  assert.match(source, /variant=\{sourceDetail\.session_checkpoint_required \? "default" : "subtle"\}/);
  assert.match(source, /\{sourceDetail\.checkpoint_label\}/);
  assert.match(source, /sourceDetail\.warning \? <Badge variant="default">fallback warning<\/Badge> : null/);
  assert.match(source, /sourceDetail\.local_only \? <Badge variant="default">local-only context<\/Badge> : null/);
  assert.match(source, /Live metadata is unavailable\./);
  assert.match(source, /<code className="font-mono">\/session<\/code>/);
  assert.match(source, /href=\{sessionHref\}/);
  assert.match(source, /Review workspace context on \/session/);
});

test("Members panel keeps metadata-guard fallback messaging and no-members live-only semantics", async () => {
  const source = await readSource(membersPanelPath);

  assert.match(source, /const isMetadataGuard = contract\?\.source === "workspace_context_not_metadata";/);
  assert.match(
    source,
    /Members data is intentionally hidden until metadata-backed workspace context is available\./,
  );
  assert.match(source, /const isFallbackError = contract\?\.source === "fallback_error";/);
  assert.match(source, /contract\?\.source === "live" && members\.length === 0/);
});

test("Members panel keeps feature-gate and control-plane-unavailable fallback semantics", async () => {
  const source = await readSource(membersPanelPath);

  assert.match(source, /const isFeatureGate = contract\?\.source === "fallback_feature_gate";/);
  assert.match(source, /const isControlPlaneUnavailable = contract\?\.source === "fallback_control_plane_unavailable";/);
  assert.match(source, /return "Plan-gated members";/);
  assert.match(source, /return "Control plane unavailable";/);
  assert.match(
    source,
    /Members visibility for this workspace is currently plan-gated\. Upgrade the workspace plan before using this surface\./,
  );
  assert.match(
    source,
    /Members endpoint is waiting for live control-plane configuration\. Verify the deployment wiring, then retry\./,
  );
});

test("Settings panel keeps enterprise saved-configuration contracts for SSO and dedicated environment", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /\{ssoConfigured \? \(/);
  assert.match(source, /Saved configuration/);
  assert.match(source, /Configured domains/);
  assert.match(source, /Entrypoint URL/);
  assert.match(source, /Signing certificate/);

  assert.match(source, /\{dedicatedConfigured \? \(/);
  assert.match(source, /Saved provisioning request/);
  assert.match(source, /Requester email/);
  assert.match(source, /Data classification/);
  assert.match(source, /Requested capacity/);
  assert.match(source, /Requested SLA/);
});

test("Settings panel keeps audit export section and plan-gated/export action semantics", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /Audit export/);
  assert.match(source, /Download audit export/);
  assert.match(source, /Export disabled reason: current plan does not include audit export\./);
  assert.match(source, /Attach in verification/);
  assert.match(source, /Carry to go-live drill/);
  assert.match(source, /Latest export receipt/);
  assert.match(source, /Full workspace history/);
  assert.match(source, /Unavailable in this browser/);
  assert.match(source, /Date filters above reflect the manual input on this page/);
  assert.match(source, /UTC day boundaries/);
  assert.match(source, /Evidence note/);
});
