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

test("Admin overview keeps readiness follow-up handoff links on shared query helper contract", async () => {
  const source = await readSource(adminOverviewPath);

  assert.match(source, /import \{ buildHandoffHref \} from "@\/lib\/handoff-query";/);
  assert.match(source, /function buildSurfaceFollowUpHref\(\{/);
  assert.match(source, /return buildHandoffHref\(/);
  assert.match(source, /source: "admin-readiness",/);
  assert.match(source, /week8Focus: readinessFocus,/);
  assert.match(source, /attentionWorkspace: workspaceSlug,/);
  assert.match(source, /attentionOrganization: organizationId,/);
  assert.match(source, /\{ preserveExistingQuery: true \}/);

  assert.match(source, /pathname: "\/settings\?intent=resolve-billing"/);
  assert.match(source, /pathname: "\/onboarding"/);
  assert.match(source, /pathname: "\/verification\?surface=verification"/);
  assert.match(source, /pathname: "\/go-live\?surface=go_live"/);
  assert.match(source, /label: "Open Week 8 checklist",\s*href: "\/verification\?surface=verification"/s);
});

test("Admin overview keeps attention action query naming consistent for surface and recent delivery metadata", async () => {
  const source = await readSource(adminOverviewPath);

  assert.match(source, /searchParams: \{/);
  assert.match(source, /source: "admin-attention",/);
  assert.match(source, /surface: targetSurface,/);
  assert.match(source, /attention_workspace: workspace\.slug,/);
  assert.match(source, /attention_organization: options\?\.attentionOrganizationId \?\? null,/);
  assert.match(source, /delivery_context: options\?\.deliveryContext \?\? null,/);
  assert.match(source, /recent_track_key: options\?\.recentTrackKey \?\? null,/);
  assert.match(source, /recent_update_kind: options\?\.recentUpdateKind \?\? null,/);
  assert.match(source, /evidence_count:\s*typeof options\?\.evidenceCount === "number" \? String\(options\.evidenceCount\) : null,/s);
  assert.match(source, /recent_owner_label: options\?\.recentOwnerLabel \?\? null,/);
  assert.match(source, /recent_owner_display_name: options\?\.recentOwnerDisplayName \?\? null,/);
  assert.match(source, /recent_owner_email: options\?\.recentOwnerEmail \?\? null,/);
});

test("Admin overview surfaces contract source and 404/503 fallback guidance in the platform snapshot", async () => {
  const source = await readSource(adminOverviewPath);

  assert.match(source, /const adminContractMeta = data\?\.contract_meta \?\? null;/);
  assert.match(source, /const adminContractSource = adminContractMeta\?\.source \?\? \(data \? "live" : null\);/);
  assert.match(
    source,
    /function adminContractLabel\(\s*source\?: ControlPlaneContractMeta\["source"\] \| null,\s*issue\?: AdminContractIssue \| null,\s*\): string \{/s,
  );
  assert.match(source, /return "Live admin contract";/);
  assert.match(source, /return "Fallback: feature gate";/);
  assert.match(source, /const fallbackStatusLabel = adminFallbackStatusLabel\(issue\);/);
  assert.match(source, /if \(fallbackStatusLabel\) \{\s*return `Fallback: \$\{fallbackStatusLabel\}`;\s*\}/s);
  assert.match(source, /return "Fallback: preview data";/);
  assert.match(
    source,
    /return issue\?\.status === 409\s*\?\s*"Admin snapshot is plan-gated, so the live summary stays hidden until the workspace entitlement changes\."\s*:\s*"Admin snapshot is currently feature-gated and cannot show the full live summary\.";/s,
  );
  assert.match(
    source,
    /return issue\?\.status === 503\s*\?\s*"Admin snapshot is using preview fallback data because the control plane returned 503\."\s*:\s*"Admin snapshot is using preview fallback data because the control plane is unavailable\.";/s,
  );
  assert.ok(source.includes('Admin snapshot is using preview fallback data because the control plane is unavailable.'));
  assert.ok(source.includes('Admin snapshot is using preview fallback data because the live overview route returned 404.'));
  assert.ok(source.includes('Admin snapshot is using preview fallback data because the live overview route returned 503.'));
  assert.ok(source.includes('Admin snapshot is using preview fallback data and should not be treated as live workspace readiness.'));
  assert.match(source, /adminContractLabel\(adminContractSource, adminContractMeta\?\.issue \?\? null\)/);
  assert.match(source, /adminContractDescription\(adminContractSource, adminContractMeta\?\.issue \?\? null\)/);
  assert.match(source, /Contract note: \{adminContractMeta\.issue\.message\}/);
});
