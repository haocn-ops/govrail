import { proxyControlPlane } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";
import { buildProxyControlPlanePostInit } from "../post-route-helpers";

export type WorkspaceBootstrapHeaderContext = {
  workspace_id: string;
  slug: string;
  tenant_id: string;
};

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
    proxy?: typeof proxyControlPlane;
    initBuilder?: typeof buildWorkspaceCreateProxyInit;
  },
): Promise<Response> {
  const proxy = options?.proxy ?? proxyControlPlane;
  const initBuilder = options?.initBuilder ?? buildWorkspaceCreateProxyInit;

  return proxy(WORKSPACES_BASE_PATH, {
    includeTenant: false,
    init: await initBuilder(request),
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
    proxy?: typeof proxyControlPlane;
    initBuilder?: typeof buildWorkspaceBootstrapProxyInit;
  },
): Promise<Response> {
  const resolveWorkspaceContext =
    options?.resolveWorkspaceContext ?? resolveWorkspaceContextForServer;
  const proxy = options?.proxy ?? proxyControlPlane;
  const initBuilder = options?.initBuilder ?? buildWorkspaceBootstrapProxyInit;
  const currentWorkspace = args.currentWorkspace ?? (await resolveWorkspaceContext()).workspace;

  return proxy(buildWorkspaceBootstrapPath(args.workspaceId), {
    includeTenant: false,
    init: await initBuilder(request, {
      workspaceId: args.workspaceId,
      currentWorkspace,
    }),
  });
}
