import { headers } from "next/headers";
import { controlPlaneErrorResponse } from "@/lib/control-plane-proxy";
import { resolveTrustedInvitationAcceptAuth } from "./auth";
import { proxyAuthenticatedPostRequest } from "../../post-route-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestHeaders = await headers();
  const auth = resolveTrustedInvitationAcceptAuth(requestHeaders);
  if (!auth) {
    return controlPlaneErrorResponse({
      status: 401,
      code: "unauthorized",
      message: "Invitation acceptance requires an authenticated subject",
    });
  }

  return proxyAuthenticatedPostRequest({
    request,
    path: "/api/v1/saas/invitations:accept",
    subjectId: auth.subjectId,
    subjectRoles: auth.subjectRoles,
    contentType: "application/json",
  });
}
