import { previewToolProviders } from "@/lib/control-plane-preview";
import { proxyControlPlaneOrFallback } from "@/lib/control-plane-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyControlPlaneOrFallback(
    "/api/v1/tool-providers",
    {
      items: previewToolProviders,
      page_info: {
        next_cursor: null
      }
    },
  );
}
