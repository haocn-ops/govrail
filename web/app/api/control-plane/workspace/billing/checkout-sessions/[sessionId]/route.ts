import { proxyWorkspaceBillingGet } from "../../route-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { sessionId: string } },
) {
  const { sessionId } = params;
  return proxyWorkspaceBillingGet(`/checkout-sessions/${sessionId}`);
}
