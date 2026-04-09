import { proxyPathFallbackGet } from "../fallback-route-helpers";
import { buildAdminOverviewPreviewData } from "@/lib/admin-overview-preview";

export function buildAdminOverviewPath(): string {
  return "/api/v1/saas/admin/overview";
}

export function buildAdminOverviewFallback() {
  const now = new Date().toISOString();
  const previewData = buildAdminOverviewPreviewData(now);

  return {
    data: {
      ...previewData,
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
            path: buildAdminOverviewPath(),
          },
        },
      },
    },
  };
}

export async function proxyAdminOverviewGet(args?: {
  proxy?: typeof proxyPathFallbackGet;
}): Promise<Response> {
  const proxy = args?.proxy ?? proxyPathFallbackGet;

  return proxy({
    path: buildAdminOverviewPath(),
    includeTenant: false,
    buildFallback: () => buildAdminOverviewFallback(),
  });
}
