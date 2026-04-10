import { proxyControlPlane, requireMetadataWorkspaceContext } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer, type WorkspaceContext } from "@/lib/workspace-context";

export type MetadataGetArgs = {
  getPath: (workspaceContext: WorkspaceContext) => string;
  includeTenant?: boolean;
  message: string;
};

export type WorkspaceScopedGetArgs = {
  getPath: (workspaceContext: WorkspaceContext) => string;
  includeTenant?: boolean;
  init?: RequestInit;
};

export type PathGetArgs = {
  path: string;
  includeTenant?: boolean;
  init?: RequestInit;
};

export function proxyPathGet(
  args: PathGetArgs,
  options?: {
    proxy?: typeof proxyControlPlane;
  },
): Promise<Response> {
  const proxy = options?.proxy ?? proxyControlPlane;
  return proxy(args.path, {
    includeTenant: args.includeTenant,
    init: args.init,
  });
}

export function proxyRequestPathGet(
  args: PathGetArgs & {
    request: Request;
  },
  options?: {
    proxy?: typeof proxyControlPlane;
  },
): Promise<Response> {
  const search = new URL(args.request.url).search;
  return proxyPathGet({
    path: search ? `${args.path}${search}` : args.path,
    includeTenant: args.includeTenant,
    init: args.init,
  }, options);
}

export function proxyWorkspaceContextGet(
  args: WorkspaceScopedGetArgs & {
    workspaceContext: WorkspaceContext;
  },
  options?: {
    proxy?: typeof proxyControlPlane;
  },
): Promise<Response> {
  const proxy = options?.proxy ?? proxyControlPlane;
  return proxy(args.getPath(args.workspaceContext), {
    includeTenant: args.includeTenant,
    workspaceContext: args.workspaceContext,
    init: args.init,
  });
}

export async function proxyWorkspaceScopedGet(
  args: WorkspaceScopedGetArgs,
  options?: {
    resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
    proxy?: typeof proxyControlPlane;
  },
): Promise<Response> {
  const resolveWorkspaceContext =
    options?.resolveWorkspaceContext ?? resolveWorkspaceContextForServer;
  const proxy = options?.proxy ?? proxyControlPlane;
  const workspaceContext = await resolveWorkspaceContext();

  return proxyWorkspaceContextGet({
    ...args,
    workspaceContext,
  }, {
    proxy,
  });
}

export async function proxyMetadataGet(
  args: MetadataGetArgs,
  options?: {
    resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
    proxy?: typeof proxyControlPlane;
    metadataGuard?: typeof requireMetadataWorkspaceContext;
  },
): Promise<Response> {
  const resolveWorkspaceContext =
    options?.resolveWorkspaceContext ?? resolveWorkspaceContextForServer;
  const proxy = options?.proxy ?? proxyControlPlane;
  const metadataGuard =
    options?.metadataGuard ?? requireMetadataWorkspaceContext;
  const workspaceContext = await resolveWorkspaceContext();
  const guardResponse = metadataGuard({
    workspaceContext,
    message: args.message,
  });
  if (guardResponse) {
    return guardResponse;
  }

  return proxyWorkspaceContextGet({
    getPath: args.getPath,
    includeTenant: args.includeTenant,
    workspaceContext,
  }, {
    proxy,
  });
}
