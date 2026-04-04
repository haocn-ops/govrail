"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ControlPlaneRequestError, createApiKey } from "@/services/control-plane";

const DEFAULT_SCOPE = "runs:write";

function normalizeScope(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function buildRunQuickstart(secret: string): string {
  return `curl -X POST "\${API_BASE_URL:-https://api.govrail.net}/api/v1/runs" \\
  -H "Authorization: Bearer ${secret}" \\
  -H "Idempotency-Key: demo-run-001" \\
  -H "Content-Type: application/json" \\
  -d '{
    "input": {
      "kind": "user_instruction",
      "text": "Run the first workspace demo flow"
    }
  }'`;
}

function formatApiKeyError(error: unknown): string {
  if (error instanceof ControlPlaneRequestError) {
    if (error.code === "api_key_limit_reached") {
      const limit = typeof error.details.limit === "number" ? error.details.limit : "unknown";
      return `API key limit reached (${limit}). ${error.message}`;
    }
    return error.message ?? "API key request failed.";
  }
  return "API key request failed. Check workspace permissions.";
}

export function CreateApiKeyForm({
  workspaceSlug,
  serviceAccountsHref = "/service-accounts",
  usageHref = "/usage",
  settingsHref = "/settings?intent=manage-plan",
  playgroundHref = "/playground",
  verificationHref = "/verification?surface=verification",
}: {
  workspaceSlug: string;
  serviceAccountsHref?: string;
  usageHref?: string;
  settingsHref?: string;
  playgroundHref?: string;
  verificationHref?: string;
}) {
  const queryClient = useQueryClient();
  const [serviceAccountId, setServiceAccountId] = useState("");
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  const [expiresAt, setExpiresAt] = useState("");
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const mutation = useMutation({
    onMutate: () => {
      setSubmissionError(null);
    },
    mutationFn: async () =>
      createApiKey({
        service_account_id: serviceAccountId.trim() || undefined,
        scope: normalizeScope(scope),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      }),
    onSuccess: async (result) => {
      setRevealedSecret(result.secret_key);
      await queryClient.invalidateQueries({
        queryKey: ["workspace-api-keys", workspaceSlug],
      });
      setSubmissionError(null);
    },
    onError: (error: unknown) => {
      setSubmissionError(formatApiKeyError(error));
    },
  });

  return (
    <div className="space-y-4">
      <Input
        placeholder="Service account ID (optional)"
        value={serviceAccountId}
        onChange={(event) => setServiceAccountId(event.currentTarget.value)}
      />
      <Input
        placeholder="Scopes, comma separated (for example: runs:write, runs:manage)"
        value={scope}
        onChange={(event) => setScope(event.currentTarget.value)}
      />
      <Input
        type="datetime-local"
        value={expiresAt}
        onChange={(event) => setExpiresAt(event.currentTarget.value)}
      />
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-950">
        <p className="font-medium text-amber-950">Manual preflight reminder</p>
        <p className="mt-1 text-amber-900">
          Confirm the target service account, current usage pressure, and any manual billing follow-up before
          generating a new secret. This lane stays navigation-only and does not auto-block issuance for you.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={serviceAccountsHref}
            className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 font-medium text-amber-950 transition hover:bg-amber-100/60"
          >
            Review service account
          </Link>
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
      <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Creating key..." : "Create key"}
      </Button>
      {submissionError ? (
        <p className="text-xs text-red-600">{submissionError}</p>
      ) : null}
      {revealedSecret ? (
        <div className="space-y-4 rounded-2xl border border-border bg-background p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-muted">One-time secret</p>
            <p className="mt-2 break-all font-mono text-sm text-foreground">{revealedSecret}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-muted">Quickstart</p>
            <p className="mt-2 text-xs text-muted">
              This example uses the new workspace API key flow for the first run. Replace `API_BASE_URL` if you are
              targeting a non-production environment.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-background p-3 text-xs text-foreground">
              <code>{buildRunQuickstart(revealedSecret)}</code>
            </pre>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-950">
            <p className="font-medium text-emerald-950">Next evidence lane</p>
            <p className="mt-1 text-emerald-900">
              Keep this secret in your own vault, run the first governed demo, confirm the resulting usage trace,
              then attach the same run context in verification before widening scope.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={playgroundHref}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-950 px-3 py-2 font-medium text-emerald-950 transition hover:bg-emerald-100"
              >
                Open Playground
              </Link>
              <Link
                href={usageHref}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 font-medium text-emerald-950 transition hover:bg-emerald-100/60"
              >
                Confirm usage signal
              </Link>
              <Link
                href={verificationHref}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 font-medium text-emerald-950 transition hover:bg-emerald-100/60"
              >
                Record verification evidence
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
