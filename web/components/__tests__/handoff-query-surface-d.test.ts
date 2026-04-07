import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceLaunchpadPath = path.resolve(testDir, "../home/workspace-launchpad.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Workspace launchpad keeps verification/go-live explicit surface routing and shared path-builder continuity", async () => {
  const source = await readSource(workspaceLaunchpadPath);

  assert.match(source, /const nextStepLinks(?:: Array<\{ label: string; surface: OnboardingSurface \}>)? = \[/);
  assert.match(source, /\{ label: "Verification", surface: "verification" \}/);
  assert.match(source, /\{ label: "Go-live", surface: "go-live" \}/);

  assert.match(source, /function toSurfacePath\(surface: OnboardingSurface\): string/);
  assert.match(source, /if \(surface === "verification"\) \{\s*return "\/verification\?surface=verification";\s*\}/s);
  assert.match(source, /if \(surface === "go_live" \|\| surface === "go-live"\) \{\s*return "\/go-live\?surface=go_live";\s*\}/s);

  assert.match(source, /function buildLaunchpadHref\(pathname: string\): string \{/);
  assert.match(source, /const latestDemoRun = onboarding\?\.latest_demo_run \?\? null;/);
  assert.match(source, /const activeRunId = latestDemoRun\?\.run_id \?\? null;/);
  assert.match(source, /return buildVerificationChecklistHandoffHref\(\{ pathname, \.\.\.handoffHrefArgs, runId: activeRunId \}\);/);
  assert.match(source, /href=\{buildLaunchpadHref\(toSurfacePath\(recommendedNextStep\.surface\)\)\}/);
  assert.match(source, /href=\{buildLaunchpadHref\(toSurfacePath\(entry\.surface\)\)\}/);
  assert.match(source, /const latestDemoRunHint = onboarding\?\.latest_demo_run_hint \?\? null;/);
  assert.match(source, /const deliveryGuidance = onboarding\?\.delivery_guidance \?\? null;/);
  assert.match(source, /const onboardingRecoveryTitle = latestDemoRunHint\?\.needs_attention/);
  assert.match(source, /const onboardingRecoveryBody = latestDemoRunHint\?\.needs_attention/);
  assert.match(source, /const onboardingRecoveryMetaLines = filterTextLines\(\[/);
  assert.match(source, /<CardTitle>Onboarding recovery lane<\/CardTitle>/);
});
