import { buildProxyControlPlanePostInit } from "../post-route-helpers";
import { proxyControlPlane, requireMetadataWorkspaceContext } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

const BASE_PATH = "/api/v1/saas/workspaces";

export function buildWorkspaceEnterprisePath(workspaceId: string, suffix: string): string {
  return `${BASE_PATH}/${workspaceId}${suffix}`;
}

export async function buildWorkspaceEnterprisePostInit(request: Request): Promise<RequestInit> {
  return buildProxyControlPlanePostInit({
    request,
    accept: request.headers.get("accept") ?? null,
    contentType: request.headers.get("content-type") ?? null,
    emptyBodyAsUndefined: true,
  });
}

async function resolveEnterpriseWorkspaceContext() {
  return resolveWorkspaceContextForServer();
}

export async function proxyWorkspaceEnterpriseGet(suffix: string): Promise<Response> {
  const workspaceContext = await resolveEnterpriseWorkspaceContext();
  return proxyControlPlane(buildWorkspaceEnterprisePath(workspaceContext.workspace.workspace_id, suffix), {
    init: {
      method: "GET",
    },
  });
}

export async function proxyWorkspaceEnterprisePost(args: {
  suffix: string;
  request: Request;
  metadataMessage: string;
}): Promise<Response> {
  const workspaceContext = await resolveEnterpriseWorkspaceContext();
  const metadataGuard = requireMetadataWorkspaceContext({
    workspaceContext,
    message: args.metadataMessage,
  });
  if (metadataGuard) {
    return metadataGuard;
  }

  return proxyControlPlane(buildWorkspaceEnterprisePath(workspaceContext.workspace.workspace_id, args.suffix), {
    init: await buildWorkspaceEnterprisePostInit(args.request),
  });
}
