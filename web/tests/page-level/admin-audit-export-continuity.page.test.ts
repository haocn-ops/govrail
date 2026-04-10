import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const adminNoticePath = path.resolve(testDir, "../../components/admin/admin-follow-up-notice.tsx");

async function readSource(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

test("admin follow-up notice keeps audit export continuity guidance", async () => {
  const source = await readSource(adminNoticePath);

  assert.match(
    source,
    /function normalizeDeliveryContext\(value\?: string \| null\): "recent_activity" \| "week8" \| null \{/,
  );
  assert.match(source, /return value === "recent_activity" \|\| value === "week8" \? value : null;/);
  assert.match(source, /const handoffState: ConsoleHandoffState = \{/);
  assert.match(source, /runId: runId \?\? null,/);
  assert.match(source, /deliveryContext: deliveryContext \?\? null,/);
  assert.match(source, /recentTrackKey: recentTrackKey \?\? null,/);
  assert.match(source, /recentUpdateKind: recentUpdateKind \?\? null,/);
  assert.match(source, /recentOwnerLabel,/);
  assert.match(source, /recentOwnerDisplayName: ownerDisplayName \?\? null,/);
  assert.match(source, /recentOwnerEmail: ownerEmail \?\? null,/);
  assert.match(source, /const baseReturnLabel = isReadinessFlow \? "Return to admin readiness view" : "Return to admin queue";/);
  assert.match(source, /const trackLabel = normalizedRecentTrackKey \? deliveryTrackLabel\(normalizedRecentTrackKey\) : null;/);
  assert.match(source, /const returnLabel = trackLabel \? `\$\{baseReturnLabel\} \(continue \$\{trackLabel\}\)` : baseReturnLabel;/);
  assert.match(source, /returnHref = buildAdminReturnHref\("\/admin", \{/);
  assert.match(source, /runId,/);
  assert.match(source, /queueSurface,/);
  assert.match(source, /week8Focus,/);
  assert.match(source, /attentionWorkspace: returnWorkspaceSlug,/);
  assert.match(source, /attentionOrganization,/);
  assert.match(source, /deliveryContext: normalizedDeliveryContext,/);
  assert.match(source, /recentTrackKey: normalizedRecentTrackKey,/);
  assert.match(source, /recentUpdateKind: normalizedRecentUpdateKind,/);
  assert.match(source, /evidenceCount: normalizedEvidenceCount,/);
  assert.match(source, /recentOwnerLabel,/);
  assert.match(source, /recentOwnerDisplayName: ownerDisplayName \?\? null,/);
  assert.match(source, /recentOwnerEmail: ownerEmail \?\? null,/);
  assert.match(source, /Audit export continuity/);
  assert.match(
    source,
    /Reuse the same Latest export receipt from <code className="font-mono">\/settings<\/code> [\s\S]*? SHA-256 stay chained/,
  );
  assert.match(source, /Reopen audit export receipt/);
  assert.match(source, /Reopen verification evidence/);
  assert.match(
    source,
    /This (?:manual evidence relay is navigation-only|is a navigation-only manual relay); open the receipt, carry the proof in the workspace surfaces,[\s\S]*?return here to complete the queue or readiness loop\./,
  );
  assert.match(source, /href=\{returnHref\}/);
  assert.match(source, /\{returnLabel\}/);
});
