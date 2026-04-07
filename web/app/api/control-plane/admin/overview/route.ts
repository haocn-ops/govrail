import { proxyAdminOverviewGet } from "../route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyAdminOverviewGet();
}
