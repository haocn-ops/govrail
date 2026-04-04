import type { ControlPlaneWorkspaceDeliveryTrack } from "@/lib/control-plane-types";
import { proxyFallbackGet } from "../../fallback-route-helpers";
import { proxyControlPlane } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";
import { buildProxyControlPlanePostInit } from "../post-route-helpers";

export const dynamic = "force-dynamic";

function buildDefaultSection(timestamp: string): ControlPlaneWorkspaceDeliveryTrack["verification"] {
  return {
    status: "pending",
    owner_user_id: null,
    notes: null,
    evidence_links: [],
    updated_at: timestamp,
  };
}

function buildFallbackTrack(workspaceId: string, upstreamStatus: number): ControlPlaneWorkspaceDeliveryTrack {
  const now = new Date().toISOString();
  return {
    workspace_id: workspaceId,
    verification: buildDefaultSection(now),
    go_live: buildDefaultSection(now),
    contract_meta: {
      source: "fallback_error",
      normalized_at: now,
      issue: {
        code: "workspace_delivery_preview_fallback",
        message: "Delivery track is showing preview fallback data until the live control-plane response is available.",
        status: upstreamStatus,
        retryable: true,
        details: {
          path: `/api/v1/saas/workspaces/${workspaceId}/delivery`,
        },
      },
    },
  };
}

export async function GET() {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const workspaceId = workspaceContext.workspace.workspace_id;
  return proxyFallbackGet({
    path: `/api/v1/saas/workspaces/${workspaceId}/delivery`,
    includeTenant: true,
    buildFallback: (upstream) => ({
      data: buildFallbackTrack(workspaceId, upstream.status),
      meta: {
        request_id: upstream.status === 503 ? "delivery-preview-unavailable" : "delivery-preview-error",
        trace_id: upstream.status === 503 ? "delivery-preview-unavailable-trace" : "delivery-preview-error-trace",
      },
    }),
  });
}

export async function POST(request: Request) {
  const workspaceContext = await resolveWorkspaceContextForServer();
  const workspaceId = workspaceContext.workspace.workspace_id;

  return proxyControlPlane(`/api/v1/saas/workspaces/${workspaceId}/delivery`, {
    includeTenant: true,
    init: await buildProxyControlPlanePostInit({
      request,
      contentType: "application/json",
      emptyBodyAsUndefined: true,
    }),
  });
}
