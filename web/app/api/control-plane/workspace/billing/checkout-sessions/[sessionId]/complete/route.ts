import { proxyWorkspaceBillingPost } from "../../../route-helpers";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  const { sessionId } = params;
  return proxyWorkspaceBillingPost(request, `/checkout-sessions/${sessionId}:complete`);
}
