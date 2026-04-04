import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const verificationPagePath = path.resolve(testDir, "../../app/(console)/verification/page.tsx");
const goLivePagePath = path.resolve(testDir, "../../app/(console)/go-live/page.tsx");
const goLivePanelPath = path.resolve(testDir, "../../components/go-live/mock-go-live-drill-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Verification page keeps admin handoff notice display conditions and inherited handoff params contract", async () => {
  const source = await readSource(verificationPagePath);

  assert.match(source, /const showAttentionHandoff = handoffSource === "admin-attention" && handoffSurface === "verification";/);
  assert.match(source, /const showReadinessHandoff = handoffSource === "admin-readiness";/);
  assert.match(source, /const showAdminReturn = showAttentionHandoff \|\| showReadinessHandoff;/);
  assert.match(source, /const adminReturnLabel = showAttentionHandoff \? "Return to admin queue" : "Return to admin readiness view";/);
  assert.match(
    source,
    /const adminQueueSurface =\s*handoffSurface === "verification" \|\| handoffSurface === "go_live"\s*\?\s*handoffSurface\s*:\s*recentTrackKey === "verification" \|\| recentTrackKey === "go_live"\s*\?\s*recentTrackKey\s*:\s*null;/s,
  );
  assert.match(source, /\{showAttentionHandoff \? \(/);
  assert.match(source, /<AdminFollowUpNotice[\s\S]*source="admin-attention"[\s\S]*surface="verification"/);
  assert.match(source, /\{showReadinessHandoff \? \(/);
  assert.match(source, /<AdminFollowUpNotice[\s\S]*source="admin-readiness"[\s\S]*surface="verification"/);
  assert.match(
    source,
    /import \{ buildAdminReturnHref, buildVerificationChecklistHandoffHref \} from "@\/lib\/handoff-query";/,
  );
  assert.match(source, /const adminReturnHref = buildAdminReturnHref\("\/admin", \{/);
  assert.match(source, /queueSurface: adminQueueSurface,/);
  assert.match(source, /week8Focus,/);
  assert.match(source, /attentionWorkspace: handoffWorkspace \?\? workspaceContext\.workspace\.slug,/);
  assert.match(source, /attentionOrganization: handoffOrganization,/);
  assert.match(source, /deliveryContext: deliveryContext === "recent_activity" \? deliveryContext : null,/);
  assert.match(source, /recentOwnerLabel: recentOwnerDisplayName \?\? recentOwnerEmail,/);
  assert.match(source, /\{showAdminReturn \? \(/);
  assert.match(source, /href=\{adminReturnHref\}/);
  assert.match(source, /\{adminReturnLabel\}/);

  assert.match(source, /<Week8VerificationChecklist[\s\S]*source=\{handoffSource\}/);
  assert.match(source, /<Week8VerificationChecklist[\s\S]*week8Focus=\{week8Focus\}/);
  assert.match(source, /<Week8VerificationChecklist[\s\S]*attentionWorkspace=\{handoffWorkspace\}/);
  assert.match(source, /<Week8VerificationChecklist[\s\S]*attentionOrganization=\{handoffOrganization\}/);
  assert.match(source, /<Week8VerificationChecklist[\s\S]*deliveryContext=\{deliveryContext\}/);
  assert.match(source, /<Week8VerificationChecklist[\s\S]*recentTrackKey=\{recentTrackKey\}/);
  assert.match(source, /<Week8VerificationChecklist[\s\S]*recentUpdateKind=\{recentUpdateKind\}/);
  assert.match(source, /<Week8VerificationChecklist[\s\S]*evidenceCount=\{evidenceCount\}/);
  assert.match(source, /<Week8VerificationChecklist[\s\S]*recentOwnerLabel=\{recentOwnerDisplayName \?\? recentOwnerEmail\}/);

  assert.match(source, /<WorkspaceDeliveryTrackPanel[\s\S]*source=\{handoffSource\}/);
  assert.match(source, /<WorkspaceDeliveryTrackPanel[\s\S]*surface="verification"/);
  assert.match(source, /<WorkspaceDeliveryTrackPanel[\s\S]*week8Focus=\{week8Focus\}/);
  assert.match(source, /<WorkspaceDeliveryTrackPanel[\s\S]*attentionWorkspace=\{handoffWorkspace\}/);
  assert.match(source, /<WorkspaceDeliveryTrackPanel[\s\S]*attentionOrganization=\{handoffOrganization\}/);
  assert.match(source, /<WorkspaceDeliveryTrackPanel[\s\S]*deliveryContext=\{deliveryContext\}/);
  assert.match(source, /<WorkspaceDeliveryTrackPanel[\s\S]*recentTrackKey=\{recentTrackKey\}/);
  assert.match(source, /<WorkspaceDeliveryTrackPanel[\s\S]*recentUpdateKind=\{recentUpdateKind\}/);
  assert.match(source, /<WorkspaceDeliveryTrackPanel[\s\S]*evidenceCount=\{evidenceCount\}/);
});

test("Verification page keeps top-level go-live continuation explicit with go_live surface and manual continuity wording", async () => {
  const source = await readSource(verificationPagePath);

  assert.match(source, /<CardTitle>Verification evidence lane<\/CardTitle>/);
  assert.match(
    source,
    /Use the links below to revisit the original run context, confirm the usage signal, review settings and\s*billing posture, then continue into the mock go-live rehearsal\. Nothing here triggers automation or changes\s*identity\./,
  );
  assert.match(
    source,
    /href=\{buildVerificationChecklistHandoffHref\(\{ pathname: "\/go-live\?surface=go_live", \.\.\.handoffHrefArgs \}\)\}[\s\S]*?>\s*Continue to go-live drill\s*<\/Link>/s,
  );
});

test("Verification and go-live pages keep delivery description stitching semantics for track/update/evidence/owner", async () => {
  const verificationSource = await readSource(verificationPagePath);
  const goLiveSource = await readSource(goLivePagePath);

  for (const source of [verificationSource, goLiveSource]) {
    assert.match(source, /const parts: string\[\] = \[\];/);
    assert.match(source, /const trackLabel = formatTrackLabel\(metadata\.recentTrackKey\);/);
    assert.match(source, /const updateLabel = describeUpdateKind\(metadata\.recentUpdateKind\);/);
    assert.match(
      source,
      /`\$\{metadata\.recentEvidenceCount\} evidence \$\{metadata\.recentEvidenceCount === 1 \? "item" : "items"\}`/,
    );
    assert.match(source, /parts\.push\(`handled by \$\{metadata\.recentOwnerLabel\}`\);/);
    assert.match(source, /return `\$\{base\} Latest admin handoff: \$\{parts\.join\(" · "\)\}\.`;/);
  }
});

test("Go-live page keeps admin handoff notice conditions and verification/usage backlink query passthrough contract", async () => {
  const source = await readSource(goLivePagePath);

  assert.match(source, /const showAttentionHandoff = handoffSource === "admin-attention" && handoffSurface === "go_live";/);
  assert.match(source, /const showReadinessHandoff = handoffSource === "admin-readiness";/);
  assert.match(source, /const showAdminReturn = showAttentionHandoff \|\| showReadinessHandoff;/);
  assert.match(source, /const adminReturnLabel = showAttentionHandoff \? "Return to admin queue" : "Return to admin readiness view";/);
  assert.match(
    source,
    /const adminQueueSurface =\s*handoffSurface === "verification" \|\| handoffSurface === "go_live"\s*\?\s*handoffSurface\s*:\s*recentTrackKey === "verification" \|\| recentTrackKey === "go_live"\s*\?\s*recentTrackKey\s*:\s*null;/s,
  );
  assert.match(source, /\{showAttentionHandoff \? \(/);
  assert.match(source, /<AdminFollowUpNotice[\s\S]*source="admin-attention"[\s\S]*surface="go_live"/);
  assert.match(source, /\{showReadinessHandoff \? \(/);
  assert.match(source, /<AdminFollowUpNotice[\s\S]*source="admin-readiness"[\s\S]*surface="go_live"/);

  assert.match(source, /import \{ buildAdminReturnHref, buildHandoffHref \} from "@\/lib\/handoff-query";/);
  assert.match(source, /function buildGoLiveHref\(args:/);
  assert.match(source, /return buildHandoffHref\(args\.pathname, \{/);
  assert.match(source, /source: args\.source,/);
  assert.match(source, /week8Focus: args\.week8Focus,/);
  assert.match(source, /attentionWorkspace: args\.attentionWorkspace,/);
  assert.match(source, /attentionOrganization: args\.attentionOrganization,/);
  assert.match(source, /deliveryContext: args\.deliveryContext,/);
  assert.match(source, /recentTrackKey: args\.recentTrackKey,/);
  assert.match(source, /recentUpdateKind: args\.recentUpdateKind,/);
  assert.match(source, /evidenceCount: args\.evidenceCount,/);
  assert.match(source, /recentOwnerDisplayName: args\.recentOwnerDisplayName,/);
  assert.match(source, /recentOwnerEmail: args\.recentOwnerEmail,/);
  assert.match(source, /\}, \{ preserveExistingQuery: true \}\);/);

  assert.match(source, /const verificationHref = buildGoLiveHref\(\{/);
  assert.match(source, /pathname: "\/verification\?surface=verification",/);
  assert.match(source, /const usageHref = buildGoLiveHref\(\{/);
  assert.match(source, /pathname: "\/usage",/);
  assert.match(source, /const settingsHref = buildGoLiveHref\(\{/);
  assert.match(source, /const playgroundHref = buildGoLiveHref\(\{/);
  assert.match(source, /const artifactsHref = buildGoLiveHref\(\{/);
  assert.match(source, /const adminReturnHref = buildAdminReturnHref\("\/admin", \{/);
  assert.match(source, /queueSurface: adminQueueSurface,/);
  assert.match(source, /attentionWorkspace: handoffWorkspace \?\? workspaceContext\.workspace\.slug,/);
  assert.match(source, /deliveryContext: deliveryContext === "recent_activity" \? deliveryContext : null,/);
  assert.match(source, /recentOwnerLabel: recentOwnerDisplayName \?\? recentOwnerEmail,/);
  assert.match(source, /const adminHref = showAdminReturn \? adminReturnHref : "\/admin";/);
  assert.match(source, /const adminLinkLabel = showAdminReturn \? adminReturnLabel : "Admin overview";/);
  assert.match(source, /<CardTitle>Session-aware drill lane<\/CardTitle>/);
  assert.match(source, /href=\{verificationHref\}/);
  assert.match(source, /href=\{usageHref\}/);
  assert.match(source, /href=\{settingsHref\}/);
  assert.match(source, /href=\{playgroundHref\}/);
  assert.match(source, /href=\{artifactsHref\}/);
  assert.match(source, /\{showAdminReturn \? \(/);
  assert.match(source, /href=\{adminReturnHref\}/);
  assert.match(source, /\{adminReturnLabel\}/);
  assert.match(source, /<Link href=\{adminHref\}>\{adminLinkLabel\}<\/Link>/);
});

test("Go-live page keeps admin-attention queue return label and href contract explicit", async () => {
  const source = await readSource(goLivePagePath);

  assert.match(source, /const showAttentionHandoff = handoffSource === "admin-attention" && handoffSurface === "go_live";/);
  assert.match(source, /const adminReturnLabel = showAttentionHandoff \? "Return to admin queue" : "Return to admin readiness view";/);
  assert.match(source, /const adminReturnHref = buildAdminReturnHref\("\/admin", \{/);
  assert.match(source, /queueSurface: adminQueueSurface,/);
  assert.match(source, /attentionWorkspace: handoffWorkspace \?\? workspaceContext\.workspace\.slug,/);
  assert.match(source, /attentionOrganization: handoffOrganization,/);
  assert.match(source, /href=\{adminReturnHref\}/);
  assert.match(source, /\{adminReturnLabel\}/);
});

test("Go-live drill panel keeps verification handoff link surface semantics for admin-attention continuity", async () => {
  const source = await readSource(goLivePanelPath);

  assert.match(source, /href: buildHref\("\/verification\?surface=verification"\),/);
});
