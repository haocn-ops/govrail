import { proxyWorkspaceBillingGet } from "../route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyWorkspaceBillingGet("/providers");
}
