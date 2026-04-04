import { resolveWorkspaceContextForServer, type WorkspaceContext } from "@/lib/workspace-context";

type ControlPlaneErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export function controlPlaneErrorResponse(args: {
  status?: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}): Response {
  const payload: ControlPlaneErrorPayload = {
    error: {
      code: args.code,
      message: args.message,
      ...(args.details ? { details: args.details } : {}),
    },
  };

  return Response.json(payload, { status: args.status ?? 503 });
}

export function requireMetadataWorkspaceContext(args: {
  workspaceContext: WorkspaceContext;
  message: string;
}): Response | null {
  if (args.workspaceContext.source === "metadata") {
    return null;
  }

  return controlPlaneErrorResponse({
    status: 412,
    code: "workspace_context_not_metadata",
    message: args.message,
    details: {
      source: args.workspaceContext.source,
      workspace_id: args.workspaceContext.workspace.workspace_id,
      workspace_slug: args.workspaceContext.workspace.slug,
    },
  });
}

function getBaseUrl(): string {
  return (
    process.env.CONTROL_PLANE_BASE_URL ??
    process.env.NEXT_PUBLIC_CONTROL_PLANE_BASE_URL ??
    ""
  ).replace(/\/$/, "");
}

function getSubjectId(): string {
  return (
    process.env.CONTROL_PLANE_SUBJECT_ID ??
    process.env.NEXT_PUBLIC_CONTROL_PLANE_SUBJECT_ID ??
    "codex@local"
  );
}

function getSubjectRoles(): string {
  return (
    process.env.CONTROL_PLANE_SUBJECT_ROLES ??
    process.env.NEXT_PUBLIC_CONTROL_PLANE_SUBJECT_ROLES ??
    "platform_admin"
  );
}

export function buildProxyControlPlaneHeaders(args: {
  workspaceContext: WorkspaceContext;
  headers?: HeadersInit;
  includeTenant?: boolean;
}): Headers {
  const upstreamHeaders = new Headers(args.headers);
  upstreamHeaders.delete("x-subject-id");
  upstreamHeaders.delete("x-subject-roles");
  upstreamHeaders.delete("x-roles");
  if (!upstreamHeaders.get("accept")) {
    upstreamHeaders.set("accept", "application/json");
  }
  if (!upstreamHeaders.get("x-authenticated-subject")) {
    upstreamHeaders.set(
      "x-authenticated-subject",
      args.workspaceContext.workspace.subject_id ?? getSubjectId(),
    );
  }
  if (!upstreamHeaders.get("x-authenticated-roles")) {
    upstreamHeaders.set(
      "x-authenticated-roles",
      args.workspaceContext.workspace.subject_roles ?? getSubjectRoles(),
    );
  }
  if (!upstreamHeaders.get("x-workspace-id")) {
    upstreamHeaders.set("x-workspace-id", args.workspaceContext.workspace.workspace_id);
  }
  if (!upstreamHeaders.get("x-workspace-slug")) {
    upstreamHeaders.set("x-workspace-slug", args.workspaceContext.workspace.slug);
  }
  if (args.includeTenant !== false && !upstreamHeaders.get("x-tenant-id")) {
    upstreamHeaders.set("x-tenant-id", args.workspaceContext.workspace.tenant_id);
  }
  return upstreamHeaders;
}

export async function proxyControlPlane(
  path: string,
  options?: {
    includeTenant?: boolean;
    init?: RequestInit;
    workspaceContext?: Awaited<ReturnType<typeof resolveWorkspaceContextForServer>>;
  },
): Promise<Response> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return controlPlaneErrorResponse({
      code: "control_plane_base_missing",
      message: "CONTROL_PLANE_BASE_URL is not configured",
    });
  }

  const workspaceContext = options?.workspaceContext ?? await resolveWorkspaceContextForServer();
  const upstreamHeaders = buildProxyControlPlaneHeaders({
    workspaceContext,
    headers: options?.init?.headers,
    includeTenant: options?.includeTenant,
  });

  const upstream = await fetch(`${baseUrl}${path}`, {
    ...(options?.init ?? {}),
    headers: upstreamHeaders,
    cache: "no-store",
  });

  const responseHeaders = new Headers({
    "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
  });
  const contentDisposition = upstream.headers.get("content-disposition");
  if (contentDisposition) {
    responseHeaders.set("content-disposition", contentDisposition);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function proxyControlPlaneOrFallback<T>(
  path: string,
  fallbackData: T,
  options?: { includeTenant?: boolean; init?: RequestInit },
): Promise<Response> {
  const upstream = await proxyControlPlane(path, options);
  if (upstream.ok) {
    return upstream;
  }

  return Response.json({
    data: fallbackData,
    meta: {
      request_id: "preview-request",
      trace_id: "preview-trace",
    },
  });
}
