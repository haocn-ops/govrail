import type { QueryClient } from "@tanstack/react-query";

import {
  switchWorkspaceContext,
  type WorkspaceContextClientResult,
} from "@/lib/client-workspace-context";

type WorkspaceContextSelection = Parameters<typeof switchWorkspaceContext>[0];

export type WorkspaceSwitchSelection = {
  workspaceId?: string | null;
  workspaceSlug?: string | null;
};

export type WorkspaceSwitchSearchParams = Record<string, string | null | undefined>;
export type WorkspaceSwitchResetMode = "clear" | "invalidate" | "none";
export type WorkspaceSwitchStatus = "switched" | "continued_after_error" | "failed";

export type WorkspaceSwitchSuccessResult = {
  ok: true;
  context: WorkspaceContextClientResult;
  warningMessage: string | null;
};

export type WorkspaceSwitchFailureResult = {
  ok: false;
  errorMessage: string;
};

export type WorkspaceSwitchResult = WorkspaceSwitchSuccessResult | WorkspaceSwitchFailureResult;
export type WorkspaceSwitchOutcome = {
  status: WorkspaceSwitchStatus;
  context: WorkspaceContextClientResult | null;
  warning: string | null;
  error: Error | null;
};

type SwitchWorkspaceImpl = typeof switchWorkspaceContext;

function resolveWorkspaceSwitchErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to switch workspace";
}

function toWorkspaceSwitchError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Unable to switch workspace");
}

async function resetWorkspaceQueries(
  queryClient: Pick<QueryClient, "clear" | "invalidateQueries"> | null | undefined,
  resetMode: WorkspaceSwitchResetMode,
): Promise<void> {
  if (!queryClient || resetMode === "none") {
    return;
  }
  if (resetMode === "clear") {
    queryClient.clear();
    return;
  }
  await queryClient.invalidateQueries();
}

export function buildWorkspaceSwitchWarningMessage(
  nextContext: Pick<WorkspaceContextClientResult, "warning" | "isFallback" | "label">,
): string | null {
  return (
    nextContext.warning ??
    (nextContext.isFallback
      ? `Workspace switched using ${nextContext.label}. Re-open /session before trusting the next lane.`
      : null)
  );
}

export const getWorkspaceSwitchWarningMessage = buildWorkspaceSwitchWarningMessage;

export function buildWorkspaceNavigationHref(
  pathname: string,
  searchParams?: WorkspaceSwitchSearchParams,
  options?: {
    preferExistingQuery?: boolean;
  },
): string {
  const [basePath, rawQuery] = pathname.split("?", 2);
  const nextSearchParams = new URLSearchParams(rawQuery ?? "");

  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (!value) {
      return;
    }
    if (options?.preferExistingQuery && nextSearchParams.has(key)) {
      return;
    }
    nextSearchParams.set(key, value);
  });

  const query = nextSearchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export async function performWorkspaceSwitch(args: {
  selection: WorkspaceContextSelection;
  queryClient?: Pick<QueryClient, "clear" | "invalidateQueries"> | null;
  resetMode?: WorkspaceSwitchResetMode;
  continueOnError?: boolean;
  switchWorkspaceContextImpl?: SwitchWorkspaceImpl;
}): Promise<WorkspaceSwitchOutcome> {
  const resetMode = args.resetMode ?? "none";

  try {
    const context = await (args.switchWorkspaceContextImpl ?? switchWorkspaceContext)(args.selection);
    await resetWorkspaceQueries(args.queryClient, resetMode);
    return {
      status: "switched",
      context,
      warning: buildWorkspaceSwitchWarningMessage(context),
      error: null,
    };
  } catch (error) {
    const resolvedError = toWorkspaceSwitchError(error);
    if (args.continueOnError) {
      await resetWorkspaceQueries(args.queryClient, resetMode);
      return {
        status: "continued_after_error",
        context: null,
        warning: null,
        error: resolvedError,
      };
    }
    return {
      status: "failed",
      context: null,
      warning: null,
      error: resolvedError,
    };
  }
}

export async function switchWorkspaceWithOutcome(
  selection: WorkspaceSwitchSelection,
  options?: {
    switchWorkspace?: SwitchWorkspaceImpl;
  },
): Promise<WorkspaceSwitchResult> {
  try {
    const nextContext = await (options?.switchWorkspace ?? switchWorkspaceContext)({
      workspace_id: selection.workspaceId ?? undefined,
      workspace_slug: selection.workspaceSlug ?? undefined,
    });

    return {
      ok: true,
      context: nextContext,
      warningMessage: buildWorkspaceSwitchWarningMessage(nextContext),
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: resolveWorkspaceSwitchErrorMessage(error),
    };
  }
}

export async function switchWorkspaceAndNavigate(args: {
  selection: WorkspaceSwitchSelection;
  pathname: string;
  searchParams?: WorkspaceSwitchSearchParams;
  navigate: (href: string) => void;
  switchWorkspace?: SwitchWorkspaceImpl;
}): Promise<WorkspaceSwitchResult> {
  const result = await switchWorkspaceWithOutcome(args.selection, {
    switchWorkspace: args.switchWorkspace,
  });
  if (!result.ok) {
    return result;
  }

  args.navigate(buildWorkspaceNavigationHref(args.pathname, args.searchParams));
  return result;
}
