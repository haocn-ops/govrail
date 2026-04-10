import { proxyWorkspaceContextCollectionPost } from "../collection-route-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyWorkspaceContextCollectionPost({
    request,
    path: "/api/v1/runs",
    contentType: request.headers.get("content-type") ?? "application/json",
  });
}
