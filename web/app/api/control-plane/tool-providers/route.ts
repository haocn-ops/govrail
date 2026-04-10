import { previewToolProviders } from "@/lib/control-plane-preview";
import {
  proxyPathCollectionGet,
  proxyWorkspaceContextCollectionPost,
} from "../collection-route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyPathCollectionGet({
    path: "/api/v1/tool-providers",
    fallback: {
      items: previewToolProviders,
      page_info: {
        next_cursor: null,
      },
    },
  });
}

export async function POST(request: Request) {
  return proxyWorkspaceContextCollectionPost({
    request,
    path: "/api/v1/tool-providers",
  });
}
