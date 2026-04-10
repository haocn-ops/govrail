import { proxyControlPlaneOrFallback } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer, type WorkspaceContext } from "@/lib/workspace-context";
import { proxyWorkspaceScopedPostRequest } from "./post-route-helpers";

export type WorkspaceCollectionFallback<T> = {
  items: T[];
  page_info: {
    next_cursor: string | null;
  };
};

type CollectionProxyFn = typeof proxyControlPlaneOrFallback;

export function buildWorkspaceCollectionPath(workspaceId: string, suffix: string): string {
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `/api/v1/saas/workspaces/${workspaceId}${normalizedSuffix}`;
}

export async function proxyWorkspaceScopedCollectionGet<T>(args: {
  suffix: string;
  fallback: WorkspaceCollectionFallback<T>;
  resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
  proxy?: typeof proxyControlPlaneOrFallback;
}): Promise<Response> {
  const resolveContext = args.resolveWorkspaceContext ?? resolveWorkspaceContextForServer;
  const workspaceContext = await resolveContext();

  return proxyWorkspaceContextCollectionGet({
    workspaceContext,
    suffix: args.suffix,
    fallback: args.fallback,
  }, {
    proxy: args.proxy,
  });
}

export function proxyCollectionGet<T>(
  args: {
    path: string;
    fallback: WorkspaceCollectionFallback<T>;
    workspaceContext?: WorkspaceContext;
  },
  options?: {
    proxy?: CollectionProxyFn;
  },
): Promise<Response> {
  const proxy = options?.proxy ?? proxyControlPlaneOrFallback;

  return proxy(
    args.path,
    args.fallback,
    args.workspaceContext
      ? {
          workspaceContext: args.workspaceContext,
        }
      : undefined,
  );
}

export function proxyWorkspaceContextCollectionGet<T>(
  args: {
    workspaceContext: WorkspaceContext;
    suffix: string;
    fallback: WorkspaceCollectionFallback<T>;
  },
  options?: {
    proxy?: CollectionProxyFn;
  },
): Promise<Response> {
  return proxyCollectionGet({
    path: buildWorkspaceCollectionPath(args.workspaceContext.workspace.workspace_id, args.suffix),
    fallback: args.fallback,
    workspaceContext: args.workspaceContext,
  }, {
    proxy: options?.proxy,
  });
}

export function proxyPathCollectionGet<T>(args: {
  path: string;
  fallback: WorkspaceCollectionFallback<T>;
  proxy?: CollectionProxyFn;
}): Promise<Response> {
  return proxyCollectionGet({
    path: args.path,
    fallback: args.fallback,
  }, {
    proxy: args.proxy,
  });
}

export async function proxyWorkspaceScopedCollectionPost(args: {
  request: Request;
  suffix: string;
  contentType?: string;
  resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
  proxyPost?: typeof proxyWorkspaceScopedPostRequest;
}): Promise<Response> {
  const resolveContext = args.resolveWorkspaceContext ?? resolveWorkspaceContextForServer;
  const proxyPost = args.proxyPost ?? proxyWorkspaceScopedPostRequest;
  const workspaceContext = await resolveContext();

  return proxyWorkspaceCollectionPost({
    request: args.request,
    path: buildWorkspaceCollectionPath(workspaceContext.workspace.workspace_id, args.suffix),
    contentType: args.contentType,
    workspaceContext,
  }, {
    proxyPost,
  });
}

export async function proxyWorkspaceContextCollectionPost(args: {
  request: Request;
  path: string;
  contentType?: string;
  resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
  workspaceContext?: WorkspaceContext;
  proxyPost?: typeof proxyWorkspaceScopedPostRequest;
}): Promise<Response> {
  const proxyPost = args.proxyPost ?? proxyWorkspaceScopedPostRequest;
  const workspaceContext =
    args.workspaceContext ??
    (await (args.resolveWorkspaceContext ?? resolveWorkspaceContextForServer)());

  return proxyWorkspaceCollectionPost({
    request: args.request,
    path: args.path,
    contentType: args.contentType,
    workspaceContext,
  }, {
    proxyPost,
  });
}

export function proxyWorkspaceCollectionPost(args: {
  request: Request;
  path: string;
  contentType?: string;
  workspaceContext: WorkspaceContext;
}, options?: {
  proxyPost?: typeof proxyWorkspaceScopedPostRequest;
}): Promise<Response> {
  const proxyPost = options?.proxyPost ?? proxyWorkspaceScopedPostRequest;
  return proxyPost({
    request: args.request,
    workspace: args.workspaceContext.workspace,
    path: args.path,
    contentType: args.contentType,
  });
}
