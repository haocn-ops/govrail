import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(testDir, "../../components/members/invitations-panel.tsx");

test("Invitations panel keeps revoke action error contract", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /ControlPlaneRequestError,/);
  assert.match(source, /function formatInvitationRevokeError/);
  assert.match(source, /Invitation revoke failed:/);
  assert.match(source, /text-red-600/);
  assert.match(source, /Pending invitations also reserve member seats until they are redeemed, revoked, or expire/);
});
