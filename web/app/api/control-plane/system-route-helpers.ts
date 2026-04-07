import { proxyControlPlane } from "@/lib/control-plane-proxy";

const HEALTH_PATH = "/api/v1/health";

export function buildHealthPath(): string {
  return HEALTH_PATH;
}

export async function proxyHealthGet(args?: {
  proxy?: typeof proxyControlPlane;
}): Promise<Response> {
  const proxy = args?.proxy ?? proxyControlPlane;
  return proxy(buildHealthPath(), { includeTenant: false });
}
