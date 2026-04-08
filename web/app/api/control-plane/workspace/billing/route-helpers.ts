import { proxyControlPlane } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

import { proxyWorkspaceScopedGet } from "../../get-route-helpers";
import {
  buildProxyControlPlanePostInit,
  proxyWorkspaceScopedDetailPost,
} from "../post-route-helpers";

const BILLING_BASE_PATH = "/api/v1/saas/workspaces";

export function buildBillingGetProxyInit(): RequestInit {
  return {
    method: "GET",
  };
}

export async function buildBillingPostProxyInit(request: Request): Promise<RequestInit> {
  return buildProxyControlPlanePostInit({
    request,
    accept: request.headers.get("accept") ?? undefined,
    contentType: request.headers.get("content-type") ?? undefined,
  });
}

export function buildWorkspaceBillingPath(workspaceId: string, suffix: string): string {
  return `${BILLING_BASE_PATH}/${workspaceId}/billing${suffix}`;
}

export async function proxyWorkspaceBillingGet(
  suffix: string,
  options?: {
    resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
    proxy?: typeof proxyControlPlane;
  },
): Promise<Response> {
  return proxyWorkspaceScopedGet(
    {
      getPath: (workspaceContext) =>
        buildWorkspaceBillingPath(workspaceContext.workspace.workspace_id, suffix),
      init: buildBillingGetProxyInit(),
    },
    {
      resolveWorkspaceContext:
        options?.resolveWorkspaceContext ?? resolveWorkspaceContextForServer,
      proxy: options?.proxy ?? proxyControlPlane,
    },
  );
}

export async function proxyWorkspaceBillingPost(
  request: Request,
  suffix: string,
  options?: {
    resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
    proxy?: typeof proxyControlPlane;
    initBuilder?: typeof buildBillingPostProxyInit;
  },
): Promise<Response> {
  const initBuilder = options?.initBuilder ?? buildBillingPostProxyInit;
  return proxyWorkspaceScopedDetailPost({
    request,
    buildPath: (workspaceId) => buildWorkspaceBillingPath(workspaceId, suffix),
    resolveWorkspaceContext:
      options?.resolveWorkspaceContext ?? resolveWorkspaceContextForServer,
    proxy: options?.proxy ?? proxyControlPlane,
    initBuilder: ({ request }) => initBuilder(request),
  });
}
