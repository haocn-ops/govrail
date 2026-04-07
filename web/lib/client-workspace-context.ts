export type WorkspaceContextSource = "metadata" | "env-fallback" | "preview-fallback";

export type WorkspaceContextSourceState = {
  source: WorkspaceContextSource;
  label: string;
  isFallback: boolean;
  localOnly: boolean;
  warning: string | null;
};

export type ClientWorkspaceRecord = {
  workspaceId: string;
  slug: string;
  displayName: string;
  tenantId: string;
  subjectId: string | null;
  subjectRoles: string | null;
};

export type ClientWorkspaceContext = {
  source: WorkspaceContextSource;
  sourceDetail: WorkspaceContextSourceState;
  sessionUser: {
    userId: string;
    email: string;
    authProvider: string;
    authSubject: string;
  } | null;
  workspace: ClientWorkspaceRecord | null;
  availableWorkspaces: ClientWorkspaceRecord[];
  selection: {
    requestedWorkspaceId: string | null;
    requestedWorkspaceSlug: string | null;
    cookieWorkspace: string | null;
  };
};

export type WorkspaceContextClientResult = WorkspaceContextSourceState & {
  context: ClientWorkspaceContext;
  requestId: string | null;
  traceId: string | null;
};

type WorkspaceContextSourceDetail = {
  label?: string;
  is_fallback?: boolean;
  local_only?: boolean;
  warning?: string | null;
};

type WorkspaceContextResponse = {
  data?: {
    source?: WorkspaceContextSource;
    source_detail?: WorkspaceContextSourceDetail;
    session_user?: {
      user_id?: string;
      email?: string;
      auth_provider?: string;
      auth_subject?: string;
    } | null;
    workspace?: {
      workspace_id?: string;
      slug?: string;
      display_name?: string;
      tenant_id?: string;
      subject_id?: string;
      subject_roles?: string;
    } | null;
    available_workspaces?: Array<{
      workspace_id?: string;
      slug?: string;
      display_name?: string;
      tenant_id?: string;
      subject_id?: string;
      subject_roles?: string;
    }> | null;
    selection?: {
      requested_workspace_id?: string | null;
      requested_workspace_slug?: string | null;
      cookie_workspace?: string | null;
    } | null;
  };
  meta?: {
    request_id?: string;
    trace_id?: string;
  };
  error?: {
    message?: string;
  };
};

type WorkspaceContextRequestOptions = {
  fetchImpl?: typeof fetch;
};

type WorkspaceContextSelection = {
  workspace_id?: string;
  workspace_slug?: string;
};

export class WorkspaceContextClientError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WorkspaceContextClientError";
    this.status = status;
  }
}

function isWorkspaceContextSource(value: unknown): value is WorkspaceContextSource {
  return value === "metadata" || value === "env-fallback" || value === "preview-fallback";
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function defaultSourceLabel(source: WorkspaceContextSource): string {
  if (source === "metadata") {
    return "SaaS metadata";
  }
  if (source === "env-fallback") {
    return "Environment fallback (non-production)";
  }
  return "Preview fallback (non-production)";
}

function defaultSourceWarning(source: WorkspaceContextSource): string | null {
  if (source === "env-fallback") {
    return "Workspace context was loaded from environment fallback values. Use metadata-backed session context before production rollout.";
  }
  if (source === "preview-fallback") {
    return "Workspace context is running in preview fallback mode. This is for local/demo validation only and should not be treated as production identity state.";
  }
  return null;
}

function normalizeWorkspaceContextSourceState(
  source: WorkspaceContextSource,
  detail?: WorkspaceContextSourceDetail,
): WorkspaceContextSourceState {
  return {
    source,
    label: normalizeString(detail?.label) ?? defaultSourceLabel(source),
    isFallback: detail?.is_fallback === true || source !== "metadata",
    localOnly: detail?.local_only === true || source !== "metadata",
    warning: normalizeString(detail?.warning) ?? defaultSourceWarning(source),
  };
}

function normalizeWorkspaceRecord(
  record:
    | {
        workspace_id?: string;
        slug?: string;
        display_name?: string;
        tenant_id?: string;
        subject_id?: string;
        subject_roles?: string;
      }
    | null
    | undefined,
): ClientWorkspaceRecord | null {
  const workspaceId = normalizeString(record?.workspace_id);
  const slug = normalizeString(record?.slug);
  const displayName = normalizeString(record?.display_name);
  const tenantId = normalizeString(record?.tenant_id);
  if (!workspaceId || !slug || !displayName || !tenantId) {
    return null;
  }

  return {
    workspaceId,
    slug,
    displayName,
    tenantId,
    subjectId: normalizeString(record?.subject_id),
    subjectRoles: normalizeString(record?.subject_roles),
  };
}

async function parseWorkspaceContextError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as WorkspaceContextResponse | null;
  return payload?.error?.message?.trim() || `Workspace context request failed (${response.status})`;
}

async function requestWorkspaceContext(
  init: RequestInit,
  options?: WorkspaceContextRequestOptions,
): Promise<WorkspaceContextClientResult> {
  const response = await (options?.fetchImpl ?? fetch)("/api/workspace-context", init);
  if (!response.ok) {
    throw new WorkspaceContextClientError(await parseWorkspaceContextError(response), response.status);
  }

  const payload = (await response.json().catch(() => null)) as WorkspaceContextResponse | null;
  const source = payload?.data?.source;
  if (!isWorkspaceContextSource(source)) {
    throw new WorkspaceContextClientError("Workspace context response was invalid", response.status);
  }

  const sourceState = normalizeWorkspaceContextSourceState(source, payload?.data?.source_detail);
  const sessionUser =
    normalizeString(payload?.data?.session_user?.user_id) &&
    normalizeString(payload?.data?.session_user?.email) &&
    normalizeString(payload?.data?.session_user?.auth_provider) &&
    normalizeString(payload?.data?.session_user?.auth_subject)
      ? {
          userId: normalizeString(payload?.data?.session_user?.user_id)!,
          email: normalizeString(payload?.data?.session_user?.email)!,
          authProvider: normalizeString(payload?.data?.session_user?.auth_provider)!,
          authSubject: normalizeString(payload?.data?.session_user?.auth_subject)!,
        }
      : null;

  return {
    ...sourceState,
    requestId: normalizeString(payload?.meta?.request_id),
    traceId: normalizeString(payload?.meta?.trace_id),
    context: {
      source,
      sourceDetail: sourceState,
      sessionUser,
      workspace: normalizeWorkspaceRecord(payload?.data?.workspace),
      availableWorkspaces: Array.isArray(payload?.data?.available_workspaces)
        ? payload.data.available_workspaces
            .map((record) => normalizeWorkspaceRecord(record))
            .filter((record): record is ClientWorkspaceRecord => record !== null)
        : [],
      selection: {
        requestedWorkspaceId: normalizeString(payload?.data?.selection?.requested_workspace_id),
        requestedWorkspaceSlug: normalizeString(payload?.data?.selection?.requested_workspace_slug),
        cookieWorkspace: normalizeString(payload?.data?.selection?.cookie_workspace),
      },
    },
  };
}

export async function fetchWorkspaceContext(
  options?: WorkspaceContextRequestOptions,
): Promise<WorkspaceContextClientResult> {
  return requestWorkspaceContext(
    {
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
    },
    options,
  );
}

export async function fetchWorkspaceContextSource(
  options?: WorkspaceContextRequestOptions,
): Promise<WorkspaceContextClientResult> {
  return fetchWorkspaceContext(options);
}

export async function switchWorkspaceContext(
  selection: WorkspaceContextSelection,
  options?: WorkspaceContextRequestOptions,
): Promise<WorkspaceContextClientResult> {
  return requestWorkspaceContext(
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(selection),
    },
    options,
  );
}
