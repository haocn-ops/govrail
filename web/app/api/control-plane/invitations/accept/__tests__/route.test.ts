import assert from "node:assert/strict";
import test from "node:test";

import { resolveTrustedInvitationAcceptAuth } from "../auth";

test("resolveTrustedInvitationAcceptAuth prefers trusted invitation subject and roles headers", () => {
  const auth = resolveTrustedInvitationAcceptAuth(
    new Headers({
      "x-authenticated-subject": "invitee@example.com",
      "x-authenticated-roles": "member,operator",
      "x-subject-id": "spoof@example.com",
    }),
  );

  assert.deepEqual(auth, {
    subjectId: "invitee@example.com",
    subjectRoles: "member,operator",
  });
});

test("resolveTrustedInvitationAcceptAuth accepts cf-access identity and trims groups", () => {
  const auth = resolveTrustedInvitationAcceptAuth(
    new Headers({
      "cf-access-authenticated-user-email": "cf-invitee@example.com",
      "cf-access-authenticated-user-groups": " approver, viewer ",
    }),
  );

  assert.deepEqual(auth, {
    subjectId: "cf-invitee@example.com",
    subjectRoles: "approver, viewer",
  });
});

test("resolveTrustedInvitationAcceptAuth rejects missing trusted subject even if x-subject-id is present", () => {
  const auth = resolveTrustedInvitationAcceptAuth(
    new Headers({
      "x-subject-id": "spoof@example.com",
      "x-authenticated-roles": "platform_admin",
    }),
  );

  assert.equal(auth, null);
});
