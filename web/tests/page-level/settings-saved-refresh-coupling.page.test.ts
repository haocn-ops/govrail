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

test("Settings panel keeps SSO saved-section fields aligned with submit payload and draft hydration", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /import \{\s*buildDedicatedHydrationConfigKey,\s*buildSsoHydrationConfigKey,\s*\} from "@\/components\/settings\/enterprise-hydration";/s,
  );
  assert.match(source, /Saved configuration/);
  assert.match(source, /Configured domains/);
  assert.match(source, /Metadata URL/);
  assert.match(source, /Entrypoint URL/);
  assert.match(source, /email_domain: ssoDomainList\[0\] \?\? null/);
  assert.match(source, /email_domains: ssoDomainList/);
  assert.match(source, /metadata_url: ssoDraft\.metadataUrl\.trim\(\)/);
  assert.match(source, /client_id: ssoDraft\.protocol === "oidc" && entityId \? entityId : null/);
  assert.match(source, /audience: ssoDraft\.protocol === "saml" && entityId \? entityId : null/);
  assert.match(
    source,
    /const ssoConfiguredIdentity = readString\(\s*ssoReadiness\?\.provider_type === "saml" \? ssoReadiness\?\.audience : ssoReadiness\?\.client_id,\s*\);/s,
  );
  assert.match(source, /metadataUrl: ssoReadiness\?\.metadata_url \?\? current\.metadataUrl/);
  assert.match(source, /entityId: ssoConfiguredIdentity \?\? current\.entityId/);
  assert.match(source, /domains: ssoConfiguredDomainsDraftValue/);
  assert.match(source, /const configKey = buildSsoHydrationConfigKey\(\{/);
});

test("Settings panel keeps dedicated saved-request fields aligned with submit payload and draft hydration", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /Saved provisioning request/);
  assert.match(source, /Network boundary/);
  assert.match(source, /Compliance notes/);
  assert.match(source, /Requester email/);
  assert.match(source, /Data classification/);
  assert.match(source, /Requested capacity/);
  assert.match(source, /Requested SLA/);
  assert.match(source, /network_boundary: networkNotes \|\| null/);
  assert.match(source, /compliance_notes: `Requested dedicated environment intake for \$\{formatTokenLabel\(/);
  assert.match(source, /requester_email: requesterEmail \|\| null/);
  assert.match(source, /data_classification: dedicatedDraft\.dataClassification/);
  assert.match(source, /requested_capacity: requestedCapacity \|\| null/);
  assert.match(source, /requested_sla: requestedSla \|\| null/);
  assert.match(source, /targetRegion: dedicatedConfiguredRegion \?\? current\.targetRegion/);
  assert.match(
    source,
    /dataClassification: dedicatedEnvironmentReadiness\?\.data_classification \?\? current\.dataClassification/,
  );
  assert.match(source, /requesterEmail: dedicatedRequesterEmail \?\? current\.requesterEmail/);
  assert.match(source, /requestedCapacity: dedicatedRequestedCapacity \?\? current\.requestedCapacity/);
  assert.match(source, /requestedSla: dedicatedRequestedSla \?\? current\.requestedSla/);
  assert.match(source, /networkNotes: dedicatedEnvironmentReadiness\?\.network_boundary \?\? current\.networkNotes/);
  assert.match(source, /const configKey = buildDedicatedHydrationConfigKey\(\{/);
});

test("Settings panel keeps plan-gated next-steps narrative for enterprise SSO and dedicated sections", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /const ssoNextSteps = ssoReadiness\?\.next_steps \?\? \[\s*"Upgrade to a plan with SSO support\.",\s*"Choose OIDC or SAML as the connection protocol\.",\s*"Configure identity provider metadata and domain mapping\.",\s*];/,
  );
  assert.match(
    source,
    /const dedicatedEnvironmentNextSteps = dedicatedEnvironmentReadiness\?\.next_steps \?\? \[\s*"Upgrade to a plan with dedicated environment support\.",\s*"Confirm region and compliance boundaries for the target deployment\.",\s*"Review network and access isolation requirements before provisioning\.",\s*];/,
  );
});

test("Settings panel keeps SSO saved sections coupled with runtime badges, source badges, and readiness/live-write refresh", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /const ssoAdditiveState = readEnterpriseAdditiveState\(ssoReadiness\);/);
  assert.match(source, /const ssoConfigured = ssoAdditiveState\.configured \?\? \(ssoReadiness\?\.status === "configured"\);/);
  assert.match(
    source,
    /enterpriseStatusBadgeVariant\(\{\s*enabled: ssoFeatureEnabled,\s*status: ssoReadiness\?\.status \?\? null,\s*configured: ssoConfigured,\s*configurationState: ssoConfigurationState,\s*isError: isSsoError,\s*\}\)/s,
  );
  assert.match(
    source,
    /enterpriseStatusLabel\(\{\s*enabled: ssoFeatureEnabled,\s*status: ssoReadiness\?\.status \?\? null,\s*configured: ssoConfigured,\s*configurationState: ssoConfigurationState,\s*isError: isSsoError,\s*\}\)/s,
  );
  assert.match(source, /<Badge variant=\{contractSourceBadgeVariant\(ssoContractSource\)\}>/);
  assert.match(source, /contractSourceLabel\(ssoContractSource, ssoContractIssue\)/);
  assert.match(source, /contractSourceDescription\(ssoContractSource, ssoContractIssue\)/);
  assert.match(source, /\{ssoConfigured \? \(/);
  assert.match(source, /<p className="text-muted">Saved configuration<\/p>/);
  assert.match(source, /SSO is marked configured in readiness data\./);
  assert.match(source, /Runtime state: configuration/);
  assert.match(source, /formatTokenLabel\(ssoConfigurationState \?\? "unknown"\)/);
  assert.match(source, /formatTokenLabel\(ssoDeliveryStatus \?\? "unknown"\)/);
  assert.match(source, /queryKey: \["workspace-sso-readiness", workspaceSlug\]/);
  assert.match(source, /const ssoRecoveryCard = buildEnterpriseRecoveryCard\(\{/);
  assert.match(source, /contractSource: ssoContractSource,/);
  assert.match(source, /contractIssue: ssoContractIssue,/);
});

test("Settings panel keeps dedicated saved sections coupled with runtime badges, source badges, and readiness/live-write refresh", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /const dedicatedAdditiveState = readEnterpriseAdditiveState\(dedicatedEnvironmentReadiness\);/);
  assert.match(
    source,
    /const dedicatedConfigured =\s*dedicatedAdditiveState\.configured \?\? \(dedicatedEnvironmentReadiness\?\.status === "configured"\);/s,
  );
  assert.match(
    source,
    /enterpriseStatusBadgeVariant\(\{\s*enabled: dedicatedEnvironmentFeatureEnabled,\s*status: dedicatedEnvironmentReadiness\?\.status \?\? null,\s*configured: dedicatedConfigured,\s*configurationState: dedicatedConfigurationState,\s*isError: isDedicatedEnvironmentError,\s*\}\)/s,
  );
  assert.match(
    source,
    /enterpriseStatusLabel\(\{\s*enabled: dedicatedEnvironmentFeatureEnabled,\s*status: dedicatedEnvironmentReadiness\?\.status \?\? null,\s*configured: dedicatedConfigured,\s*configurationState: dedicatedConfigurationState,\s*isError: isDedicatedEnvironmentError,\s*\}\)/s,
  );
  assert.match(source, /<Badge variant=\{contractSourceBadgeVariant\(dedicatedContractSource\)\}>/);
  assert.match(source, /contractSourceLabel\(dedicatedContractSource, dedicatedContractIssue\)/);
  assert.match(source, /contractSourceDescription\(dedicatedContractSource, dedicatedContractIssue\)/);
  assert.match(source, /\{dedicatedConfigured \? \(/);
  assert.match(source, /<p className="text-muted">Saved provisioning request<\/p>/);
  assert.match(source, /Runtime state: configuration/);
  assert.match(source, /formatTokenLabel\(dedicatedConfigurationState \?\? "unknown"\)/);
  assert.match(source, /formatTokenLabel\(dedicatedDeliveryStatus \?\? "unknown"\)/);
  assert.match(source, /queryKey: \["workspace-dedicated-environment-readiness", workspaceSlug\]/);
  assert.match(source, /const dedicatedRecoveryCard = buildEnterpriseRecoveryCard\(\{/);
  assert.match(source, /contractSource: dedicatedContractSource,/);
  assert.match(source, /contractIssue: dedicatedContractIssue,/);
});

test("Settings panel keeps readiness/attention/onboarding cards aligned with verification and go-live handoff links", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /const adminReturnHref = buildAdminReturnHref\("\/admin", \{[\s\S]*runId,/);
  assert.match(
    source,
    /const verificationHref = buildSettingsHref\(\{ pathname: "\/verification\?surface=verification", \.\.\.handoffHrefArgs \}\);/,
  );
  assert.match(source, /const goLiveHref = buildSettingsHref\(\{ pathname: "\/go-live\?surface=go_live", \.\.\.handoffHrefArgs \}\);/);
  assert.match(source, /queueSurface: normalizedRecentTrackKey,/);
  assert.match(source, /attentionWorkspace: attentionWorkspace \?\? workspaceSlug,/);
  assert.match(source, /runId,/);

  assert.match(source, /const readinessCard =\s*normalizedSource === "admin-readiness"/s);
  assert.match(source, /title: "Admin readiness follow-up"/);
  assert.match(source, /<Link\s+href=\{adminReturnHref\}[\s\S]*?>\s*Return to admin readiness view\s*<\/Link>/s);

  assert.match(source, /const attentionCard =\s*normalizedSource === "admin-attention"/s);
  assert.match(source, /title: "Admin queue billing follow-up"/);
  assert.match(source, /<Link\s+href=\{verificationHref\}[\s\S]*?>\s*Continue to verification\s*<\/Link>/s);
  assert.match(source, /<Link\s+href=\{adminReturnHref\}[\s\S]*?>\s*Return to admin queue\s*<\/Link>/s);

  assert.match(source, /const onboardingCard =\s*normalizedSource === "onboarding"/s);
  assert.match(source, /title: "Onboarding governance checkpoint"/);
  assert.match(source, /<Link\s+href=\{verificationHref\}[\s\S]*?>\s*Return to verification\s*<\/Link>/s);
  assert.match(source, /<Link\s+href=\{goLiveHref\}[\s\S]*?>\s*Continue with go-live drill prep\s*<\/Link>/s);
});

test("Settings panel keeps enterprise evidence continuity navigation-only with explicit verification surface and Week 8 wording", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /const verificationHref = buildSettingsHref\(\{ pathname: "\/verification\?surface=verification", \.\.\.handoffHrefArgs \}\);/,
  );
  assert.match(source, /const governanceClosureCard = \{/);
  assert.match(source, /title: "Billing and readiness closure lane"/);
  assert.match(
    source,
    /governanceClosureCard = \{[\s\S]*?\{ label: "Capture verification evidence", href: verificationHref \}[\s\S]*?footnote:\s*"Navigation only: these links preserve governance context across settings, verification, go-live, and admin readiness without automation, support tooling, or impersonation\."[\s\S]*?\};/s,
  );
  assert.match(source, /const usagePressureCard = \{/);
  assert.match(
    source,
    /Use this lane to compare plan limits with current usage before limits block a first demo, a provider expansion, or later Week 8 follow-up\./,
  );
  assert.match(
    source,
    /usagePressureCard = \{[\s\S]*?\{ label: "Capture verification evidence", href: verificationHref \}[\s\S]*?footnote:\s*"This lane is still navigation-only: compare usage against plan limits, decide whether billing action is needed, then keep the same workspace evidence path through verification and back to admin\."[\s\S]*?\};/s,
  );
});

test("Settings panel keeps intent and billing follow-up cards coupled to source-specific handoff routes", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(source, /const intentContextMap: Record</);
  assert.match(source, /"manage-plan":[\s\S]*\{ label: "Back to Week 8 checklist", href: verificationHref \}/s);
  assert.match(source, /"manage-plan":[\s\S]*\{ label: "Review usage pressure", href: usageHref \}/s);
  assert.match(source, /"resolve-billing":[\s\S]*\{ label: "Return to Week 8 checklist", href: verificationHref \}/s);
  assert.match(source, /"resolve-billing":[\s\S]*\{ label: "Return to admin readiness view", href: adminReturnHref \}/s);
  assert.match(source, /upgrade:[\s\S]*\{ label: "Continue to go-live drill", href: goLiveHref \}/s);
  assert.match(source, /upgrade:[\s\S]*\{ label: "Confirm usage evidence", href: usageHref \}/s);

  assert.match(source, /const intentCard = highlightIntent \? intentContextMap\[highlightIntent\] : null;/);
  assert.match(source, /const showBillingFollowUpCard =\s*!intentCard && \(normalizedSource \|\| checkout\.session \|\| subscriptionAction\.notice \|\| auditExport\.notice\);/s);
  assert.match(source, /title: normalizedSource === "onboarding" \? "Onboarding billing evidence" : "Billing evidence handoff"/);
  assert.match(source, /normalizedSource === "onboarding"[\s\S]*\{ label: "Capture verification evidence", href: verificationHref \}/s);
  assert.match(source, /normalizedSource === "onboarding"[\s\S]*\{ label: "Review usage pressure", href: usageHref \}/s);
  assert.match(source, /:\s*\[[\s\S]*\{ label: "Return to Week 8 checklist", href: verificationHref \}/s);
  assert.match(source, /:\s*\[[\s\S]*\{ label: "Continue to go-live drill", href: goLiveHref \}/s);
});

test("Settings panel keeps audit export source-badge and cross-page evidence handoff semantics coupled", async () => {
  const source = await readSource(settingsPanelPath);

  assert.match(
    source,
    /const auditContractSource: ContractMetaSource \| null =\s*auditExport\.contractSource \?\? \(auditExportEnabled \? null : "fallback_feature_gate"\);/s,
  );
  assert.match(
    source,
    /const auditContractIssueMessage =\s*auditExport\.contractIssueMessage \?\?\s*\(!auditExportEnabled \? "Audit export is not available on the current plan\." : null\);/s,
  );
  assert.match(source, /notice: "Audit export downloaded\. Attach it to verification\/go-live evidence as needed\."/);
  assert.match(
    source,
    /Export workspace audit events for compliance review and attach output into verification\/go-live evidence\./,
  );
  assert.match(source, /<Badge variant=\{contractSourceBadgeVariant\(auditContractSource\)\}>/);
  assert.match(source, /const auditContractIssue: ControlPlaneContractIssue \| null =/);
  assert.match(source, /contractSourceLabel\(auditContractSource, auditContractIssue\)/);
  assert.match(source, /contractSourceDescription\(auditContractSource, auditContractIssue\)/);
  assert.match(source, /<Link\s+href=\{verificationHref\}[\s\S]*?>\s*Attach in verification\s*<\/Link>/s);
  assert.match(source, /<Link\s+href=\{goLiveHref\}[\s\S]*?>\s*Carry to go-live drill\s*<\/Link>/s);
  assert.match(source, /type AuditExportReceipt = AuditExportReceiptSummary & \{/);
  assert.match(source, /const \[auditExportReceipt, setAuditExportReceipt\] = useState<AuditExportReceipt \| null>\(null\);/);
  assert.match(source, /function buildAuditExportReceiptContinuityArgs\(/);
  assert.match(source, /auditReceiptFilename: receipt\?\.filename \?\? null,/);
  assert.match(source, /auditReceiptExportedAt: receipt\?\.exportedAt \?\? null,/);
  assert.match(source, /auditReceiptSha256: receipt\?\.sha256 \?\? null,/);
  assert.match(source, /\.\.\.buildAuditExportReceiptContinuityArgs\(auditExportReceipt\),/);
  assert.match(source, /auditReceiptFilename: args\.auditReceiptFilename,/);
  assert.match(source, /auditReceiptExportedAt: args\.auditReceiptExportedAt,/);
  assert.match(source, /auditReceiptFromDate: args\.auditReceiptFromDate,/);
  assert.match(source, /auditReceiptToDate: args\.auditReceiptToDate,/);
  assert.match(source, /auditReceiptSha256: args\.auditReceiptSha256,/);
  assert.match(source, /const sha256 = await computeBlobSha256\(download\.blob\);/);
  assert.match(
    source,
    /setAuditExportReceipt\(\{\s*filename: download\.filename,\s*format: download\.format,\s*exportedAt: new Date\(\)\.toISOString\(\),\s*fromDate: auditFromDate\.trim\(\) \|\| null,\s*toDate: auditToDate\.trim\(\) \|\| null,\s*contentType: download\.content_type,\s*sizeBytes: download\.blob\.size,\s*sha256,\s*\}\);/s,
  );
  assert.match(source, /Latest export receipt/);
  assert.match(source, /Keep this receipt with the downloaded file/);
  assert.match(source, /same export details\./);
  assert.match(source, /SHA-256/);
  assert.match(source, /function formatAuditExportEvidenceNote\(receipt: AuditExportReceipt\): string \{/);
  assert.match(source, /Audit export \$\{receipt\.filename\}/);
  assert.match(source, /Evidence note/);
  assert.match(source, /Carry this exact note into verification, go-live, or the delivery track/);
});
