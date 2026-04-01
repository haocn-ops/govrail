import { createId } from "./ids.js";

export interface ResponseMeta {
  request_id: string;
  trace_id: string;
}

type NorthboundAuthMode = "permissive" | "trusted_edge";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function json(data: unknown, meta: ResponseMeta, init: ResponseInit = {}): Response {
  return new Response(
    JSON.stringify({
      data,
      meta,
    }),
    {
      ...init,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...init.headers,
      },
    },
  );
}

export function errorResponse(error: ApiError, meta: ResponseMeta): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      meta,
    }),
    {
      status: error.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, "invalid_request", "Request body must be valid JSON");
  }
}

export function getNorthboundAuthMode(env: Env): NorthboundAuthMode {
  return env.NORTHBOUND_AUTH_MODE === "trusted_edge" ? "trusted_edge" : "permissive";
}

export function enforceNorthboundAccess(request: Request, env: Env): void {
  if (getNorthboundAuthMode(env) !== "trusted_edge") {
    return;
  }

  const hasUntrustedIdentityOverride =
    request.headers.has("x-subject-id") ||
    request.headers.has("x-subject-roles") ||
    request.headers.has("x-roles");

  if (hasUntrustedIdentityOverride) {
    throw new ApiError(
      401,
      "unauthorized",
      "Direct X-Subject-* identity overrides are disabled in trusted_edge mode",
    );
  }

  const trustedSubjectId =
    request.headers.get("cf-access-authenticated-user-email") ??
    request.headers.get("x-authenticated-subject");
  if (!trustedSubjectId || trustedSubjectId.trim() === "") {
    throw new ApiError(
      401,
      "unauthorized",
      "Trusted edge identity headers are required in trusted_edge mode",
    );
  }
}

export function getRequiredTenantId(request: Request): string {
  const tenantId = request.headers.get("x-tenant-id");
  if (!tenantId) {
    throw new ApiError(400, "invalid_request", "Missing required header: X-Tenant-Id");
  }
  return tenantId;
}

export function getSubjectId(request: Request, env: Env): string {
  if (getNorthboundAuthMode(env) === "trusted_edge") {
    return (
      request.headers.get("cf-access-authenticated-user-email") ??
      request.headers.get("x-authenticated-subject") ??
      "anonymous"
    );
  }

  return (
    request.headers.get("cf-access-authenticated-user-email") ??
    request.headers.get("x-authenticated-subject") ??
    request.headers.get("x-subject-id") ??
    "anonymous"
  );
}

export function getSubjectRoles(request: Request, env: Env): string[] {
  const roleHeaders =
    getNorthboundAuthMode(env) === "trusted_edge"
      ? [
          request.headers.get("x-authenticated-roles"),
          request.headers.get("cf-access-authenticated-user-groups"),
        ]
      : [
          request.headers.get("x-authenticated-roles"),
          request.headers.get("x-subject-roles"),
          request.headers.get("x-roles"),
          request.headers.get("cf-access-authenticated-user-groups"),
        ];

  const normalizedRoleHeaders = roleHeaders.filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );

  if (normalizedRoleHeaders.length === 0) {
    return [];
  }

  const roles = new Set<string>();
  for (const raw of normalizedRoleHeaders) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          for (const value of parsed) {
            if (typeof value === "string" && value.trim() !== "") {
              roles.add(value.trim());
            }
          }
          continue;
        }
      } catch {
        // Fall through to comma-separated parsing.
      }
    }

    for (const part of trimmed.split(",")) {
      const role = part.trim();
      if (role !== "") {
        roles.add(role);
      }
    }
  }

  return [...roles];
}

export function buildMeta(request: Request, traceId?: string): ResponseMeta {
  return {
    request_id: request.headers.get("x-request-id") ?? createId("req"),
    trace_id: traceId ?? request.headers.get("x-trace-id") ?? createId("trc"),
  };
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key");
  if (!key) {
    throw new ApiError(400, "invalid_request", "Missing required header: Idempotency-Key");
  }
  return key;
}
