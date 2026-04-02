import { previewPolicies } from "@/lib/control-plane-preview";
import { proxyControlPlaneOrFallback } from "@/lib/control-plane-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyControlPlaneOrFallback(
    "/api/v1/policies",
    {
      items: previewPolicies,
      page_info: {
        next_cursor: null
      }
    },
  );
}
