import { proxyControlPlane } from "@/lib/control-plane-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyControlPlane("/api/v1/health", { includeTenant: false });
}
