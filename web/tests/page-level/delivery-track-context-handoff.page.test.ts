import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const deliveryPanelPath = path.resolve(testDir, "../../components/delivery/workspace-delivery-track-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Workspace delivery track panel keeps cross-page handoff query continuity for verification/go-live/usage/settings links", async () => {
  const source = await readSource(deliveryPanelPath);

  assert.match(
    source,
    /import \{[\s\S]*buildConsoleHandoffHref,[\s\S]*buildConsoleAdminReturnHref,[\s\S]*type ConsoleHandoffState,[\s\S]*\} from "@\/lib\/console-handoff";/,
  );
  assert.match(source, /import \{ AuditExportReceiptCallout \} from "@\/components\/audit-export-receipt-callout";/);
  assert.match(source, /import \{ resolveAuditExportReceiptSummary \} from "@\/lib\/audit-export-receipt";/);
  assert.match(source, /function buildContextHref\(/);
  assert.match(source, /return buildConsoleHandoffHref\(pathname, handoff\);/);
  assert.match(source, /runId,/);
  assert.match(source, /source,/);
  assert.match(source, /surface,/);
  assert.match(source, /week8Focus,/);
  assert.match(source, /attentionWorkspace,/);
  assert.match(source, /attentionOrganization,/);
  assert.match(source, /deliveryContext,/);
  assert.match(source, /recentTrackKey,/);
  assert.match(source, /recentUpdateKind,/);
  assert.match(source, /evidenceCount,/);
  assert.match(source, /recentOwnerLabel,/);
  assert.match(source, /recentOwnerDisplayName,/);
  assert.match(source, /recentOwnerEmail,/);
  assert.match(source, /auditReceiptFilename,/);
  assert.match(source, /auditReceiptExportedAt,/);
  assert.match(source, /auditReceiptSha256,/);

  assert.match(
    source,
    /const verificationHref = buildContextHref\(\s*"\/verification",\s*{\s*source,\s*surface:\s*"verification",[\s\S]*?\}\s*\);/s,
  );
  assert.match(
    source,
    /const goLiveHref = buildContextHref\(\s*"\/go-live",\s*{\s*source,\s*surface:\s*"go_live",[\s\S]*?\}\s*\);/s,
  );
  assert.match(
    source,
    /const usageHref = buildContextHref\(\s*"\/usage",\s*{\s*source,\s*surface:\s*sectionKey,[\s\S]*?\}\s*\);/s,
  );
  assert.match(
    source,
    /const settingsHref = buildContextHref\(\s*"\/settings\?intent=manage-plan",\s*{\s*source,\s*surface:\s*sectionKey,[\s\S]*?\}\s*\);/s,
  );
});

test("Workspace delivery track panel keeps onboarding context-card action mapping stable across verification and go-live surfaces", async () => {
  const source = await readSource(deliveryPanelPath);

  assert.match(source, /if \(source === "onboarding"\) \{/);
  assert.match(source, /if \(sectionKey === "verification"\) \{/);
  assert.match(source, /title: "Onboarding evidence capture"/);
  assert.match(source, /actions:\s*\[\s*\{ label: "Review usage evidence", href: usageHref \},\s*\{ label: "Continue to go-live drill", href: goLiveHref \},\s*\]/s);
  assert.match(source, /title: "Onboarding drill handoff"/);
  assert.match(source, /actions:\s*\[\s*\{ label: "Return to verification", href: verificationHref \},\s*\{ label: "Inspect billing and features", href: settingsHref \},\s*\]/s);
  assert.match(source, /metaLines: metadataLines\.length > 0 \? metadataLines : undefined/);
});

test("Workspace delivery track panel keeps admin-readiness/admin-attention return mapping and queue semantics stable", async () => {
  const source = await readSource(deliveryPanelPath);

  assert.match(source, /function buildDeliveryHandoffState\(args: \{/);
  assert.match(source, /runId\?: string \| null;/);
  assert.match(source, /runId: args\.runId \?\? null,/);
  assert.match(source, /deliveryContext: args\.deliveryContext \?\? null,/);
  assert.match(source, /recentTrackKey: args\.recentTrackKey \?\? null,/);
  assert.match(source, /recentUpdateKind: args\.recentUpdateKind \?\? null,/);
  assert.match(source, /recentOwnerLabel: args\.recentOwnerLabel \?\? null,/);
  assert.match(source, /recentOwnerDisplayName: args\.recentOwnerDisplayName \?\? null,/);
  assert.match(source, /recentOwnerEmail: args\.recentOwnerEmail \?\? null,/);
  assert.match(source, /auditReceiptFilename: args\.auditReceiptFilename \?\? null,/);
  assert.match(source, /auditReceiptExportedAt: args\.auditReceiptExportedAt \?\? null,/);
  assert.match(source, /auditReceiptSha256: args\.auditReceiptSha256 \?\? null,/);
  assert.match(source, /function buildAdminReturnUrl\(/);
  assert.match(source, /return buildConsoleAdminReturnHref\(\{/);
  assert.match(source, /pathname: "\/admin",/);
  assert.match(source, /handoff: buildDeliveryHandoffState\(\{/);
  assert.match(source, /runId,/);
  assert.match(source, /attentionWorkspace: attentionWorkspace \?\? workspaceSlug,/);
  assert.match(source, /recentTrackKey,/);
  assert.match(source, /queueSurface: surface,/);

  assert.match(source, /if \(source === "admin-readiness"\) \{/);
  assert.match(source, /title: "Admin readiness evidence handoff"/);
  assert.match(
    source,
    /sectionKey === "verification"\s*\?\s*\[\s*\{ label: "Continue to go-live drill", href: goLiveHref \},\s*\{ label: "Return to admin readiness view", href: adminReturnHref \},\s*\]/s,
  );
  assert.match(
    source,
    /:\s*\[\s*\{ label: "Return to verification", href: verificationHref \},\s*\{ label: "Return to admin readiness view", href: adminReturnHref \},\s*\]/s,
  );

  assert.match(source, /title: "Admin queue evidence handoff"/);
  assert.match(
    source,
    /sectionKey === "verification"\s*\?\s*\[\s*\{ label: "Continue to go-live drill", href: goLiveHref \},\s*\{ label: "Return to admin queue", href: adminReturnHref \},\s*\]/s,
  );
  assert.match(
    source,
    /:\s*\[\s*\{ label: "Return to verification", href: verificationHref \},\s*\{ label: "Return to admin queue", href: adminReturnHref \},\s*\]/s,
  );
  assert.match(
    source,
    /deliveryContext === "recent_activity"\s*\?\s*"You arrived here from the admin recent delivery activity snapshot\./s,
  );
  assert.match(
    source,
    /Attach the audit export receipt\/evidence note \(filename, filters, SHA-256\) to this \$\{surfaceLabel\} entry so verification, go-live, and delivery tracking stay tied to the same file and later delivery notes can reference that shared evidence thread\./,
  );
});

test("Workspace delivery track panel keeps recent metadata normalization and context-card/status guidance semantics aligned", async () => {
  const source = await readSource(deliveryPanelPath);

  assert.match(source, /type DeliveryContext = "recent_activity" \| "week8";/);
  assert.match(source, /return value === "recent_activity" \|\| value === "week8" \? value : null;/);
  assert.match(source, /function normalizeRecentTrackKey\(value\?: string \| null\): "verification" \| "go_live" \| null/);
  assert.match(source, /if \(value === "verification" \|\| value === "go_live"\) \{/);
  assert.match(source, /function normalizeRecentUpdateKind\(value\?: string \| null\): ControlPlaneAdminDeliveryUpdateKind \| null/);
  assert.match(source, /value === "verification_completed"/);
  assert.match(source, /value === "go_live_completed"/);
  assert.match(source, /value === "evidence_only"/);

  assert.match(source, /const metadataLines = deliveryContext === "recent_activity" \? buildMetadataLines\(metadata\) : \[\];/);
  assert.match(source, /const handoffContextArgs: Omit<BuildContextHrefArgs, "surface"> = \{/);
  assert.match(source, /runId,/);
  assert.match(source, /const auditExportReceipt = resolveAuditExportReceiptSummary\(/);
  assert.match(source, /<AuditExportReceiptCallout[\s\S]*title="Audit export continuity"/);
  assert.match(source, /Recent admin handoff owner:/);
  assert.match(source, /if \(kind === "evidence_only"\) \{\s*return `Evidence links were added on the \$\{trackLabel\(trackKey\)\} track\.`;\s*\}/s);
  assert.match(source, /if \(typeof metadata\.evidenceCount === "number"\) \{/);
  assert.match(
    source,
    /`\$\{metadata\.evidenceCount\} evidence \$\{metadata\.evidenceCount === 1 \? "link" : "links"\} were already recorded in admin context\.`/,
  );
  assert.match(source, /lines\.push\("No evidence links were recorded in the latest admin context yet\."\);/);
  assert.match(source, /const recentSummary =\s*deliveryContext === "recent_activity"\s*\?\s*describeRecentUpdateKind\(recentUpdateKind, recentTrackKey\)\s*:\s*null;/s);
});

test("Workspace delivery track panel surfaces contract source badge and 404/503 fallback guidance", async () => {
  const source = await readSource(deliveryPanelPath);

  assert.match(source, /ControlPlaneContractMeta/);
  assert.match(source, /const deliveryContractMeta = data\?\.contract_meta \?\? null;/);
  assert.match(source, /const deliveryContractSource = deliveryContractMeta\?\.source \?\? \(data \? "live" : null\);/);
  assert.match(
    source,
    /function contractSourceLabel\(\s*source\?: ControlPlaneContractMeta\["source"\] \| null,\s*issue\?: DeliveryContractIssue \| null,\s*\): string \{/s,
  );
  assert.match(
    source,
    /const fallbackStatusLabel = deliveryFallbackStatusLabel\(issue\);/,
  );
  assert.match(
    source,
    /if \(fallbackStatusLabel\) \{\s*return `Fallback: \$\{fallbackStatusLabel\}`;\s*\}/s,
  );
  assert.ok(source.includes('Fallback: preview data'));
  assert.ok(source.includes('Delivery track is using preview fallback data because the control plane is unavailable.'));
  assert.ok(source.includes('Delivery track is using preview fallback data because the live delivery route returned 404.'));
  assert.ok(source.includes('Delivery track is using preview fallback data because the live delivery route returned 503.'));
  assert.ok(source.includes('Delivery track is using preview fallback data and should not be treated as live evidence.'));
  assert.match(source, /contractSourceLabel\(deliveryContractSource, deliveryContractMeta\?\.issue \?\? null\)/);
  assert.match(source, /contractSourceDescription\(deliveryContractSource, deliveryContractMeta\?\.issue \?\? null\)/);
  assert.match(source, /<Badge variant=\{contractSourceBadgeVariant\(deliveryContractSource\)\}>/);
  assert.match(source, /Contract note: \{deliveryContractMeta\.issue\.message\}/);
});
