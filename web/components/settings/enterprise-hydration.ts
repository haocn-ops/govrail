import type {
  ControlPlaneWorkspaceDedicatedEnvironmentReadiness,
  ControlPlaneWorkspaceSsoReadiness,
} from "@/lib/control-plane-types";

function readNormalizedValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildFallbackHydrationKey(parts: Record<string, string | string[] | null>): string | null {
  const normalized = Object.fromEntries(
    Object.entries(parts).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.filter((item) => item.trim() !== "") : readNormalizedValue(value),
    ]),
  );
  const hasValue = Object.values(normalized).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== null,
  );
  return hasValue ? JSON.stringify(normalized) : null;
}

export function buildSsoHydrationConfigKey(args: {
  readiness: ControlPlaneWorkspaceSsoReadiness | undefined;
  configuredIdentity: string | null;
  configuredDomains: string[];
}): string | null {
  const configuredAt = readNormalizedValue(args.readiness?.configured_at);
  if (configuredAt) {
    return `configured_at:${configuredAt}`;
  }

  return buildFallbackHydrationKey({
    providerType: args.readiness?.provider_type ?? null,
    metadataUrl: args.readiness?.metadata_url ?? null,
    entrypointUrl: args.readiness?.entrypoint_url ?? null,
    configuredIdentity: args.configuredIdentity,
    configuredDomains: args.configuredDomains,
  });
}

export function buildDedicatedHydrationConfigKey(args: {
  readiness: ControlPlaneWorkspaceDedicatedEnvironmentReadiness | undefined;
  configuredRegion: string | null;
  requesterEmail: string | null;
  requestedCapacity: string | null;
  requestedSla: string | null;
}): string | null {
  const configuredAt = readNormalizedValue(args.readiness?.configured_at);
  if (configuredAt) {
    return `configured_at:${configuredAt}`;
  }

  return buildFallbackHydrationKey({
    targetRegion: args.configuredRegion,
    dataClassification: args.readiness?.data_classification ?? null,
    requesterEmail: args.requesterEmail,
    requestedCapacity: args.requestedCapacity,
    requestedSla: args.requestedSla,
    networkBoundary: args.readiness?.network_boundary ?? null,
  });
}
