import { proxyWorkspaceCreatePost } from "./route-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyWorkspaceCreatePost(request);
}
