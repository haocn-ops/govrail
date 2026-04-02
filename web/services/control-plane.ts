import { previewPolicies, previewToolProviders } from "@/lib/control-plane-preview";
import type {
  ControlPlaneHealth,
  ControlPlanePolicy,
  ControlPlaneToolProvider
} from "@/lib/control-plane-types";

type JsonEnvelope<T> = {
  data: T;
  meta: {
    request_id: string;
    trace_id: string;
  };
};

type ListEnvelope<T> = {
  items: T[];
  page_info: {
    next_cursor: string | null;
  };
};

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Control plane request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as JsonEnvelope<T>;
  return payload.data;
}

export async function fetchHealth(): Promise<ControlPlaneHealth> {
  try {
    return await request<ControlPlaneHealth>("/api/control-plane/health");
  } catch {
    return {
      ok: true,
      service: "govrail-control-plane",
      version: "local-preview",
      now: new Date().toISOString()
    };
  }
}

export async function fetchPolicies(): Promise<ControlPlanePolicy[]> {
  try {
    const payload = await request<ListEnvelope<ControlPlanePolicy>>("/api/control-plane/policies");
    return payload.items;
  } catch {
    return previewPolicies;
  }
}

export async function fetchToolProviders(): Promise<ControlPlaneToolProvider[]> {
  try {
    const payload = await request<ListEnvelope<ControlPlaneToolProvider>>("/api/control-plane/tool-providers");
    return payload.items;
  } catch {
    return previewToolProviders;
  }
}
