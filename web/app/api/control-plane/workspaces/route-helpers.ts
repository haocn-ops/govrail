import { proxyControlPlane } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";
import { buildProxyControlPlanePostInit } from "../post-route-helpers";

export type WorkspaceBootstrapHeaderContext = {
  workspace_id: string;
  slug: string;
  tenant_id: string;
};

type ProxyControlPlaneFn = typeof proxyControlPlane;

export function buildForwardedAuthHeaders(request: Request): Headers {
  const headers = new Headers();
  const forwardedSubject =
    request.headers.get("x-authenticated-subject") ??
    request.headers.get("cf-access-authenticated-user-email");
  const forwardedRoles =
    request.headers.get("x-authenticated-roles") ??
    request.headers.get("cf-access-authenticated-user-groups");

  if (forwardedSubject) {
    headers.set("x-authenticated-subject", forwardedSubject);
  }
  if (forwardedRoles) {
    headers.set("x-authenticated-roles", forwardedRoles);
  }

  return headers;
}

const WORKSPACES_BASE_PATH = "/api/v1/saas/workspaces";

export async function buildWorkspaceCreateProxyInit(request: Request): Promise<RequestInit> {
  return buildProxyControlPlanePostInit({
    request,
    accept: null,
  });
}

export function buildWorkspaceBootstrapPath(workspaceId: string): string {
  return `${WORKSPACES_BASE_PATH}/${workspaceId}/bootstrap`;
}

export async function proxyWorkspaceTenantlessPost(args: {
  request: Request;
  path: string;
}, options: {
  proxy?: ProxyControlPlaneFn;
  initBuilder: (request: Request) => Promise<RequestInit>;
}): Promise<Response> {
  const proxy = options.proxy ?? proxyControlPlane;

  return proxy(args.path, {
    includeTenant: false,
    init: await options.initBuilder(args.request),
  });
}

export async function buildWorkspaceBootstrapProxyInit(
  request: Request,
  args: {
    workspaceId: string;
    currentWorkspace: WorkspaceBootstrapHeaderContext;
  },
): Promise<RequestInit> {
  const init = await buildProxyControlPlanePostInit({
    request,
    accept: null,
    headers: buildForwardedAuthHeaders(request),
  });

  const headers = new Headers(init.headers);
  headers.set("x-workspace-id", args.workspaceId);
  if (args.currentWorkspace.workspace_id === args.workspaceId) {
    headers.set("x-workspace-slug", args.currentWorkspace.slug);
    headers.set("x-tenant-id", args.currentWorkspace.tenant_id);
  }

  return {
    ...init,
    headers,
  };
}

export async function proxyWorkspaceCreatePost(
  request: Request,
  options?: {
    proxy?: ProxyControlPlaneFn;
    initBuilder?: typeof buildWorkspaceCreateProxyInit;
  },
): Promise<Response> {
  const initBuilder = options?.initBuilder ?? buildWorkspaceCreateProxyInit;

  return proxyWorkspaceTenantlessPost({
    request,
    path: WORKSPACES_BASE_PATH,
  }, {
    proxy: options?.proxy,
    initBuilder,
  });
}

export async function proxyWorkspaceBootstrapPost(
  request: Request,
  args: {
    workspaceId: string;
    currentWorkspace?: WorkspaceBootstrapHeaderContext;
  },
  options?: {
    resolveWorkspaceContext?: () => Promise<{ workspace: WorkspaceBootstrapHeaderContext }>;
    proxy?: ProxyControlPlaneFn;
    initBuilder?: typeof buildWorkspaceBootstrapProxyInit;
  },
): Promise<Response> {
  const resolveWorkspaceContext =
    options?.resolveWorkspaceContext ?? resolveWorkspaceContextForServer;
  const initBuilder = options?.initBuilder ?? buildWorkspaceBootstrapProxyInit;
  const currentWorkspace = args.currentWorkspace ?? (await resolveWorkspaceContext()).workspace;

  return proxyWorkspaceTenantlessPost({
    request,
    path: buildWorkspaceBootstrapPath(args.workspaceId),
  }, {
    proxy: options?.proxy,
    initBuilder: (request) => initBuilder(request, {
      workspaceId: args.workspaceId,
      currentWorkspace,
    }),
  });
}
