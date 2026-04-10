import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const settingsPanelPath = path.resolve(testDir, "../../components/settings/workspace-settings-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("settings panel keeps checkout/portal action error narratives aligned", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /function formatPortalActionError\(error: unknown\): string \{/);
  assert.match(
    source,
    /if \(args\.action === "complete" \&\& \(isStripeBillingProvider\(args\.providerCode\) \|\| normalizedCode\.includes\("webhook"\)\)\) \{\s*return `\$\{providerLabel\} finalizes completion after checkout\. Use Refresh session after payment to sync status\.`;/s,
  );
  assert.match(
    source,
    /if \(args\.action === "refresh" && error\.status === 404\) \{\s*return "Checkout session was not found\. Create a new session from this page and continue\.";.*\}/s,
  );
  assert.match(
    source,
    /normalizedCode\.includes\("portal"\)\s*&&\s*normalizedCode\.includes\("unsupported"\)\s*\)\s*\{\s*return "The current billing provider does not expose a customer portal for this workspace\.";/s,
  );
  assert.match(
    source,
    /normalizedCode === "billing_provider_portal_unavailable"\)\s*\{\s*return "The current subscription provider does not offer a customer portal for this workspace\.";/s,
  );
  assert.match(
    source,
    /normalizedCode === "billing_provider_portal_unimplemented"\)\s*\{\s*return "This provider-managed portal flow is not available yet for the current billing provider\.";/s,
  );
  assert.match(
    source,
    /if \(error\.message\) \{\s*return error\.message;\s*\}\s*\}\s*if \(error instanceof Error && error\.message\) \{\s*return error\.message;\s*\}\s*return "Unable to open billing portal\.";/s,
  );
});

test("settings panel keeps subscription cancel/resume action error narratives aligned", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /function formatSubscriptionActionError\(/);
  assert.match(
    source,
    /normalizedCode === "billing_subscription_managed_by_provider"\)\s*\{\s*return args\.action === "cancel"\s*\?\s*"This subscription is managed in the billing provider portal\. Open billing portal from this page to change cancellation timing\."\s*:\s*"This subscription is managed in the billing provider portal\. Open billing portal from this page to restore renewal settings\.";/s,
  );
  assert.match(
    source,
    /normalizedCode === "billing_subscription_not_cancellable"\)\s*\{\s*return "This subscription can no longer be scheduled for cancellation from this workspace\.";/s,
  );
  assert.match(
    source,
    /normalizedCode === "billing_subscription_not_resumable"\)\s*\{\s*return "This subscription must be replaced through checkout before renewal can resume\.";/s,
  );
  assert.match(
    source,
    /normalizedCode === "billing_subscription_missing"\)\s*\{\s*return "No workspace subscription is available to update right now\. Refresh settings and retry\.";/s,
  );
  assert.match(
    source,
    /normalizedCode === "billing_subscription_not_paid"\)\s*\{\s*return "Only paid subscriptions can change renewal timing from this page\.";/s,
  );
  assert.match(
    source,
    /normalizedCode === "billing_subscription_plan_unavailable"\)\s*\{\s*return "Billing plan details are unavailable right now\. Refresh settings and retry\.";/s,
  );
  assert.match(
    source,
    /error: formatSubscriptionActionError\(error,\s*\{\s*action: "cancel",\s*\}\),/s,
  );
  assert.match(
    source,
    /error: formatSubscriptionActionError\(error,\s*\{\s*action: "resume",\s*\}\),/s,
  );
});

test("settings panel keeps audit export transport-failure fallback semantics aligned", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /function formatAuditExportActionError\(error: unknown\): string \{/);
  assert.match(
    source,
    /normalizedCode === "workspace_feature_unavailable"\) \{\s*return "Audit export is gated by current plan entitlements\. Upgrade to unlock export\.";/s,
  );
  assert.match(
    source,
    /normalizedCode === "control_plane_base_missing"\) \{\s*return "Control plane is unavailable; audit export cannot be generated right now\.";/s,
  );
  assert.match(
    source,
    /return `Audit export request failed\. Retry after checking workspace\/control-plane health\. \(\$\{error\.message\}\)`;/s,
  );
  assert.match(
    source,
    /try \{\s*const result = await downloadWorkspaceAuditExportViewModel\(\{[\s\S]*?\}\);/s,
  );
  assert.match(
    source,
    /catch \(error\) \{\s*setAuditExport\(\{\s*exporting: false,\s*error: formatAuditExportActionError\(error\),\s*notice: null,\s*contractSource: "fallback_error",/s,
  );
  assert.match(
    source,
    /contractIssueCode: isControlPlaneRequestError\(error\) \? error\.code : "request_failed",/s,
  );
});
