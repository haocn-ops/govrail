import {
  proxyWorkspaceScopedCollectionGet,
  proxyWorkspaceScopedCollectionPost,
} from "../collection-route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyWorkspaceScopedCollectionGet({
    suffix: "/invitations",
    fallback: {
      items: [],
      page_info: {
        next_cursor: null,
      },
    },
  });
}

export async function POST(request: Request) {
  return proxyWorkspaceScopedCollectionPost({ request, suffix: "/invitations" });
}
