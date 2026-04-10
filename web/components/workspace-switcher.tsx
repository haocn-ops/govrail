"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

import { performWorkspaceSwitch } from "@/lib/client-workspace-navigation";
import {
  applyWorkspaceSwitchOutcome,
  beginWorkspaceSwitcherSelection,
  createWorkspaceSwitcherViewState,
  syncWorkspaceSwitcherViewState,
} from "@/components/workspace-switcher-state";

type WorkspaceOption = {
  workspace_id: string;
  slug: string;
  display_name: string;
};

function workspaceCountLabel(count: number): string {
  return count === 1 ? "1 reachable workspace" : `${count} reachable workspaces`;
}

export function WorkspaceSwitcher({
  currentWorkspaceSlug,
  workspaces,
}: {
  currentWorkspaceSlug: string;
  workspaces: WorkspaceOption[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [viewState, setViewState] = useState(() => createWorkspaceSwitcherViewState(currentWorkspaceSlug));
  const [showGuidance, setShowGuidance] = useState(false);
  const { selected, isSaving, errorMessage, warningMessage } = viewState;

  useEffect(() => {
    setViewState((state) => syncWorkspaceSwitcherViewState(state, currentWorkspaceSlug));
  }, [currentWorkspaceSlug]);

  async function switchWorkspace(nextSlug: string, previousSlug: string) {
    const outcome = await performWorkspaceSwitch({
      selection: {
        workspace_slug: nextSlug,
      },
      queryClient,
      resetMode: "clear",
    });

    const { nextState, shouldRefresh } = applyWorkspaceSwitchOutcome({
      nextSlug,
      previousSlug,
      outcome,
    });

    setViewState(nextState);
    if (shouldRefresh) {
      router.refresh();
    }
  }

  return (
    <div className="rounded-lg border border-border/50 bg-background/35 px-3 py-2">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.12em] text-muted">
          <span className="uppercase tracking-[0.15em]">Workspace</span>
          <span>{workspaceCountLabel(workspaces.length)}</span>
          <span>·</span>
          <span>current: {currentWorkspaceSlug}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="min-w-[190px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none disabled:opacity-70"
            value={selected}
            disabled={isSaving}
            onChange={(event) => {
              const nextSlug = event.currentTarget.value;
              const nextState = beginWorkspaceSwitcherSelection(viewState, nextSlug);
              if (!nextState) {
                return;
              }
              const previousSlug = selected;
              setViewState(nextState);
              startTransition(() => {
                void switchWorkspace(nextSlug, previousSlug);
              });
            }}
            aria-label="Select workspace"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.workspace_id} value={workspace.slug}>
                {workspace.display_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-[11px] font-medium text-foreground transition hover:bg-card"
            onClick={() => setShowGuidance((value) => !value)}
            aria-expanded={showGuidance}
          >
            {showGuidance ? "Hide context guidance" : "Workspace guidance"}
          </button>
          {isSaving ? <span className="text-[11px] text-muted">syncing...</span> : null}
        </div>
      </div>
      {errorMessage ? (
        <p className="mt-3 text-[11px] text-amber-700" role="status">
          {errorMessage}
        </p>
      ) : null}
      {warningMessage ? (
        <p className="mt-3 text-[11px] text-amber-700" role="status">
          {warningMessage}
        </p>
      ) : null}
      {showGuidance ? (
        <div className="mt-2 grid gap-2 rounded-lg border border-border bg-background px-3 py-3 text-[11px] leading-5 text-muted">
          <p>
            Switch workspaces only after you confirm the current identity and tenant, then visit onboarding, billing,
            verification, or go-live with the correct context.
          </p>
          <p>
            This control only updates the console's manual workspace context. Keep an eye on the topbar badges: if
            they show fallback or local-only context, it means metadata-backed session data isn't available yet, so revisit <code className="font-mono">/session</code> before trusting the next lane.
          </p>
          <p>
            This switcher only changes the manual workspace context for the console. It does not impersonate another
            member, edit roles, or trigger support-side automation.
          </p>
        </div>
      ) : null}
    </div>
  );
}
