"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ControlPlaneRequestError, createServiceAccount } from "@/services/control-plane";

function describeServiceAccountError(error: unknown): string {
  if (error instanceof ControlPlaneRequestError) {
    if (error.code === "service_account_limit_reached") {
      return "Service account limit reached. Disable another account or upgrade the plan.";
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Service account creation failed. Check workspace permissions.";
}

export function CreateServiceAccountForm({
  workspaceSlug,
  usageHref = "/usage",
  settingsHref = "/settings?intent=manage-plan",
  apiKeysHref = "/api-keys",
  playgroundHref = "/playground",
}: {
  workspaceSlug: string;
  usageHref?: string;
  settingsHref?: string;
  apiKeysHref?: string;
  playgroundHref?: string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState("workspace_service");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [createdAccountName, setCreatedAccountName] = useState<string | null>(null);

  const mutation = useMutation({
    onMutate: () => {
      setFormError(null);
    },
    mutationFn: async () =>
      createServiceAccount({
        name: name.trim(),
        role: role.trim() || "workspace_service",
        description: description.trim() || null,
      }),
    onSuccess: async () => {
      setCreatedAccountName(name.trim());
      setName("");
      setRole("workspace_service");
      setDescription("");
      setFormError(null);
      await queryClient.invalidateQueries({
        queryKey: ["workspace-service-accounts", workspaceSlug],
      });
    },
    onError: (error: unknown) => {
      setFormError(describeServiceAccountError(error));
    },
  });

  return (
    <div className="space-y-4">
      <Input
        placeholder="Service account name"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <Input
        placeholder="Role (for example: workspace_service)"
        value={role}
        onChange={(event) => setRole(event.currentTarget.value)}
      />
      <Textarea
        placeholder="Description or intended runtime purpose"
        value={description}
        onChange={(event) => setDescription(event.currentTarget.value)}
      />
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-950">
        <p className="font-medium text-amber-950">Manual gating reminder</p>
        <p className="mt-1 text-amber-900">
          Make sure creating another service account aligns with the plan boundary, current usage pressure, and any
          outstanding manual billing review before you proceed. This is still a human checkpoint, not an enforced
          product block.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={usageHref}
            className="inline-flex items-center justify-center rounded-xl border border-amber-950 px-3 py-2 font-medium text-amber-950 transition hover:bg-amber-100"
          >
            Review usage pressure
          </Link>
          <Link
            href={settingsHref}
            className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950 transition hover:bg-amber-100/60"
          >
            Confirm plan and billing
          </Link>
        </div>
      </div>
      <Button disabled={mutation.isPending || name.trim() === ""} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Creating service account..." : "Create service account"}
      </Button>
      {formError ? <p className="text-xs text-muted">{formError}</p> : null}
      {createdAccountName ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-950">
          <p className="font-medium text-emerald-950">Service account created</p>
          <p className="mt-1 text-emerald-900">
            <span className="font-medium">{createdAccountName}</span> is ready for the next manual lane. Issue a
            narrow API key, run the first demo, and keep the resulting run ids available for verification.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={apiKeysHref}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-950 px-3 py-2 font-medium text-emerald-950 transition hover:bg-emerald-100"
            >
              Issue API key
            </Link>
            <Link
              href={playgroundHref}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 font-medium text-emerald-950 transition hover:bg-emerald-100/60"
            >
              Continue to Playground
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
