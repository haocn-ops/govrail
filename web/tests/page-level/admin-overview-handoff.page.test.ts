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
  assert.match(source, /runId,/);
  assert.match(source, /week8Focus: readinessFocus,/);
  assert.match(source, /attentionWorkspace: workspaceSlug,/);
  assert.match(source, /attentionOrganization: organizationId,/);
  assert.match(source, /\{ preserveExistingQuery: true \}/);

  assert.match(source, /pathname: "\/settings\?intent=resolve-billing"/);
  assert.match(source, /pathname: "\/settings\?intent=manage-plan"/);
  assert.match(source, /pathname: "\/onboarding"/);
  assert.match(source, /pathname: "\/verification\?surface=verification"/);
  assert.match(source, /pathname: "\/go-live\?surface=go_live"/);
  assert.match(source, /label: "Open Week 8 checklist",\s*href: "\/verification\?surface=verification"/s);
});

test("Admin overview keeps attention action query naming consistent for surface and recent delivery metadata", async () => {
  const source = await readSource(adminOverviewPath);

  assert.match(
    source,
    /import \{\s*buildWorkspaceNavigationHref,\s*performWorkspaceSwitch,\s*\} from "@\/lib\/client-workspace-navigation";/s,
  );
  assert.match(
    source,
    /import \{\s*adminAttentionActionLabel,\s*buildAdminAttentionNavigationTarget,\s*buildAdminReadinessNavigationTarget,\s*\} from "@\/lib\/admin-follow-up-navigation";/s,
  );
  assert.match(source, /const outcome = await performWorkspaceSwitch\(\{/);
  assert.match(source, /workspace_slug: options\.workspaceSlug,/);
  assert.match(source, /await navigateWithWorkspaceContext\(buildAdminAttentionNavigationTarget\(workspace, options\)\);/);
  assert.match(
    source,
    /await navigateWithWorkspaceContext\(\s*buildAdminReadinessNavigationTarget\(workspace, \{\s*readinessFocus,\s*attentionOrganizationId,\s*\}\),\s*\);/s,
  );
  assert.match(source, /router\.push\(buildWorkspaceNavigationHref\(options\.pathname, options\.searchParams\)\);/);
  assert.match(source, /const actionLabel = adminAttentionActionLabel\(targetSurface\);/);
});

test("Admin overview keeps direct admin-attention go-live queue entry and return cues explicit", async () => {
  const source = await readSource(adminOverviewPath);

  assert.match(source, /const targetSurface = workspace\.next_action_surface \?\? "verification";/);
  assert.match(source, /adminAttentionActionLabel\(targetSurface\)/);
  assert.match(source, /const returnLinksHref = "#admin-return-links";/);
  assert.match(source, /<p className="font-medium">Admin queue focus restored<\/p>/);
  assert.match(source, /Continue the governance review from the filtered queue/);
  assert.match(source, /<Link href=\{returnLinksHref\}>return links below<\/Link>/);
  assert.match(source, /<div id="admin-return-links" className="flex flex-wrap gap-2">/);
  assert.match(source, /<Link[\s\S]*?>\s*Clear follow-up return\s*<\/Link>/s);
});

test("Admin overview surfaces contract source and 404/503 fallback guidance in the platform snapshot", async () => {
  const source = await readSource(adminOverviewPath);

  assert.match(source, /const normalizedData = useMemo\(\(\) => \{/);
  assert.match(source, /if \(!preferPreviewScaffolding\) \{\s*return data;\s*\}/s);
  assert.match(source, /const previewData = buildAdminOverviewPreviewData\(data\?\.updated_at\);/);
  assert.match(source, /if \(!data\) \{\s*return \{\s*\.\.\.previewData,/s);
  assert.match(source, /const adminContractMeta = normalizedData\?\.contract_meta \?\? null;/);
  assert.match(source, /const adminContractSource = adminContractMeta\?\.source \?\? \(normalizedData \? "live" : null\);/);
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
