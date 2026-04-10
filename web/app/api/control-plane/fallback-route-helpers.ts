import { proxyControlPlane } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer, type WorkspaceContext } from "@/lib/workspace-context";

type ProxyControlPlaneFn = typeof proxyControlPlane;
type ProxyWorkspaceContext = NonNullable<
  Parameters<ProxyControlPlaneFn>[1]
>["workspaceContext"];
type ProxyFallbackGetFn = typeof proxyFallbackGet;

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

type PathFallbackGetArgs<T> = {
  path: string;
  includeTenant?: boolean;
  workspaceContext?: WorkspaceContext;
  proxyControlPlane?: ProxyControlPlaneFn;
  buildFallback: (upstream: Response) => { data: T; meta?: Partial<FallbackMeta> };
};

type WorkspaceScopedFallbackGetArgs<T> = {
  getPath: (workspaceContext: WorkspaceContext) => string;
  includeTenant?: boolean;
  buildFallback: (
    upstream: Response,
    workspaceContext: WorkspaceContext,
  ) => { data: T; meta?: Partial<FallbackMeta> };
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

export function proxyPathFallbackGet<T>(
  args: PathFallbackGetArgs<T>,
  options?: {
    proxy?: ProxyFallbackGetFn;
  },
): Promise<Response> {
  const proxy = options?.proxy ?? proxyFallbackGet;
  return proxy({
    path: args.path,
    includeTenant: args.includeTenant,
    workspaceContext: args.workspaceContext,
    proxy: args.proxyControlPlane,
    buildFallback: args.buildFallback,
  });
}

export function proxyWorkspaceContextFallbackGet<T>(
  args: WorkspaceScopedFallbackGetArgs<T> & {
    workspaceContext: WorkspaceContext;
    proxyControlPlane?: ProxyControlPlaneFn;
  },
  options?: {
    proxy?: ProxyFallbackGetFn;
  },
): Promise<Response> {
  return proxyPathFallbackGet({
    path: args.getPath(args.workspaceContext),
    includeTenant: args.includeTenant,
    workspaceContext: args.workspaceContext,
    proxyControlPlane: args.proxyControlPlane,
    buildFallback: (upstream) => args.buildFallback(upstream, args.workspaceContext),
  }, {
    proxy: options?.proxy,
  });
}

export async function proxyWorkspaceScopedFallbackGet<T>(
  args: WorkspaceScopedFallbackGetArgs<T>,
  options?: {
    resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
    proxy?: ProxyFallbackGetFn;
    proxyControlPlane?: ProxyControlPlaneFn;
  },
): Promise<Response> {
  const resolveWorkspaceContext =
    options?.resolveWorkspaceContext ?? resolveWorkspaceContextForServer;
  const workspaceContext = await resolveWorkspaceContext();

  return proxyWorkspaceContextFallbackGet({
    ...args,
    workspaceContext,
    proxyControlPlane: options?.proxyControlPlane,
  }, {
    proxy: options?.proxy,
  });
}
