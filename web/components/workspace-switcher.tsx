"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

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
  const [selected, setSelected] = useState(currentWorkspaceSlug);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelected(currentWorkspaceSlug);
    setIsSaving(false);
  }, [currentWorkspaceSlug]);

  async function switchWorkspace(nextSlug: string, previousSlug: string) {
    try {
      const response = await fetch("/api/workspace-context", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspace_slug: nextSlug,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? "Failed to switch workspace");
      }

      queryClient.clear();
      router.refresh();
    } catch (error) {
      setSelected(previousSlug);
      setErrorMessage(error instanceof Error ? error.message : "Failed to switch workspace");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-muted">
        <span className="uppercase tracking-[0.15em]">Workspace</span>
        <select
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none disabled:opacity-70"
          value={selected}
          disabled={isSaving}
          onChange={(event) => {
            const nextSlug = event.currentTarget.value;
            if (nextSlug === selected) {
              return;
            }
            const previousSlug = selected;
            setSelected(nextSlug);
            setErrorMessage(null);
            setIsSaving(true);
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
      {isSaving ? <span className="text-[10px] text-muted">syncing...</span> : null}
    </label>
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
        <span>{workspaceCountLabel(workspaces.length)}</span>
        <span>·</span>
        <span>current: {currentWorkspaceSlug}</span>
      </div>
      <p className="text-[10px] text-muted">
        Switch workspaces only after you confirm the current identity and tenant, then visit onboarding, billing,
        verification, or go-live with the correct context.
      </p>
      <p className="text-[10px] text-muted">
        This control only updates the console's manual workspace context. Keep an eye on the topbar badges: if they
        show fallback or local-only context, it means metadata-backed session data isn't available yet, so revisit
        <code className="font-mono">/session</code> before trusting the next lane.
      </p>
      <p className="text-[10px] text-muted">
        This switcher only changes the manual workspace context for the console. It does not impersonate another member,
        edit roles, or trigger support-side automation.
      </p>
      {errorMessage ? (
        <p className="text-[10px] text-amber-700" role="status">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
