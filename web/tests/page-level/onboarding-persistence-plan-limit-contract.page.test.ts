import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const onboardingWizardPath = path.resolve(testDir, "../../components/onboarding/workspace-onboarding-wizard.tsx");
const playgroundPanelPath = path.resolve(testDir, "../../components/playground/playground-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("onboarding wizard keeps persisted bootstrap summary contract visible", async () => {
  const source = await readSource(onboardingWizardPath);

  assert.match(source, /const bootstrapSummary = bootstrapResult\?\.summary \?\? onboardingState\?\.summary \?\? null;/);
  assert.match(source, /bootstrapSummary\.providers_created/);
  assert.match(source, /bootstrapSummary\.providers_existing/);
  assert.match(source, /bootstrapSummary\.policies_created/);
  assert.match(source, /bootstrapSummary\.policies_existing/);
  assert.match(source, /created · \{bootstrapSummary\.providers_existing\} existing/);
  assert.match(source, /created · \{bootstrapSummary\.policies_existing\} existing/);
});

test("playground panel keeps period-aware plan-limit parsing and notice copy", async () => {
  const source = await readSource(playgroundPanelPath);

  assert.match(source, /periodStart: readString\(error\.details\.period_start\)/);
  assert.match(source, /periodEnd: readString\(error\.details\.period_end\)/);
  assert.match(source, /const planLimitPeriodLabel =/);
  assert.match(source, /formatDateLabel\(planLimitNotice\?\.periodStart \?\? null\)/);
  assert.match(source, /formatDateLabel\(planLimitNotice\?\.periodEnd \?\? null\)/);
  assert.match(source, /This workspace has used \{planLimitNotice\.used \?\? "\?"\} of/);
});
