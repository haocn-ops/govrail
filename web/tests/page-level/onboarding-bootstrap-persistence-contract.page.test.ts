import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const onboardingWizardPath = path.resolve(testDir, "../../components/onboarding/workspace-onboarding-wizard.tsx");

async function readSource(): Promise<string> {
  return readFile(onboardingWizardPath, "utf8");
}

test("onboarding wizard keeps persisted bootstrap summary fallback and created/existing counters", async () => {
  const source = await readSource();

  assert.match(source, /const bootstrapSummary = bootstrapResult\?\.summary \?\? onboardingState\?\.summary \?\? null;/);
  assert.match(source, /bootstrapSummary\.providers_created/);
  assert.match(source, /bootstrapSummary\.providers_existing/);
  assert.match(source, /bootstrapSummary\.policies_created/);
  assert.match(source, /bootstrapSummary\.policies_existing/);
  assert.match(source, /\{bootstrapSummary\.providers_created\} created · \{bootstrapSummary\.providers_existing\} existing/);
  assert.match(source, /\{bootstrapSummary\.policies_created\} created · \{bootstrapSummary\.policies_existing\} existing/);
  assert.match(source, /This creates a small, deterministic seed set based on the workspace id, so re-running does not create duplicates\./);
});
