import { proxyWorkspaceBillingPost } from "../../route-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyWorkspaceBillingPost(request, "/subscription:resume");
}
