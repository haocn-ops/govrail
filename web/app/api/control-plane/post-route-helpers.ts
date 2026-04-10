import { proxyControlPlane } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer, type WorkspaceContext } from "@/lib/workspace-context";

export type WorkspaceScopedHeaderContext = {
  subject_id?: string | null;
  subject_roles?: string | null;
  workspace_id: string;
  slug: string;
  tenant_id: string;
};

export function getControlPlaneBaseUrl(): string {
  return (
    process.env.CONTROL_PLANE_BASE_URL ??
    process.env.NEXT_PUBLIC_CONTROL_PLANE_BASE_URL ??
    ""
  ).replace(/\/$/, "");
}

export function controlPlaneBaseMissingResponse(): Response {
  return Response.json(
    {
      error: {
        code: "control_plane_base_missing",
        message: "CONTROL_PLANE_BASE_URL is not configured",
      },
    },
    { status: 503 },
  );
}

function buildBasePostHeaders(contentType: string): Headers {
  const headers = new Headers();
  headers.set("accept", "application/json");
  headers.set("content-type", contentType);
  headers.set("idempotency-key", `web-${crypto.randomUUID()}`);
  return headers;
}

export function buildWorkspaceScopedPostHeaders(args: {
  workspace: WorkspaceScopedHeaderContext;
  contentType?: string;
}): Headers {
  const headers = buildBasePostHeaders(args.contentType ?? "application/json");
  headers.set("x-authenticated-subject", args.workspace.subject_id ?? "codex@local");
  headers.set("x-authenticated-roles", args.workspace.subject_roles ?? "platform_admin");
  headers.set("x-workspace-id", args.workspace.workspace_id);
  headers.set("x-workspace-slug", args.workspace.slug);
  headers.set("x-tenant-id", args.workspace.tenant_id);
  return headers;
}

export function buildAuthenticatedPostHeaders(args: {
  subjectId: string;
  subjectRoles: string;
  contentType?: string;
}): Headers {
  const headers = buildBasePostHeaders(args.contentType ?? "application/json");
  headers.set("x-authenticated-subject", args.subjectId);
  headers.set("x-authenticated-roles", args.subjectRoles);
  return headers;
}

export async function buildProxyControlPlanePostInit(args: {
  request: Request;
  headers?: HeadersInit;
  contentType?: string | null;
  accept?: string | null;
  emptyBodyAsUndefined?: boolean;
}): Promise<RequestInit> {
  const body = await args.request.text();
  const headers = new Headers(args.headers);

  if (args.accept !== null) {
    headers.set("accept", args.accept ?? "application/json");
  }
  if (args.contentType !== null) {
    headers.set("content-type", args.contentType ?? "application/json");
  }
  headers.set("idempotency-key", `web-${crypto.randomUUID()}`);

  return {
    method: "POST",
    headers,
    body: args.emptyBodyAsUndefined && body.length === 0 ? undefined : body,
  };
}

export async function proxyControlPlanePost(args: {
  baseUrl: string;
  path: string;
  headers: HeadersInit;
  body: string;
}): Promise<Response> {
  const upstream = await fetch(`${args.baseUrl}${args.path}`, {
    method: "POST",
    headers: args.headers,
    body: args.body,
    cache: "no-store",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
  });
}

export async function proxyWorkspaceScopedPostRequest(args: {
  request: Request;
  workspace: WorkspaceScopedHeaderContext;
  path: string;
  contentType?: string;
}): Promise<Response> {
  const baseUrl = getControlPlaneBaseUrl();
  if (!baseUrl) {
    return controlPlaneBaseMissingResponse();
  }

  return proxyControlPlanePost({
    baseUrl,
    path: args.path,
    headers: buildWorkspaceScopedPostHeaders({
      workspace: args.workspace,
      contentType: args.contentType,
    }),
    body: await args.request.text(),
  });
}

export async function proxyAuthenticatedPostRequest(args: {
  request: Request;
  path: string;
  subjectId: string;
  subjectRoles: string;
  contentType?: string;
}): Promise<Response> {
  const baseUrl = getControlPlaneBaseUrl();
  if (!baseUrl) {
    return controlPlaneBaseMissingResponse();
  }

  return proxyControlPlanePost({
    baseUrl,
    path: args.path,
    headers: buildAuthenticatedPostHeaders({
      subjectId: args.subjectId,
      subjectRoles: args.subjectRoles,
      contentType: args.contentType,
    }),
    body: await args.request.text(),
  });
}

export async function proxyWorkspaceScopedDetailPost(args: {
  request: Request;
  buildPath: (workspaceId: string) => string;
  includeTenant?: boolean;
  resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
  proxy?: typeof proxyControlPlane;
  initBuilder?: typeof buildProxyControlPlanePostInit;
  beforeProxy?: (workspaceContext: WorkspaceContext) => Response | null;
}): Promise<Response> {
  const resolveContext = args.resolveWorkspaceContext ?? resolveWorkspaceContextForServer;
  const proxy = args.proxy ?? proxyControlPlane;
  const initBuilder = args.initBuilder ?? buildProxyControlPlanePostInit;
  const workspaceContext = await resolveContext();
  const guardResponse = args.beforeProxy?.(workspaceContext);
  if (guardResponse) {
    return guardResponse;
  }
  const workspaceId = workspaceContext.workspace.workspace_id;

  return proxy(args.buildPath(workspaceId), {
    includeTenant: args.includeTenant,
    workspaceContext,
    init: await initBuilder({ request: args.request }),
  });
}
