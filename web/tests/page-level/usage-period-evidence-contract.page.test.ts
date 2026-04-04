import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const usageDashboardPath = path.resolve(testDir, "../../components/usage/workspace-usage-dashboard.tsx");
const onboardingWizardPath = path.resolve(testDir, "../../components/onboarding/workspace-onboarding-wizard.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("usage dashboard keeps current-period evidence and plan-limit follow-up contract", async () => {
  const source = await readSource(usageDashboardPath);

  assert.match(source, /const usageWindowLabel = usage \? `\$\{formatDate\(usage\.period_start\)\} to \$\{formatDate\(usage\.period_end\)\}` : "-";/);
  assert.match(source, /const billingActionHref = billingSummary\?\.action\?\.href \?\? "\/settings\?intent=manage-plan";/);
  assert.match(source, /Current usage window/);
  assert.match(
    source,
    /Carry this billing window into verification evidence when documenting usage pressure, upgrade follow-up,/,
  );
  assert.match(source, /href=\{billingActionHref\}/);
  assert.match(source, /Resolve plan limits in settings/);
  assert.match(source, /Capture over-limit evidence/);
  assert.match(source, /Current billing window: \{usageWindowLabel\}/);
});

test("onboarding wizard keeps persisted bootstrap summary and current-period usage awareness lane", async () => {
  const source = await readSource(onboardingWizardPath);

  assert.match(source, /const bootstrapSummary = bootstrapResult\?\.summary \?\? onboardingState\?\.summary \?\? null;/);
  assert.match(source, /This creates a small, deterministic seed set based on the workspace id, so re-running does not create duplicates\./);
  assert.match(source, /Before sending the first governed run, confirm that plan posture and current-period usage still/);
  assert.match(source, /Open usage checkpoint/);
  assert.match(source, /Open settings billing lane/);
  assert.match(source, /Capture verification evidence before widening rollout, and keep rollback ownership, settings review,/);
});
