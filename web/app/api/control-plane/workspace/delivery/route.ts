import {
  proxyWorkspaceDeliveryGet,
  proxyWorkspaceDeliveryPost,
} from "./route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyWorkspaceDeliveryGet();
}

export async function POST(request: Request) {
  return proxyWorkspaceDeliveryPost({ request });
}
