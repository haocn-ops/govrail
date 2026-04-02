function getBaseUrl(): string {
  return (
    process.env.CONTROL_PLANE_BASE_URL ??
    process.env.NEXT_PUBLIC_CONTROL_PLANE_BASE_URL ??
    ""
  ).replace(/\/$/, "");
}

function getTenantId(): string {
  return (
    process.env.CONTROL_PLANE_TENANT_ID ??
    process.env.NEXT_PUBLIC_CONTROL_PLANE_TENANT_ID ??
    "tenant_demo"
  );
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

export async function proxyControlPlane(path: string, options?: { includeTenant?: boolean }): Promise<Response> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return Response.json(
      {
        error: {
          code: "control_plane_base_missing",
          message: "CONTROL_PLANE_BASE_URL is not configured"
        }
      },
      { status: 503 },
    );
  }

  const headers = new Headers({
    accept: "application/json",
    "x-authenticated-subject": getSubjectId(),
    "x-authenticated-roles": getSubjectRoles()
  });

  if (options?.includeTenant !== false) {
    headers.set("x-tenant-id", getTenantId());
  }

  const upstream = await fetch(`${baseUrl}${path}`, {
    headers,
    cache: "no-store"
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}

export async function proxyControlPlaneOrFallback<T>(
  path: string,
  fallbackData: T,
  options?: { includeTenant?: boolean },
): Promise<Response> {
  const upstream = await proxyControlPlane(path, options);
  if (upstream.ok) {
    return upstream;
  }

  return Response.json({
    data: fallbackData,
    meta: {
      request_id: "preview-request",
      trace_id: "preview-trace"
    }
  });
}
