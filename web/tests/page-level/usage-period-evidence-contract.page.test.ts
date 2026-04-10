import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const usageDashboardPath = path.resolve(testDir, "../../components/usage/workspace-usage-dashboard.tsx");
const onboardingWizardPath = path.resolve(testDir, "../../components/onboarding/workspace-onboarding-wizard.tsx");
const workspaceContextCalloutPath = path.resolve(testDir, "../../components/workspace-context-callout.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("usage dashboard keeps current-period evidence and plan-limit follow-up contract", async () => {
  const source = await readSource(usageDashboardPath);

  assert.match(source, /import \{ useState \} from "react";/);
  assert.match(source, /import \{ useMutation, useQuery, useQueryClient \} from "@tanstack\/react-query";/);
  assert.match(source, /import \{ Button \} from "@\/components\/ui\/button";/);
  assert.match(source, /import \{[\s\S]*fetchWorkspaceDeliveryTrack,[\s\S]*saveWorkspaceDeliveryTrack,[\s\S]*\} from "@\/services\/control-plane";/s);
  assert.match(source, /const deliveryTrackQueryKey = \["workspace-delivery-track", workspaceSlug\];/);
  assert.match(source, /const \{ data: deliveryTrack \} = useQuery\(\{/);
  assert.match(source, /const usageWindowLabel = usage \? `\$\{formatDate\(usage\.period_start\)\} to \$\{formatDate\(usage\.period_end\)\}` : "-";/);
  assert.match(source, /const billingActionHref = billingSummary\?\.action\?\.href \?\? "\/settings\?intent=manage-plan";/);
  assert.match(source, /const usagePlanGapNote =[\s\S]*buildUsagePlanGapNote\(\{/s);
  assert.match(source, /const usagePlanGapAcknowledged =[\s\S]*verificationDelivery\.notes\.includes\(USAGE_PLAN_GAP_NOTE_PREFIX\)/s);
  assert.match(source, /const acknowledgePlanGapMutation = useMutation\(\{/);
  assert.match(source, /notes: mergeUsagePlanGapNote\(verificationDelivery\?\.notes, usagePlanGapNote\),/);
  assert.match(source, /queryClient\.setQueryData\(deliveryTrackQueryKey, updated\);/);
  assert.match(source, /setPlanGapNotice\("Usage plan gap recorded in verification delivery track\."\);/);
  assert.match(source, /Current usage window/);
  assert.match(
    source,
    /Carry this billing window into verification evidence when documenting usage pressure, upgrade follow-up,/,
  );
  assert.match(source, /Existing follow-up/);
  assert.match(source, /Verification sync/);
  assert.match(source, /Record plan gap in verification track/);
  assert.match(source, /Plan gap recorded/);
  assert.match(source, /Recording\.\.\./);
  assert.match(source, /href=\{billingActionHref\}/);
  assert.match(source, /Resolve plan limits in settings/);
  assert.match(source, /Capture over-limit evidence/);
  assert.match(source, /Refresh over-limit evidence/);
  assert.match(source, /Return to admin queue/);
  assert.match(source, /Return to admin readiness view/);
  assert.match(source, /Current billing window: \{usageWindowLabel\}/);
  assert.match(source, /const selfServeSetupNotice = formatSelfServeSetupNotice\(billingSummary\?\.self_serve_reason_code \?\? null\);/);
  assert.match(source, /Self-serve provider setup required/);
  assert.match(source, /billing_self_serve_not_configured/);
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

test("workspace context callout documents usage and go-live usage surfaces", async () => {
  const source = await readSource(workspaceContextCalloutPath);

  assert.match(source, /if \(surface === "usage"\) \{/);
  assert.match(
    source,
    /Confirm workspace identity before recording usage pressure, quota evidence, or plan-limit remediation cues that will later be relayed into verification, settings, and admin notes\./,
  );
  assert.match(source, /return "Go-live context checkpoint";/);
  assert.match(
    source,
    /Confirm workspace identity before running mock go-live drill notes, reusing the same audit export evidence thread, and handing readiness status back to admin\./,
  );
});
