import Link from "next/link";

import { AdminFollowUpNotice } from "@/components/admin/admin-follow-up-notice";
import { ApiKeysPanel } from "@/components/api-keys/api-keys-panel";
import { CreateApiKeyForm } from "@/components/api-keys/create-api-key-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildHandoffHref } from "@/lib/handoff-query";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function getParam(value?: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

function normalizeRecentTrackKey(value?: string | null): "verification" | "go_live" | null {
  if (value === "verification" || value === "go_live") {
    return value;
  }
  return null;
}

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const source = getParam(searchParams?.source);
  const handoffWorkspace = getParam(searchParams?.attention_workspace);
  const handoffOrganization = getParam(searchParams?.attention_organization);
  const week8Focus = getParam(searchParams?.week8_focus);
  const deliveryContext = getParam(searchParams?.delivery_context);
  const recentTrackKey = normalizeRecentTrackKey(getParam(searchParams?.recent_track_key));
  const recentUpdateKind = getParam(searchParams?.recent_update_kind);
  const evidenceCountParam = getParam(searchParams?.evidence_count);
  const evidenceCount =
    evidenceCountParam !== null && !Number.isNaN(Number(evidenceCountParam)) ? Number(evidenceCountParam) : null;
  const ownerLabel =
    getParam(searchParams?.recent_owner_label) ?? getParam(searchParams?.recent_owner_display_name);
  const showOnboardingHint = source === "onboarding";
  const showReadinessHandoff = source === "admin-readiness";
  const showAttentionHandoff = source === "admin-attention";
  const handoffArgs = {
    source,
    week8Focus,
    attentionWorkspace: handoffWorkspace,
    attentionOrganization: handoffOrganization,
    deliveryContext,
    recentTrackKey,
    recentUpdateKind,
    evidenceCount,
    recentOwnerLabel: ownerLabel,
  };
  const serviceAccountsHref = buildHandoffHref("/service-accounts", handoffArgs);
  const usageHref = buildHandoffHref("/usage", handoffArgs);
  const settingsHref = buildHandoffHref("/settings?intent=manage-plan", handoffArgs);
  const playgroundHref = buildHandoffHref("/playground", handoffArgs);
  const verificationHref = buildHandoffHref("/verification?surface=verification", handoffArgs);

  return (
    <div className="space-y-8">
      {showAttentionHandoff ? (
        <AdminFollowUpNotice
          source="admin-attention"
          surface="api-keys"
          workspaceSlug={workspaceContext.workspace.slug}
          sourceWorkspaceSlug={handoffWorkspace}
          attentionOrganization={handoffOrganization}
          deliveryContext={deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={recentUpdateKind}
          evidenceCount={evidenceCount}
          ownerDisplayName={ownerLabel}
        />
      ) : null}
      {showReadinessHandoff ? (
        <AdminFollowUpNotice
          source="admin-readiness"
          surface="api-keys"
          workspaceSlug={workspaceContext.workspace.slug}
          sourceWorkspaceSlug={handoffWorkspace}
          week8Focus={week8Focus}
          attentionOrganization={handoffOrganization}
          deliveryContext={deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={recentUpdateKind}
          evidenceCount={evidenceCount}
          ownerDisplayName={ownerLabel}
        />
      ) : null}
      <PageHeader
        eyebrow="API Keys"
        title="Credential lifecycle"
        description="Manage API keys, ownership metadata, scopes, and rotation windows for the control plane."
      />
      <Card>
        <CardHeader>
          <CardTitle>Credential sequence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Treat the first API key as a narrow, manual credential artifact for{" "}
            <span className="font-medium text-foreground">{workspaceContext.workspace.slug}</span>. Issue the key,
            keep the secret, run the demo in Playground, confirm the usage signal, then record the same run context in
            verification before widening scope.
          </p>
          <p>
            Current session context: <span className="font-medium text-foreground">{workspaceContext.source_detail.label}</span>.
            These links only preserve workspace handoff context across the console.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHandoffHref("/service-accounts", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 1: Review service account
            </Link>
            <Link
              href={buildHandoffHref("/playground", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 3: Run playground demo
            </Link>
            <Link
              href={buildHandoffHref("/usage", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 4: Confirm usage
            </Link>
            <Link
              href={buildHandoffHref("/verification?surface=verification", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 5: Record verification evidence
            </Link>
          </div>
          <p className="text-xs text-muted">
            This sequence stays navigation-only between surfaces. Creating the key happens here, but the follow-up run,
            usage confirmation, and evidence capture are all still manual operator steps.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Manual governance checkpoint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            New keys are easy to create, but they should still follow the plan-limit and billing lane. If the workspace
            is already under usage pressure, confirm that first so you do not widen access for a path that is already
            close to a plan boundary.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHandoffHref("/usage", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Check usage pressure
            </Link>
            <Link
              href={buildHandoffHref("/settings?intent=manage-plan", handoffArgs)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Check plan and billing
            </Link>
          </div>
          <p className="text-xs text-muted">
            This remains a manual governance checkpoint. It does not block key creation automatically or perform any
            support-side change for you.
          </p>
        </CardContent>
      </Card>
      {showOnboardingHint ? (
        <Card>
          <CardHeader>
            <CardTitle>Onboarding context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <p>
              You arrived here while following the onboarding path. Generate a `runs:write` key, keep its secret
              safe, then immediately run the first demo via the Playground so Usage and Verification can capture the
              trace before widening scope.
            </p>
            <p>
              After that first run, add the additional scopes (replay/cancel, approvals, A2A, MCP) only when the
              verified trace justifies them, and rotate the key once you need new audit evidence.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildHandoffHref("/playground", handoffArgs)}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Open playground
              </Link>
              <Link
                href={buildHandoffHref("/verification?surface=verification", handoffArgs)}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Open verification
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CreateApiKeyForm
              workspaceSlug={workspaceContext.workspace.slug}
              serviceAccountsHref={serviceAccountsHref}
              usageHref={usageHref}
              settingsHref={settingsHref}
              playgroundHref={playgroundHref}
              verificationHref={verificationHref}
            />
            <p className="text-xs text-muted">
              New API keys are only revealed once at creation time. Store the secret before navigating away.
            </p>
            <p className="text-xs text-muted">
              Rotation creates a replacement key and revokes the previous secret immediately, which is the safest path
              for routine rollover.
            </p>
            <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted">
              <p className="font-medium text-foreground">Recommended first-run scope</p>
              <p className="mt-1 text-xs text-muted">
                Start with `runs:write` for the first workspace demo flow. Add broader scopes only when the key also
                needs replay, cancel, approvals, MCP, or A2A actions.
              </p>
              <p className="mt-2 text-xs text-muted">
                After the first run queues via `/playground`, revisit `/usage` to capture run pressure and `/verification` to log the evidence before extending scope.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">
              <p className="font-medium text-foreground">After key creation</p>
              <p className="mt-1 text-xs text-muted">
                The normal next lane is: keep the secret in your own vault, run the governed demo in Playground,
                confirm the meter in Usage, then carry the same run ids into Verification and later the mock go-live
                drill if readiness is still on track.
              </p>
            </div>
          </CardContent>
        </Card>

        <ApiKeysPanel
          workspaceSlug={workspaceContext.workspace.slug}
          source={source}
          week8Focus={week8Focus}
          attentionWorkspace={handoffWorkspace}
          attentionOrganization={handoffOrganization}
          deliveryContext={deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={recentUpdateKind}
          evidenceCount={evidenceCount}
          recentOwnerLabel={ownerLabel}
        />
      </div>
    </div>
  );
}
