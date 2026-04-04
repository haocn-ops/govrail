import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const invitationFormPath = path.resolve(testDir, "../../components/members/create-invitation-form.tsx");

test("Invitation form keeps seat-reservation limit copy and structured error helper", async () => {
  const source = await readFile(invitationFormPath, "utf8");

  assert.match(source, /function describeInvitationCreateError/);
  assert.match(source, /error\.code === "invitation_limit_reached"/);
  assert.match(
    source,
    /Invitation seat limit reached\. Pending invitations reserve seats too, so disable an existing invite, remove inactive access, or upgrade the plan via \$\{upgradeHref\}\./,
  );
  assert.match(source, /error\.code === "invalid_state_transition"/);
  assert.match(source, /Invitations are unavailable until the workspace and organization return to an active state\./);
  assert.match(source, /setFormError\(describeInvitationCreateError\(error\)\);/);
  assert.match(
    source,
    /Pending invitations count against the workspace seat reservation until they are accepted, revoked, or expired\./,
  );
});
