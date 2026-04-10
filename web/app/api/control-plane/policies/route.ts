import { previewPolicies } from "@/lib/control-plane-preview";
import { proxyPathCollectionGet } from "../collection-route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyPathCollectionGet({
    path: "/api/v1/policies",
    fallback: {
      items: previewPolicies,
      page_info: {
        next_cursor: null,
      },
    },
  });
}
