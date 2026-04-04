import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const adminOverviewPath = path.resolve(testDir, "../../components/admin/admin-overview-panel.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("Admin readiness overview keeps buildAdminHref continuity for queue/readiness focus and returns", async () => {
  const source = await readSource(adminOverviewPath);

  assert.match(source, /function buildAdminHref\(\{/);
  assert.match(source, /if \(surface && surface !== "all"\) \{\s*searchParams\.set\("queue_surface", surface\);\s*\}/s);
  assert.match(source, /if \(readinessFocus\) \{\s*searchParams\.set\("week8_focus", readinessFocus\);\s*\}/s);
  assert.match(source, /if \(workspaceSlug\) \{\s*searchParams\.set\("attention_workspace", workspaceSlug\);\s*\}/s);
  assert.match(source, /if \(organizationId\) \{\s*searchParams\.set\("attention_organization", organizationId\);\s*\}/s);
  assert.match(source, /if \(queueReturned\) \{\s*searchParams\.set\("queue_returned", "1"\);\s*\}/s);
  assert.match(source, /if \(readinessReturned\) \{\s*searchParams\.set\("readiness_returned", "1"\);\s*\}/s);
  assert.match(source, /return query \? `\/admin\?\$\{query\}` : "\/admin";/);
});

test("Admin readiness overview keeps drill-down navigation-only continuity and return banner semantics", async () => {
  const source = await readSource(adminOverviewPath);

  assert.match(source, /const showReadinessReturnBanner =\s*!!readinessReturned && !!readinessFocus;/);
  assert.match(source, /const readinessFollowUp = readinessFollowUpAction\(/);
  assert.match(source, /<AdminReadinessReturnBanner[\s\S]*focusLabel=\{readinessFocusLabelText\}[\s\S]*clearHref=\{clearReadinessHref\}[\s\S]*focusHint=\{readinessFollowUp\?\.hint \?\? null\}[\s\S]*followUpHref=\{readinessFollowUp\?\.href \?\? null\}[\s\S]*followUpLabel=\{readinessFollowUp\?\.label \?\? null\}/);
  assert.match(source, /Use this list to move from a readiness metric into the specific workspaces that still need onboarding,/);
  assert.match(source, /These actions only switch workspace context and open the/);
  assert.match(source, /they do not trigger remediation or automate evidence capture for the operator\./);
  assert.match(source, /Keep this drill manual, record the outcome on the target/);
  assert.match(source, /surface, then return here with the same focus\./);
});

test("Admin attention queue and recent activity keep workspace/context continuity without impersonation semantics", async () => {
  const source = await readSource(adminOverviewPath);

  assert.match(source, /const handleAction = async \(/);
  assert.match(source, /source: "admin-attention",/);
  assert.match(source, /surface: targetSurface,/);
  assert.match(source, /attention_workspace: workspace\.slug,/);
  assert.match(source, /attention_organization: options\?\.attentionOrganizationId \?\? null,/);
  assert.match(source, /delivery_context: options\?\.deliveryContext \?\? null,/);
  assert.match(source, /recent_track_key: options\?\.recentTrackKey \?\? null,/);
  assert.match(source, /recent_update_kind: options\?\.recentUpdateKind \?\? null,/);
  assert.match(source, /recent_owner_display_name: options\?\.recentOwnerDisplayName \?\? null,/);
  assert.match(source, /recent_owner_email: options\?\.recentOwnerEmail \?\? null,/);

  assert.match(source, /const handleReadinessAction = async \(workspace: ControlPlaneAdminWeek8ReadinessWorkspace\) => \{/);
  assert.match(source, /source: "admin-readiness",/);
  assert.match(source, /week8_focus: readinessFocus,/);
  assert.match(source, /attention_workspace: workspace\.slug,/);
  assert.match(source, /attention_organization: workspace\.organization_id \|\| attentionOrganizationId \|\| null,/);

  assert.match(source, /<p className="font-medium">Admin queue focus restored<\/p>/);
  assert.match(source, /Continue the governance review from the filtered queue/);
  assert.match(source, /Organization focus is preserved for this return path so the same governance cluster stays in view\./);
  assert.match(source, /<CardTitle>Recent delivery activity<\/CardTitle>/);
  assert.match(source, /The latest workspaces that updated their delivery tracking are listed here so you can follow up quickly\./);
});
