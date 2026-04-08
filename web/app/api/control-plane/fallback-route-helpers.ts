import { proxyControlPlane } from "@/lib/control-plane-proxy";

type ProxyControlPlaneFn = typeof proxyControlPlane;
type ProxyWorkspaceContext = NonNullable<
  Parameters<ProxyControlPlaneFn>[1]
>["workspaceContext"];

type FallbackMeta = {
  request_id: string;
  trace_id: string;
};

type ProxyFallbackGetArgs<T> = {
  path: string;
  includeTenant?: boolean;
  workspaceContext?: ProxyWorkspaceContext;
  proxy?: ProxyControlPlaneFn;
  buildFallback: (upstream: Response) => { data: T; meta?: Partial<FallbackMeta> };
};

const DEFAULT_FALLBACK_META: FallbackMeta = {
  request_id: "preview-request",
  trace_id: "preview-trace",
};

export async function proxyFallbackGet<T>(
  args: ProxyFallbackGetArgs<T>,
): Promise<Response> {
  const upstream = await (args.proxy ?? proxyControlPlane)(args.path, {
    includeTenant: args.includeTenant,
    workspaceContext: args.workspaceContext,
  });

  if (upstream.ok) {
    return upstream;
  }

  if (upstream.status !== 404 && upstream.status !== 503) {
    return upstream;
  }

  const fallback = args.buildFallback(upstream);
  return Response.json({
    data: fallback.data,
    meta: {
      ...DEFAULT_FALLBACK_META,
      ...(fallback.meta ?? {}),
    },
  });
}
