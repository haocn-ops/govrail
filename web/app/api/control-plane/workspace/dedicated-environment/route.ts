import { proxyWorkspaceEnterpriseGet, proxyWorkspaceEnterprisePost } from "../route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyWorkspaceEnterpriseGet("/dedicated-environment");
}

export async function POST(request: Request) {
  return proxyWorkspaceEnterprisePost({
    suffix: "/dedicated-environment",
    request,
    metadataMessage:
      "Dedicated environment updates require metadata-backed SaaS context. Preview and env fallback modes are disabled for this endpoint.",
  });
}
