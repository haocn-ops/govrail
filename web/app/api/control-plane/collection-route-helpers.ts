import { proxyControlPlaneOrFallback } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";
import { proxyWorkspaceScopedPostRequest } from "./post-route-helpers";

export type WorkspaceCollectionFallback<T> = {
  items: T[];
  page_info: {
    next_cursor: string | null;
  };
};

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
  const proxy = args.proxy ?? proxyControlPlaneOrFallback;
  const workspaceContext = await resolveContext();

  return proxy(
    buildWorkspaceCollectionPath(workspaceContext.workspace.workspace_id, args.suffix),
    args.fallback,
    {
      workspaceContext,
    },
  );
}

export async function proxyPathCollectionGet<T>(args: {
  path: string;
  fallback: WorkspaceCollectionFallback<T>;
  proxy?: typeof proxyControlPlaneOrFallback;
}): Promise<Response> {
  const proxy = args.proxy ?? proxyControlPlaneOrFallback;
  return proxy(args.path, args.fallback);
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

  return proxyPost({
    request: args.request,
    workspace: workspaceContext.workspace,
    path: buildWorkspaceCollectionPath(workspaceContext.workspace.workspace_id, args.suffix),
    contentType: args.contentType,
  });
}

export async function proxyWorkspaceContextCollectionPost(args: {
  request: Request;
  path: string;
  contentType?: string;
  resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
  proxyPost?: typeof proxyWorkspaceScopedPostRequest;
}): Promise<Response> {
  const resolveContext = args.resolveWorkspaceContext ?? resolveWorkspaceContextForServer;
  const proxyPost = args.proxyPost ?? proxyWorkspaceScopedPostRequest;
  const workspaceContext = await resolveContext();

  return proxyPost({
    request: args.request,
    workspace: workspaceContext.workspace,
    path: args.path,
    contentType: args.contentType,
  });
}
