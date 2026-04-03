import { proxyControlPlane } from "@/lib/control-plane-proxy";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { runId: string } },
) {
  const search = new URL(request.url).search;
  return proxyControlPlane(`/api/v1/runs/${params.runId}/artifacts${search}`);
}
