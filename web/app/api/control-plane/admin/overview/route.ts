import { proxyFallbackGet } from "../../fallback-route-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyFallbackGet({
    path: "/api/v1/saas/admin/overview",
    includeTenant: false,
    buildFallback: () => {
      const now = new Date().toISOString();

      return {
        data: {
          summary: {
            organizations_total: 1,
            workspaces_total: 1,
            active_workspaces_total: 1,
            users_total: 1,
            paid_subscriptions_total: 0,
            past_due_subscriptions_total: 0,
          },
          plan_distribution: [
            {
              plan_code: "free",
              workspace_count: 1,
            },
          ],
          feature_rollout: {
            sso_enabled_workspaces: 0,
            audit_export_enabled_workspaces: 0,
            dedicated_environment_enabled_workspaces: 0,
          },
          recent_workspaces: [
            {
              workspace_id: "ws_preview",
              slug: "preview",
              display_name: "Preview Workspace",
              organization_display_name: "Preview Organization",
              plan_code: "free",
              status: "active",
              created_at: now,
            },
          ],
          delivery_governance: {
            verification: {
              pending: 0,
              in_progress: 0,
              complete: 0,
            },
            go_live: {
              pending: 0,
              in_progress: 0,
              complete: 0,
            },
          },
          recent_delivery_workspaces: [
            {
              workspace_id: "ws_preview",
              slug: "preview",
              display_name: "Preview Workspace",
              organization_id: "org_preview",
              organization_display_name: "Preview Organization",
              latest_demo_run_id: null,
              verification_status: null,
              go_live_status: null,
              next_action_surface: "verification",
              owner_display_name: "Preview Operator",
              owner_email: "preview@example.com",
              notes_summary: "Captured baseline notes and linked a rehearsal artifact for the next review.",
              evidence_count: 1,
              recent_track_key: "verification",
              recent_update_kind: "evidence_only",
              updated_at: now,
            },
          ],
          attention_workspaces: [
            {
              workspace_id: "ws_preview",
              slug: "preview",
              display_name: "Preview Workspace",
              organization_id: "org_preview",
              organization_display_name: "Preview Organization",
              latest_demo_run_id: null,
              verification_status: "in_progress",
              go_live_status: "pending",
              updated_at: now,
              next_action_surface: "verification",
            },
          ],
          attention_summary: {
            total: 1,
            verification_total: 1,
            go_live_total: 1,
            in_progress_total: 1,
            pending_total: 1,
          },
          week8_readiness: {
            total: 1,
            baseline_ready_total: 0,
            credentials_ready_total: 0,
            demo_run_succeeded_total: 0,
            billing_warning_total: 0,
            mock_go_live_ready_total: 0,
          },
          week8_readiness_workspaces: [
            {
              workspace_id: "ws_preview",
              slug: "preview",
              display_name: "Preview Workspace",
              organization_id: "org_preview",
              organization_display_name: "Preview Organization",
              latest_demo_run_id: null,
              baseline_ready: false,
              credentials_ready: false,
              demo_run_succeeded: false,
              billing_warning: false,
              mock_go_live_ready: false,
              next_action_surface: "onboarding",
              updated_at: now,
            },
          ],
          attention_organizations: [
            {
              organization_id: "org_preview",
              organization_display_name: "Preview Organization",
              workspaces_total: 1,
              verification_total: 1,
              go_live_total: 1,
              in_progress_total: 1,
              pending_total: 1,
              latest_update_at: now,
            },
          ],
          updated_at: now,
          contract_meta: {
            source: "fallback_error",
            normalized_at: now,
            issue: {
              code: "admin_overview_preview_fallback",
              message:
                "Admin overview is showing preview fallback data until the live control-plane summary is available.",
              status: null,
              retryable: true,
              details: {
                path: "/api/v1/saas/admin/overview",
              },
            },
          },
        },
      };
    },
  });
}
