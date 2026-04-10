import assert from "node:assert/strict";
import test from "node:test";

import {
  ControlPlaneRequestError,
  cancelBillingSubscription,
  createApiKey,
  completeBillingCheckoutSession,
  createBillingPortalSession,
  createRun,
  createServiceAccount,
  createToolProvider,
  createWorkspace,
  createWorkspaceInvitation,
  disableServiceAccount,
  downloadWorkspaceAuditExportViewModel,
  fetchAdminOverview,
  bootstrapWorkspace,
  fetchCurrentWorkspace,
  fetchWorkspaceDeliveryTrack,
  fetchWorkspaceDedicatedEnvironmentReadiness,
  fetchWorkspaceMembersViewModel,
  fetchRun,
  fetchRunArtifacts,
  fetchRunEvents,
  fetchRunGraph,
  fetchWorkspaceSsoReadiness,
  revokeApiKey,
  revokeWorkspaceInvitation,
  resumeBillingSubscription,
  rotateApiKey,
  saveWorkspaceDedicatedEnvironmentReadiness,
  saveWorkspaceDeliveryTrack,
  saveWorkspaceSsoReadiness,
  updateToolProviderStatus,
  acceptWorkspaceInvitation,
} from "../../services/control-plane";

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

function assertControlPlaneRequestError(
  error: unknown,
  expected: {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  },
): boolean {
  assert.equal(error instanceof ControlPlaneRequestError, true);
  if (!(error instanceof ControlPlaneRequestError)) {
    return false;
  }
  assert.equal(error.status, expected.status);
  assert.equal(error.code, expected.code);
  assert.equal(error.message, expected.message);
  if (expected.details) {
    for (const [key, value] of Object.entries(expected.details)) {
      assert.deepEqual(error.details[key], value);
    }
  }
  return true;
}

test("fetchAdminOverview adds live contract_meta when the API response omits it", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/admin/overview");
    return new Response(
      JSON.stringify({
        data: {
          summary: {
            organizations_total: 2,
            workspaces_total: 3,
            active_workspaces_total: 3,
            users_total: 5,
            paid_subscriptions_total: 1,
            past_due_subscriptions_total: 0,
          },
          plan_distribution: [],
          feature_rollout: {
            sso_enabled_workspaces: 1,
            audit_export_enabled_workspaces: 1,
            dedicated_environment_enabled_workspaces: 0,
          },
          recent_workspaces: [],
          updated_at: "2026-04-04T00:00:00.000Z",
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await fetchAdminOverview();
    assert.equal(result.summary.organizations_total, 2);
    assert.equal(result.contract_meta?.source, "live");
    assert.equal(result.contract_meta?.issue, null);
    assert.equal(typeof result.contract_meta?.normalized_at, "string");
  });
});

test("fetchAdminOverview preserves fallback contract_meta returned by the API route", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/admin/overview");
    return new Response(
      JSON.stringify({
        data: {
          summary: {
            organizations_total: 1,
            workspaces_total: 1,
            active_workspaces_total: 1,
            users_total: 1,
            paid_subscriptions_total: 0,
            past_due_subscriptions_total: 0,
          },
          plan_distribution: [],
          feature_rollout: {
            sso_enabled_workspaces: 0,
            audit_export_enabled_workspaces: 0,
            dedicated_environment_enabled_workspaces: 0,
          },
          recent_workspaces: [],
          updated_at: "2026-04-04T00:00:00.000Z",
          contract_meta: {
            source: "fallback_error",
            normalized_at: "2026-04-04T00:00:00.000Z",
            issue: {
              code: "admin_overview_preview_fallback",
              message: "Admin overview is showing preview fallback data until the live control-plane summary is available.",
              status: null,
              retryable: true,
              details: {
                path: "/api/v1/saas/admin/overview",
              },
            },
          },
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await fetchAdminOverview();
    assert.equal(result.contract_meta?.source, "fallback_error");
    assert.equal(result.contract_meta?.issue?.code, "admin_overview_preview_fallback");
  });
});

test("fetchAdminOverview returns preview fallback contract when the control plane base is missing", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/admin/overview");
    return new Response(
      JSON.stringify({
        error: {
          code: "control_plane_base_missing",
          message: "CONTROL_PLANE_BASE_URL is not configured",
        },
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await fetchAdminOverview();
    assert.equal(result.recent_workspaces[0]?.workspace_id, "ws_preview");
    assert.equal(result.contract_meta?.source, "fallback_control_plane_unavailable");
    assert.equal(result.contract_meta?.issue?.code, "control_plane_base_missing");
  });
});

test("fetchWorkspaceDeliveryTrack injects live contract_meta when the API response omits it", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/workspace/delivery");
    return new Response(
      JSON.stringify({
        data: {
          workspace_id: "ws_123",
          verification: {
            status: "pending",
            owner_user_id: null,
            notes: null,
            evidence_links: [],
            updated_at: "2026-04-04T00:00:00.000Z",
          },
          go_live: {
            status: "pending",
            owner_user_id: null,
            notes: null,
            evidence_links: [],
            updated_at: "2026-04-04T00:00:00.000Z",
          },
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await fetchWorkspaceDeliveryTrack();
    assert.equal(result.workspace_id, "ws_123");
    assert.equal(result.contract_meta?.source, "live");
    assert.equal(result.contract_meta?.issue, null);
  });
});

test("saveWorkspaceDeliveryTrack preserves contract_meta returned by the API route", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/delivery");
    assert.equal(init?.method, "POST");
    return new Response(
      JSON.stringify({
        data: {
          workspace_id: "ws_123",
          verification: {
            status: "complete",
            owner_user_id: "user_1",
            notes: "Verification closed",
            evidence_links: [],
            updated_at: "2026-04-04T00:00:00.000Z",
          },
          go_live: {
            status: "pending",
            owner_user_id: null,
            notes: null,
            evidence_links: [],
            updated_at: "2026-04-04T00:00:00.000Z",
          },
          contract_meta: {
            source: "fallback_error",
            normalized_at: "2026-04-04T00:00:00.000Z",
            issue: {
              code: "workspace_delivery_preview_fallback",
              message: "Delivery track is showing preview fallback data until the live control-plane response is available.",
              status: 503,
              retryable: true,
              details: {
                path: "/api/v1/saas/workspaces/ws_123/delivery",
              },
            },
          },
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await saveWorkspaceDeliveryTrack({
      workspace_id: "ws_123",
      verification: {
        status: "complete",
        owner_user_id: "user_1",
        notes: "Verification closed",
        evidence_links: [],
      },
      go_live: {
        status: "pending",
        owner_user_id: null,
        notes: null,
        evidence_links: [],
      },
    });
    assert.equal(result.contract_meta?.source, "fallback_error");
    assert.equal(result.contract_meta?.issue?.code, "workspace_delivery_preview_fallback");
  });
});

test("downloadWorkspaceAuditExportViewModel returns live contract with decoded filename on success", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/audit-events/export?format=jsonl&from=2026-04-01");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>)?.accept, "application/x-ndjson,application/json");

    return new Response("line-1\nline-2\n", {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson",
        "content-disposition": "attachment; filename*=UTF-8''audit%20events.jsonl",
      },
    });
  }, async () => {
    const result = await downloadWorkspaceAuditExportViewModel({
      format: "jsonl",
      from: "2026-04-01",
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error("Expected successful audit export result");
    }
    assert.equal(result.filename, "audit events.jsonl");
    assert.equal(result.format, "jsonl");
    assert.equal(result.content_type, "application/x-ndjson");
    assert.equal(result.contract_meta.source, "live");
    assert.equal(result.contract_meta.issue, null);
    assert.equal(result.blob.size > 0, true);
  });
});

test("downloadWorkspaceAuditExportViewModel maps workspace_feature_unavailable to fallback_feature_gate", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/workspace/audit-events/export");
    return new Response(
      JSON.stringify({
        error: {
          code: "workspace_feature_unavailable",
          message: "Feature is not enabled",
          details: { plan_code: "starter" },
        },
      }),
      {
        status: 409,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await downloadWorkspaceAuditExportViewModel();
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected failed audit export result");
    }
    assert.equal(result.error.code, "workspace_feature_unavailable");
    assert.equal(result.contract_meta.source, "fallback_feature_gate");
    assert.equal(result.contract_meta.issue?.status, 409);
  });
});

test("downloadWorkspaceAuditExportViewModel maps control_plane_base_missing to fallback_control_plane_unavailable", async () => {
  await withMockFetch(async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: "control_plane_base_missing",
          message: "Missing CONTROL_PLANE_BASE_URL",
        },
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await downloadWorkspaceAuditExportViewModel();
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected failed audit export result");
    }
    assert.equal(result.contract_meta.source, "fallback_control_plane_unavailable");
    assert.equal(result.error.code, "control_plane_base_missing");
    assert.equal(result.error.status, 503);
  });
});

test("downloadWorkspaceAuditExportViewModel maps generic request failure to fallback_error", async () => {
  await withMockFetch(async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: "request_failed",
          message: "Unexpected upstream failure",
        },
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await downloadWorkspaceAuditExportViewModel();
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected failed audit export result");
    }
    assert.equal(result.contract_meta.source, "fallback_error");
    assert.equal(result.error.code, "request_failed");
    assert.equal(result.error.retryable, true);
  });
});

test("downloadWorkspaceAuditExportViewModel maps transport failures to fallback_error contract", async () => {
  await withMockFetch(async () => {
    throw new Error("network down");
  }, async () => {
    const result = await downloadWorkspaceAuditExportViewModel();
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected failed audit export result");
    }
    assert.equal(result.contract_meta.source, "fallback_error");
    assert.equal(result.error.code, "request_failed");
    assert.equal(result.error.message, "network down");
    assert.equal(result.error.status, null);
    assert.equal(result.error.retryable, true);
    assert.equal(result.content_type, null);
  });
});

test("fetchWorkspaceSsoReadiness maps 409 workspace_feature_unavailable to fallback_feature_gate", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/workspace/sso");
    return new Response(
      JSON.stringify({
        error: {
          code: "workspace_feature_unavailable",
          message: "SSO is not available",
          details: { upgrade_href: "/settings?intent=upgrade", plan_code: "starter" },
        },
      }),
      {
        status: 409,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await fetchWorkspaceSsoReadiness();
    assert.equal(result.feature, "sso");
    assert.equal(result.contract_meta?.source, "fallback_feature_gate");
    assert.equal(result.feature_enabled, false);
    assert.equal(result.status, "staged");
    assert.equal(result.plan_code, "starter");
  });
});

test("fetchWorkspaceDedicatedEnvironmentReadiness maps 409 workspace_feature_unavailable to fallback_feature_gate", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/workspace/dedicated-environment");
    return new Response(
      JSON.stringify({
        error: {
          code: "workspace_feature_unavailable",
          message: "Dedicated environment is not available",
          details: { upgrade_href: "/settings?intent=upgrade", plan_code: "enterprise" },
        },
      }),
      {
        status: 409,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await fetchWorkspaceDedicatedEnvironmentReadiness();
    assert.equal(result.feature, "dedicated_environment");
    assert.equal(result.contract_meta?.source, "fallback_feature_gate");
    assert.equal(result.contract_meta?.issue?.code, "workspace_feature_unavailable");
    assert.equal(result.contract_meta?.issue?.message, "Dedicated environment is not available");
    assert.equal(result.upgrade_href, "/settings?intent=upgrade");
    assert.equal(result.plan_code, "enterprise");
  });
});

test("fetchWorkspaceDedicatedEnvironmentReadiness maps 503 control_plane_base_missing to fallback_control_plane_unavailable", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/workspace/dedicated-environment");
    return new Response(
      JSON.stringify({
        error: {
          code: "control_plane_base_missing",
          message: "Missing CONTROL_PLANE_BASE_URL",
        },
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await fetchWorkspaceDedicatedEnvironmentReadiness();
    assert.equal(result.feature, "dedicated_environment");
    assert.equal(result.contract_meta?.source, "fallback_control_plane_unavailable");
    assert.equal(result.feature_enabled, false);
    assert.equal(result.status, "staged");
    assert.equal(result.target_region, null);
  });
});

test("fetchWorkspaceSsoReadiness maps 503 control_plane_base_missing to fallback_control_plane_unavailable", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/workspace/sso");
    return new Response(
      JSON.stringify({
        error: {
          code: "control_plane_base_missing",
          message: "Missing CONTROL_PLANE_BASE_URL",
          details: {
            upgrade_href: "/settings?intent=upgrade&feature=sso",
            plan_code: "enterprise",
          },
        },
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await fetchWorkspaceSsoReadiness();
    assert.equal(result.feature, "sso");
    assert.equal(result.contract_meta?.source, "fallback_control_plane_unavailable");
    assert.equal(result.contract_meta?.issue?.code, "control_plane_base_missing");
    assert.equal(result.feature_enabled, false);
    assert.equal(result.status, "staged");
    assert.equal(result.upgrade_href, "/settings?intent=upgrade&feature=sso");
    assert.equal(result.plan_code, "enterprise");
  });
});

test("createBillingPortalSession posts return_url payload to portal route", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/billing/portal-sessions");
    assert.equal(init?.method, "POST");
    assert.equal(init?.headers?.["content-type"], "application/json");
    const body = init?.body as string | null | undefined;
    assert.ok(body);
    const parsed = JSON.parse(body ?? "{}");
    assert.equal(parsed.return_url, "https://govrail.net/settings?intent=manage-plan");

    return new Response(JSON.stringify({ data: { billing_provider: "stripe", portal_url: "sess", return_url: parsed.return_url } }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const portal = await createBillingPortalSession({ return_url: "https://govrail.net/settings?intent=manage-plan" });
    assert.equal(portal.return_url, "https://govrail.net/settings?intent=manage-plan");
    assert.equal(portal.billing_provider, "stripe");
    assert.equal(portal.portal_url, "sess");
  });
});

test("createBillingPortalSession posts empty payload when return_url is omitted", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/billing/portal-sessions");
    assert.equal(init?.method, "POST");
    const body = init?.body as string | null | undefined;
    assert.ok(body);
    const parsed = JSON.parse(body ?? "{}");
    assert.deepEqual(parsed, {});

    return new Response(JSON.stringify({ data: { billing_provider: "stripe", portal_url: "sess-no-return", return_url: null } }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const portal = await createBillingPortalSession();
    assert.equal(portal.return_url, null);
    assert.equal(portal.billing_provider, "stripe");
    assert.equal(portal.portal_url, "sess-no-return");
  });
});

test("createBillingPortalSession surface structured errors when portal unavailable", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/billing/portal-sessions");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)?.["content-type"], "application/json");
    return new Response(
      JSON.stringify({
        error: {
          code: "billing_provider_portal_unavailable",
          message: "Provider portal is not yet available",
          details: {
            provider: "stripe",
          },
        },
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    await assert.rejects(
      async () => createBillingPortalSession({ return_url: "https://govrail.net/settings?intent=manage-plan" }),
      (error: unknown) => {
        assert.equal(error instanceof ControlPlaneRequestError, true);
        if (!(error instanceof ControlPlaneRequestError)) {
          return false;
        }
        assert.equal(error.status, 503);
        assert.equal(error.code, "billing_provider_portal_unavailable");
        assert.equal(error.message, "Provider portal is not yet available");
        assert.equal(error.details.provider, "stripe");
        return true;
      },
    );
  });
});

test("createBillingPortalSession surfaces structured errors when portal flow is not implemented for provider", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/billing/portal-sessions");
    assert.equal(init?.method, "POST");
    return new Response(
      JSON.stringify({
        error: {
          code: "billing_provider_portal_unimplemented",
          message: "Customer portal creation is not implemented for this billing provider",
          details: {
            billing_provider: "manual",
          },
        },
      }),
      {
        status: 409,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    await assert.rejects(
      async () => createBillingPortalSession({ return_url: "https://govrail.net/settings?intent=manage-plan" }),
      (error: unknown) => {
        assert.equal(error instanceof ControlPlaneRequestError, true);
        if (!(error instanceof ControlPlaneRequestError)) {
          return false;
        }
        assert.equal(error.status, 409);
        assert.equal(error.code, "billing_provider_portal_unimplemented");
        assert.equal(error.message, "Customer portal creation is not implemented for this billing provider");
        assert.equal(error.details.billing_provider, "manual");
        return true;
      },
    );
  });
});

test("completeBillingCheckoutSession surfaces structured errors when completion deferred", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(
      String(input),
      "/api/control-plane/workspace/billing/checkout-sessions/chk_deferred/complete",
    );
    assert.equal(init?.method, "POST");
    return new Response(
      JSON.stringify({
        error: {
          code: "billing_checkout_completion_deferred",
          message: "This checkout session must be finalized by its billing provider webhook flow",
          details: {
            billing_provider: "stripe",
          },
        },
      }),
      {
        status: 409,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    await assert.rejects(
      async () => completeBillingCheckoutSession("chk_deferred"),
      (error: unknown) => {
        if (!(error instanceof ControlPlaneRequestError)) {
          return false;
        }
        assert.equal(error.status, 409);
        assert.equal(error.code, "billing_checkout_completion_deferred");
        assert.equal(
          error.message,
          "This checkout session must be finalized by its billing provider webhook flow",
        );
        assert.equal(error.details.billing_provider, "stripe");
        return true;
      },
    );
  });
});

test("cancelBillingSubscription surfaces structured errors when subscription missing", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/billing/subscription/cancel");
    assert.equal(init?.method, "POST");
    return new Response(
      JSON.stringify({
        error: {
          code: "billing_subscription_missing",
          message: "No billing subscription can be resolved for this workspace",
          details: {
            workspace_id: "ws_not_found",
          },
        },
      }),
      {
        status: 404,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    await assert.rejects(
      async () => cancelBillingSubscription(),
      (error: unknown) => {
        if (!(error instanceof ControlPlaneRequestError)) {
          return false;
        }
        assert.equal(error.status, 404);
        assert.equal(error.code, "billing_subscription_missing");
        assert.equal(error.message, "No billing subscription can be resolved for this workspace");
        assert.equal(error.details.workspace_id, "ws_not_found");
        return true;
      },
    );
  });
});

test("cancelBillingSubscription surfaces structured errors when subscription is provider managed", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/billing/subscription/cancel");
    assert.equal(init?.method, "POST");
    return new Response(
      JSON.stringify({
        error: {
          code: "billing_subscription_managed_by_provider",
          message:
            "This subscription is managed by the billing provider portal. Open the billing portal to change cancellation settings.",
          details: {
            billing_provider: "stripe",
            manage_plan_href: "/settings?intent=manage-plan",
          },
        },
      }),
      {
        status: 409,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    await assert.rejects(
      async () => cancelBillingSubscription(),
      (error: unknown) => {
        if (!(error instanceof ControlPlaneRequestError)) {
          return false;
        }
        assert.equal(error.status, 409);
        assert.equal(error.code, "billing_subscription_managed_by_provider");
        assert.equal(
          error.message,
          "This subscription is managed by the billing provider portal. Open the billing portal to change cancellation settings.",
        );
        assert.equal(error.details.billing_provider, "stripe");
        assert.equal(error.details.manage_plan_href, "/settings?intent=manage-plan");
        return true;
      },
    );
  });
});

test("resumeBillingSubscription surfaces structured errors when no paused subscription exists", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/billing/subscription/resume");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)?.["content-type"], "application/json");
    return new Response(
      JSON.stringify({
        error: {
          code: "billing_subscription_not_paused",
          message: "Subscription is not paused and cannot be resumed",
          details: {
            workspace_id: "ws_not_paused",
          },
        },
      }),
      {
        status: 409,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    await assert.rejects(
      async () => resumeBillingSubscription(),
      (error: unknown) => {
        if (!(error instanceof ControlPlaneRequestError)) {
          return false;
        }
        assert.equal(error.status, 409);
        assert.equal(error.code, "billing_subscription_not_paused");
        assert.equal(error.message, "Subscription is not paused and cannot be resumed");
        assert.equal(error.details.workspace_id, "ws_not_paused");
        return true;
      },
    );
  });
});

test("resumeBillingSubscription surfaces structured errors when subscription is not resumable", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/billing/subscription/resume");
    assert.equal(init?.method, "POST");
    return new Response(
      JSON.stringify({
        error: {
          code: "billing_subscription_not_resumable",
          message: "This subscription must be replaced through checkout before it can become active again",
          details: {
            billing_provider: "stripe",
          },
        },
      }),
      {
        status: 409,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    await assert.rejects(
      async () => resumeBillingSubscription(),
      (error: unknown) => {
        if (!(error instanceof ControlPlaneRequestError)) {
          return false;
        }
        assert.equal(error.status, 409);
        assert.equal(error.code, "billing_subscription_not_resumable");
        assert.equal(
          error.message,
          "This subscription must be replaced through checkout before it can become active again",
        );
        assert.equal(error.details.billing_provider, "stripe");
        return true;
      },
    );
  });
});

test("resumeBillingSubscription surfaces structured errors when subscription missing", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/billing/subscription/resume");
    assert.equal(init?.method, "POST");
    return new Response(
      JSON.stringify({
        error: {
          code: "billing_subscription_missing",
          message: "No billing subscription can be resolved for this workspace",
          details: {
            workspace_id: "ws_not_found",
          },
        },
      }),
      {
        status: 404,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    await assert.rejects(
      async () => resumeBillingSubscription(),
      (error: unknown) => {
        if (!(error instanceof ControlPlaneRequestError)) {
          return false;
        }
        assert.equal(error.status, 404);
        assert.equal(error.code, "billing_subscription_missing");
        assert.equal(error.message, "No billing subscription can be resolved for this workspace");
        assert.equal(error.details.workspace_id, "ws_not_found");
        return true;
      },
    );
  });
});

test("fetchWorkspaceMembersViewModel returns live contract on success", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/members");
    assert.equal((init?.headers as Record<string, string>)?.accept, "application/json");

    return new Response(
      JSON.stringify({
        data: {
          items: [
            {
              user_id: "user_1",
              email: "member@govrail.dev",
              display_name: "Member One",
              role: "admin",
              status: "active",
              joined_at: "2026-04-01T00:00:00.000Z",
            },
          ],
          page_info: {
            next_cursor: null,
          },
        },
        meta: {
          request_id: "req_members_live",
          trace_id: "trace_members_live",
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await fetchWorkspaceMembersViewModel();
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.user_id, "user_1");
    assert.equal(result.contract.source, "live");
    assert.equal(result.contract.code, null);
    assert.equal(result.contract.status, 200);
    assert.equal(result.contract.retryable, false);
  });
});

test("fetchWorkspaceMembersViewModel maps 412 workspace_context_not_metadata contract", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/members");
    return new Response(
      JSON.stringify({
        error: {
          code: "workspace_context_not_metadata",
          message: "Workspace context is not metadata-backed",
          details: {
            workspace_id: "ws_not_metadata",
          },
        },
      }),
      {
        status: 412,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await fetchWorkspaceMembersViewModel();
    assert.deepEqual(result.items, []);
    assert.equal(result.contract.source, "workspace_context_not_metadata");
    assert.equal(result.contract.code, "workspace_context_not_metadata");
    assert.equal(result.contract.status, 412);
    assert.equal(result.contract.retryable, false);
    assert.equal(result.contract.details.workspace_id, "ws_not_metadata");
  });
});

test("fetchWorkspaceMembersViewModel maps generic request failure to fallback_error", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/members");
    return new Response(
      JSON.stringify({
        error: {
          code: "request_failed",
          message: "Upstream members API failed",
          details: {
            request_id: "req_members_500",
          },
        },
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await fetchWorkspaceMembersViewModel();
    assert.deepEqual(result.items, []);
    assert.equal(result.contract.source, "fallback_error");
    assert.equal(result.contract.code, "request_failed");
    assert.equal(result.contract.status, 500);
    assert.equal(result.contract.retryable, true);
    assert.equal(result.contract.details.request_id, "req_members_500");
  });
});

test("fetchWorkspaceMembersViewModel maps 409 workspace_feature_unavailable to fallback_feature_gate contract", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/members");
    return new Response(
      JSON.stringify({
        error: {
          code: "workspace_feature_unavailable",
          message: "Members surface is feature-gated on this plan",
          details: {
            plan_code: "starter",
            upgrade_href: "/settings?intent=upgrade",
          },
        },
      }),
      {
        status: 409,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await fetchWorkspaceMembersViewModel();
    assert.deepEqual(result.items, []);
    assert.equal(result.contract.source, "fallback_feature_gate");
    assert.equal(result.contract.code, "workspace_feature_unavailable");
    assert.equal(result.contract.status, 409);
    assert.equal(result.contract.retryable, false);
    assert.equal(result.contract.details.plan_code, "starter");
    assert.equal(result.contract.details.upgrade_href, "/settings?intent=upgrade");
  });
});

test("fetchWorkspaceMembersViewModel maps 503 control_plane_base_missing to fallback_control_plane_unavailable contract", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/members");
    return new Response(
      JSON.stringify({
        error: {
          code: "control_plane_base_missing",
          message: "Missing CONTROL_PLANE_BASE_URL",
          details: {
            env_var: "CONTROL_PLANE_BASE_URL",
          },
        },
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await fetchWorkspaceMembersViewModel();
    assert.deepEqual(result.items, []);
    assert.equal(result.contract.source, "fallback_control_plane_unavailable");
    assert.equal(result.contract.code, "control_plane_base_missing");
    assert.equal(result.contract.status, 503);
    assert.equal(result.contract.retryable, true);
    assert.equal(result.contract.details.env_var, "CONTROL_PLANE_BASE_URL");
  });
});

test("saveWorkspaceSsoReadiness returns normalized live readiness on success", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/sso");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)?.accept, "application/json");
    assert.equal((init?.headers as Record<string, string>)?.["content-type"], "application/json");

    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    assert.equal(body.enabled, true);
    assert.equal(body.provider_type, "oidc");

    return new Response(
      JSON.stringify({
        data: {
          feature_enabled: true,
          status: "configured",
          provider_type: "oidc",
          supported_protocols: ["oidc", "invalid"],
          email_domains: ["example.com", "example.com", ""],
          email_domain: "legacy.example.com",
        },
        meta: {
          request_id: "req_save_sso",
          trace_id: "trace_save_sso",
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await saveWorkspaceSsoReadiness({
      enabled: true,
      provider_type: "oidc",
      email_domains: ["example.com"],
    });

    assert.equal(result.feature, "sso");
    assert.equal(result.feature_enabled, true);
    assert.equal(result.status, "configured");
    assert.equal(result.connection_mode, "workspace");
    assert.deepEqual(result.supported_protocols, ["oidc"]);
    assert.deepEqual(result.email_domains, ["example.com", "legacy.example.com"]);
    assert.equal(result.contract_meta?.source, "live");
    assert.equal(result.contract_meta?.issue, null);
    assert.equal(typeof result.contract_meta?.normalized_at, "string");
  });
});

test("saveWorkspaceSsoReadiness throws ControlPlaneRequestError on non-2xx response", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/sso");
    assert.equal(init?.method, "POST");

    return new Response(
      JSON.stringify({
        error: {
          code: "workspace_feature_unavailable",
          message: "SSO is unavailable on current plan",
          details: {
            plan_code: "starter",
            upgrade_href: "/settings?intent=upgrade",
          },
        },
      }),
      {
        status: 409,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    await assert.rejects(
      async () =>
        saveWorkspaceSsoReadiness({
          enabled: true,
          provider_type: "oidc",
        }),
      (error: unknown) => {
        assert.equal(error instanceof ControlPlaneRequestError, true);
        if (!(error instanceof ControlPlaneRequestError)) {
          return false;
        }
        assert.equal(error.status, 409);
        assert.equal(error.code, "workspace_feature_unavailable");
        assert.equal(error.message, "SSO is unavailable on current plan");
        assert.equal(error.details.plan_code, "starter");
        assert.equal(error.details.upgrade_href, "/settings?intent=upgrade");
        return true;
      },
    );
  });
});

test("saveWorkspaceSsoReadiness keeps idempotency conflict details on conflicting retries", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/sso");
    assert.equal(init?.method, "POST");

    return new Response(
      JSON.stringify({
        error: {
          code: "idempotency_conflict",
          message: "Idempotency key was already used for another payload",
          details: {
            route: "/api/v1/saas/workspaces/ws_123/sso",
            idempotency_key: "web-existing",
          },
        },
      }),
      {
        status: 409,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    await assert.rejects(
      async () =>
        saveWorkspaceSsoReadiness({
          enabled: true,
          provider_type: "oidc",
          metadata_url: "https://idp.example.com/.well-known/openid-configuration",
        }),
      (error: unknown) => {
        assert.equal(error instanceof ControlPlaneRequestError, true);
        if (!(error instanceof ControlPlaneRequestError)) {
          return false;
        }
        assert.equal(error.status, 409);
        assert.equal(error.code, "idempotency_conflict");
        assert.equal(error.message, "Idempotency key was already used for another payload");
        assert.equal(error.details.route, "/api/v1/saas/workspaces/ws_123/sso");
        assert.equal(error.details.idempotency_key, "web-existing");
        return true;
      },
    );
  });
});

test("saveWorkspaceDedicatedEnvironmentReadiness throws ControlPlaneRequestError on non-2xx response", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/dedicated-environment");
    assert.equal(init?.method, "POST");

    return new Response(
      JSON.stringify({
        error: {
          code: "control_plane_base_missing",
          message: "Missing CONTROL_PLANE_BASE_URL",
          details: {
            env_var: "CONTROL_PLANE_BASE_URL",
          },
        },
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    await assert.rejects(
      async () =>
        saveWorkspaceDedicatedEnvironmentReadiness({
          enabled: true,
          target_region: "us-east-1",
        }),
      (error: unknown) => {
        assert.equal(error instanceof ControlPlaneRequestError, true);
        if (!(error instanceof ControlPlaneRequestError)) {
          return false;
        }
        assert.equal(error.status, 503);
        assert.equal(error.code, "control_plane_base_missing");
        assert.equal(error.message, "Missing CONTROL_PLANE_BASE_URL");
        assert.equal(error.details.env_var, "CONTROL_PLANE_BASE_URL");
        return true;
      },
    );
  });
});

test("saveWorkspaceDedicatedEnvironmentReadiness keeps admin-access denial details on 403 response", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/dedicated-environment");
    assert.equal(init?.method, "POST");

    return new Response(
      JSON.stringify({
        error: {
          code: "workspace_admin_required",
          message: "Only workspace owners or admins can configure dedicated environment delivery",
          details: {
            required_roles: ["workspace_owner", "workspace_admin"],
            workspace_id: "ws_123",
          },
        },
      }),
      {
        status: 403,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    await assert.rejects(
      async () =>
        saveWorkspaceDedicatedEnvironmentReadiness({
          enabled: true,
          deployment_model: "single_tenant",
          target_region: "us-east-1",
          requester_email: "owner@govrail.dev",
        }),
      (error: unknown) => {
        assert.equal(error instanceof ControlPlaneRequestError, true);
        if (!(error instanceof ControlPlaneRequestError)) {
          return false;
        }
        assert.equal(error.status, 403);
        assert.equal(error.code, "workspace_admin_required");
        assert.equal(
          error.message,
          "Only workspace owners or admins can configure dedicated environment delivery",
        );
        assert.deepEqual(error.details.required_roles, ["workspace_owner", "workspace_admin"]);
        assert.equal(error.details.workspace_id, "ws_123");
        return true;
      },
    );
  });
});

test("saveWorkspaceDedicatedEnvironmentReadiness returns normalized live readiness on success", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/workspace/dedicated-environment");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)?.accept, "application/json");
    assert.equal((init?.headers as Record<string, string>)?.["content-type"], "application/json");

    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    assert.equal(body.enabled, true);
    assert.equal(body.deployment_model, "single_tenant");
    assert.equal(body.target_region, "us-east-1");
    assert.equal(body.data_classification, "restricted");
    assert.equal(body.requester_email, "owner@govrail.dev");

    return new Response(
      JSON.stringify({
        data: {
          feature_enabled: true,
          status: "configured",
          deployment_model: "single_tenant",
          target_region: "us-east-1",
          requester_email: "owner@govrail.dev",
          data_classification: "restricted",
          requested_capacity: "6 vCPU / 16 GB",
          requested_sla: "99.9% / 24x7",
          network_boundary: "private-vpc-only",
          compliance_notes: "SOC2 + data residency review",
          notes: "Dedicated intake accepted",
        },
        meta: {
          request_id: "req_save_dedicated",
          trace_id: "trace_save_dedicated",
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }, async () => {
    const result = await saveWorkspaceDedicatedEnvironmentReadiness({
      enabled: true,
      deployment_model: "single_tenant",
      target_region: "us-east-1",
      requester_email: "owner@govrail.dev",
      data_classification: "restricted",
      requested_capacity: "6 vCPU / 16 GB",
      requested_sla: "99.9% / 24x7",
      network_boundary: "private-vpc-only",
      compliance_notes: "SOC2 + data residency review",
      notes: "Dedicated intake accepted",
    });

    assert.equal(result.feature, "dedicated_environment");
    assert.equal(result.feature_enabled, true);
    assert.equal(result.status, "configured");
    assert.equal(result.deployment_model, "single_tenant");
    assert.equal(result.target_region, "us-east-1");
    assert.equal(result.requester_email, "owner@govrail.dev");
    assert.equal(result.data_classification, "restricted");
    assert.equal(result.requested_capacity, "6 vCPU / 16 GB");
    assert.equal(result.requested_sla, "99.9% / 24x7");
    assert.equal(result.network_boundary, "private-vpc-only");
    assert.equal(result.compliance_notes, "SOC2 + data residency review");
    assert.equal(result.notes, "Dedicated intake accepted");
    assert.equal(result.contract_meta?.source, "live");
    assert.equal(result.contract_meta?.issue, null);
    assert.equal(typeof result.contract_meta?.normalized_at, "string");
  });
});

test("createRun posts JSON body and returns result", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/runs");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)?.accept, "application/json");
    assert.equal((init?.headers as Record<string, string>)?.["content-type"], "application/json");
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    assert.deepEqual(body.input, { kind: "user_instruction", text: "Ship it" });

    return new Response(JSON.stringify({ data: {
      run_id: "run_123",
      status: "queued",
      workflow_status: "queued",
      coordinator_id: "coord_123",
      trace_id: "trace_123",
      created_at: "2026-04-04T00:00:00.000Z",
    } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const result = await createRun({ input: { kind: "user_instruction", text: "Ship it" } });
    assert.equal(result.run_id, "run_123");
    assert.equal(result.status, "queued");
  });
});

test("fetchRun and fetchRunGraph target stable detail endpoints", async () => {
  const calls: string[] = [];

  await withMockFetch(async (input) => {
    calls.push(String(input));
    return new Response(
      JSON.stringify({
        data: {
          run_id: "run_123",
          status: "running",
          workflow_status: "running",
          trace_id: "trace_123",
          created_at: "2026-04-04T00:00:00.000Z",
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }, async () => {
    await fetchRun("run_123");
    await fetchRunGraph("run_123");
  });

  assert.deepEqual(calls, [
    "/api/control-plane/runs/run_123",
    "/api/control-plane/runs/run_123/graph",
  ]);
});

test("fetchRunEvents normalizes page_size and preserves cursor query semantics", async () => {
  await withMockFetch(async (input) => {
    assert.equal(
      String(input),
      "/api/control-plane/runs/run_123/events?page_size=25&cursor=cursor_abc",
    );
    return new Response(
      JSON.stringify({
        data: {
          items: [],
          page_info: {
            next_cursor: null,
          },
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }, async () => {
    const result = await fetchRunEvents("run_123", {
      page_size: 25.9,
      cursor: "cursor_abc",
    });
    assert.deepEqual(result.items, []);
    assert.equal(result.page_info.next_cursor, null);
  });
});

test("fetchRunArtifacts omits invalid page_size and empty cursor query values", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/runs/run_123/artifacts");
    return new Response(
      JSON.stringify({
        data: {
          items: [],
          page_info: {
            next_cursor: null,
          },
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }, async () => {
    const result = await fetchRunArtifacts("run_123", {
      page_size: 0,
      cursor: "",
    });
    assert.deepEqual(result.items, []);
    assert.equal(result.page_info.next_cursor, null);
  });
});

test("createWorkspace uses custom fallback message and code on non-2xx response", async () => {
  await withMockFetch(async () => new Response("{}", { status: 500, headers: { "content-type": "application/json" } }), async () => {
    await assert.rejects(
      async () =>
        createWorkspace({
          organization_id: "org_123",
          slug: "Acme Workspace",
          display_name: "Acme Workspace",
        }),
      (error: unknown) =>
        assertControlPlaneRequestError(error, {
          status: 500,
          code: "workspace_create_failed",
          message: "Workspace creation failed. Check slug uniqueness and organization access, then retry.",
        }),
    );
  });
});

test("bootstrapWorkspace uses custom fallback message and code on non-2xx response", async () => {
  await withMockFetch(async () => new Response("{}", { status: 503, headers: { "content-type": "application/json" } }), async () => {
    await assert.rejects(
      async () => bootstrapWorkspace("ws_bootstrap"),
      (error: unknown) =>
        assertControlPlaneRequestError(error, {
          status: 503,
          code: "workspace_bootstrap_failed",
          message: "Workspace bootstrap failed. Verify permissions and workspace state before retrying.",
        }),
    );
  });
});

test("createApiKey surfaces structured ControlPlaneRequestError on non-2xx response", async () => {
  await withMockFetch(async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: "api_key_limit_reached",
          message: "API key limit reached",
          details: { limit: 5 },
        },
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }, async () => {
    await assert.rejects(
      async () => createApiKey({ scope: ["runs:write"] }),
      (error: unknown) =>
        assertControlPlaneRequestError(error, {
          status: 409,
          code: "api_key_limit_reached",
          message: "API key limit reached",
          details: { limit: 5 },
        }),
    );
  });
});

test("revokeApiKey posts empty body and returns payload", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/api-keys/key_123/revoke");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body ?? "{}")), {});
    return new Response(JSON.stringify({ data: { api_key_id: "key_123", status: "revoked" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const result = await revokeApiKey("key_123");
    assert.equal(result.api_key_id, "key_123");
    assert.equal(result.status, "revoked");
  });
});

test("rotateApiKey posts rotation payload and returns payload", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/api-keys/key_123/rotate");
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    assert.deepEqual(body.scope, ["runs:write"]);
    return new Response(JSON.stringify({ data: {
      previous_api_key: { api_key_id: "key_123", service_account_id: null, name: "old", scope: [], status: "revoked", created_at: "2026-04-04T00:00:00.000Z", expires_at: null, last_used_at: null },
      api_key: { api_key_id: "key_456", service_account_id: null, name: "new", scope: ["runs:write"], status: "active", created_at: "2026-04-04T00:00:00.000Z", expires_at: null, last_used_at: null },
      secret_key: "tok_rotated",
      rotated_from_api_key_id: "key_123",
    } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const result = await rotateApiKey("key_123", { scope: ["runs:write"] });
    assert.equal(result.api_key.api_key_id, "key_456");
    assert.equal(result.secret_key, "tok_rotated");
  });
});

test("createServiceAccount surfaces structured ControlPlaneRequestError on non-2xx response", async () => {
  await withMockFetch(async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: "service_account_limit_reached",
          message: "Service account limit reached",
        },
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }, async () => {
    await assert.rejects(
      async () => createServiceAccount({ name: "Ops Bot" }),
      (error: unknown) =>
        assertControlPlaneRequestError(error, {
          status: 409,
          code: "service_account_limit_reached",
          message: "Service account limit reached",
        }),
    );
  });
});

test("disableServiceAccount posts empty body and returns payload", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/service-accounts/sa_123/disable");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body ?? "{}")), {});
    return new Response(JSON.stringify({ data: { service_account_id: "sa_123", status: "disabled" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const result = await disableServiceAccount("sa_123");
    assert.equal(result.service_account_id, "sa_123");
    assert.equal(result.status, "disabled");
  });
});

test("createWorkspaceInvitation surfaces structured ControlPlaneRequestError on non-2xx response", async () => {
  await withMockFetch(async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: "invitation_limit_reached",
          message: "Invitation limit reached",
        },
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }, async () => {
    await assert.rejects(
      async () => createWorkspaceInvitation({ email: "owner@example.com" }),
      (error: unknown) =>
        assertControlPlaneRequestError(error, {
          status: 409,
          code: "invitation_limit_reached",
          message: "Invitation limit reached",
        }),
    );
  });
});

test("revokeWorkspaceInvitation posts empty body and returns payload", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/invitations/invite_123/revoke");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body ?? "{}")), {});
    return new Response(JSON.stringify({ data: { invitation_id: "invite_123", status: "revoked" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const result = await revokeWorkspaceInvitation("invite_123");
    assert.equal(result.invitation_id, "invite_123");
    assert.equal(result.status, "revoked");
  });
});

test("acceptWorkspaceInvitation posts invite token and returns payload", async () => {
  await withMockFetch(async (input, init) => {
    assert.equal(String(input), "/api/control-plane/invitations/accept");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body ?? "{}")), { invite_token: "invite_token_123" });
    return new Response(JSON.stringify({ data: {
      invitation: {
        invitation_id: "invite_123",
        organization_id: "org_123",
        workspace_id: "ws_123",
        email: "owner@example.com",
        role: "owner",
        status: "accepted",
        invited_by_user_id: null,
        invited_by_email: null,
        invited_by_display_name: null,
        expires_at: "2026-05-01T00:00:00.000Z",
        accepted_by_user_id: "usr_123",
        accepted_at: "2026-04-04T00:00:00.000Z",
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-04T00:00:00.000Z",
      },
      workspace: {
        workspace_id: "ws_123",
        organization_id: "org_123",
        organization_slug: "org",
        organization_display_name: "Org",
        slug: "workspace",
        display_name: "Workspace",
      },
      membership: {
        role: "owner",
        status: "active",
        joined_at: "2026-04-04T00:00:00.000Z",
      },
    } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const result = await acceptWorkspaceInvitation("invite_token_123");
    assert.equal(result.workspace.workspace_id, "ws_123");
    assert.equal(result.membership.status, "active");
  });
});

test("acceptWorkspaceInvitation surfaces structured ControlPlaneRequestError for disabled workspace and seat-limit flows", async () => {
  await withMockFetch(async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: "invalid_state_transition",
          message: "Invitation workspace is not active",
          details: {
            workspace_id: "ws_123",
            workspace_status: "disabled",
          },
        },
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }, async () => {
    await assert.rejects(
      async () => acceptWorkspaceInvitation("invite_token_disabled"),
      (error: unknown) =>
        assertControlPlaneRequestError(error, {
          status: 409,
          code: "invalid_state_transition",
          message: "Invitation workspace is not active",
          details: {
            workspace_id: "ws_123",
            workspace_status: "disabled",
          },
        }),
    );
  });

  await withMockFetch(async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: "plan_limit_exceeded",
          message: "Workspace has reached the member seat limit",
          details: {
            scope: "member_seats",
            used: 3,
            limit: 3,
            remaining: 0,
            workspace_id: "ws_123",
            plan_id: "plan_free",
            plan_code: "free",
            upgrade_href: "/settings?intent=upgrade",
          },
        },
      }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
  }, async () => {
    await assert.rejects(
      async () => acceptWorkspaceInvitation("invite_token_seat_limit"),
      (error: unknown) =>
        assertControlPlaneRequestError(error, {
          status: 429,
          code: "plan_limit_exceeded",
          message: "Workspace has reached the member seat limit",
          details: {
            scope: "member_seats",
            used: 3,
            limit: 3,
            remaining: 0,
            workspace_id: "ws_123",
            plan_id: "plan_free",
            plan_code: "free",
            upgrade_href: "/settings?intent=upgrade",
          },
        }),
    );
  });
});

test("createToolProvider attaches plan-limit metadata to structured error", async () => {
  await withMockFetch(async () => {
    return new Response(
      JSON.stringify({
        error: {
          code: "plan_limit_exceeded",
          message: "Provider limit reached",
          details: {
            scope: "tool_providers",
            used: 5,
            limit: 5,
            remaining: 0,
            plan_id: "plan_free",
            plan_code: "free",
            upgrade_href: "/settings?intent=upgrade",
            period_start: "2026-04-15T00:00:00.000Z",
            period_end: "2026-05-15T00:00:00.000Z",
          },
        },
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }, async () => {
    await assert.rejects(
      async () =>
        createToolProvider({
          name: "Webhook Provider",
          provider_type: "http_api",
          endpoint_url: "https://provider.example.com",
        }),
      (error: unknown) => {
        assertControlPlaneRequestError(error, {
          status: 409,
          code: "plan_limit_exceeded",
          message: "Provider limit reached",
        });
        assert.deepEqual((error as ControlPlaneRequestError & { planLimit?: unknown }).planLimit, {
          scope: "tool_providers",
          used: 5,
          limit: 5,
          remaining: 0,
          planId: "plan_free",
          planCode: "free",
          upgradeHref: "/settings?intent=upgrade",
          periodStart: "2026-04-15T00:00:00.000Z",
          periodEnd: "2026-05-15T00:00:00.000Z",
          message: "Provider limit reached",
        });
        return true;
      },
    );
  });
});

test("updateToolProviderStatus targets activate and disable routes with planLimit passthrough", async () => {
  const seen: string[] = [];
  await withMockFetch(async (input, init) => {
    seen.push(`${String(input)} ${init?.method ?? "GET"}`);
    return new Response(
      JSON.stringify({
        data: {
          tool_provider_id: "tp_123",
          tenant_id: "tenant_123",
          name: "Webhook Provider",
          provider_type: "http_api",
          endpoint_url: "https://provider.example.com",
          auth_ref: null,
          visibility_policy_ref: null,
          execution_policy_ref: null,
          status: String(input).endsWith("/disable") ? "disabled" : "active",
          created_at: "2026-04-04T00:00:00.000Z",
          updated_at: "2026-04-04T00:00:00.000Z",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }, async () => {
    const activated = await updateToolProviderStatus("tp_123", "active");
    const disabled = await updateToolProviderStatus("tp_123", "disabled");
    assert.equal(activated.data.status, "active");
    assert.equal(activated.planLimit, null);
    assert.equal(disabled.data.status, "disabled");
    assert.equal(disabled.planLimit, null);
  });

  assert.deepEqual(seen, [
    "/api/control-plane/tool-providers/tp_123 POST",
    "/api/control-plane/tool-providers/tp_123/disable POST",
  ]);
});

test("fetchCurrentWorkspace preserves persisted onboarding summary fields while normalizing visible surfaces", async () => {
  await withMockFetch(async (input) => {
    assert.equal(String(input), "/api/control-plane/workspace");
    return new Response(
      JSON.stringify({
        data: {
          workspace: {
            workspace_id: "ws_123",
            organization_id: "org_123",
            organization_slug: "org",
            organization_display_name: "Org",
            tenant_id: "tenant_123",
            slug: "alpha",
            display_name: "Alpha",
            status: "active",
            created_at: "2026-04-01T00:00:00.000Z",
            updated_at: "2026-04-04T00:00:00.000Z",
          },
          plan: null,
          subscription: null,
          billing_summary: {
            provider: "stripe",
            provider_customer_id: null,
            provider_subscription_id: null,
            provider_status: null,
            billing_email: null,
            current_period_start: null,
            current_period_end: null,
            cancel_at_period_end: false,
            trial_ends_at: null,
          },
          billing_providers: [],
          usage: {
            window_start: "2026-04-01T00:00:00.000Z",
            window_end: "2026-05-01T00:00:00.000Z",
            runs_count: 0,
            active_providers: 2,
            storage_bytes: 0,
          },
          onboarding: {
            status: "baseline_ready",
            checklist: {
              workspace_created: true,
              baseline_ready: true,
              service_account_created: false,
              api_key_created: false,
              demo_run_created: false,
              demo_run_succeeded: false,
            },
            summary: {
              providers_total: 2,
              policies_total: 2,
              providers_created: 1,
              providers_existing: 1,
              policies_created: 2,
              policies_existing: 0,
              service_accounts_total: 0,
              api_keys_total: 0,
              demo_runs_total: 0,
            },
            latest_demo_run: null,
            latest_demo_run_hint: {
              status_label: "Bootstrap ready",
              is_terminal: false,
              needs_attention: false,
              suggested_action: "Create a demo credential",
            },
            next_actions: ["Create a service account", "Create an API key"],
            blockers: [
              {
                code: "service_account_required",
                severity: "blocking",
                message: "Create a service account before the first demo run.",
                surface: "service-accounts",
                retryable: true,
              },
            ],
            recommended_next: {
              surface: "go-live",
              action: "Finish the launch checklist",
              reason: "Bootstrap completed and the workspace is ready for delivery planning.",
            },
            recommended_next_surface: "service-accounts",
            recommended_next_action: "Ignored legacy action",
            recommended_next_reason: "Ignored legacy reason",
            delivery_guidance: {
              verification_status: "in_progress",
              go_live_status: "pending",
              next_surface: "go-live",
              summary: "Verification is in progress before go-live.",
              updated_at: "2026-04-04T00:00:00.000Z",
            },
          },
          members: [],
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }, async () => {
    const result = await fetchCurrentWorkspace();
    assert.equal(result.onboarding.summary.providers_created, 1);
    assert.equal(result.onboarding.summary.providers_existing, 1);
    assert.equal(result.onboarding.summary.policies_created, 2);
    assert.equal(result.onboarding.blockers?.[0]?.surface, "service_accounts");
    assert.equal(result.onboarding.recommended_next?.surface, "go_live");
    assert.equal(result.onboarding.recommended_next_surface, "go_live");
    assert.equal(result.onboarding.recommended_next_action, "Finish the launch checklist");
    assert.equal(
      result.onboarding.recommended_next_reason,
      "Bootstrap completed and the workspace is ready for delivery planning.",
    );
    assert.equal(result.onboarding.delivery_guidance?.next_surface, "go_live");
    assert.deepEqual(result.onboarding.latest_demo_run_hint, {
      status_label: "Bootstrap ready",
      is_terminal: false,
      needs_attention: false,
      suggested_action: "Create a demo credential",
    });
  });
});
