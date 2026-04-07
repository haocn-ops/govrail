import type { ControlPlaneWorkspaceDeliveryTrack } from "@/lib/control-plane-types";
import { proxyControlPlane } from "@/lib/control-plane-proxy";
import { resolveWorkspaceContextForServer } from "@/lib/workspace-context";
import { buildProxyControlPlanePostInit } from "../post-route-helpers";
import { proxyFallbackGet } from "../../fallback-route-helpers";

const DELIVERY_SUFFIX = "/delivery";

export function buildDeliveryPath(workspaceId: string): string {
  return `/api/v1/saas/workspaces/${workspaceId}${DELIVERY_SUFFIX}`;
}

function buildDefaultSection(timestamp: string): ControlPlaneWorkspaceDeliveryTrack["verification"] {
  return {
    status: "pending",
    owner_user_id: null,
    notes: null,
    evidence_links: [],
    updated_at: timestamp,
  };
}

export function buildDeliveryFallbackTrack(
  workspaceId: string,
  upstreamStatus: number,
): ControlPlaneWorkspaceDeliveryTrack {
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
        message:
          "Delivery track is showing preview fallback data until the live control-plane response is available.",
        status: upstreamStatus,
        retryable: true,
        details: {
          path: buildDeliveryPath(workspaceId),
        },
      },
    },
  };
}

function buildFallbackMeta(upstreamStatus: number): { request_id: string; trace_id: string } {
  if (upstreamStatus === 503) {
    return {
      request_id: "delivery-preview-unavailable",
      trace_id: "delivery-preview-unavailable-trace",
    };
  }
  return {
    request_id: "delivery-preview-error",
    trace_id: "delivery-preview-error-trace",
  };
}

export async function buildWorkspaceDeliveryPostInit(request: Request): Promise<RequestInit> {
  return buildProxyControlPlanePostInit({
    request,
    contentType: "application/json",
    emptyBodyAsUndefined: true,
  });
}

export async function proxyWorkspaceDeliveryGet(args?: {
  resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
  proxy?: typeof proxyFallbackGet;
}): Promise<Response> {
  const resolveContext = args?.resolveWorkspaceContext ?? resolveWorkspaceContextForServer;
  const proxy = args?.proxy ?? proxyFallbackGet;
  const workspaceContext = await resolveContext();
  const workspaceId = workspaceContext.workspace.workspace_id;

  return proxy({
    path: buildDeliveryPath(workspaceId),
    includeTenant: true,
    buildFallback: (upstream) => ({
      data: buildDeliveryFallbackTrack(workspaceId, upstream.status),
      meta: buildFallbackMeta(upstream.status),
    }),
  });
}

export async function proxyWorkspaceDeliveryPost(args: {
  request: Request;
  resolveWorkspaceContext?: typeof resolveWorkspaceContextForServer;
  proxy?: typeof proxyControlPlane;
  initBuilder?: typeof buildWorkspaceDeliveryPostInit;
}): Promise<Response> {
  const resolveContext = args.resolveWorkspaceContext ?? resolveWorkspaceContextForServer;
  const proxy = args.proxy ?? proxyControlPlane;
  const initBuilder = args.initBuilder ?? buildWorkspaceDeliveryPostInit;
  const workspaceContext = await resolveContext();

  return proxy(buildDeliveryPath(workspaceContext.workspace.workspace_id), {
    includeTenant: true,
    init: await initBuilder(args.request),
  });
}
