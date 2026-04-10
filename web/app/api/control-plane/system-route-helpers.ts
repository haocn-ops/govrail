import type { proxyControlPlane } from "@/lib/control-plane-proxy";
import { proxyPathGet } from "./get-route-helpers";

type ProxyControlPlaneFn = typeof proxyControlPlane;

const HEALTH_PATH = "/api/v1/health";

export function buildHealthPath(): string {
  return HEALTH_PATH;
}

export async function proxyHealthGet(args?: {
  proxy?: ProxyControlPlaneFn;
}): Promise<Response> {
  return proxyPathGet({
    path: buildHealthPath(),
    includeTenant: false,
  }, {
    proxy: args?.proxy,
  });
}
