import type { proxyControlPlane } from "@/lib/control-plane-proxy";
import { proxyRequestPathGet } from "../get-route-helpers";

type ProxyControlPlaneFn = typeof proxyControlPlane;

export function buildRunPath(runId: string, suffix?: string): string {
  const base = `/api/v1/runs/${runId}`;
  return suffix ? `${base}${suffix}` : base;
}

export async function proxyRunDetailRequest(args: {
  request: Request;
  runId: string;
  suffix?: string;
  proxy?: ProxyControlPlaneFn;
}): Promise<Response> {
  return proxyRequestPathGet({
    request: args.request,
    path: buildRunPath(args.runId, args.suffix),
  }, {
    proxy: args.proxy,
  });
}
