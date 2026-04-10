import { proxyHealthGet } from "../system-route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyHealthGet();
}
