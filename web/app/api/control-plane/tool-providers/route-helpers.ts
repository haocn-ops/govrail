import { proxyControlPlane } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";
import { buildProxyControlPlanePostInit } from "../post-route-helpers";

export type ToolProviderAction = "disable";

export function buildToolProviderPath(toolProviderId: string, action?: ToolProviderAction): string {
  const basePath = `/api/v1/tool-providers/${toolProviderId}`;
  return action === "disable" ? `${basePath}:disable` : basePath;
}

export async function buildToolProviderPostInit(request: Request): Promise<RequestInit> {
  return buildProxyControlPlanePostInit({
    request,
    accept: request.headers.get("accept") ?? undefined,
    contentType: request.headers.get("content-type") ?? undefined,
    emptyBodyAsUndefined: true,
  });
}

export async function proxyToolProviderPost(
  request: Request,
  toolProviderId: string,
  action?: ToolProviderAction,
  options?: {
    resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
    proxy?: typeof proxyControlPlane;
    initBuilder?: typeof buildToolProviderPostInit;
  },
): Promise<Response> {
  const resolveWorkspaceContext =
    options?.resolveWorkspaceContext ?? resolveWorkspaceContextForServer;
  const proxy = options?.proxy ?? proxyControlPlane;
  const initBuilder = options?.initBuilder ?? buildToolProviderPostInit;
  const workspaceContext = await resolveWorkspaceContext();

  return proxy(buildToolProviderPath(toolProviderId, action), {
    workspaceContext,
    init: await initBuilder(request),
  });
}
