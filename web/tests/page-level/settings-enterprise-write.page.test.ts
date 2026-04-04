import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const settingsPanelPath = path.resolve(testDir, "../../components/settings/workspace-settings-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Settings panel keeps enterprise live-write error mapping semantics", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /if \(normalizedCode === "workspace_context_not_metadata"\)/);
  assert.match(source, /live write requires metadata-backed workspace context/);
  assert.match(source, /if \(normalizedCode === "workspace_feature_unavailable"\)/);
  assert.match(source, /live write is still plan-gated for this workspace/);
  assert.match(source, /if \(error\.status === 404 \|\| error\.status === 405\)/);
  assert.match(source, /write handler is not enabled yet/);
  assert.match(source, /if \(error\.status >= 500\)/);
  assert.match(source, /write is temporarily unavailable because control-plane write handling is not healthy/);
});

test("Settings panel keeps explicit 404/405 write-handler-not-enabled guidance contract", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /if \(error\.status === 404 \|\| error\.status === 405\)/);
  assert.match(
    source,
    /return `\$\{featureLabel\} live write is wired in the console, but the control-plane write handler is not enabled yet\. Keep this preflight summary and retry after backend rollout\.`;/,
  );
});

test("Settings panel keeps >=500 unhealthy guidance before fallback", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /if \(error\.status >= 500\) \{\s*return `\$\{featureLabel\} write is temporarily unavailable because control-plane write handling is not healthy\. Retry after recovery\.`;\s*\}/s,
  );
});

test("Settings panel keeps idempotency conflict and access guidance copy", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /if \(normalizedCode === "idempotency_conflict"\) \{\s*return `\$\{featureLabel\} write was already submitted with a different payload\. Refresh the form and retry once the desktop service confirms the previous save\.`;/,
  );
  assert.match(
    source,
    /if \(error\.status === 401 \|\| error\.status === 403\) \{\s*return `\$\{featureLabel\} configuration requires workspace owner or admin access\. Confirm your role and retry once the proper permissions are granted\.`;/,
  );
});

test("Settings panel keeps controlled live-write submit success semantics for SSO and dedicated environment", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /SSO configuration was recorded through controlled live write\./);
  assert.match(source, /Dedicated environment intake was recorded through controlled live write\./);
  assert.match(source, /Settings and readiness were refreshed for the latest status\./);
  assert.match(source, /queryKey: \["workspace-sso-readiness", workspaceSlug\]/);
  assert.match(source, /queryKey: \["workspace-dedicated-environment-readiness", workspaceSlug\]/);
});

test("Settings panel keeps contract source issue mapping distinct for 409 feature gate and 404/503 fallback states", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /function contractSourceLabel\(\s*source\?: ContractMetaSource \| null,\s*issue\?: ContractMetaIssue\s*\): string \{/s,
  );
  assert.match(
    source,
    /function contractSourceDescription\(\s*source\?: ContractMetaSource \| null,\s*issue\?: ContractMetaIssue\s*\): string \{/s,
  );
  assert.match(source, /return "Fallback: feature gate";/);
  assert.match(source, /return "Fallback: control plane unavailable";/);
  assert.match(
    source,
    /return issue\?\.status === 409\s*\?\s*"Feature is currently plan-gated\. UI shows fallback guidance until entitlement changes\."\s*:\s*"Feature is gated, so the UI shows fallback guidance until entitlement changes\.";/s,
  );
  assert.match(
    source,
    /return "Control plane is unavailable; readiness is currently fallback-derived\.";/,
  );
  assert.match(
    source,
    /return "Readiness load returned 404, so fallback values are shown until the live route is available\.";/,
  );
  assert.match(
    source,
    /return "Readiness load returned 503, so fallback values are shown until the control plane recovers\.";/,
  );
  assert.match(source, /return "Readiness load failed; showing fallback values for continuity\."/);
  assert.match(source, /const auditContractIssue: ControlPlaneContractIssue \| null =/);
  assert.match(source, /status: auditContractSource === "fallback_feature_gate" \? 409 : null,/);
  assert.match(source, /contractSourceLabel\(ssoContractSource, ssoContractIssue\)/);
  assert.match(source, /contractSourceDescription\(ssoContractSource, ssoContractIssue\)/);
  assert.match(source, /contractSourceLabel\(dedicatedContractSource, dedicatedContractIssue\)/);
  assert.match(source, /contractSourceDescription\(dedicatedContractSource, dedicatedContractIssue\)/);
  assert.match(source, /contractSourceLabel\(auditContractSource, auditContractIssue\)/);
  assert.match(source, /contractSourceDescription\(auditContractSource, auditContractIssue\)/);
});

test("Settings panel keeps SSO controlled live-write submit path, payload, and refresh contract", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /saveWorkspaceSsoReadiness,/);
  assert.match(source, /async function submitSsoConfiguration\(\): Promise<void>/);
  assert.match(source, /await saveWorkspaceSsoReadiness\(payload\);/);
  assert.match(source, /provider_type: ssoDraft\.protocol/);
  assert.match(source, /connection_mode: "workspace"/);
  assert.match(source, /metadata_url: ssoDraft\.metadataUrl\.trim\(\)/);
  assert.match(source, /email_domains: ssoDomainList/);
  assert.match(
    source,
    /await Promise\.all\(\[\s*queryClient\.invalidateQueries\(\{\s*queryKey: \["workspace-settings", workspaceSlug\]/s,
  );
  assert.match(source, /queryKey: \["workspace-sso-readiness", workspaceSlug\]/);
});

test("Settings panel keeps dedicated-environment submit path, payload, and refresh contract", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /saveWorkspaceDedicatedEnvironmentReadiness,/);
  assert.match(source, /async function submitDedicatedEnvironmentRequest\(\): Promise<void>/);
  assert.match(source, /await saveWorkspaceDedicatedEnvironmentReadiness\(payload\);/);
  assert.match(source, /target_region: dedicatedDraft\.targetRegion\.trim\(\)/);
  assert.match(source, /requester_email: requesterEmail \|\| null/);
  assert.match(source, /data_classification: dedicatedDraft\.dataClassification/);
  assert.match(source, /requested_capacity: requestedCapacity \|\| null/);
  assert.match(source, /requested_sla: requestedSla \|\| null/);
  assert.match(source, /network_boundary: networkNotes \|\| null/);
  assert.match(
    source,
    /await Promise\.all\(\[\s*queryClient\.invalidateQueries\(\{\s*queryKey: \["workspace-settings", workspaceSlug\]/s,
  );
  assert.match(source, /queryKey: \["workspace-dedicated-environment-readiness", workspaceSlug\]/);
});

test("Settings panel keeps enterprise preflight and submit-status guidance semantics", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /SSO write flow is locked until plan upgrade\./);
  assert.match(source, /Dedicated environment write flow is locked until plan upgrade\./);
  assert.match(source, /Submit status: \{ssoSubmitDisabledReason \?\? "Ready for controlled live write\."\}/);
  assert.match(
    source,
    /Submit status: \{dedicatedSubmitDisabledReason \?\? "Ready for controlled live write\."\}/,
  );
  assert.match(source, /SSO preflight is ready\./);
  assert.match(source, /Dedicated environment preflight is ready\./);
});

test("Settings panel resets submit-state feedback when SSO and dedicated drafts change", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /setSsoWriteState\(\(current\) => \(\{ \.\.\.current, error: null, notice: null, responseCode: null \}\)\);/,
  );
  assert.match(
    source,
    /setDedicatedWriteState\(\(current\) => \(\{ \.\.\.current, error: null, notice: null, responseCode: null \}\)\);/,
  );
  assert.match(source, /setSsoPreflightNotice\(null\);/);
  assert.match(source, /setDedicatedPreflightNotice\(null\);/);
});

test("Settings panel keeps submit result-state contract for responseCode and notice/error on success and failure", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /setSsoWriteState\(\{\s*submitting: false,\s*error: null,\s*notice:\s*"SSO configuration was recorded through controlled live write\.[^"]*",\s*responseCode: null,\s*\}\);/s,
  );
  assert.match(
    source,
    /setSsoWriteState\(\{\s*submitting: false,\s*error: formatEnterpriseWriteError\(error,\s*\{ feature: "sso" \}\),\s*notice: null,\s*responseCode: isControlPlaneRequestError\(error\) \? error\.code : null,\s*\}\);/s,
  );

  assert.match(
    source,
    /setDedicatedWriteState\(\{\s*submitting: false,\s*error: null,\s*notice:\s*"Dedicated environment intake was recorded through controlled live write\.[^"]*",\s*responseCode: null,\s*\}\);/s,
  );
  assert.match(
    source,
    /setDedicatedWriteState\(\{\s*submitting: false,\s*error: formatEnterpriseWriteError\(error,\s*\{ feature: "dedicated_environment" \}\),\s*notice: null,\s*responseCode: isControlPlaneRequestError\(error\) \? error\.code : null,\s*\}\);/s,
  );

  assert.match(
    source,
    /\{ssoWriteState\.responseCode \?\s*\(\s*<p className="mt-1 text-xs text-muted">Latest response code: \{ssoWriteState\.responseCode\}<\/p>\s*\) : null\}/s,
  );
  assert.match(
    source,
    /\{dedicatedWriteState\.responseCode \?\s*\(\s*<p className="mt-1 text-xs text-muted">Latest response code: \{dedicatedWriteState\.responseCode\}<\/p>\s*\) : null\}/s,
  );
});

test("Settings panel keeps post-submit reset ordering semantics by clearing notice/error/responseCode together on input edits", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /setSsoWriteState\(\(current\) => \(\{ \.\.\.current, error: null, notice: null, responseCode: null \}\)\);/,
  );
  assert.match(
    source,
    /setDedicatedWriteState\(\(current\) => \(\{ \.\.\.current, error: null, notice: null, responseCode: null \}\)\);/,
  );
  assert.match(source, /setSsoPreflightNotice\(null\);\s*setSsoWriteState\(\(current\) => \(\{ \.\.\.current, error: null, notice: null, responseCode: null \}\)\);/s);
  assert.match(
    source,
    /setDedicatedPreflightNotice\(null\);\s*setDedicatedWriteState\(\(current\) => \(\{ \.\.\.current, error: null, notice: null, responseCode: null \}\)\);/s,
  );
});

test("Settings panel keeps submit-payload and saved-sections coupling contract for enterprise fields", async () => {
  const source = await readSource(settingsPanelPath);

  // SSO submit payload fields must stay coupled with saved-section readiness render fields.
  assert.match(source, /email_domains: ssoDomainList/);
  assert.match(source, /client_id: ssoDraft\.protocol === "oidc" && entityId \? entityId : null/);
  assert.match(source, /audience: ssoDraft\.protocol === "saml" && entityId \? entityId : null/);
  assert.match(source, /metadata_url: ssoDraft\.metadataUrl\.trim\(\)/);
  assert.match(source, /const ssoConfiguredDomains = normalizeDomainList\(\[/);
  assert.match(source, /ssoReadiness\?\.email_domains/);
  assert.match(source, /ssoReadiness\?\.email_domain/);
  assert.match(source, /const ssoConfiguredIdentity =\s*ssoReadiness\?\.provider_type === "saml" \? \(ssoReadiness\?\.audience \?\? null\) : \(ssoReadiness\?\.client_id \?\? null\);/s);
  assert.match(source, /ssoReadiness\?\.metadata_url \?\? "Not saved"/);
  assert.match(source, /ssoReadiness\?\.entrypoint_url \?\? "Not saved"/);

  // Dedicated submit payload fields must stay coupled with saved provisioning request fields.
  assert.match(source, /requester_email: requesterEmail \|\| null/);
  assert.match(source, /data_classification: dedicatedDraft\.dataClassification/);
  assert.match(source, /requested_capacity: requestedCapacity \|\| null/);
  assert.match(source, /requested_sla: requestedSla \|\| null/);
  assert.match(source, /network_boundary: networkNotes \|\| null/);
  assert.match(source, /const dedicatedRequesterEmail = readString\(dedicatedEnvironmentReadiness\?\.requester_email\);/);
  assert.match(source, /const dedicatedRequestedCapacity = readString\(dedicatedEnvironmentReadiness\?\.requested_capacity\);/);
  assert.match(source, /const dedicatedRequestedSla = readString\(dedicatedEnvironmentReadiness\?\.requested_sla\);/);
  assert.match(source, /dedicatedEnvironmentReadiness\?\.network_boundary \?\? "Not saved"/);
  assert.match(source, /dedicatedEnvironmentReadiness\?\.compliance_notes \?\? "Not saved"/);
  assert.match(source, /dedicatedRequestedCapacity \?\? "-"/);
  assert.match(source, /dedicatedRequestedSla \?\? "-"/);
});

test("Settings panel keeps handoff query passthrough contract for settings/verification/go-live links", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /import \{ buildAdminReturnHref, buildHandoffHref \} from "@\/lib\/handoff-query";/);
  assert.match(source, /function buildSettingsHref\(args: SettingsHrefArgs\): string/);
  assert.match(source, /const href = buildHandoffHref\(/);
  assert.match(source, /source: args\.source,/);
  assert.match(source, /week8Focus: args\.week8Focus,/);
  assert.match(source, /attentionWorkspace: args\.attentionWorkspace,/);
  assert.match(source, /attentionOrganization: args\.attentionOrganization,/);
  assert.match(source, /deliveryContext: args\.deliveryContext,/);
  assert.match(source, /recentTrackKey: args\.recentTrackKey,/);
  assert.match(source, /recentUpdateKind: args\.recentUpdateKind,/);
  assert.match(source, /evidenceCount: args\.evidenceCount,/);
  assert.match(source, /recentOwnerLabel: args\.recentOwnerLabel,/);
  assert.match(source, /\{ preserveExistingQuery: true \}/);
  assert.match(source, /searchParams\.set\("intent", args\.intent\);/);
  assert.match(source, /const adminReturnHref = buildAdminReturnHref\("\/admin", \{/);
  assert.match(source, /queueSurface: normalizedRecentTrackKey,/);
  assert.match(source, /attentionWorkspace: attentionWorkspace \?\? workspaceSlug,/);

  assert.match(source, /const usageHref = buildSettingsHref\(\{ pathname: "\/usage", \.\.\.handoffHrefArgs \}\);/);
  assert.match(
    source,
    /const verificationHref = buildSettingsHref\(\{ pathname: "\/verification\?surface=verification", \.\.\.handoffHrefArgs \}\);/,
  );
  assert.match(source, /const goLiveHref = buildSettingsHref\(\{ pathname: "\/go-live\?surface=go_live", \.\.\.handoffHrefArgs \}\);/);
  assert.match(source, /const billingActionHref = billingSummary\?\.action[\s\S]*pathname: billingSummary\.action\.href,[\s\S]*\.\.\.handoffHrefArgs,/);
  assert.match(source, /const ssoUpgradeHref =[\s\S]*pathname: ssoReadiness\.upgrade_href,[\s\S]*\.\.\.handoffHrefArgs,/);
  assert.match(
    source,
    /const dedicatedEnvironmentUpgradeHref =[\s\S]*pathname: dedicatedEnvironmentReadiness\.upgrade_href,[\s\S]*\.\.\.handoffHrefArgs,/,
  );
});

test("Settings panel keeps plan-gated upgrade guidance and hrefs for SSO and dedicated environments", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /SSO configuration is available as a plan-gated enterprise surface\. Upgrade this workspace to unlock\s+provider setup\./,
  );
  assert.match(source, /href=\{ssoUpgradeHref\}/);
  assert.match(
    source,
    /Dedicated environment delivery is exposed as a plan-gated readiness surface in this slice\. Upgrade to\s+unlock workspace-level provisioning intake\./,
  );
  assert.match(source, /href=\{dedicatedEnvironmentUpgradeHref\}/);
});

test("Settings panel keeps attention/readiness/onboarding cards linked through shared handoff helpers", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /href=\{adminReturnHref\}[\s\S]*Return to admin readiness view/);
  assert.match(source, /href=\{verificationHref\}[\s\S]*Continue to verification/);
  assert.match(source, /href=\{adminReturnHref\}[\s\S]*Return to admin queue/);
  assert.match(source, /href=\{verificationHref\}[\s\S]*Return to verification/);
  assert.match(source, /href=\{goLiveHref\}[\s\S]*Continue with go-live drill prep/);

  assert.match(source, /const intentContextMap:[\s\S]*\{ label: "Back to Week 8 checklist", href: verificationHref \}/);
  assert.match(source, /const intentContextMap:[\s\S]*\{ label: "Continue to go-live drill", href: goLiveHref \}/);
  assert.match(source, /const billingFollowUpCard =[\s\S]*\{ label: "Return to Week 8 checklist", href: verificationHref \}/);
  assert.match(source, /const billingFollowUpCard =[\s\S]*\{ label: "Continue to go-live drill", href: goLiveHref \}/);
});

test("Settings panel keeps Stripe-focused billing action messaging and resolve-billing intent semantics", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /Self-serve checkout is live through Stripe-hosted checkout and webhook confirmation\./,
  );
  assert.match(
    source,
    /"resolve-billing": \{\s*title: "Resolve billing warning intent",/,
  );
  assert.match(
    source,
    /This path lands you in settings to resolve past-due or warning statuses\. Finish the billing cleanup before returning to the Week 8 checkpoint or admin readiness focus\./,
  );
  assert.match(
    source,
    /These links restore the `admin-readiness` focus once manual resolution finishes; nothing is automated for you\./,
  );
});
