import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const acceptInvitationPagePath = path.resolve(testDir, "../../app/accept-invitation/page.tsx");

test("accept-invitation page keeps structured error mapping for auth state, seat limit, and disabled workspace flows", async () => {
  const source = await readFile(acceptInvitationPagePath, "utf8");

  assert.match(source, /function formatInvitationAcceptError\(error: unknown\): string \{/);
  assert.match(source, /error\.code === "unauthorized"/);
  assert.match(source, /authenticated SaaS session/);
  assert.match(source, /error\.code === "invitation_not_found"/);
  assert.match(source, /issue a fresh invitation/);
  assert.match(source, /error\.code === "tenant_access_denied"/);
  assert.match(source, /does not match the invited member \(\$\{invitationEmail\}\)/);
  assert.match(source, /error\.code === "plan_limit_exceeded" && error\.details\.scope === "member_seats"/);
  assert.match(source, /workspace has reached the member seat limit/);
  assert.match(source, /upgrade the plan via \$\{upgradeHref\}/);
  assert.match(source, /error\.code === "invalid_state_transition"/);
  assert.match(source, /workspace is not active/);
  assert.match(source, /organization is not active/);
  assert.match(source, /Invitation accept issue/);
  assert.match(source, /does not repair session state, reopen expired invitations, or bypass workspace\/member seat policy/);
});
