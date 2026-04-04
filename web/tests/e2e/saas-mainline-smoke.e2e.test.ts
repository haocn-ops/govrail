import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";

import AdminPage from "../../app/(console)/admin/page";
import { GET as getWorkspaceContext, POST as postWorkspaceContext } from "../../app/api/workspace-context/route";
import { buildVerificationChecklistHandoffHref } from "../../components/verification/week8-verification-checklist";
import { buildAdminReturnHref, buildHandoffHref } from "../../lib/handoff-query";
import { downloadWorkspaceAuditExportViewModel } from "../../services/control-plane";
import {
  ControlPlaneRequestError,
  fetchWorkspaceDedicatedEnvironmentReadiness,
  fetchWorkspaceSsoReadiness,
  saveWorkspaceDedicatedEnvironmentReadiness,
  saveWorkspaceSsoReadiness,
} from "../../services/control-plane";

const WORKSPACE_ENV_KEYS = [
  "CONTROL_PLANE_BASE_URL",
  "NEXT_PUBLIC_CONTROL_PLANE_BASE_URL",
  "CONTROL_PLANE_TENANT_ID",
  "NEXT_PUBLIC_CONTROL_PLANE_TENANT_ID",
  "CONTROL_PLANE_WORKSPACE_SLUG",
  "CONTROL_PLANE_WORKSPACE_NAME",
  "CONTROL_PLANE_WORKSPACES_JSON",
  "CONTROL_PLANE_SUBJECT_ID",
  "NEXT_PUBLIC_CONTROL_PLANE_SUBJECT_ID",
  "CONTROL_PLANE_SUBJECT_ROLES",
  "NEXT_PUBLIC_CONTROL_PLANE_SUBJECT_ROLES",
] as const;

const testDir = path.dirname(fileURLToPath(import.meta.url));
const settingsPanelPath = path.resolve(testDir, "../../components/settings/workspace-settings-panel.tsx");
const artifactsPagePath = path.resolve(testDir, "../../app/(console)/artifacts/page.tsx");
const logsPagePath = path.resolve(testDir, "../../app/(console)/logs/page.tsx");
const membersPagePath = path.resolve(testDir, "../../app/(console)/members/page.tsx");
const serviceAccountsPagePath = path.resolve(testDir, "../../app/(console)/service-accounts/page.tsx");
const serviceAccountsPanelPath = path.resolve(testDir, "../../components/service-accounts/service-accounts-panel.tsx");
const apiKeysPanelPath = path.resolve(testDir, "../../components/api-keys/api-keys-panel.tsx");
const workspaceLaunchpadPath = path.resolve(testDir, "../../components/home/workspace-launchpad.tsx");
const onboardingWizardPath = path.resolve(testDir, "../../components/onboarding/workspace-onboarding-wizard.tsx");
const playgroundPanelPath = path.resolve(testDir, "../../components/playground/playground-panel.tsx");
const usageDashboardPath = path.resolve(testDir, "../../components/usage/workspace-usage-dashboard.tsx");
const acceptInvitationPagePath = path.resolve(testDir, "../../app/accept-invitation/page.tsx");
const goLivePagePath = path.resolve(testDir, "../../app/(console)/go-live/page.tsx");
const verificationPagePath = path.resolve(testDir, "../../app/(console)/verification/page.tsx");
const adminPagePath = path.resolve(testDir, "../../app/(console)/admin/page.tsx");
const deliveryTrackPanelPath = path.resolve(testDir, "../../components/delivery/workspace-delivery-track-panel.tsx");
const adminFollowUpNoticePath = path.resolve(testDir, "../../components/admin/admin-follow-up-notice.tsx");
const handoffQueryPath = path.resolve(testDir, "../../lib/handoff-query.ts");

async function withCleanWorkspaceEnv<T>(fn: () => Promise<T> | T): Promise<T> {
  const snapshot = new Map<string, string | undefined>();
  for (const key of WORKSPACE_ENV_KEYS) {
    snapshot.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    return await fn();
  } finally {
    for (const key of WORKSPACE_ENV_KEYS) {
      const original = snapshot.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  }
}

async function withMockFetch<T>(
  mock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test(
  "smoke(non-browser): mainline workspace-context metadata path + settings live-write affordance contract",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_SUBJECT_ROLES = "workspace_owner,operator";

      const response = await withMockFetch(async (input, init) => {
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.accept, "application/json");
        assert.equal(headers?.["x-authenticated-subject"], "owner@example.com");
        assert.equal(headers?.["x-authenticated-roles"], "workspace_owner,operator");

        return new Response(
          JSON.stringify({
            data: {
              user: {
                user_id: "usr_live_mainline",
                email: "owner@example.com",
                auth_provider: "cf_access",
                auth_subject: "owner@example.com",
              },
              workspaces: [
                {
                  workspace_id: "ws_mainline_1",
                  slug: "mainline-one",
                  display_name: "Mainline One",
                  tenant_id: "tenant_mainline_1",
                },
                {
                  workspace_id: "ws_mainline_2",
                  slug: "mainline-two",
                  display_name: "Mainline Two",
                  tenant_id: "tenant_mainline_2",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }, () =>
        getWorkspaceContext(
          new Request("http://localhost/api/workspace-context", {
            headers: {
              "x-authenticated-subject": "owner@example.com",
              "x-authenticated-roles": "workspace_owner,operator",
              "x-workspace-slug": "mainline-two",
            },
          }),
        ),
      );

      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          source: string;
          source_detail: { is_fallback: boolean };
          workspace: { workspace_id: string; slug: string };
        };
      };
      assert.equal(payload.data.source, "metadata");
      assert.equal(payload.data.source_detail.is_fallback, false);
      assert.equal(payload.data.workspace.workspace_id, "ws_mainline_2");
      assert.equal(payload.data.workspace.slug, "mainline-two");
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), "metadata");
      assert.equal(response.headers.get("x-govrail-workspace-context-fallback"), "0");

      const settingsSource = await readFile(settingsPanelPath, "utf8");
      assert.match(settingsSource, /Ready for controlled live write\./);
      assert.match(settingsSource, /SSO configuration was recorded through controlled live write\./);
      assert.match(settingsSource, /Dedicated environment intake was recorded through controlled live write\./);
    }),
);

test(
  "smoke(non-browser): POST /api/workspace-context mainline keeps metadata body/slug/cookie selection and set-cookie/header alignment",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_SUBJECT_ROLES = "workspace_owner,operator";

      const response = await withMockFetch(async (input, init) => {
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.accept, "application/json");
        assert.equal(headers?.["x-authenticated-subject"], "owner@example.com");
        assert.equal(headers?.["x-authenticated-roles"], "workspace_owner,operator");

        return new Response(
          JSON.stringify({
            data: {
              user: {
                user_id: "usr_post_mainline",
                email: "owner@example.com",
                auth_provider: "cf_access",
                auth_subject: "owner@example.com",
              },
              workspaces: [
                {
                  workspace_id: "ws_alpha",
                  slug: "alpha",
                  display_name: "Alpha",
                  tenant_id: "tenant_alpha",
                },
                {
                  workspace_id: "ws_beta",
                  slug: "beta",
                  display_name: "Beta",
                  tenant_id: "tenant_beta",
                },
                {
                  workspace_id: "ws_gamma",
                  slug: "gamma",
                  display_name: "Gamma",
                  tenant_id: "tenant_gamma",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }, () =>
        postWorkspaceContext(
          new Request("http://localhost/api/workspace-context", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-authenticated-subject": "owner@example.com",
              "x-authenticated-roles": "workspace_owner,operator",
              cookie: "govrail_workspace=gamma",
            },
            body: JSON.stringify({
              workspace_id: "ws_beta",
              workspace_slug: "alpha",
            }),
          }),
        ),
      );

      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        data: {
          source: string;
          source_detail: { is_fallback: boolean };
          workspace: { workspace_id: string; slug: string };
          selection: {
            requested_workspace_id: string | null;
            requested_workspace_slug: string | null;
            cookie_workspace: string | null;
          };
        };
      };

      assert.equal(payload.data.source, "metadata");
      assert.equal(payload.data.source_detail.is_fallback, false);
      assert.equal(payload.data.workspace.workspace_id, "ws_beta");
      assert.equal(payload.data.workspace.slug, "beta");
      assert.equal(payload.data.selection.requested_workspace_id, "ws_beta");
      assert.equal(payload.data.selection.requested_workspace_slug, "alpha");
      assert.equal(payload.data.selection.cookie_workspace, "gamma");

      assert.match(response.headers.get("set-cookie") ?? "", /govrail_workspace=beta/);
      assert.equal(response.headers.get("x-govrail-workspace-context-source"), "metadata");
      assert.equal(response.headers.get("x-govrail-workspace-context-fallback"), "0");
    }),
);

test(
  "smoke(non-browser, source-assisted): settings enterprise submit -> readiness refresh -> saved-sections contract loop",
  async () => {
    const settingsSource = await readFile(settingsPanelPath, "utf8");

    // This remains source-assisted (no browser runtime), but adds service execution coverage for submit->refresh.
    assert.match(settingsSource, /async function submitSsoConfiguration\(\): Promise<void>/);
    assert.match(settingsSource, /saveWorkspaceSsoReadiness,/);
    assert.match(settingsSource, /await saveWorkspaceSsoReadiness\(payload\);/);
    assert.match(settingsSource, /queryKey: \["workspace-settings", workspaceSlug\]/);
    assert.match(settingsSource, /queryKey: \["workspace-sso-readiness", workspaceSlug\]/);
    assert.match(
      settingsSource,
      /SSO configuration was recorded through controlled live write\. Settings and readiness were refreshed for the latest status\./,
    );
    assert.match(settingsSource, /async function submitDedicatedEnvironmentRequest\(\): Promise<void>/);
    assert.match(settingsSource, /saveWorkspaceDedicatedEnvironmentReadiness,/);
    assert.match(settingsSource, /await saveWorkspaceDedicatedEnvironmentReadiness\(payload\);/);
    assert.match(settingsSource, /queryKey: \["workspace-dedicated-environment-readiness", workspaceSlug\]/);
    assert.match(
      settingsSource,
      /Dedicated environment intake was recorded through controlled live write\. Settings and readiness were refreshed for the latest status\./,
    );
    assert.match(settingsSource, /\{ssoConfigured \? \(/);
    assert.match(settingsSource, /Saved configuration/);
    assert.match(settingsSource, /\{dedicatedConfigured \? \(/);
    assert.match(settingsSource, /Saved provisioning request/);

    await withMockFetch(async (input, init) => {
      const url = String(input);
      if (url === "/api/control-plane/workspace/sso" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              feature: "sso",
              feature_enabled: true,
              status: "configured",
              provider_type: "oidc",
              supported_protocols: ["oidc", "saml"],
              email_domain: "example.com",
              email_domains: ["example.com", "corp.example.com"],
              metadata_url: "https://idp.example.com/.well-known/openid-configuration",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url === "/api/control-plane/workspace/sso" && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            data: {
              feature: "sso",
              feature_enabled: true,
              status: "configured",
              provider_type: "oidc",
              supported_protocols: ["oidc", "saml"],
              email_domain: "example.com",
              email_domains: ["example.com", "corp.example.com"],
              metadata_url: "https://idp.example.com/.well-known/openid-configuration",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url === "/api/control-plane/workspace/dedicated-environment" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              feature: "dedicated_environment",
              feature_enabled: true,
              status: "configured",
              deployment_model: "single_tenant",
              target_region: "us-east-1",
              requester_email: "owner@example.com",
              data_classification: "restricted",
              requested_capacity: "6 vCPU / 16 GB",
              requested_sla: "99.9% / 24x7",
              network_boundary: "private-vpc",
              compliance_notes: "SOC2 control set",
              notes: "Dedicated intake accepted",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url === "/api/control-plane/workspace/dedicated-environment" && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            data: {
              feature: "dedicated_environment",
              feature_enabled: true,
              status: "configured",
              deployment_model: "single_tenant",
              target_region: "us-east-1",
              requester_email: "owner@example.com",
              data_classification: "restricted",
              requested_capacity: "6 vCPU / 16 GB",
              requested_sla: "99.9% / 24x7",
              network_boundary: "private-vpc",
              compliance_notes: "SOC2 control set",
              notes: "Dedicated intake accepted",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch call in smoke loop: ${url} method=${init?.method ?? "GET"}`);
    }, async () => {
      const ssoSubmit = await saveWorkspaceSsoReadiness({
        enabled: true,
        provider_type: "oidc",
        metadata_url: "https://idp.example.com/.well-known/openid-configuration",
        email_domains: ["example.com", "corp.example.com"],
      });
      const ssoRefresh = await fetchWorkspaceSsoReadiness();

      assert.equal(ssoSubmit.feature, "sso");
      assert.equal(ssoSubmit.status, "configured");
      assert.deepEqual(ssoSubmit.email_domains, ["example.com", "corp.example.com"]);
      assert.equal(ssoRefresh.feature, "sso");
      assert.equal(ssoRefresh.status, "configured");
      assert.equal(ssoRefresh.metadata_url, "https://idp.example.com/.well-known/openid-configuration");

      const dedicatedSubmit = await saveWorkspaceDedicatedEnvironmentReadiness({
        enabled: true,
        deployment_model: "single_tenant",
        target_region: "us-east-1",
        requester_email: "owner@example.com",
        data_classification: "restricted",
        requested_capacity: "6 vCPU / 16 GB",
        requested_sla: "99.9% / 24x7",
        network_boundary: "private-vpc",
        compliance_notes: "SOC2 control set",
        notes: "Dedicated intake accepted",
      });
      const dedicatedRefresh = await fetchWorkspaceDedicatedEnvironmentReadiness();

      assert.equal(dedicatedSubmit.feature, "dedicated_environment");
      assert.equal(dedicatedSubmit.status, "configured");
      assert.equal(dedicatedSubmit.target_region, "us-east-1");
      assert.equal(dedicatedSubmit.data_classification, "restricted");
      assert.equal(dedicatedRefresh.feature, "dedicated_environment");
      assert.equal(dedicatedRefresh.status, "configured");
      assert.equal(dedicatedRefresh.requester_email, "owner@example.com");
      assert.equal(dedicatedRefresh.notes, "Dedicated intake accepted");
    });
  },
);

test(
  "smoke(non-browser, source-assisted): enterprise readiness fallback retains contract source and guidance",
  async () => {
    const ssoUpgrade = "/settings?intent=upgrade";
    const dedicatedUpgrade = "/settings?intent=upgrade&feature=dedicated";

    await withMockFetch(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/workspace/sso")) {
        return new Response(
          JSON.stringify({
            error: {
              code: "workspace_feature_unavailable",
              message: "SSO not on current plan",
              details: {
                upgrade_href: ssoUpgrade,
                plan_code: "enterprise",
              },
            },
          }),
          {
            status: 409,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.endsWith("/workspace/dedicated-environment")) {
        return new Response(
          JSON.stringify({
            error: {
              code: "control_plane_base_missing",
              message: "Control plane is missing",
              details: {
                upgrade_href: dedicatedUpgrade,
              },
            },
          }),
          {
            status: 503,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch call in fallback smoke: ${url}`);
    }, async () => {
      const ssoReadiness = await fetchWorkspaceSsoReadiness();
      assert.equal(ssoReadiness.feature, "sso");
      assert.equal(ssoReadiness.contract_meta.source, "fallback_feature_gate");
      assert.equal(ssoReadiness.contract_meta.issue?.code, "workspace_feature_unavailable");
      assert.equal(ssoReadiness.upgrade_href, ssoUpgrade);
      assert.match(ssoReadiness.next_steps.join(" "), /Upgrade to a plan with SSO support/);

      const dedicatedReadiness = await fetchWorkspaceDedicatedEnvironmentReadiness();
      assert.equal(dedicatedReadiness.feature, "dedicated_environment");
      assert.equal(dedicatedReadiness.contract_meta.source, "fallback_control_plane_unavailable");
      assert.equal(dedicatedReadiness.contract_meta.issue?.code, "control_plane_base_missing");
      assert.equal(dedicatedReadiness.upgrade_href, dedicatedUpgrade);
      assert.match(
        dedicatedReadiness.next_steps.join(" "),
        /Set CONTROL_PLANE_BASE_URL to enable live readiness checks/,
      );
    });
  },
);

test(
  "smoke(non-browser, source-assisted): settings enterprise live-write keeps idempotency/admin error semantics aligned",
  async () => {
    const settingsSource = await readFile(settingsPanelPath, "utf8");

    assert.match(
      settingsSource,
      /if \(normalizedCode === "idempotency_conflict"\) \{\s*return `\$\{featureLabel\} write was already submitted with a different payload\. Refresh the form and retry once the desktop service confirms the previous save\.`;\s*\}/s,
    );
    assert.match(
      settingsSource,
      /if \(error\.status === 401 \|\| error\.status === 403\) \{\s*return `\$\{featureLabel\} configuration requires workspace owner or admin access\. Confirm your role and retry once the proper permissions are granted\.`;\s*\}/s,
    );

    await withMockFetch(async (input) => {
      const url = String(input);
      if (url.endsWith("/workspace/sso")) {
        return new Response(
          JSON.stringify({
            error: {
              code: "idempotency_conflict",
              message: "Idempotency key was already used for another payload",
            },
          }),
          {
            status: 409,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.endsWith("/workspace/dedicated-environment")) {
        return new Response(
          JSON.stringify({
            error: {
              code: "workspace_admin_required",
              message: "Only workspace owners or admins can configure dedicated environment delivery",
            },
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch call in enterprise error smoke: ${url}`);
    }, async () => {
      await assert.rejects(
        () =>
          saveWorkspaceSsoReadiness({
            enabled: true,
            provider_type: "oidc",
            metadata_url: "https://idp.example.com/.well-known/openid-configuration",
            email_domains: ["example.com"],
          }),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.status, 409);
          assert.equal(error.code, "idempotency_conflict");
          assert.equal(error.message, "Idempotency key was already used for another payload");
          return true;
        },
      );

      await assert.rejects(
        () =>
          saveWorkspaceDedicatedEnvironmentReadiness({
            enabled: true,
            deployment_model: "single_tenant",
            target_region: "us-east-1",
            requester_email: "owner@example.com",
          }),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.status, 403);
          assert.equal(error.code, "workspace_admin_required");
          assert.equal(
            error.message,
            "Only workspace owners or admins can configure dedicated environment delivery",
          );
          return true;
        },
      );
    });
  },
);

test(
  "smoke(non-browser, source-assisted+execution): onboarding wizard keeps first-demo blockers and evidence handoff links",
  async () => {
    const onboardingWizardSource = await readFile(onboardingWizardPath, "utf8");

    assert.match(onboardingWizardSource, /firstDemoStatusText/);
    assert.match(onboardingWizardSource, /firstDemoStatusVariant/);
    assert.match(onboardingWizardSource, /latestDemoRunHint/);
    assert.match(onboardingWizardSource, /blockers\.find/);
    assert.match(
      onboardingWizardSource,
      /const verificationChecklistHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/verification\?surface=verification",/s,
    );
    assert.match(
      onboardingWizardSource,
      /const goLiveDrillHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/go-live\?surface=go_live",/s,
    );
    assert.match(onboardingWizardSource, /continue the guided walkthrough/);
    assert.match(onboardingWizardSource, /Capture verification evidence/);
  },
);

test(
  "smoke(non-browser, source-assisted+execution): settings handoff contract keeps verification/go-live routing for enterprise submit and audit export",
  async () => {
    const settingsSource = await readFile(settingsPanelPath, "utf8");

    assert.match(settingsSource, /import \{ buildAdminReturnHref, buildHandoffHref \} from "@\/lib\/handoff-query";/);
    assert.match(settingsSource, /function buildSettingsHref\(args: SettingsHrefArgs\): string \{/);
    assert.match(settingsSource, /const href = buildHandoffHref\(/);
    assert.match(
      settingsSource,
      /const verificationHref = buildSettingsHref\(\{ pathname: "\/verification\?surface=verification", \.\.\.handoffHrefArgs \}\);/,
    );
    assert.match(
      settingsSource,
      /const goLiveHref = buildSettingsHref\(\{ pathname: "\/go-live\?surface=go_live", \.\.\.handoffHrefArgs \}\);/,
    );

    assert.match(settingsSource, /href=\{verificationHref\}[\s\S]*Capture SSO evidence/s);
    assert.match(settingsSource, /href=\{goLiveHref\}[\s\S]*Continue to go-live drill/s);
    assert.match(settingsSource, /href=\{verificationHref\}[\s\S]*Attach environment evidence/s);
    assert.match(settingsSource, /href=\{goLiveHref\}[\s\S]*Continue to go-live drill/s);
    assert.match(settingsSource, /href=\{verificationHref\}[\s\S]*Attach in verification/s);
    assert.match(settingsSource, /href=\{goLiveHref\}[\s\S]*Carry to go-live drill/s);
    assert.match(settingsSource, /Attach it to verification\/go-live evidence as needed\./);

    const exportResult = await withMockFetch(async (input, init) => {
      assert.equal(String(input), "/api/control-plane/workspace/audit-events/export?format=jsonl");
      assert.equal(init?.method, "GET");
      assert.equal((init?.headers as Record<string, string> | undefined)?.accept, "application/x-ndjson,application/json");

      return new Response("event-1\n", {
        status: 200,
        headers: {
          "content-type": "application/x-ndjson",
          "content-disposition": "attachment; filename*=UTF-8''workspace-audit-export.jsonl",
        },
      });
    }, () => downloadWorkspaceAuditExportViewModel({ format: "jsonl" }));

    assert.equal(exportResult.ok, true);
    if (!exportResult.ok) {
      throw new Error("Expected successful audit export contract");
    }
    assert.equal(exportResult.contract_meta.source, "live");
    assert.equal(exportResult.contract_meta.issue, null);
    assert.equal(exportResult.format, "jsonl");
    assert.equal(exportResult.filename, "workspace-audit-export.jsonl");
  },
);

test(
  "smoke(non-browser, source-assisted+execution): delivery-track/handoff continuity keeps shared query and metadata contract across settings/go-live/delivery surfaces",
  { concurrency: false },
  async () =>
    withCleanWorkspaceEnv(async () => {
      process.env.CONTROL_PLANE_BASE_URL = "https://control-plane.example";
      process.env.CONTROL_PLANE_SUBJECT_ROLES = "workspace_owner,operator";

      const workspaceContextResponse = await withMockFetch(async (input, init) => {
        assert.equal(String(input), "https://control-plane.example/api/v1/saas/me");
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.accept, "application/json");
        assert.equal(headers?.["x-authenticated-subject"], "handoff-owner@example.com");
        assert.equal(headers?.["x-authenticated-roles"], "workspace_owner,operator");

        return new Response(
          JSON.stringify({
            data: {
              user: {
                user_id: "usr_handoff_smoke",
                email: "handoff-owner@example.com",
                auth_provider: "cf_access",
                auth_subject: "handoff-owner@example.com",
              },
              workspaces: [
                {
                  workspace_id: "ws_handoff_alpha",
                  slug: "handoff-alpha",
                  display_name: "Handoff Alpha",
                  tenant_id: "tenant_handoff_alpha",
                },
                {
                  workspace_id: "ws_handoff_beta",
                  slug: "handoff-beta",
                  display_name: "Handoff Beta",
                  tenant_id: "tenant_handoff_beta",
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }, () =>
        getWorkspaceContext(
          new Request("http://localhost/api/workspace-context", {
            headers: {
              "x-authenticated-subject": "handoff-owner@example.com",
              "x-authenticated-roles": "workspace_owner,operator",
              "x-workspace-slug": "handoff-beta",
            },
          }),
        ),
      );

      assert.equal(workspaceContextResponse.status, 200);
      const workspaceContextPayload = (await workspaceContextResponse.json()) as {
        data: { source: string; workspace: { slug: string } };
      };
      assert.equal(workspaceContextPayload.data.source, "metadata");
      assert.equal(workspaceContextPayload.data.workspace.slug, "handoff-beta");

      const settingsSource = await readFile(settingsPanelPath, "utf8");
      const goLiveSource = await readFile(goLivePagePath, "utf8");
      const verificationSource = await readFile(verificationPagePath, "utf8");
      const deliveryPanelSource = await readFile(deliveryTrackPanelPath, "utf8");
      const handoffQuerySource = await readFile(handoffQueryPath, "utf8");

      assert.match(settingsSource, /import \{ buildAdminReturnHref, buildHandoffHref \} from "@\/lib\/handoff-query";/);
      assert.match(goLiveSource, /import \{ buildHandoffHref \} from "@\/lib\/handoff-query";/);
      assert.match(deliveryPanelSource, /import \{ buildAdminReturnHref, buildHandoffHref \} from "@\/lib\/handoff-query";/);
      assert.match(goLiveSource, /return buildHandoffHref\(args\.pathname,/);
      assert.match(deliveryPanelSource, /return buildHandoffHref\(pathname,/);

      for (const source of [settingsSource, goLiveSource, deliveryPanelSource]) {
        assert.match(source, /week8Focus/);
        assert.match(source, /attentionWorkspace/);
        assert.match(source, /attentionOrganization/);
        assert.match(source, /deliveryContext/);
        assert.match(source, /recentTrackKey/);
        assert.match(source, /recentUpdateKind/);
        assert.match(source, /evidenceCount/);
      }

      for (const key of [
        "week8_focus",
        "attention_workspace",
        "attention_organization",
        "delivery_context",
        "recent_track_key",
        "recent_update_kind",
        "evidence_count",
      ]) {
        assert.match(handoffQuerySource, new RegExp(`"${key}"`));
      }

      assert.match(handoffQuerySource, /"recent_owner_label"/);
      assert.match(handoffQuerySource, /"recent_owner_display_name"/);
      assert.match(handoffQuerySource, /"recent_owner_email"/);
      assert.match(goLiveSource, /recent_owner_display_name/);
      assert.match(goLiveSource, /recent_owner_email/);

      assert.match(verificationSource, /const verificationDeliveryDescription = buildRecentDeliveryDescription\(/);
      assert.match(goLiveSource, /const goLiveDeliveryDescription = buildRecentDeliveryDescription\(/);
      assert.match(verificationSource, /Latest admin handoff: \$\{parts\.join\(" · "\)\}\./);
      assert.match(goLiveSource, /Latest admin handoff: \$\{parts\.join\(" · "\)\}\./);
      assert.match(deliveryPanelSource, /describeRecentUpdateKind/);
      assert.match(deliveryPanelSource, /Evidence links were added on the \$\{trackLabel\(trackKey\)\} track\./);

      assert.match(
        goLiveSource,
        /href=\{buildGoLiveHref\(\{[\s\S]*pathname: "\/verification\?surface=verification",[\s\S]*recentTrackKey,[\s\S]*recentUpdateKind,[\s\S]*evidenceCount: recentEvidenceCountParam,[\s\S]*\}\)\}/,
      );
      assert.match(
        goLiveSource,
        /href=\{buildGoLiveHref\(\{[\s\S]*pathname: "\/usage",[\s\S]*recentTrackKey,[\s\S]*recentUpdateKind,[\s\S]*evidenceCount: recentEvidenceCountParam,[\s\S]*\}\)\}/,
      );
    }),
);

test(
  "smoke(non-browser, source-assisted+execution): surface -> verification/go-live -> admin return continuity keeps queue/readiness handoff contract",
  async () => {
    const goLiveSource = await readFile(goLivePagePath, "utf8");
    const verificationSource = await readFile(verificationPagePath, "utf8");
    const deliveryPanelSource = await readFile(deliveryTrackPanelPath, "utf8");
    const adminPageSource = await readFile(adminPagePath, "utf8");
    const adminFollowUpNoticeSource = await readFile(adminFollowUpNoticePath, "utf8");

    assert.match(verificationSource, /source="admin-attention"[\s\S]*surface="verification"/);
    assert.match(verificationSource, /source="admin-readiness"[\s\S]*surface="verification"/);
    assert.match(goLiveSource, /source="admin-attention"[\s\S]*surface="go_live"/);
    assert.match(goLiveSource, /source="admin-readiness"[\s\S]*surface="go_live"/);

    assert.match(deliveryPanelSource, /import \{ buildAdminReturnHref, buildHandoffHref \} from "@\/lib\/handoff-query";/);
    assert.match(deliveryPanelSource, /function buildAdminReturnUrl\(/);
    assert.match(deliveryPanelSource, /return buildAdminReturnHref\("\/admin", \{/);
    assert.match(deliveryPanelSource, /queueSurface: surface,/);
    assert.match(deliveryPanelSource, /week8Focus,/);
    assert.match(deliveryPanelSource, /attentionWorkspace: workspaceSlug,/);
    assert.match(deliveryPanelSource, /Return to admin queue/);
    assert.match(deliveryPanelSource, /Return to admin readiness view/);

    assert.match(adminFollowUpNoticeSource, /import \{ buildAdminReturnHref \} from "@\/lib\/handoff-query";/);
    assert.match(adminFollowUpNoticeSource, /const queueSurface =/);
    assert.match(adminFollowUpNoticeSource, /const returnHref = buildAdminReturnHref\("\/admin", \{/);
    assert.match(adminFollowUpNoticeSource, /attentionWorkspace: returnWorkspaceSlug,/);
    assert.match(adminPageSource, /const queueReturned = getParam\(searchParams\?\.queue_returned\) === "1";/);
    assert.match(adminPageSource, /const readinessReturned = getParam\(searchParams\?\.readiness_returned\) === "1";/);
    assert.match(adminPageSource, /initialSurfaceFilter=\{normalizedSurface\}/);
    assert.match(adminPageSource, /initialReadinessFocus=\{normalizedReadinessFocus\}/);

    const verificationHandoffHref = buildHandoffHref("/verification?surface=verification", {
      source: "admin-attention",
      surface: "verification",
      week8Focus: "go_live_ready",
      attentionWorkspace: "handoff-beta",
      attentionOrganization: "org_handoff",
      deliveryContext: "recent_activity",
      recentTrackKey: "verification",
      recentUpdateKind: "verification_completed",
      evidenceCount: 2,
      recentOwnerDisplayName: "Queue Owner",
      recentOwnerEmail: "queue-owner@example.com",
    });
    const verificationHandoffUrl = new URL(`https://example.test${verificationHandoffHref}`);
    assert.equal(verificationHandoffUrl.searchParams.get("source"), "admin-attention");
    assert.equal(verificationHandoffUrl.searchParams.get("surface"), "verification");
    assert.equal(verificationHandoffUrl.searchParams.get("attention_workspace"), "handoff-beta");
    assert.equal(verificationHandoffUrl.searchParams.get("delivery_context"), "recent_activity");
    assert.equal(verificationHandoffUrl.searchParams.get("recent_update_kind"), "verification_completed");

    const goLiveHandoffHref = buildHandoffHref("/go-live?surface=go_live", {
      source: "admin-attention",
      surface: "go_live",
      week8Focus: "go_live_ready",
      attentionWorkspace: "handoff-beta",
      attentionOrganization: "org_handoff",
      deliveryContext: "recent_activity",
      recentTrackKey: "go_live",
      recentUpdateKind: "go_live_completed",
      evidenceCount: 3,
      recentOwnerDisplayName: "Queue Owner",
      recentOwnerEmail: "queue-owner@example.com",
    });
    const goLiveHandoffUrl = new URL(`https://example.test${goLiveHandoffHref}`);
    assert.equal(goLiveHandoffUrl.searchParams.get("source"), "admin-attention");
    assert.equal(goLiveHandoffUrl.searchParams.get("surface"), "go_live");
    assert.equal(goLiveHandoffUrl.searchParams.get("recent_track_key"), "go_live");

    const queueReturnHref = buildAdminReturnHref("/admin", {
      source: "admin-attention",
      queueSurface: "go_live",
      attentionWorkspace: "handoff-beta",
      attentionOrganization: "org_handoff",
    });
    const queueReturnSearchParams = Object.fromEntries(new URL(`https://example.test${queueReturnHref}`).searchParams.entries());

    const previousReact = (globalThis as { React?: typeof React }).React;
    (globalThis as { React?: typeof React }).React = React;
    try {
      const queueReturnElement = AdminPage({ searchParams: queueReturnSearchParams });
      const queueReturnPanel = (queueReturnElement as { props?: { children?: unknown[] } }).props?.children?.[1] as {
        type?: { name?: string };
        props?: Record<string, unknown>;
      };
      assert.equal(queueReturnPanel?.type?.name, "AdminOverviewPanel");
      assert.equal(queueReturnPanel?.props?.initialSurfaceFilter, "go_live");
      assert.equal(queueReturnPanel?.props?.queueReturned, true);
      assert.equal(queueReturnPanel?.props?.attentionWorkspaceSlug, "handoff-beta");
      assert.equal(queueReturnPanel?.props?.attentionOrganizationId, "org_handoff");

      const readinessReturnHref = buildAdminReturnHref("/admin", {
        source: "admin-readiness",
        week8Focus: "go_live_ready",
        attentionWorkspace: "handoff-beta",
        attentionOrganization: "org_handoff",
      });
      const readinessReturnElement = AdminPage({
        searchParams: Object.fromEntries(new URL(`https://example.test${readinessReturnHref}`).searchParams.entries()),
      });
      const readinessReturnPanel = (readinessReturnElement as { props?: { children?: unknown[] } }).props?.children?.[1] as {
        type?: { name?: string };
        props?: Record<string, unknown>;
      };
      assert.equal(readinessReturnPanel?.type?.name, "AdminOverviewPanel");
      assert.equal(readinessReturnPanel?.props?.initialReadinessFocus, "go_live_ready");
      assert.equal(readinessReturnPanel?.props?.readinessReturned, true);
      assert.equal(readinessReturnPanel?.props?.attentionWorkspaceSlug, "handoff-beta");
      assert.equal(readinessReturnPanel?.props?.attentionOrganizationId, "org_handoff");
    } finally {
      (globalThis as { React?: typeof React }).React = previousReact;
    }
  },
);

test(
  "smoke(non-browser, source-assisted+execution): workspace-launchpad keeps recommended/all-surfaces continuity into verification/go-live with explicit-surface preference",
  async () => {
    const launchpadSource = await readFile(workspaceLaunchpadPath, "utf8");

    assert.match(launchpadSource, /const nextStepLinks(?:: Array<\{ label: string; surface: OnboardingSurface \}>)? = \[/);
    assert.match(
      launchpadSource,
      /\{ label: "Verification", (?:path: "\/verification(?:\?surface=verification)?"|surface: "verification") \},/,
    );
    assert.match(
      launchpadSource,
      /\{ label: "Go-live", (?:path: "\/go-live(?:\?surface=go_live)?"|surface: "go-live") \},/,
    );
    assert.match(launchpadSource, /function toSurfacePath\(surface: OnboardingSurface\): string \{/);
    assert.match(launchpadSource, /if \(surface === "go_live" \|\| surface === "go-live"\) \{/);
    assert.match(launchpadSource, /return "\/go-live(?:\?surface=go_live)?";/);
    assert.match(launchpadSource, /return \`\/\$\{surface\}\`;/);
    assert.match(launchpadSource, /href=\{toSurfacePath\(recommendedNextStep\.surface\)\}/);
    assert.match(launchpadSource, /href=\{(?:entry\.path|toSurfacePath\(entry\.surface\))\}/);

    const hasExplicitVerification = /return "\/verification\?surface=verification";/.test(launchpadSource)
      || /{ label: "Verification", path: "\/verification\?surface=verification" }/.test(launchpadSource);
    const hasExplicitGoLive =
      /return "\/go-live\?surface=go_live";/.test(launchpadSource)
      || /{ label: "Go-live", path: "\/go-live\?surface=go_live" }/.test(launchpadSource);
    const hasExplicitGoLiveSurfacePath = /return "\/go-live\?surface=go_live";/.test(launchpadSource);

    const onboardingArgs = {
      source: "onboarding",
      week8Focus: "demo_run",
      attentionWorkspace: "launchpad-smoke",
      attentionOrganization: "org-launchpad",
      deliveryContext: "recent_activity",
      recentTrackKey: "verification",
      recentUpdateKind: "evidence_only",
      evidenceCount: 6,
      recentOwnerLabel: "Launchpad Owner",
    } as const;

    const verificationEntryPath = hasExplicitVerification ? "/verification?surface=verification" : "/verification";
    const goLiveEntryPath = hasExplicitGoLive ? "/go-live?surface=go_live" : "/go-live";
    const recommendedGoLivePath = hasExplicitGoLiveSurfacePath ? "/go-live?surface=go_live" : "/go-live";

    const verificationFromLaunchpad = buildVerificationChecklistHandoffHref({
      pathname: verificationEntryPath,
      ...onboardingArgs,
    });
    const goLiveFromLaunchpad = buildVerificationChecklistHandoffHref({
      pathname: goLiveEntryPath,
      ...onboardingArgs,
    });
    const recommendedGoLive = buildVerificationChecklistHandoffHref({
      pathname: recommendedGoLivePath,
      ...onboardingArgs,
    });

    const expectedKeys = [
      ["source", onboardingArgs.source],
      ["week8_focus", onboardingArgs.week8Focus],
      ["attention_workspace", onboardingArgs.attentionWorkspace],
      ["attention_organization", onboardingArgs.attentionOrganization],
      ["delivery_context", onboardingArgs.deliveryContext],
      ["recent_track_key", onboardingArgs.recentTrackKey],
      ["recent_update_kind", onboardingArgs.recentUpdateKind],
      ["evidence_count", String(onboardingArgs.evidenceCount)],
      ["recent_owner_label", onboardingArgs.recentOwnerLabel],
    ] as const;

    for (const href of [verificationFromLaunchpad, goLiveFromLaunchpad, recommendedGoLive]) {
      const parsed = new URL(`https://example.test${href}`);
      for (const [key, value] of expectedKeys) {
        assert.equal(parsed.searchParams.get(key), value);
      }
    }

    const verificationUrl = new URL(`https://example.test${verificationFromLaunchpad}`);
    const goLiveUrl = new URL(`https://example.test${goLiveFromLaunchpad}`);
    if (hasExplicitVerification) {
      assert.equal(verificationUrl.searchParams.get("surface"), "verification");
    }
    if (hasExplicitGoLive) {
      assert.equal(goLiveUrl.searchParams.get("surface"), "go_live");
    }
  },
);

test(
  "smoke(non-browser, source-assisted+execution): onboarding recovery prework keeps launchpad -> playground -> verification/go-live click order and explicit surface semantics",
  async () => {
    const launchpadSource = await readFile(workspaceLaunchpadPath, "utf8");
    const playgroundSource = await readFile(playgroundPanelPath, "utf8");
    const usageSource = await readFile(usageDashboardPath, "utf8");

    assert.match(launchpadSource, /const latestDemoRunHint = onboarding\?\.latest_demo_run_hint \?\? null;/);
    assert.match(launchpadSource, /const deliveryGuidance = onboarding\?\.delivery_guidance \?\? null;/);
    assert.match(launchpadSource, /<CardTitle>Onboarding recovery lane<\/CardTitle>/);
    assert.match(launchpadSource, /surface: "playground"/);
    assert.match(launchpadSource, /surface: "verification"/);
    assert.match(launchpadSource, /surface: "go-live"/);
    assert.match(launchpadSource, /Inspect Playground status/);
    assert.match(launchpadSource, /Open verification evidence lane/);

    assert.match(playgroundSource, /if \(args\.latestDemoRunHint\?\.needs_attention\) \{/);
    assert.match(playgroundSource, /actionLabel: args\.latestDemoRunHint\.is_terminal \? "Retry Playground run" : "Inspect Playground status"/);
    assert.match(playgroundSource, /actionSurface: "playground"/);
    assert.match(playgroundSource, /actionLabel: "Open Verification"/);
    assert.match(playgroundSource, /actionSurface: "verification"/);
    assert.match(playgroundSource, /actionLabel: "Open go-live drill"/);
    assert.match(playgroundSource, /actionSurface: "go-live"/);
    assert.match(playgroundSource, /return "\/verification\?surface=verification";/);
    assert.match(playgroundSource, /return "\/go-live\?surface=go_live";/);

    assert.match(usageSource, /title: "Governed first demo signal"/);
    assert.match(usageSource, /Run a playground demo/);
    assert.match(usageSource, /Capture evidence in verification/);
    assert.match(usageSource, /Review API key scopes/);
    assert.match(usageSource, /const latestDemoRunHint = args\.onboardingState\?\.latest_demo_run_hint \?\? null;/);
    assert.match(usageSource, /const deliveryGuidance = args\.onboardingState\?\.delivery_guidance \?\? null;/);

    const continuityArgs = {
      source: "onboarding",
      week8Focus: "demo_run",
      attentionWorkspace: "launchpad-prework",
      attentionOrganization: "org-launchpad-prework",
      deliveryContext: "recent_activity",
      recentTrackKey: "verification",
      recentUpdateKind: "evidence_only",
      evidenceCount: 2,
      recentOwnerLabel: "Launchpad Owner",
    } as const;

    const launchpadPlaygroundHref = buildVerificationChecklistHandoffHref({
      pathname: "/playground",
      ...continuityArgs,
    });
    const playgroundVerificationHref = buildVerificationChecklistHandoffHref({
      pathname: "/verification?surface=verification",
      ...continuityArgs,
    });
    const playgroundGoLiveHref = buildVerificationChecklistHandoffHref({
      pathname: "/go-live?surface=go_live",
      ...continuityArgs,
    });

    const continuitySequence = [
      launchpadPlaygroundHref,
      playgroundVerificationHref,
      playgroundGoLiveHref,
    ].map((href) => new URL(`https://example.test${href}`));

    assert.equal(continuitySequence[0].pathname, "/playground");
    assert.equal(continuitySequence[1].pathname, "/verification");
    assert.equal(continuitySequence[2].pathname, "/go-live");
    assert.equal(continuitySequence[0].searchParams.get("surface"), null);
    assert.equal(continuitySequence[1].searchParams.get("surface"), "verification");
    assert.equal(continuitySequence[2].searchParams.get("surface"), "go_live");

    const expectedKeys = [
      ["source", continuityArgs.source],
      ["week8_focus", continuityArgs.week8Focus],
      ["attention_workspace", continuityArgs.attentionWorkspace],
      ["attention_organization", continuityArgs.attentionOrganization],
      ["delivery_context", continuityArgs.deliveryContext],
      ["recent_track_key", continuityArgs.recentTrackKey],
      ["recent_update_kind", continuityArgs.recentUpdateKind],
      ["evidence_count", String(continuityArgs.evidenceCount)],
      ["recent_owner_label", continuityArgs.recentOwnerLabel],
    ] as const;

    for (const parsed of continuitySequence) {
      for (const [key, value] of expectedKeys) {
        assert.equal(parsed.searchParams.get(key), value);
      }
    }
  },
);

test(
  "smoke(non-browser, source-assisted+execution): accept-invitation onboarding path builder preserves continuity keys and verification explicit-surface semantics",
  async () => {
    const acceptInvitationSource = await readFile(acceptInvitationPagePath, "utf8");

    assert.match(acceptInvitationSource, /function buildOnboardingPath\(pathname: string\): string \{/);
    assert.match(acceptInvitationSource, /params\.set\("source", "onboarding"\);/);
    assert.match(acceptInvitationSource, /params\.set\("attention_workspace", acceptedWorkspace\.workspace_slug\);/);
    assert.match(acceptInvitationSource, /params\.set\("delivery_context", "recent_activity"\);/);
    assert.match(acceptInvitationSource, /params\.set\("recent_owner_label", acceptedWorkspace\.display_name\);/);
    assert.match(
      acceptInvitationSource,
      /openWorkspaceSurface\(buildOnboardingPath\("\/verification(?:\?surface=verification)?"\)\)/,
    );
    assert.match(acceptInvitationSource, /openWorkspaceSurface\(buildOnboardingPath\("\/members"\)\)/);
    assert.match(acceptInvitationSource, /openWorkspaceSurface\(buildOnboardingPath\("\/playground"\)\)/);

    const verificationOnboardingPath = /buildOnboardingPath\("\/verification\?surface=verification"\)/.test(
      acceptInvitationSource,
    )
      ? "/verification?surface=verification"
      : "/verification";

    const onboardingQueryArgs = {
      source: "onboarding",
      attentionWorkspace: "invite-smoke-workspace",
      deliveryContext: "recent_activity",
      recentOwnerLabel: "Invite Smoke Owner",
    } as const;

    const membersFromInvite = buildHandoffHref("/members", onboardingQueryArgs);
    const playgroundFromInvite = buildHandoffHref("/playground", onboardingQueryArgs);
    const verificationFromInvite = buildHandoffHref(verificationOnboardingPath, onboardingQueryArgs, {
      preserveExistingQuery: true,
    });

    for (const href of [membersFromInvite, playgroundFromInvite, verificationFromInvite]) {
      const parsed = new URL(`https://example.test${href}`);
      assert.equal(parsed.searchParams.get("source"), "onboarding");
      assert.equal(parsed.searchParams.get("attention_workspace"), "invite-smoke-workspace");
      assert.equal(parsed.searchParams.get("delivery_context"), "recent_activity");
      assert.equal(parsed.searchParams.get("recent_owner_label"), "Invite Smoke Owner");
    }

    if (verificationOnboardingPath.includes("surface=verification")) {
      assert.equal(new URL(`https://example.test${verificationFromInvite}`).searchParams.get("surface"), "verification");
    }
  },
);

test(
  "smoke(non-browser, source-assisted+execution): members -> accept-invitation -> onboarding next steps keeps continuity keys and explicit verification/go-live surfaces",
  async () => {
    const membersSource = await readFile(membersPagePath, "utf8");
    const acceptInvitationSource = await readFile(acceptInvitationPagePath, "utf8");
    const onboardingSource = await readFile(onboardingWizardPath, "utf8");

    assert.match(membersSource, /href=\{buildHandoffHref\("\/accept-invitation", handoffArgs\)\}/);
    assert.match(membersSource, /const handoffArgs = \{/);
    assert.match(membersSource, /week8Focus,/);
    assert.match(membersSource, /attentionOrganization: handoffOrganization,/);
    assert.match(membersSource, /recentTrackKey,/);
    assert.match(membersSource, /recentUpdateKind,/);
    assert.match(membersSource, /evidenceCount,/);
    assert.match(membersSource, /recentOwnerLabel: ownerLabel,/);

    assert.match(acceptInvitationSource, /function buildOnboardingPath\(pathname: string\): string \{/);
    assert.match(acceptInvitationSource, /const \[basePath, rawQuery\] = pathname\.split\("\?", 2\);/);
    assert.match(acceptInvitationSource, /const params = new URLSearchParams\(rawQuery \?\? ""\);/);
    assert.match(acceptInvitationSource, /const continuityKeys = \[/);
    assert.match(acceptInvitationSource, /"week8_focus"/);
    assert.match(acceptInvitationSource, /"attention_organization"/);
    assert.match(acceptInvitationSource, /"delivery_context"/);
    assert.match(acceptInvitationSource, /"recent_track_key"/);
    assert.match(acceptInvitationSource, /"recent_update_kind"/);
    assert.match(acceptInvitationSource, /"evidence_count"/);
    assert.match(acceptInvitationSource, /"recent_owner_label"/);
    assert.match(acceptInvitationSource, /"recent_owner_display_name"/);
    assert.match(acceptInvitationSource, /"recent_owner_email"/);
    assert.match(acceptInvitationSource, /for \(const key of continuityKeys\) \{/);
    assert.match(acceptInvitationSource, /const value = searchParams\.get\(key\);/);
    assert.match(acceptInvitationSource, /if \(value && !params\.has\(key\)\) \{\s*params\.set\(key, value\);\s*\}/s);
    assert.match(acceptInvitationSource, /params\.set\("source", "onboarding"\);/);
    assert.match(acceptInvitationSource, /params\.set\("attention_workspace",/);
    assert.match(acceptInvitationSource, /params\.set\("delivery_context",/);
    assert.match(acceptInvitationSource, /params\.set\("recent_owner_label",/);
    assert.match(acceptInvitationSource, /openWorkspaceSurface\(buildOnboardingPath\("\/members"\)\)/);
    assert.match(acceptInvitationSource, /openWorkspaceSurface\(buildOnboardingPath\("\/playground"\)\)/);
    assert.match(
      acceptInvitationSource,
      /openWorkspaceSurface\(buildOnboardingPath\("\/verification\?surface=verification"\)\)/,
    );
    assert.match(acceptInvitationSource, /openWorkspaceSurface\(buildOnboardingPath\("\/go-live\?surface=go_live"\)\)/);
    assert.match(
      onboardingSource,
      /buildVerificationChecklistHandoffHref\(\{ pathname: "\/service-accounts", \.\.\.handoffHrefArgs \}\)/,
    );
    assert.match(
      onboardingSource,
      /buildVerificationChecklistHandoffHref\(\{ pathname: "\/api-keys", \.\.\.handoffHrefArgs \}\)/,
    );
    assert.match(
      onboardingSource,
      /const verificationChecklistHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/verification\?surface=verification",\s*\.\.\.handoffHrefArgs,\s*\}\);/s,
    );

    const continuityArgs = {
      source: "admin-attention",
      week8Focus: "demo_run",
      attentionWorkspace: "members-invite-chain",
      attentionOrganization: "org-members-invite-chain",
      deliveryContext: "queue_review",
      recentTrackKey: "verification",
      recentUpdateKind: "evidence_only",
      evidenceCount: 8,
      recentOwnerLabel: "Original Invite Owner",
      recentOwnerDisplayName: "Original Invite Owner Display",
      recentOwnerEmail: "owner@example.test",
    } as const;

    const membersToAcceptInvitationHref = buildHandoffHref("/accept-invitation", continuityArgs);
    const parsedAcceptInvitationUrl = new URL(`https://example.test${membersToAcceptInvitationHref}`);
    assert.equal(parsedAcceptInvitationUrl.pathname, "/accept-invitation");

    const requiredParam = (value: string | null, key: string): string => {
      assert.ok(value, `expected ${key} to exist on members -> accept-invitation handoff`);
      return value;
    };

    const forwardedArgs = {
      source: requiredParam(parsedAcceptInvitationUrl.searchParams.get("source"), "source"),
      week8Focus: requiredParam(parsedAcceptInvitationUrl.searchParams.get("week8_focus"), "week8_focus"),
      attentionWorkspace: requiredParam(
        parsedAcceptInvitationUrl.searchParams.get("attention_workspace"),
        "attention_workspace",
      ),
      attentionOrganization: requiredParam(
        parsedAcceptInvitationUrl.searchParams.get("attention_organization"),
        "attention_organization",
      ),
      deliveryContext: requiredParam(parsedAcceptInvitationUrl.searchParams.get("delivery_context"), "delivery_context"),
      recentTrackKey: requiredParam(parsedAcceptInvitationUrl.searchParams.get("recent_track_key"), "recent_track_key"),
      recentUpdateKind: requiredParam(
        parsedAcceptInvitationUrl.searchParams.get("recent_update_kind"),
        "recent_update_kind",
      ),
      evidenceCount: Number(requiredParam(parsedAcceptInvitationUrl.searchParams.get("evidence_count"), "evidence_count")),
      recentOwnerLabel: requiredParam(
        parsedAcceptInvitationUrl.searchParams.get("recent_owner_label"),
        "recent_owner_label",
      ),
      recentOwnerDisplayName: requiredParam(
        parsedAcceptInvitationUrl.searchParams.get("recent_owner_display_name"),
        "recent_owner_display_name",
      ),
      recentOwnerEmail: requiredParam(
        parsedAcceptInvitationUrl.searchParams.get("recent_owner_email"),
        "recent_owner_email",
      ),
    };

    const acceptedWorkspace = {
      workspaceSlug: "accepted-invite-workspace",
      displayName: "Accepted Invite Workspace",
    } as const;
    const continuityKeys = [
      "week8_focus",
      "attention_organization",
      "delivery_context",
      "recent_track_key",
      "recent_update_kind",
      "evidence_count",
      "recent_owner_label",
      "recent_owner_display_name",
      "recent_owner_email",
    ] as const;
    const buildAcceptedOnboardingPath = (pathname: string): string => {
      const [basePath, rawQuery] = pathname.split("?", 2);
      const params = new URLSearchParams(rawQuery ?? "");
      for (const key of continuityKeys) {
        const value = parsedAcceptInvitationUrl.searchParams.get(key);
        if (value && !params.has(key)) {
          params.set(key, value);
        }
      }
      params.set("source", "onboarding");
      params.set("attention_workspace", acceptedWorkspace.workspaceSlug);
      params.set("delivery_context", "recent_activity");
      params.set("recent_owner_label", acceptedWorkspace.displayName);
      const query = params.toString();
      return query ? `${basePath}?${query}` : basePath;
    };

    const membersFromInvite = buildAcceptedOnboardingPath("/members");
    const serviceAccountsFromInvite = buildVerificationChecklistHandoffHref({
      pathname: "/service-accounts",
      source: "onboarding",
      week8Focus: forwardedArgs.week8Focus,
      attentionWorkspace: acceptedWorkspace.workspaceSlug,
      attentionOrganization: forwardedArgs.attentionOrganization,
      deliveryContext: "recent_activity",
      recentTrackKey: forwardedArgs.recentTrackKey,
      recentUpdateKind: forwardedArgs.recentUpdateKind,
      evidenceCount: forwardedArgs.evidenceCount,
      recentOwnerLabel: acceptedWorkspace.displayName,
    });
    const apiKeysFromInvite = buildVerificationChecklistHandoffHref({
      pathname: "/api-keys",
      source: "onboarding",
      week8Focus: forwardedArgs.week8Focus,
      attentionWorkspace: acceptedWorkspace.workspaceSlug,
      attentionOrganization: forwardedArgs.attentionOrganization,
      deliveryContext: "recent_activity",
      recentTrackKey: forwardedArgs.recentTrackKey,
      recentUpdateKind: forwardedArgs.recentUpdateKind,
      evidenceCount: forwardedArgs.evidenceCount,
      recentOwnerLabel: acceptedWorkspace.displayName,
    });
    const playgroundFromInvite = buildAcceptedOnboardingPath("/playground");
    const verificationFromInvite = buildAcceptedOnboardingPath("/verification?surface=verification");
    const goLiveFromInvite = buildAcceptedOnboardingPath("/go-live?surface=go_live");

    const expectedKeys = [
      ["source", "onboarding"],
      ["week8_focus", continuityArgs.week8Focus],
      ["attention_workspace", acceptedWorkspace.workspaceSlug],
      ["attention_organization", continuityArgs.attentionOrganization],
      ["delivery_context", "recent_activity"],
      ["recent_track_key", continuityArgs.recentTrackKey],
      ["recent_update_kind", continuityArgs.recentUpdateKind],
      ["evidence_count", String(continuityArgs.evidenceCount)],
      ["recent_owner_label", acceptedWorkspace.displayName],
    ] as const;

    for (const href of [
      membersFromInvite,
      serviceAccountsFromInvite,
      apiKeysFromInvite,
      playgroundFromInvite,
      verificationFromInvite,
      goLiveFromInvite,
    ]) {
      const parsed = new URL(`https://example.test${href}`);
      for (const [key, value] of expectedKeys) {
        assert.equal(parsed.searchParams.get(key), value);
      }
    }

    for (const href of [membersFromInvite, playgroundFromInvite, verificationFromInvite, goLiveFromInvite]) {
      const parsed = new URL(`https://example.test${href}`);
      assert.equal(parsed.searchParams.get("recent_owner_display_name"), continuityArgs.recentOwnerDisplayName);
      assert.equal(parsed.searchParams.get("recent_owner_email"), continuityArgs.recentOwnerEmail);
    }

    assert.equal(parsedAcceptInvitationUrl.searchParams.get("source"), continuityArgs.source);
    assert.equal(parsedAcceptInvitationUrl.searchParams.get("attention_workspace"), continuityArgs.attentionWorkspace);
    assert.equal(parsedAcceptInvitationUrl.searchParams.get("delivery_context"), continuityArgs.deliveryContext);
    assert.equal(parsedAcceptInvitationUrl.searchParams.get("recent_owner_label"), continuityArgs.recentOwnerLabel);
    assert.equal(
      parsedAcceptInvitationUrl.searchParams.get("recent_owner_display_name"),
      continuityArgs.recentOwnerDisplayName,
    );
    assert.equal(parsedAcceptInvitationUrl.searchParams.get("recent_owner_email"), continuityArgs.recentOwnerEmail);

    assert.equal(new URL(`https://example.test${verificationFromInvite}`).searchParams.get("surface"), "verification");
    assert.equal(new URL(`https://example.test${goLiveFromInvite}`).searchParams.get("surface"), "go_live");
  },
);

test(
  "smoke(non-browser, source-assisted+execution): onboarding/playground/usage keep shared handoff helper continuity and stable query keys",
  async () => {
    const onboardingSource = await readFile(onboardingWizardPath, "utf8");
    const playgroundSource = await readFile(playgroundPanelPath, "utf8");
    const usageSource = await readFile(usageDashboardPath, "utf8");
    const handoffQuerySource = await readFile(handoffQueryPath, "utf8");

    assert.match(
      onboardingSource,
      /import \{ buildVerificationChecklistHandoffHref \} from "@\/components\/verification\/week8-verification-checklist";/,
    );
    assert.match(
      playgroundSource,
      /import \{ buildVerificationChecklistHandoffHref \} from "@\/components\/verification\/week8-verification-checklist";/,
    );
    assert.match(
      usageSource,
      /import \{ buildVerificationChecklistHandoffHref \} from "@\/components\/verification\/week8-verification-checklist";/,
    );

    assert.match(
      onboardingSource,
      /const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>\[0\], "pathname"> = \{/,
    );
    assert.match(onboardingSource, /deliveryContext,/);
    assert.match(onboardingSource, /recentTrackKey,/);
    assert.match(onboardingSource, /recentUpdateKind,/);
    assert.match(onboardingSource, /evidenceCount,/);
    assert.match(onboardingSource, /recentOwnerLabel,/);
    assert.match(
      onboardingSource,
      /const verificationChecklistHref = buildVerificationChecklistHandoffHref\(\{\s*pathname: "\/verification\?surface=verification",\s*\.\.\.handoffHrefArgs,\s*\}\);/s,
    );
    assert.match(
      playgroundSource,
      /const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>\[0\], "pathname"> = \{/,
    );
    assert.match(
      playgroundSource,
      /buildVerificationChecklistHandoffHref\(\{ pathname: "\/verification\?surface=verification", \.\.\.handoffHrefArgs \}\)/,
    );
    assert.match(
      usageSource,
      /const handoffHrefArgs: Omit<Parameters<typeof buildVerificationChecklistHandoffHref>\[0\], "pathname"> = \{/,
    );
    assert.match(
      usageSource,
      /buildVerificationChecklistHandoffHref\(\{ pathname: "\/verification\?surface=verification", \.\.\.handoffHrefArgs \}\)/,
    );

    const continuityArgs = {
      source: "onboarding",
      week8Focus: "demo_run",
      attentionWorkspace: "workspace-smoke",
      attentionOrganization: "org-smoke",
      deliveryContext: "recent_activity",
      recentTrackKey: "verification",
      recentUpdateKind: "evidence_only",
      evidenceCount: 4,
      recentOwnerLabel: "Owner Smoke",
    } as const;

    const onboardingHref = buildVerificationChecklistHandoffHref({
      pathname: "/verification?surface=verification",
      ...continuityArgs,
    });
    const playgroundHref = buildVerificationChecklistHandoffHref({
      pathname: "/usage",
      ...continuityArgs,
    });
    const usageHref = buildVerificationChecklistHandoffHref({
      pathname: "/settings",
      ...continuityArgs,
    });

    const expectedKeys = [
      ["source", continuityArgs.source],
      ["week8_focus", continuityArgs.week8Focus],
      ["attention_workspace", continuityArgs.attentionWorkspace],
      ["attention_organization", continuityArgs.attentionOrganization],
      ["delivery_context", continuityArgs.deliveryContext],
      ["recent_track_key", continuityArgs.recentTrackKey],
      ["recent_update_kind", continuityArgs.recentUpdateKind],
      ["evidence_count", String(continuityArgs.evidenceCount)],
      ["recent_owner_label", continuityArgs.recentOwnerLabel],
    ] as const;

    for (const href of [onboardingHref, playgroundHref, usageHref]) {
      const parsed = new URL(`https://example.test${href}`);
      for (const [key, value] of expectedKeys) {
        assert.equal(parsed.searchParams.get(key), value);
      }
    }
    assert.equal(new URL(`https://example.test${onboardingHref}`).searchParams.get("surface"), "verification");

    for (const key of expectedKeys.map(([key]) => key)) {
      assert.match(handoffQuerySource, new RegExp(`"${key}"`));
    }
  },
);

test(
  "smoke(non-browser, source-assisted+execution): members -> service-accounts -> api-keys/playground -> verification keeps shared handoff continuity",
  async () => {
    const membersSource = await readFile(membersPagePath, "utf8");
    const serviceAccountsPageSource = await readFile(serviceAccountsPagePath, "utf8");
    const serviceAccountsPanelSource = await readFile(serviceAccountsPanelPath, "utf8");
    const apiKeysPanelSource = await readFile(apiKeysPanelPath, "utf8");
    const playgroundPanelSource = await readFile(playgroundPanelPath, "utf8");

    assert.match(membersSource, /href=\{buildHandoffHref\("\/service-accounts", handoffArgs\)\}/);
    assert.match(serviceAccountsPageSource, /href=\{buildHandoffHref\("\/api-keys", \{/);
    assert.match(serviceAccountsPageSource, /recentOwnerLabel: ownerLabel,/);
    assert.match(
      serviceAccountsPanelSource,
      /buildVerificationChecklistHandoffHref\(\{ pathname: "\/playground", \.\.\.handoffHrefArgs \}\)/,
    );
    assert.match(
      serviceAccountsPanelSource,
      /buildVerificationChecklistHandoffHref\(\{[\s\S]*pathname: "\/verification\?surface=verification",[\s\S]*\.\.\.handoffHrefArgs[\s\S]*\}\)/,
    );
    assert.match(
      apiKeysPanelSource,
      /const playgroundHref = buildVerificationChecklistHandoffHref\(\{ pathname: "\/playground", \.\.\.handoffHrefArgs \}\);/,
    );
    assert.match(
      apiKeysPanelSource,
      /const verificationHref = buildVerificationChecklistHandoffHref\(\{[\s\S]*pathname: "\/verification\?surface=verification",[\s\S]*\.\.\.handoffHrefArgs[\s\S]*\}\);/,
    );
    assert.match(
      playgroundPanelSource,
      /buildVerificationChecklistHandoffHref\(\{ pathname: "\/verification\?surface=verification", \.\.\.handoffHrefArgs \}\)/,
    );

    const chainArgs = {
      source: "onboarding",
      week8Focus: "demo_run",
      attentionWorkspace: "members-chain",
      attentionOrganization: "org-members-chain",
      deliveryContext: "recent_activity",
      recentTrackKey: "verification",
      recentUpdateKind: "evidence_only",
      evidenceCount: 3,
      recentOwnerLabel: "Chain Owner",
    } as const;

    const membersToServiceAccountsHref = buildHandoffHref("/service-accounts", chainArgs);
    const serviceAccountsToApiKeysHref = buildHandoffHref("/api-keys", chainArgs);
    const apiKeysToPlaygroundHref = buildVerificationChecklistHandoffHref({
      pathname: "/playground",
      ...chainArgs,
    });
    const playgroundToVerificationHref = buildVerificationChecklistHandoffHref({
      pathname: "/verification?surface=verification",
      ...chainArgs,
    });

    const expectedKeys = [
      ["source", chainArgs.source],
      ["week8_focus", chainArgs.week8Focus],
      ["attention_workspace", chainArgs.attentionWorkspace],
      ["attention_organization", chainArgs.attentionOrganization],
      ["delivery_context", chainArgs.deliveryContext],
      ["recent_track_key", chainArgs.recentTrackKey],
      ["recent_update_kind", chainArgs.recentUpdateKind],
      ["evidence_count", String(chainArgs.evidenceCount)],
      ["recent_owner_label", chainArgs.recentOwnerLabel],
    ] as const;

    for (const href of [
      membersToServiceAccountsHref,
      serviceAccountsToApiKeysHref,
      apiKeysToPlaygroundHref,
      playgroundToVerificationHref,
    ]) {
      const parsed = new URL(`https://example.test${href}`);
      for (const [key, value] of expectedKeys) {
        assert.equal(parsed.searchParams.get(key), value);
      }
    }
    assert.equal(new URL(`https://example.test${playgroundToVerificationHref}`).searchParams.get("surface"), "verification");
  },
);

test(
  "smoke(non-browser, source-assisted+execution): artifacts/logs/members keep console-page handoff continuity with explicit surface and run_id semantics",
  async () => {
    const artifactsSource = await readFile(artifactsPagePath, "utf8");
    const logsSource = await readFile(logsPagePath, "utf8");
    const membersSource = await readFile(membersPagePath, "utf8");

    assert.match(artifactsSource, /import \{ buildHandoffHref, type HandoffQueryArgs \} from "@\/lib\/handoff-query";/);
    assert.match(logsSource, /import \{ buildHandoffHref, type HandoffQueryArgs \} from "@\/lib\/handoff-query";/);
    assert.match(artifactsSource, /function buildArtifactsHandoffHref\(args: HandoffQueryArgs & \{ pathname: string; runId\?: string \| null \}\): string \{/);
    assert.match(logsSource, /function buildLogsHandoffHref\(args: HandoffQueryArgs & \{ pathname: string; runId\?: string \| null \}\): string \{/);
    assert.match(artifactsSource, /buildHandoffHref\(pathname, query, \{ preserveExistingQuery: true \}\)/);
    assert.match(logsSource, /buildHandoffHref\(pathname, query, \{ preserveExistingQuery: true \}\)/);
    assert.match(artifactsSource, /searchParams\.set\("run_id", runId\);/);
    assert.match(logsSource, /searchParams\.set\("run_id", runId\);/);
    assert.match(artifactsSource, /const requestedRunId = getParam\(searchParams\?\.run_id\) \?\? getParam\(searchParams\?\.runId\);/);
    assert.match(logsSource, /const requestedRunId = getParam\(searchParams\?\.run_id\) \?\? getParam\(searchParams\?\.runId\);/);
    assert.match(logsSource, /<LogStream runId=\{requestedRunId\} \/>/);
    assert.match(artifactsSource, /path: "\/verification\?surface=verification"/);
    assert.match(artifactsSource, /path: "\/go-live\?surface=go_live"/);
    assert.match(logsSource, /path: "\/verification\?surface=verification"/);
    assert.match(logsSource, /path: "\/go-live\?surface=go_live"/);
    assert.match(membersSource, /href=\{buildHandoffHref\("\/service-accounts", handoffArgs\)\}/);

    const consoleArgs = {
      source: "admin-attention",
      week8Focus: "demo_run",
      attentionWorkspace: "console-smoke",
      attentionOrganization: "org-console",
      deliveryContext: "recent_activity",
      recentTrackKey: "verification",
      recentUpdateKind: "evidence_only",
      evidenceCount: 5,
      recentOwnerLabel: "Console Owner",
    } as const;

    function withRunId(href: string, runId: string): string {
      const [basePath, rawQuery] = href.split("?");
      const searchParams = new URLSearchParams(rawQuery ?? "");
      searchParams.set("run_id", runId);
      const query = searchParams.toString();
      return query ? `${basePath}?${query}` : basePath;
    }

    const artifactsVerificationHref = withRunId(
      buildHandoffHref("/verification?surface=verification", consoleArgs, { preserveExistingQuery: true }),
      "run_console_123",
    );
    const artifactsGoLiveHref = withRunId(
      buildHandoffHref("/go-live?surface=go_live", consoleArgs, { preserveExistingQuery: true }),
      "run_console_123",
    );
    const logsVerificationHref = withRunId(
      buildHandoffHref("/verification?surface=verification", consoleArgs, { preserveExistingQuery: true }),
      "run_console_123",
    );
    const logsGoLiveHref = withRunId(
      buildHandoffHref("/go-live?surface=go_live", consoleArgs, { preserveExistingQuery: true }),
      "run_console_123",
    );
    const membersNextHref = buildHandoffHref("/service-accounts", consoleArgs);
    const verificationExplicitHref = withRunId(
      buildHandoffHref("/verification?surface=verification", consoleArgs, { preserveExistingQuery: true }),
      "run_console_123",
    );
    const goLiveExplicitHref = withRunId(
      buildHandoffHref("/go-live?surface=go_live", consoleArgs, { preserveExistingQuery: true }),
      "run_console_123",
    );

    const artifactsVerificationUrl = new URL(`https://example.test${artifactsVerificationHref}`);
    const artifactsGoLiveUrl = new URL(`https://example.test${artifactsGoLiveHref}`);
    const logsVerificationUrl = new URL(`https://example.test${logsVerificationHref}`);
    const logsGoLiveUrl = new URL(`https://example.test${logsGoLiveHref}`);
    const membersNextUrl = new URL(`https://example.test${membersNextHref}`);
    const verificationExplicitUrl = new URL(`https://example.test${verificationExplicitHref}`);
    const goLiveExplicitUrl = new URL(`https://example.test${goLiveExplicitHref}`);

    const expectedKeys = [
      ["source", consoleArgs.source],
      ["week8_focus", consoleArgs.week8Focus],
      ["attention_workspace", consoleArgs.attentionWorkspace],
      ["attention_organization", consoleArgs.attentionOrganization],
      ["delivery_context", consoleArgs.deliveryContext],
      ["recent_track_key", consoleArgs.recentTrackKey],
      ["recent_update_kind", consoleArgs.recentUpdateKind],
      ["evidence_count", String(consoleArgs.evidenceCount)],
      ["recent_owner_label", consoleArgs.recentOwnerLabel],
    ] as const;

    for (const parsed of [artifactsVerificationUrl, artifactsGoLiveUrl, logsVerificationUrl, logsGoLiveUrl, membersNextUrl]) {
      for (const [key, value] of expectedKeys) {
        assert.equal(parsed.searchParams.get(key), value);
      }
    }

    assert.equal(artifactsVerificationUrl.searchParams.get("run_id"), "run_console_123");
    assert.equal(artifactsGoLiveUrl.searchParams.get("run_id"), "run_console_123");
    assert.equal(logsVerificationUrl.searchParams.get("run_id"), "run_console_123");
    assert.equal(logsGoLiveUrl.searchParams.get("run_id"), "run_console_123");
    assert.equal(verificationExplicitUrl.searchParams.get("surface"), "verification");
    assert.equal(goLiveExplicitUrl.searchParams.get("surface"), "go_live");
    assert.equal(verificationExplicitUrl.searchParams.get("run_id"), "run_console_123");
    assert.equal(goLiveExplicitUrl.searchParams.get("run_id"), "run_console_123");

    const queueReturnHref = buildAdminReturnHref("/admin", {
      source: "admin-attention",
      queueSurface: "go_live",
      attentionWorkspace: consoleArgs.attentionWorkspace,
      attentionOrganization: consoleArgs.attentionOrganization,
      deliveryContext: consoleArgs.deliveryContext,
      recentUpdateKind: consoleArgs.recentUpdateKind,
      evidenceCount: consoleArgs.evidenceCount,
      recentOwnerLabel: consoleArgs.recentOwnerLabel,
    });
    const readinessReturnHref = buildAdminReturnHref("/admin", {
      source: "admin-readiness",
      week8Focus: "demo_run",
      attentionWorkspace: consoleArgs.attentionWorkspace,
      attentionOrganization: consoleArgs.attentionOrganization,
      deliveryContext: consoleArgs.deliveryContext,
      recentUpdateKind: consoleArgs.recentUpdateKind,
      evidenceCount: consoleArgs.evidenceCount,
      recentOwnerLabel: consoleArgs.recentOwnerLabel,
    });
    const queueReturnUrl = new URL(`https://example.test${queueReturnHref}`);
    const readinessReturnUrl = new URL(`https://example.test${readinessReturnHref}`);
    assert.equal(queueReturnUrl.searchParams.get("queue_surface"), "go_live");
    assert.equal(queueReturnUrl.searchParams.get("queue_returned"), "1");
    assert.equal(readinessReturnUrl.searchParams.get("week8_focus"), "demo_run");
    assert.equal(readinessReturnUrl.searchParams.get("readiness_returned"), "1");

    const previousReact = (globalThis as { React?: typeof React }).React;
    (globalThis as { React?: typeof React }).React = React;
    try {
      const queueReturnElement = AdminPage({
        searchParams: Object.fromEntries(queueReturnUrl.searchParams.entries()),
      });
      const queueReturnPanel = (queueReturnElement as { props?: { children?: unknown[] } }).props?.children?.[1] as {
        type?: { name?: string };
        props?: Record<string, unknown>;
      };
      assert.equal(queueReturnPanel?.type?.name, "AdminOverviewPanel");
      assert.equal(queueReturnPanel?.props?.initialSurfaceFilter, "go_live");
      assert.equal(queueReturnPanel?.props?.queueReturned, true);

      const readinessReturnElement = AdminPage({
        searchParams: Object.fromEntries(readinessReturnUrl.searchParams.entries()),
      });
      const readinessReturnPanel = (readinessReturnElement as { props?: { children?: unknown[] } }).props?.children?.[1] as {
        type?: { name?: string };
        props?: Record<string, unknown>;
      };
      assert.equal(readinessReturnPanel?.type?.name, "AdminOverviewPanel");
      assert.equal(readinessReturnPanel?.props?.initialReadinessFocus, "demo_run");
      assert.equal(readinessReturnPanel?.props?.readinessReturned, true);
    } finally {
      (globalThis as { React?: typeof React }).React = previousReact;
    }

    assert.equal(membersNextUrl.pathname, "/service-accounts");
    assert.equal(membersNextUrl.searchParams.get("attention_workspace"), "console-smoke");
    assert.equal(membersNextUrl.searchParams.get("recent_owner_label"), "Console Owner");
  },
);
