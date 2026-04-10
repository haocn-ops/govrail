import {
  buildProxyControlPlanePostInit,
  proxyWorkspaceScopedDetailPost,
} from "../post-route-helpers";
import { proxyWorkspaceScopedGet } from "../get-route-helpers";
import { proxyControlPlane, requireMetadataWorkspaceContext } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

const BASE_PATH = "/api/v1/saas/workspaces";
export const auditExportAcceptHeader = "application/json, application/x-ndjson";

export function buildWorkspaceEnterprisePath(workspaceId: string, suffix: string): string {
  return `${BASE_PATH}/${workspaceId}${suffix}`;
}

export function buildWorkspaceEnterpriseGetPath(
  workspaceId: string,
  suffix: string,
  request?: Request,
): string {
  const basePath = buildWorkspaceEnterprisePath(workspaceId, suffix);
  if (!request) {
    return basePath;
  }

  const query = new URL(request.url).searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function buildWorkspaceEnterpriseGetInit(args?: {
  request?: Request;
  defaultAccept?: string;
}): RequestInit {
  const accept = args?.request?.headers.get("accept") ?? args?.defaultAccept ?? null;
  return accept
    ? {
        method: "GET",
        headers: {
          accept,
        },
      }
    : {
        method: "GET",
      };
}

export async function buildWorkspaceEnterprisePostInit(request: Request): Promise<RequestInit> {
  return buildProxyControlPlanePostInit({
    request,
    accept: request.headers.get("accept") ?? null,
    contentType: request.headers.get("content-type") ?? null,
    emptyBodyAsUndefined: true,
  });
}

export async function proxyWorkspaceEnterpriseGet(
  suffix: string,
  options?: {
    request?: Request;
    defaultAccept?: string;
    resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
    proxy?: typeof proxyControlPlane;
  },
): Promise<Response> {
  return proxyWorkspaceScopedGet(
    {
      getPath: (workspaceContext) =>
        buildWorkspaceEnterpriseGetPath(workspaceContext.workspace.workspace_id, suffix, options?.request),
      init: buildWorkspaceEnterpriseGetInit(options),
    },
    {
      resolveWorkspaceContext:
        options?.resolveWorkspaceContext ?? resolveWorkspaceContextForServer,
      proxy: options?.proxy ?? proxyControlPlane,
    },
  );
}

export async function proxyWorkspaceEnterprisePost(
  args: {
    suffix: string;
    request: Request;
    metadataMessage: string;
  },
  options?: {
    resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
    proxy?: typeof proxyControlPlane;
    initBuilder?: typeof buildWorkspaceEnterprisePostInit;
  },
): Promise<Response> {
  const initBuilder = options?.initBuilder ?? buildWorkspaceEnterprisePostInit;
  return proxyWorkspaceScopedDetailPost({
    request: args.request,
    buildPath: (workspaceId) => buildWorkspaceEnterprisePath(workspaceId, args.suffix),
    resolveWorkspaceContext:
      options?.resolveWorkspaceContext ?? resolveWorkspaceContextForServer,
    proxy: options?.proxy ?? proxyControlPlane,
    initBuilder: ({ request }) => initBuilder(request),
    beforeProxy: (workspaceContext) =>
      requireMetadataWorkspaceContext({
        workspaceContext,
        message: args.metadataMessage,
      }),
  });
}
