import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const acceptInvitationPagePath = path.resolve(testDir, "../../app/accept-invitation/page.tsx");

async function readSource(): Promise<string> {
  return readFile(acceptInvitationPagePath, "utf8");
}

test("accept-invitation page keeps trusted-session and seat-limit error guardrails", async () => {
  const source = await readSource();

  assert.match(source, /function formatInvitationAcceptError\(error: unknown\): string \{/);
  assert.match(source, /if \(error\.code === "unauthorized"\) \{/);
  assert.match(
    source,
    /Invitation acceptance requires an authenticated SaaS session\. Re-open \/session, confirm the current signed-in user, then retry\./,
  );
  assert.match(source, /if \(error\.code === "plan_limit_exceeded" && error\.details\.scope === "member_seats"\) \{/);
  assert.match(
    source,
    /This workspace has reached the member seat limit\. Free a seat or upgrade the plan before accepting the invitation\./,
  );
  assert.match(source, /setErrorMessage\(formatInvitationAcceptError\(error\)\);/);
});

test("accept-invitation page keeps invalid-state narratives and manual workspace-switch contract", async () => {
  const source = await readSource();

  assert.match(source, /if \(error\.code === "invalid_state_transition"\) \{/);
  assert.match(source, /if \(invitationStatus === "revoked" \|\| invitationStatus === "expired"\) \{/);
  assert.match(source, /if \(workspaceStatus && workspaceStatus !== "active"\) \{/);
  assert.match(source, /if \(organizationStatus && organizationStatus !== "active"\) \{/);
  assert.match(source, /This invitation can no longer be redeemed because the workspace is not active\./);
  assert.match(source, /This invitation can no longer be redeemed because the organization is not active\./);
  assert.match(source, /The actions below will switch your current workspace context to/);
  assert.match(source, /Switching the workspace context is the only automatic step here\./);
});
