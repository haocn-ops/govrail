import { proxyWorkspaceEnterpriseGet, proxyWorkspaceEnterprisePost } from "../route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyWorkspaceEnterpriseGet("/sso");
}

export async function POST(request: Request) {
  return proxyWorkspaceEnterprisePost({
    suffix: "/sso",
    request,
    metadataMessage:
      "Workspace SSO updates require metadata-backed SaaS context. Preview and env fallback modes are disabled for this endpoint.",
  });
}
