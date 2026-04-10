import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDedicatedHydrationConfigKey,
  buildSsoHydrationConfigKey,
} from "../settings/enterprise-hydration";

test("buildSsoHydrationConfigKey prefers configured_at when present", () => {
  const result = buildSsoHydrationConfigKey({
    readiness: {
      feature: "sso",
      feature_enabled: true,
      status: "configured",
      provider_type: "oidc",
      connection_mode: "workspace",
      supported_protocols: ["oidc"],
      next_steps: [],
      upgrade_href: null,
      plan_code: null,
      configured_at: "2026-04-05T10:00:00.000Z",
      metadata_url: "https://idp.example.com/.well-known/openid-configuration",
      email_domains: ["example.com"],
    },
    configuredIdentity: "client_123",
    configuredDomains: ["example.com"],
  });

  assert.equal(result, "configured_at:2026-04-05T10:00:00.000Z");
});

test("buildSsoHydrationConfigKey falls back to saved-field signature when configured_at is absent", () => {
  const first = buildSsoHydrationConfigKey({
    readiness: {
      feature: "sso",
      feature_enabled: true,
      status: "configured",
      provider_type: "oidc",
      connection_mode: "workspace",
      supported_protocols: ["oidc"],
      next_steps: [],
      upgrade_href: null,
      plan_code: null,
      metadata_url: "https://idp.example.com/.well-known/openid-configuration",
      email_domains: ["example.com"],
    },
    configuredIdentity: "client_123",
    configuredDomains: ["example.com"],
  });
  const second = buildSsoHydrationConfigKey({
    readiness: {
      feature: "sso",
      feature_enabled: true,
      status: "configured",
      provider_type: "oidc",
      connection_mode: "workspace",
      supported_protocols: ["oidc"],
      next_steps: [],
      upgrade_href: null,
      plan_code: null,
      metadata_url: "https://idp.example.com/.well-known/openid-configuration",
      email_domains: ["example.com", "corp.example.com"],
    },
    configuredIdentity: "client_123",
    configuredDomains: ["example.com", "corp.example.com"],
  });

  assert.notEqual(first, null);
  assert.notEqual(second, null);
  assert.notEqual(first, second);
});

test("buildSsoHydrationConfigKey returns null when no persisted configuration exists", () => {
  const result = buildSsoHydrationConfigKey({
    readiness: {
      feature: "sso",
      feature_enabled: true,
      status: "not_configured",
      provider_type: null,
      connection_mode: "workspace",
      supported_protocols: ["oidc", "saml"],
      next_steps: [],
      upgrade_href: null,
      plan_code: null,
    },
    configuredIdentity: null,
    configuredDomains: [],
  });

  assert.equal(result, null);
});

test("buildSsoHydrationConfigKey ignores blank configured identity values", () => {
  const result = buildSsoHydrationConfigKey({
    readiness: {
      feature: "sso",
      feature_enabled: true,
      status: "not_configured",
      provider_type: null,
      connection_mode: "workspace",
      supported_protocols: ["oidc", "saml"],
      next_steps: [],
      upgrade_href: null,
      plan_code: null,
    },
    configuredIdentity: "   ",
    configuredDomains: [],
  });

  assert.equal(result, null);
});

test("buildDedicatedHydrationConfigKey prefers configured_at and otherwise tracks saved request fields", () => {
  const configuredAtKey = buildDedicatedHydrationConfigKey({
    readiness: {
      feature: "dedicated_environment",
      feature_enabled: true,
      status: "configured",
      deployment_model: "single_tenant",
      target_region: "us-east-1",
      isolation_summary: "Configured",
      next_steps: [],
      upgrade_href: null,
      plan_code: null,
      configured_at: "2026-04-05T11:00:00.000Z",
    },
    configuredRegion: "us-east-1",
    requesterEmail: "owner@example.com",
    requestedCapacity: "6 vCPU / 16 GB",
    requestedSla: "99.9% / 24x7",
  });
  const fallbackKeyA = buildDedicatedHydrationConfigKey({
    readiness: {
      feature: "dedicated_environment",
      feature_enabled: true,
      status: "configured",
      deployment_model: "single_tenant",
      target_region: "us-east-1",
      isolation_summary: "Configured",
      next_steps: [],
      upgrade_href: null,
      plan_code: null,
      data_classification: "restricted",
      network_boundary: "private-vpc",
    },
    configuredRegion: "us-east-1",
    requesterEmail: "owner@example.com",
    requestedCapacity: "6 vCPU / 16 GB",
    requestedSla: "99.9% / 24x7",
  });
  const fallbackKeyB = buildDedicatedHydrationConfigKey({
    readiness: {
      feature: "dedicated_environment",
      feature_enabled: true,
      status: "configured",
      deployment_model: "single_tenant",
      target_region: "us-east-1",
      isolation_summary: "Configured",
      next_steps: [],
      upgrade_href: null,
      plan_code: null,
      data_classification: "restricted",
      network_boundary: "private-vpc-only",
    },
    configuredRegion: "us-east-1",
    requesterEmail: "owner@example.com",
    requestedCapacity: "6 vCPU / 16 GB",
    requestedSla: "99.9% / 24x7",
  });

  assert.equal(configuredAtKey, "configured_at:2026-04-05T11:00:00.000Z");
  assert.notEqual(fallbackKeyA, null);
  assert.notEqual(fallbackKeyB, null);
  assert.notEqual(fallbackKeyA, fallbackKeyB);
});
