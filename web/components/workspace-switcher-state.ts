import type { WorkspaceSwitchOutcome } from "@/lib/client-workspace-navigation";

export type WorkspaceSwitcherViewState = {
  selected: string;
  isSaving: boolean;
  errorMessage: string | null;
  warningMessage: string | null;
};

export function createWorkspaceSwitcherViewState(currentWorkspaceSlug: string): WorkspaceSwitcherViewState {
  return {
    selected: currentWorkspaceSlug,
    isSaving: false,
    errorMessage: null,
    warningMessage: null,
  };
}

export function syncWorkspaceSwitcherViewState(
  state: WorkspaceSwitcherViewState,
  currentWorkspaceSlug: string,
): WorkspaceSwitcherViewState {
  return {
    ...state,
    selected: currentWorkspaceSlug,
    isSaving: false,
  };
}

export function beginWorkspaceSwitcherSelection(
  state: WorkspaceSwitcherViewState,
  nextSlug: string,
): WorkspaceSwitcherViewState | null {
  if (nextSlug === state.selected) {
    return null;
  }

  return {
    selected: nextSlug,
    isSaving: true,
    errorMessage: null,
    warningMessage: null,
  };
}

export function applyWorkspaceSwitchOutcome(args: {
  nextSlug: string;
  previousSlug: string;
  outcome: Pick<WorkspaceSwitchOutcome, "status" | "warning" | "error">;
}): {
  nextState: WorkspaceSwitcherViewState;
  shouldRefresh: boolean;
} {
  if (args.outcome.status === "switched") {
    return {
      nextState: {
        selected: args.nextSlug,
        isSaving: false,
        errorMessage: null,
        warningMessage: args.outcome.warning,
      },
      shouldRefresh: true,
    };
  }

  return {
    nextState: {
      selected: args.previousSlug,
      isSaving: false,
      errorMessage: args.outcome.error?.message ?? "Failed to switch workspace",
      warningMessage: null,
    },
    shouldRefresh: false,
  };
}
