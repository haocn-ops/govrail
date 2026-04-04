export function resolveTrustedInvitationAcceptAuth(requestHeaders: Headers): {
  subjectId: string;
  subjectRoles: string;
} | null {
  const subjectId =
    requestHeaders.get("x-authenticated-subject") ??
    requestHeaders.get("cf-access-authenticated-user-email");
  if (!subjectId || subjectId.trim() === "") {
    return null;
  }

  const subjectRoles =
    requestHeaders.get("x-authenticated-roles") ??
    requestHeaders.get("cf-access-authenticated-user-groups") ??
    "";

  return {
    subjectId: subjectId.trim(),
    subjectRoles: subjectRoles.trim(),
  };
}
