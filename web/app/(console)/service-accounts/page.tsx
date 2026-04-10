import Link from "next/link";

import { ConsoleAdminFollowUp } from "@/components/admin/console-admin-follow-up";
import { PageHeader } from "@/components/page-header";
import { CreateServiceAccountForm } from "@/components/service-accounts/create-service-account-form";
import { ServiceAccountsPanel } from "@/components/service-accounts/service-accounts-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildConsoleHandoffHref,
  parseConsoleHandoffState,
  type ConsoleHandoffState,
} from "@/lib/console-handoff";
import { resolveConsoleRecentTrackKey } from "@/lib/console-handoff";
import { requestControlPlanePageData } from "@/lib/server-control-plane-page-fetch";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";

/* Source contract sentinel:
import { buildConsoleHandoffHref, parseConsoleHandoffState, resolveConsoleRecentTrackKey, type ConsoleHandoffState, } from "@/lib/console-handoff";
*/

function buildServiceAccountsHandoffHref(pathname: string, handoff: ConsoleHandoffState): string {
  return buildConsoleHandoffHref(pathname, handoff);
}

type WorkspaceDetailResponse = {
  onboarding?: {
    latest_demo_run?: {
      run_id: string;
    } | null;
  };
};

export default async function ServiceAccountsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const handoff = parseConsoleHandoffState(searchParams);
  const workspace = await requestControlPlanePageData<WorkspaceDetailResponse>("/api/control-plane/workspace");
  const activeRunId = workspace?.onboarding?.latest_demo_run?.run_id ?? handoff.runId ?? null;
  const runAwareHandoff = { ...handoff, runId: activeRunId };
  const recentTrackKey = resolveConsoleRecentTrackKey(runAwareHandoff.recentTrackKey);
  const source = runAwareHandoff.source;
  const showOnboardingContext = source === "onboarding";
  const usageHref = buildServiceAccountsHandoffHref("/usage", runAwareHandoff);
  const settingsHref = buildServiceAccountsHandoffHref("/settings?intent=manage-plan", runAwareHandoff);
  const apiKeysHref = buildServiceAccountsHandoffHref("/api-keys", runAwareHandoff);
  const playgroundHref = buildServiceAccountsHandoffHref("/playground", runAwareHandoff);
  const verificationHref = buildServiceAccountsHandoffHref("/verification?surface=verification", runAwareHandoff);
  const goLiveHref = buildServiceAccountsHandoffHref("/go-live?surface=go_live", runAwareHandoff);
  const adminHref = buildServiceAccountsHandoffHref("/admin", runAwareHandoff);
  const adminFollowUpActionsHref = "#service-accounts-admin-follow-up";

  return (
    <div className="space-y-8">
      <ConsoleAdminFollowUp
        handoff={runAwareHandoff}
        surface="service-accounts"
        workspaceSlug={workspaceContext.workspace.slug}
      />
      <PageHeader
        eyebrow="Service Accounts"
        title="Machine identities"
        description="Create runtime identities for API keys, automation, and future service-to-service access control."
      />
      <Card>
        <CardHeader>
          <CardTitle>Audit export continuity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Service account flows must carry the same Latest export receipt proof: reopen the receipt on{" "}
            <code className="font-mono">/settings?intent=upgrade</code>, keep the filename, filters, and SHA-256, and
            reuse that evidence as you move through verification, the go-live drill, and any{" "}
            <Link href={adminFollowUpActionsHref}>admin follow-up</Link>.
          </p>
          <p className="text-xs text-muted">
            Navigation-only manual relay: these links preserve workspace context but do not automate remediation or
            impersonate another operator.
          </p>
          <div id="service-accounts-admin-follow-up" className="flex flex-wrap gap-2">
            <Link
              href={buildServiceAccountsHandoffHref("/settings?intent=upgrade", runAwareHandoff)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen audit export receipt
            </Link>
            <Link
              href={buildServiceAccountsHandoffHref("/verification?surface=verification", runAwareHandoff)}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Continue verification evidence
            </Link>
            <Link
              href={goLiveHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Reopen go-live drill
            </Link>
            <Link
              href={adminHref}
              className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Return to admin follow-up
            </Link>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Credential sequence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            This is the manual Week 4 / Week 5 credential lane for{" "}
            <span className="font-medium text-foreground">{workspaceContext.workspace.slug}</span>. Create one service
            account, issue a narrow API key, run the first governed demo, confirm the usage trace, then carry the same
            evidence into verification.
          </p>
          <p>
            Current session context comes from{" "}
            <span className="font-medium text-foreground">{workspaceContext.source_detail.label}</span>. These links
            keep navigation context together only; they do not send credentials anywhere or automate follow-up.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildServiceAccountsHandoffHref("/api-keys", runAwareHandoff)}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 2: Issue API key
            </Link>
            <Link
              href={buildServiceAccountsHandoffHref("/playground", runAwareHandoff)}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 3: Run playground demo
            </Link>
            <Link
              href={usageHref}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 4: Confirm usage signal
            </Link>
            <Link
              href={verificationHref}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Step 5: Capture verification evidence
            </Link>
          </div>
          <p className="text-xs text-muted">
            This sequence is still navigation-only across the console. Creating the service account happens here, while
            API key issuance, demo execution, usage confirmation, and evidence capture remain separate manual steps.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Manual governance checkpoint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <p>
            Before you add another service account, check whether the current plan and usage profile still support the
            next workload you are preparing. This is the conservative path for Week 6 plan-limit awareness.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={usageHref}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review usage pressure
            </Link>
            <Link
              href={settingsHref}
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
            >
              Review plan and billing
            </Link>
          </div>
          <p className="text-xs text-muted">
            These are manual checks only. Service-account creation is not auto-blocked here, and no support workflow is
            triggered on your behalf.
          </p>
        </CardContent>
      </Card>
      {showOnboardingContext ? (
        <Card>
          <CardHeader>
            <CardTitle>Onboarding guidance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted">
            <p>
              While onboarding, create the first service account before issuing the inaugural API key. Keep the scope tied
              to that account small—`runs:write` is enough for the first demo run—and then decide if replay, cancel, approval,
              A2A, or MCP operations need extra scopes.
            </p>
            <p className="text-xs text-foreground">
              Next step: issue the first API key, run the playground demo, capture the trace, and move into verification.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildServiceAccountsHandoffHref("/api-keys", runAwareHandoff)}
                className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Create the first API key
              </Link>
              <Link
                href={buildServiceAccountsHandoffHref("/playground", runAwareHandoff)}
                className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Open playground
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create service account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CreateServiceAccountForm
              workspaceSlug={workspaceContext.workspace.slug}
              usageHref={usageHref}
              settingsHref={settingsHref}
              apiKeysHref={apiKeysHref}
              playgroundHref={playgroundHref}
            />
            <p className="text-xs text-muted">
              Start with a single service account for the first workspace demo or any external runtime flow you want to run via an API key. Bind future API key scope to `runs:write` so northbound calls stay aligned with the control-plane contract; add broader scope only when you need cancel/replay, approvals, A2A, or MCP calls.
            </p>
            <p className="text-xs text-muted">
              The role field is a governance tag that helps describe what the account is for, but it does not change the scopes an API key grants. Scopes live on the key itself, so pair each new service account with the key scope you expect to need.
            </p>
            <p className="text-xs text-muted">
              Use distinct service accounts per workload so API keys, usage, and audit trails stay attributable.
            </p>
            <p className="text-xs text-muted">
              Disable service accounts when a workload is retired, then separately revoke any surviving API keys that should stop working right away.
            </p>
            <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">
              <p className="font-medium text-foreground">After service-account creation</p>
              <p className="mt-1 text-xs text-muted">
                The normal next lane is: mint the first narrow API key, run the governed demo in Playground, confirm the resulting Usage signal, then attach the same run context in Verification before you treat the credential path as ready.
              </p>
            </div>
          </CardContent>
        </Card>
        <ServiceAccountsPanel
          workspaceSlug={workspaceContext.workspace.slug}
          source={source}
          week8Focus={runAwareHandoff.week8Focus}
          attentionWorkspace={runAwareHandoff.attentionWorkspace}
          attentionOrganization={runAwareHandoff.attentionOrganization}
          deliveryContext={runAwareHandoff.deliveryContext}
          recentTrackKey={recentTrackKey}
          recentUpdateKind={runAwareHandoff.recentUpdateKind}
          evidenceCount={runAwareHandoff.evidenceCount}
          recentOwnerLabel={runAwareHandoff.recentOwnerLabel}
          recentOwnerDisplayName={runAwareHandoff.recentOwnerDisplayName}
          recentOwnerEmail={runAwareHandoff.recentOwnerEmail}
        />
      </div>
    </div>
  );
}
