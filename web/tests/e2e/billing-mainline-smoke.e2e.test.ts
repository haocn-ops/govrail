import assert from "node:assert/strict";
import test from "node:test";

import {
  completeBillingCheckoutSession,
  ControlPlaneRequestError,
  createBillingCheckoutSession,
  createBillingPortalSession,
  cancelBillingSubscription,
  fetchBillingCheckoutSession,
  resumeBillingSubscription,
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

test(
  "smoke(non-browser): billing control-plane services keep checkout, portal, and subscription request semantics aligned",
  { concurrency: false },
  async () => {
    const calls: Array<{ path: string; method: string; body: string | null; accept: string | null; contentType: string | null }> = [];

    await withMockFetch(async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        path: String(input),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : null,
        accept: headers.get("accept"),
        contentType: headers.get("content-type"),
      });

      if (String(input) === "/api/control-plane/workspace/billing/checkout-sessions" && init?.method === "POST") {
        return Response.json({
          data: {
            checkout_session: {
              session_id: "chk_123",
              status: "open",
              current_plan_id: "plan_free",
              target_plan_id: "plan_pro",
              target_plan_code: "pro",
              target_plan_display_name: "Pro",
              billing_interval: "monthly",
              billing_provider: "stripe",
              expires_at: "2026-04-03T12:00:00.000Z",
              completed_at: null,
              created_at: "2026-04-03T11:00:00.000Z",
              updated_at: "2026-04-03T11:00:00.000Z",
              checkout_url: "/settings?intent=upgrade&checkout_session_id=chk_123",
              review_url: "/settings?intent=upgrade&checkout_session_id=chk_123",
            },
            current_plan: null,
            target_plan: null,
          },
        });
      }

      if (String(input) === "/api/control-plane/workspace/billing/checkout-sessions/chk_123" && !init?.method) {
        return Response.json({
          data: {
            checkout_session: {
              session_id: "chk_123",
              status: "open",
              current_plan_id: "plan_free",
              target_plan_id: "plan_pro",
              target_plan_code: "pro",
              target_plan_display_name: "Pro",
              billing_interval: "monthly",
              billing_provider: "stripe",
              expires_at: "2026-04-03T12:00:00.000Z",
              completed_at: null,
              created_at: "2026-04-03T11:00:00.000Z",
              updated_at: "2026-04-03T11:00:00.000Z",
              checkout_url: "/settings?intent=upgrade&checkout_session_id=chk_123",
              review_url: "/settings?intent=upgrade&checkout_session_id=chk_123",
            },
            current_plan: null,
            target_plan: null,
          },
        });
      }

      if (String(input) === "/api/control-plane/workspace/billing/checkout-sessions/chk_123/complete" && init?.method === "POST") {
        return Response.json({
          data: {
            checkout_session: {
              session_id: "chk_123",
              status: "completed",
              current_plan_id: "plan_free",
              target_plan_id: "plan_pro",
              target_plan_code: "pro",
              target_plan_display_name: "Pro",
              billing_interval: "monthly",
              billing_provider: "stripe",
              expires_at: "2026-04-03T12:00:00.000Z",
              completed_at: "2026-04-03T11:15:00.000Z",
              created_at: "2026-04-03T11:00:00.000Z",
              updated_at: "2026-04-03T11:15:00.000Z",
              checkout_url: "/settings?intent=upgrade&checkout_session_id=chk_123",
              review_url: "/settings?intent=upgrade&checkout_session_id=chk_123",
            },
            current_plan: null,
            target_plan: null,
            subscription: {
              subscription_id: "sub_123",
              workspace_id: "ws_123",
              organization_id: "org_123",
              plan_id: "plan_pro",
              billing_provider: "stripe",
              external_customer_ref: "cus_123",
              external_subscription_ref: "sub_ext_123",
              status: "active",
              current_period_start: "2026-04-03T11:15:00.000Z",
              current_period_end: "2026-05-03T11:15:00.000Z",
              cancel_at_period_end: false,
              created_at: "2026-04-03T11:15:00.000Z",
              updated_at: "2026-04-03T11:15:00.000Z",
            },
            billing_summary: {
              status: "active",
              status_label: "Plan active",
              status_tone: "positive",
              provider: "stripe",
              plan_code: "pro",
              plan_display_name: "Pro",
              monthly_price_cents: 4900,
              current_period_start: "2026-04-03T11:15:00.000Z",
              current_period_end: "2026-05-03T11:15:00.000Z",
              cancel_at_period_end: false,
              self_serve_enabled: true,
              description: "Stripe self-serve is active for this workspace.",
              action: {
                kind: "manage_plan",
                label: "Manage plan",
                href: "/settings?intent=manage-plan",
                availability: "ready",
              },
            },
            billing_providers: {
              current_provider_code: "stripe",
              providers: [],
            },
          },
        });
      }

      if (String(input) === "/api/control-plane/workspace/billing/portal-sessions" && init?.method === "POST") {
        return Response.json({
          data: {
            billing_provider: "stripe",
            portal_url: "https://billing.stripe.test/session",
            return_url: "https://govrail.net/settings?intent=manage-plan",
          },
        });
      }

      if (
        (String(input) === "/api/control-plane/workspace/billing/subscription/cancel" ||
          String(input) === "/api/control-plane/workspace/billing/subscription/resume") &&
        init?.method === "POST"
      ) {
        return Response.json({
          data: {
            plan: null,
            subscription: {
              subscription_id: "sub_123",
              workspace_id: "ws_123",
              organization_id: "org_123",
              plan_id: "plan_pro",
              billing_provider: "stripe",
              external_customer_ref: "cus_123",
              external_subscription_ref: "sub_ext_123",
              status: "active",
              current_period_start: "2026-04-03T11:15:00.000Z",
              current_period_end: "2026-05-03T11:15:00.000Z",
              cancel_at_period_end: String(input).includes("cancel"),
              created_at: "2026-04-03T11:15:00.000Z",
              updated_at: "2026-04-03T11:15:00.000Z",
            },
            billing_summary: {
              status: "active",
              status_label: "Plan active",
              status_tone: "positive",
              provider: "stripe",
              plan_code: "pro",
              plan_display_name: "Pro",
              monthly_price_cents: 4900,
              current_period_start: "2026-04-03T11:15:00.000Z",
              current_period_end: "2026-05-03T11:15:00.000Z",
              cancel_at_period_end: String(input).includes("cancel"),
              self_serve_enabled: true,
              description: "Stripe self-serve is active for this workspace.",
              action: {
                kind: "manage_plan",
                label: "Manage plan",
                href: "/settings?intent=manage-plan",
                availability: "ready",
              },
            },
            billing_providers: {
              current_provider_code: "stripe",
              providers: [],
            },
          },
        });
      }

      throw new Error(`Unexpected fetch ${String(input)} ${init?.method ?? "GET"}`);
    }, async () => {
      const created = await createBillingCheckoutSession({
        target_plan_id: "plan_pro",
        billing_interval: "monthly",
      });
      assert.equal(created.checkout_session.session_id, "chk_123");
      assert.equal(created.checkout_session.billing_provider, "stripe");

      const fetched = await fetchBillingCheckoutSession("chk_123");
      assert.equal(fetched.checkout_session.review_url, "/settings?intent=upgrade&checkout_session_id=chk_123");

      const completed = await completeBillingCheckoutSession("chk_123");
      assert.equal(completed.subscription?.billing_provider, "stripe");
      assert.equal(completed.billing_summary.action?.href, "/settings?intent=manage-plan");

      const portal = await createBillingPortalSession({
        return_url: "https://govrail.net/settings?intent=manage-plan",
      });
      assert.equal(portal.billing_provider, "stripe");
      assert.equal(portal.return_url, "https://govrail.net/settings?intent=manage-plan");

      const cancelled = await cancelBillingSubscription();
      assert.equal(cancelled.subscription.cancel_at_period_end, true);

      const resumed = await resumeBillingSubscription();
      assert.equal(resumed.subscription.cancel_at_period_end, false);
    });

    assert.deepEqual(
      calls.map((call) => [call.path, call.method]),
      [
        ["/api/control-plane/workspace/billing/checkout-sessions", "POST"],
        ["/api/control-plane/workspace/billing/checkout-sessions/chk_123", "GET"],
        ["/api/control-plane/workspace/billing/checkout-sessions/chk_123/complete", "POST"],
        ["/api/control-plane/workspace/billing/portal-sessions", "POST"],
        ["/api/control-plane/workspace/billing/subscription/cancel", "POST"],
        ["/api/control-plane/workspace/billing/subscription/resume", "POST"],
      ],
    );
    assert.equal(calls[0]?.accept, "application/json");
    assert.equal(calls[0]?.contentType, "application/json");
    assert.equal(calls[1]?.accept, "application/json");
    assert.equal(calls[1]?.contentType, null);
    assert.equal(calls[3]?.body, JSON.stringify({ return_url: "https://govrail.net/settings?intent=manage-plan" }));
    assert.equal(calls[4]?.body, JSON.stringify({}));
    assert.equal(calls[5]?.body, JSON.stringify({}));
  },
);

test(
  "smoke(non-browser): createBillingPortalSession surfaces portal_url when provider exists",
  async () => {
    await withMockFetch(async (input, init) => {
      if (String(input) === "/api/control-plane/workspace/billing/portal-sessions" && init?.method === "POST") {
        return Response.json({
          data: {
            billing_provider: "stripe",
            portal_url: "https://billing.stripe.test/session",
            return_url: "https://govrail.net/settings?intent=manage-plan",
          },
        });
      }

      throw new Error(`Unexpected fetch ${String(input)} ${init?.method ?? "GET"}`);
    }, async () => {
      const portal = await createBillingPortalSession({
        return_url: "https://govrail.net/settings?intent=manage-plan",
      });
      assert.equal(portal.billing_provider, "stripe");
      assert.equal(portal.return_url, "https://govrail.net/settings?intent=manage-plan");
      assert.equal(portal.portal_url, "https://billing.stripe.test/session");
    });
  },
);

test(
  "smoke(non-browser): billing services preserve structured self-serve and portal error semantics",
  { concurrency: false },
  async () => {
    let portalAttemptCount = 0;
    await withMockFetch(async (input, init) => {
      if (String(input) === "/api/control-plane/workspace/billing/checkout-sessions" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            error: {
              code: "billing_self_serve_not_configured",
              message: "No production self-serve billing provider is configured for this workspace",
              details: {
                stripe_checkout_enabled: false,
              },
            },
          }),
          {
            status: 409,
            headers: { "content-type": "application/json" },
          },
        );
      }

      let portalAttempt = portalAttemptCount ?? 0;
      if (String(input) === "/api/control-plane/workspace/billing/portal-sessions" && init?.method === "POST") {
        portalAttempt = (portalAttemptCount ?? 0) + 1;
        portalAttemptCount = portalAttempt;
        return new Response(
          JSON.stringify({
            error: {
              code:
                portalAttempt === 1
                  ? "billing_provider_portal_unavailable"
                  : "billing_provider_portal_unimplemented",
              message:
                portalAttempt === 1
                  ? "The current billing provider does not offer a self-serve customer portal"
                  : "This provider-managed portal flow is not available yet for the current billing provider.",
              details: {
                billing_provider: portalAttempt === 1 ? "manual" : "stripe",
              },
            },
          }),
          {
            status: 409,
            headers: { "content-type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected fetch ${String(input)} ${init?.method ?? "GET"}`);
    }, async () => {
      await assert.rejects(
        () =>
          createBillingCheckoutSession({
            target_plan_id: "plan_pro",
            billing_interval: "monthly",
          }),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.code, "billing_self_serve_not_configured");
          assert.equal(error.status, 409);
          assert.equal(
            error.message,
            "No production self-serve billing provider is configured for this workspace",
          );
          return true;
        },
      );

      await assert.rejects(
        () =>
          createBillingPortalSession({
            return_url: "https://govrail.net/settings?intent=manage-plan",
          }),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.code, "billing_provider_portal_unavailable");
          assert.equal(error.status, 409);
          assert.equal(
            error.message,
            "The current billing provider does not offer a self-serve customer portal",
          );
          assert.equal(error.details.billing_provider, "manual");
          return true;
        },
      );
      await assert.rejects(
        () =>
          createBillingPortalSession({
            return_url: "https://govrail.net/settings?intent=manage-plan",
          }),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.code, "billing_provider_portal_unimplemented");
          assert.equal(error.status, 409);
          assert.equal(
            error.message,
            "This provider-managed portal flow is not available yet for the current billing provider.",
          );
          assert.equal(error.details.billing_provider, "stripe");
          return true;
        },
      );
    });
  },
);

test(
  "smoke(non-browser): completeBillingCheckoutSession surfaces deferred completion errors to match Stripe webhooks",
  async () => {
    const calls: Array<{ path: string; method: string }> = [];
    await withMockFetch(async (input, init) => {
      calls.push({ path: String(input), method: init?.method ?? "GET" });

      if (
        String(input) === "/api/control-plane/workspace/billing/checkout-sessions/chk_deferred/complete" &&
        init?.method === "POST"
      ) {
        return new Response(
          JSON.stringify({
            error: {
              code: "billing_checkout_completion_deferred",
              message: "This checkout session must be finalized by its billing provider webhook flow",
              details: {
                billing_provider: "stripe",
                webhook_event: "checkout.session.completed",
              },
            },
          }),
          {
            status: 409,
            headers: { "content-type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected fetch ${String(input)} ${init?.method ?? "GET"}`);
    }, async () => {
      await assert.rejects(
        () => completeBillingCheckoutSession("chk_deferred"),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.code, "billing_checkout_completion_deferred");
          assert.equal(error.status, 409);
          assert.equal(
            error.message,
            "This checkout session must be finalized by its billing provider webhook flow",
          );
          assert.equal(error.details.billing_provider, "stripe");
          assert.equal(error.details.webhook_event, "checkout.session.completed");
          return true;
        },
      );
    });

    assert.deepEqual(calls, [
      {
        path: "/api/control-plane/workspace/billing/checkout-sessions/chk_deferred/complete",
        method: "POST",
      },
    ]);
  },
);

test(
  "smoke(non-browser): billing cancel/resume services surface provider-managed and not-resumable errors",
  { concurrency: false },
  async () => {
    await withMockFetch(async (input, init) => {
      const path = String(input);
      if (path === "/api/control-plane/workspace/billing/subscription/cancel" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            error: {
              code: "billing_subscription_managed_by_provider",
              message: "This subscription is managed by the billing provider portal. Open the billing portal to change cancellation settings.",
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
      }

      if (path === "/api/control-plane/workspace/billing/subscription/resume" && init?.method === "POST") {
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
      }

      throw new Error(`Unexpected fetch ${String(input)} ${init?.method ?? "GET"}`);
    }, async () => {
      await assert.rejects(
        () => cancelBillingSubscription(),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.code, "billing_subscription_managed_by_provider");
          assert.equal(error.status, 409);
          assert.equal(
            error.message,
            "This subscription is managed by the billing provider portal. Open the billing portal to change cancellation settings.",
          );
          assert.equal(error.status, 409);
          assert.equal(error.details.billing_provider, "stripe");
          assert.equal(error.details.manage_plan_href, "/settings?intent=manage-plan");
          return true;
        },
      );

      await assert.rejects(
        () => resumeBillingSubscription(),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.code, "billing_subscription_not_resumable");
          assert.equal(error.status, 409);
          assert.equal(
            error.message,
            "This subscription must be replaced through checkout before it can become active again",
          );
          assert.equal(error.status, 409);
          assert.equal(error.details.billing_provider, "stripe");
          return true;
        },
      );
    });
  },
);

test(
  "smoke(non-browser): billing portal and subscription services preserve plan-availability and paid-plan error semantics",
  { concurrency: false },
  async () => {
    let portalAttemptCount = 0;
    let cancelAttemptCount = 0;
    let resumeAttemptCount = 0;

    await withMockFetch(async (input, init) => {
      const path = String(input);
      if (path === "/api/control-plane/workspace/billing/portal-sessions" && init?.method === "POST") {
        portalAttemptCount += 1;
        return new Response(
          JSON.stringify({
            error:
              portalAttemptCount === 1
                ? {
                    code: "billing_subscription_plan_unavailable",
                    message: "Workspace plan is not available for billing changes",
                  }
                : {
                    code: "billing_subscription_not_paid",
                    message: "Free workspaces do not have a paid subscription to manage",
                  },
          }),
          {
            status: 409,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      if (path === "/api/control-plane/workspace/billing/subscription/cancel" && init?.method === "POST") {
        cancelAttemptCount += 1;
        return new Response(
          JSON.stringify({
            error:
              cancelAttemptCount === 1
                ? {
                    code: "billing_subscription_plan_unavailable",
                    message: "Workspace plan is not available for billing changes",
                  }
                : {
                    code: "billing_subscription_not_paid",
                    message: "Free workspaces do not have a paid subscription to cancel",
                  },
          }),
          {
            status: 409,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      if (path === "/api/control-plane/workspace/billing/subscription/resume" && init?.method === "POST") {
        resumeAttemptCount += 1;
        return new Response(
          JSON.stringify({
            error: {
              code: "billing_subscription_plan_unavailable",
              message: "Workspace plan is not available for billing changes",
            },
          }),
          {
            status: 409,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      throw new Error(`Unexpected fetch ${String(input)} ${init?.method ?? "GET"}`);
    }, async () => {
      await assert.rejects(
        () => createBillingPortalSession({ return_url: "https://govrail.net/settings?intent=manage-plan" }),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.code, "billing_subscription_plan_unavailable");
          assert.equal(error.status, 409);
          assert.equal(error.message, "Workspace plan is not available for billing changes");
          return true;
        },
      );

      await assert.rejects(
        () => createBillingPortalSession({ return_url: "https://govrail.net/settings?intent=manage-plan" }),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.code, "billing_subscription_not_paid");
          assert.equal(error.status, 409);
          assert.equal(error.message, "Free workspaces do not have a paid subscription to manage");
          return true;
        },
      );

      await assert.rejects(
        () => cancelBillingSubscription(),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.code, "billing_subscription_plan_unavailable");
          assert.equal(error.status, 409);
          assert.equal(error.message, "Workspace plan is not available for billing changes");
          return true;
        },
      );

      await assert.rejects(
        () => cancelBillingSubscription(),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.code, "billing_subscription_not_paid");
          assert.equal(error.status, 409);
          assert.equal(error.message, "Free workspaces do not have a paid subscription to cancel");
          return true;
        },
      );

      await assert.rejects(
        () => resumeBillingSubscription(),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.code, "billing_subscription_plan_unavailable");
          assert.equal(error.status, 409);
          assert.equal(error.message, "Workspace plan is not available for billing changes");
          return true;
        },
      );
    });
  },
);

test(
  "smoke(non-browser): billing resume preserves provider-managed structured error details",
  { concurrency: false },
  async () => {
    await withMockFetch(async (input, init) => {
      const path = String(input);
      if (path === "/api/control-plane/workspace/billing/subscription/resume" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            error: {
              code: "billing_subscription_managed_by_provider",
              message: "This subscription is managed by the billing provider portal. Open the billing portal to change cancellation settings.",
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
      }

      throw new Error(`Unexpected fetch ${String(input)} ${init?.method ?? "GET"}`);
    }, async () => {
      await assert.rejects(
        () => resumeBillingSubscription(),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.code, "billing_subscription_managed_by_provider");
          assert.equal(error.status, 409);
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
  },
);

test(
  "smoke(non-browser): billing cancel surfaces not-cancellable structured error semantics",
  { concurrency: false },
  async () => {
    await withMockFetch(async (input, init) => {
      const path = String(input);
      if (path === "/api/control-plane/workspace/billing/subscription/cancel" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            error: {
              code: "billing_subscription_not_cancellable",
              message: "This subscription cannot be scheduled for cancellation",
            },
          }),
          {
            status: 409,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      throw new Error(`Unexpected fetch ${String(input)} ${init?.method ?? "GET"}`);
    }, async () => {
      await assert.rejects(
        () => cancelBillingSubscription(),
        (error: unknown) => {
          assert.ok(error instanceof ControlPlaneRequestError);
          assert.equal(error.code, "billing_subscription_not_cancellable");
          assert.equal(error.status, 409);
          assert.equal(error.message, "This subscription cannot be scheduled for cancellation");
          assert.deepEqual(error.details, {});
          return true;
        },
      );
    });
  },
);
