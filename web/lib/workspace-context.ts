import { cookies, headers } from "next/headers";

export const WORKSPACE_COOKIE_NAME = "govrail_workspace";
export const WORKSPACE_CONTEXT_WARNING_HEADER = "x-govrail-workspace-context-warning";
const WORKSPACE_HEADER_SLUG = "x-workspace-slug";
const WORKSPACE_HEADER_ID = "x-workspace-id";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

export type WorkspaceContextSource = "metadata" | "env-fallback" | "preview-fallback";

export type WorkspaceContextSourceDetail = {
  label: "SaaS metadata" | "Environment fallback (non-production)" | "Preview fallback (non-production)";
  is_fallback: boolean;
  local_only: boolean;
  warning: string | null;
};

export type WorkspaceRecord = {
  workspace_id: string;
  slug: string;
  display_name: string;
  tenant_id: string;
  subject_id?: string;
  subject_roles?: string;
};

export type WorkspaceContext = {
  source: WorkspaceContextSource;
  source_detail: WorkspaceContextSourceDetail;
  session_user: {
    user_id: string;
    email: string;
    auth_provider: string;
    auth_subject: string;
  } | null;
  workspace: WorkspaceRecord;
  available_workspaces: WorkspaceRecord[];
  selection: {
    requested_workspace_id: string | null;
    requested_workspace_slug: string | null;
    cookie_workspace: string | null;
  };
};

type WorkspaceSelectionArgs = {
  requestedWorkspaceId?: string | null;
  requestedWorkspaceSlug?: string | null;
  cookieWorkspace?: string | null;
  preferredSubjectId?: string | null;
  preferredSubjectRoles?: string | null;
};

type SaasMeResponse = {
  data?: {
    user?: {
      user_id?: string;
      email?: string;
      auth_provider?: string;
      auth_subject?: string;
    };
    workspaces?: WorkspaceListItem[];
  };
};

type WorkspaceListItem = {
  workspace_id?: string;
  slug?: string;
  display_name?: string;
  tenant_id?: string;
};

const DEFAULT_PREVIEW_WORKSPACE: WorkspaceRecord = {
  workspace_id: "ws_preview",
  slug: "preview",
  display_name: "Preview",
  tenant_id: "tenant_demo",
  subject_id: "codex@local",
  subject_roles: "platform_admin",
};

export function isWorkspaceContextFallbackSource(source: WorkspaceContextSource): boolean {
  return source !== "metadata";
}

export function describeWorkspaceContextSource(source: WorkspaceContextSource): WorkspaceContextSourceDetail {
  if (source === "metadata") {
    return {
      label: "SaaS metadata",
      is_fallback: false,
      local_only: false,
      warning: null,
    };
  }

  return {
    label: source === "env-fallback" ? "Environment fallback (non-production)" : "Preview fallback (non-production)",
    is_fallback: true,
    local_only: true,
    warning: getFallbackWorkspaceContextWarning(source),
  };
}

function getFallbackWorkspaceContextWarning(source: WorkspaceContextSource): string | null {
  if (source === "env-fallback") {
    return "Workspace context was loaded from environment fallback values. Use metadata-backed session context before production rollout.";
  }

  if (source === "preview-fallback") {
    return "Workspace context is running in preview fallback mode. This is for local/demo validation only and should not be treated as production identity state.";
  }

  return null;
}

function getBaseUrl(): string {
  return (
    process.env.CONTROL_PLANE_BASE_URL ??
    process.env.NEXT_PUBLIC_CONTROL_PLANE_BASE_URL ??
    ""
  ).replace(/\/$/, "");
}

function getBaseSubjectId(): string {
  return (
    process.env.CONTROL_PLANE_SUBJECT_ID ??
    process.env.NEXT_PUBLIC_CONTROL_PLANE_SUBJECT_ID ??
    "codex@local"
  );
}

function getBaseSubjectRoles(): string {
  return (
    process.env.CONTROL_PLANE_SUBJECT_ROLES ??
    process.env.NEXT_PUBLIC_CONTROL_PLANE_SUBJECT_ROLES ??
    "platform_admin"
  );
}

function enrichWorkspace(
  workspace: WorkspaceRecord,
  sessionUser?: WorkspaceContext["session_user"],
): WorkspaceRecord {
  return {
    ...workspace,
    subject_id: workspace.subject_id ?? sessionUser?.auth_subject ?? getBaseSubjectId(),
    subject_roles: workspace.subject_roles ?? getBaseSubjectRoles(),
  };
}

function getEnvFallbackWorkspace(): WorkspaceRecord | null {
  const tenantId = (
    process.env.CONTROL_PLANE_TENANT_ID ??
    process.env.NEXT_PUBLIC_CONTROL_PLANE_TENANT_ID ??
    ""
  ).trim();
  if (!tenantId) {
    return null;
  }

  return enrichWorkspace({
    workspace_id: "ws_env_default",
    slug: process.env.CONTROL_PLANE_WORKSPACE_SLUG?.trim() || "default",
    display_name: process.env.CONTROL_PLANE_WORKSPACE_NAME?.trim() || "Default Workspace",
    tenant_id: tenantId,
  });
}

function parseConfiguredWorkspaces(sessionUser?: WorkspaceContext["session_user"]): WorkspaceRecord[] {
  const raw = process.env.CONTROL_PLANE_WORKSPACES_JSON?.trim();
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((candidate) => candidate && typeof candidate === "object")
      .map((candidate, index) => {
        const record = candidate as Record<string, unknown>;
        const slug =
          typeof record.slug === "string" && record.slug.trim()
            ? record.slug.trim()
            : `workspace-${index + 1}`;
        const workspaceId =
          typeof record.workspace_id === "string" && record.workspace_id.trim()
            ? record.workspace_id.trim()
            : `ws_${slug}`;
        return enrichWorkspace(
          {
          workspace_id: workspaceId,
          slug,
          display_name:
            typeof record.display_name === "string" && record.display_name.trim()
              ? record.display_name.trim()
              : slug,
          tenant_id:
            typeof record.tenant_id === "string" && record.tenant_id.trim()
              ? record.tenant_id.trim()
              : "",
          subject_id:
            typeof record.subject_id === "string" && record.subject_id.trim()
              ? record.subject_id.trim()
              : undefined,
          subject_roles:
            typeof record.subject_roles === "string" && record.subject_roles.trim()
              ? record.subject_roles.trim()
              : undefined,
          },
          sessionUser,
        );
      })
      .filter((workspace) => workspace.tenant_id !== "");
  } catch {
    return [];
  }
}

function normalizeWorkspaceList(
  items: WorkspaceListItem[] | undefined,
  sessionUser?: WorkspaceContext["session_user"],
): WorkspaceRecord[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const slug = typeof item.slug === "string" ? item.slug.trim() : "";
      const workspaceId = typeof item.workspace_id === "string" ? item.workspace_id.trim() : "";
      const displayName = typeof item.display_name === "string" ? item.display_name.trim() : "";
      const tenantId = typeof item.tenant_id === "string" ? item.tenant_id.trim() : "";
      if (!slug || !workspaceId || !tenantId) {
        return null;
      }

      return enrichWorkspace(
        {
          workspace_id: workspaceId,
          slug,
          display_name: displayName || slug,
          tenant_id: tenantId,
        },
        sessionUser,
      );
    })
    .filter((workspace): workspace is WorkspaceRecord => workspace !== null);
}

function findWorkspaceByRequestedSelection(
  workspaces: WorkspaceRecord[],
  requestedWorkspaceId: string | null,
  requestedWorkspaceSlug: string | null,
): WorkspaceRecord | null {
  if (requestedWorkspaceId) {
    const matchedById = workspaces.find((workspace) => workspace.workspace_id === requestedWorkspaceId);
    if (matchedById) {
      return matchedById;
    }
  }

  if (requestedWorkspaceSlug) {
    const matchedBySlug = workspaces.find((workspace) => workspace.slug === requestedWorkspaceSlug);
    if (matchedBySlug) {
      return matchedBySlug;
    }
  }

  return null;
}

function normalizeSaasMeUser(payload: SaasMeResponse): WorkspaceContext["session_user"] {
  const user = payload.data?.user;
  if (!user) {
    return null;
  }

  const userId = typeof user.user_id === "string" ? user.user_id.trim() : "";
  const email = typeof user.email === "string" ? user.email.trim() : "";
  const authProvider = typeof user.auth_provider === "string" ? user.auth_provider.trim() : "";
  const authSubject = typeof user.auth_subject === "string" ? user.auth_subject.trim() : "";
  if (!userId || !email || !authProvider || !authSubject) {
    return null;
  }

  return {
    user_id: userId,
    email,
    auth_provider: authProvider,
    auth_subject: authSubject,
  };
}

function normalizeRolesHeader(raw: string | null | undefined): string {
  if (!raw) {
    return "";
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .join(",");
}

async function fetchSaasMeAndWorkspaces(args: {
  preferredSubjectId?: string | null;
  preferredSubjectRoles?: string | null;
}): Promise<{
  sessionUser: WorkspaceContext["session_user"];
  workspaces: WorkspaceRecord[];
}> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return {
      sessionUser: null,
      workspaces: [],
    };
  }

  const preferredSubjectId = args.preferredSubjectId?.trim() ?? "";
  if (preferredSubjectId === "") {
    return {
      sessionUser: null,
      workspaces: [],
    };
  }

  const fallbackRoles = getBaseSubjectRoles();
  const attempts: Array<{ subjectId: string; subjectRoles: string }> = [
    {
      subjectId: preferredSubjectId,
      subjectRoles: normalizeRolesHeader(args.preferredSubjectRoles) || fallbackRoles,
    },
  ];

  for (const attempt of attempts) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/saas/me`, {
        headers: {
          accept: "application/json",
          "x-authenticated-subject": attempt.subjectId,
          "x-authenticated-roles": attempt.subjectRoles,
        },
        cache: "no-store",
      });
      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as SaasMeResponse;
      const sessionUser = normalizeSaasMeUser(payload);
      const workspaces = normalizeWorkspaceList(payload.data?.workspaces, sessionUser);
      if (workspaces.length === 0) {
        continue;
      }

      return {
        sessionUser,
        workspaces,
      };
    } catch {
      // Continue attempts.
    }
  }

  return {
    sessionUser: null,
    workspaces: [],
  };
}

async function getAvailableWorkspaces(args: {
  preferredSubjectId?: string | null;
  preferredSubjectRoles?: string | null;
}): Promise<{
  source: WorkspaceContextSource;
  sessionUser: WorkspaceContext["session_user"];
  available: WorkspaceRecord[];
}> {
  const metadata = await fetchSaasMeAndWorkspaces(args);
  if (metadata.workspaces.length > 0) {
    return {
      source: "metadata",
      sessionUser: metadata.sessionUser,
      available: metadata.workspaces,
    };
  }

  const configured = parseConfiguredWorkspaces(metadata.sessionUser);
  if (configured.length > 0) {
    return {
      source: "env-fallback",
      sessionUser: metadata.sessionUser,
      available: configured,
    };
  }

  const envFallback = getEnvFallbackWorkspace();
  if (envFallback) {
    return {
      source: "env-fallback",
      sessionUser: metadata.sessionUser,
      available: [enrichWorkspace(envFallback, metadata.sessionUser)],
    };
  }

  return {
    source: "preview-fallback",
    sessionUser: metadata.sessionUser,
    available: [enrichWorkspace(DEFAULT_PREVIEW_WORKSPACE, metadata.sessionUser)],
  };
}

export function resolveCookieWorkspaceFromRawCookie(rawCookie: string | null): string | null {
  if (!rawCookie) {
    return null;
  }

  const matched = rawCookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${WORKSPACE_COOKIE_NAME}=`));

  if (!matched) {
    return null;
  }

  const rawValue = matched.split("=")[1] ?? "";
  if (!rawValue) {
    return null;
  }

  try {
    return decodeURIComponent(rawValue) || null;
  } catch {
    return rawValue || null;
  }
}

function resolvePreferredSubjectId(requestHeaders: Headers): string | null {
  return (
    requestHeaders.get("x-authenticated-subject") ??
    requestHeaders.get("cf-access-authenticated-user-email") ??
    null
  );
}

function resolvePreferredRoles(requestHeaders: Headers): string | null {
  return (
    requestHeaders.get("x-authenticated-roles") ??
    requestHeaders.get("cf-access-authenticated-user-groups") ??
    null
  );
}

export async function resolveWorkspaceContextFromValues(args: WorkspaceSelectionArgs): Promise<WorkspaceContext> {
  const { available, source, sessionUser } = await getAvailableWorkspaces({
    preferredSubjectId: args.preferredSubjectId,
    preferredSubjectRoles: args.preferredSubjectRoles,
  });
  const sourceDetail = describeWorkspaceContextSource(source);
  if (IS_PRODUCTION && sourceDetail.is_fallback) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "workspace_context_fallback_in_production",
        source,
        warning: sourceDetail.warning,
      }),
    );
  }
  const requestedWorkspaceId = args.requestedWorkspaceId?.trim() || null;
  const requestedWorkspaceSlug =
    args.requestedWorkspaceSlug?.trim() || args.cookieWorkspace?.trim() || null;
  const selected =
    findWorkspaceByRequestedSelection(available, requestedWorkspaceId, requestedWorkspaceSlug) ?? available[0];

  return {
    source,
    source_detail: sourceDetail,
    session_user: sessionUser,
    workspace: selected,
    available_workspaces: available,
    selection: {
      requested_workspace_id: requestedWorkspaceId,
      requested_workspace_slug: requestedWorkspaceSlug,
      cookie_workspace: args.cookieWorkspace?.trim() || null,
    },
  };
}

export async function resolveWorkspaceContextFromRequest(request: Request): Promise<WorkspaceContext> {
  const requestHeaders = request.headers;
  return resolveWorkspaceContextFromValues({
    requestedWorkspaceId: requestHeaders.get(WORKSPACE_HEADER_ID),
    requestedWorkspaceSlug: requestHeaders.get(WORKSPACE_HEADER_SLUG),
    cookieWorkspace: resolveCookieWorkspaceFromRawCookie(requestHeaders.get("cookie")),
    preferredSubjectId: resolvePreferredSubjectId(requestHeaders),
    preferredSubjectRoles: resolvePreferredRoles(requestHeaders),
  });
}

export async function resolveWorkspaceContextForServer(): Promise<WorkspaceContext> {
  const requestHeaders = headers();
  const cookieStore = cookies();
  return resolveWorkspaceContextFromValues({
    requestedWorkspaceId: requestHeaders.get(WORKSPACE_HEADER_ID),
    requestedWorkspaceSlug: requestHeaders.get(WORKSPACE_HEADER_SLUG),
    cookieWorkspace: cookieStore.get(WORKSPACE_COOKIE_NAME)?.value ?? null,
    preferredSubjectId: resolvePreferredSubjectId(requestHeaders),
    preferredSubjectRoles: resolvePreferredRoles(requestHeaders),
  });
}
