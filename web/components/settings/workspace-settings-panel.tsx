"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ControlPlaneAdminDeliveryUpdateKind,
  ControlPlaneContractIssue,
  ControlPlaneWorkspaceDedicatedEnvironmentSaveRequest,
  ControlPlaneWorkspaceSsoSaveRequest,
} from "@/lib/control-plane-types";
import type {
  AuditExportReceiptContinuityArgs,
  AuditExportReceiptSummary,
} from "@/lib/audit-export-receipt";
import { buildAdminReturnHref, buildHandoffHref } from "@/lib/handoff-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildDedicatedHydrationConfigKey,
  buildSsoHydrationConfigKey,
} from "@/components/settings/enterprise-hydration";
import {
  completeBillingCheckoutSession,
  cancelBillingSubscription,
  createBillingPortalSession,
  createBillingCheckoutSession,
  downloadWorkspaceAuditExportViewModel,
  fetchBillingCheckoutSession,
  fetchCurrentWorkspace,
  fetchWorkspaceDedicatedEnvironmentReadiness,
  fetchWorkspaceSsoReadiness,
  isControlPlaneRequestError,
  resumeBillingSubscription,
  saveWorkspaceDedicatedEnvironmentReadiness,
  saveWorkspaceSsoReadiness,
} from "@/services/control-plane";

function formatPrice(monthlyPriceCents: number): string {
  if (monthlyPriceCents <= 0) {
    return "Custom / free";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(monthlyPriceCents / 100);
}

function formatMetricValue(key: string, value: number): string {
  if (key === "artifact_storage_bytes") {
    if (value < 1024) {
      return `${value} B`;
    }
    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return String(value);
}

function formatFileSize(bytes?: number | null): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "-";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatMetricLabel(key: string): string {
  switch (key) {
    case "runs_created":
      return "Runs created";
    case "active_tool_providers":
      return "Active tool providers";
    case "artifact_storage_bytes":
      return "Artifact storage";
    default:
      return key.replace(/_/g, " ");
  }
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function formatUsageFraction(metric: { used: number; limit: number | null }): number {
  if (!metric.limit || metric.limit <= 0) {
    return 0;
  }
  return Math.min(100, (metric.used / metric.limit) * 100);
}

function billingBadgeVariant(tone: "positive" | "warning" | "neutral"): "strong" | "default" | "subtle" {
  if (tone === "positive") {
    return "strong";
  }
  if (tone === "warning") {
    return "default";
  }
  return "subtle";
}

function intentMatchesAction(
  highlightIntent: "upgrade" | "manage-plan" | "resolve-billing" | null,
  href?: string,
): boolean {
  if (!highlightIntent || !href) {
    return false;
  }
  return href.includes(`intent=${highlightIntent}`);
}

function formatFeatureStatusLabel(status?: string | null): string {
  if (!status) {
    return "staged";
  }
  return status.replace(/_/g, " ");
}

function formatSsoProtocolLabel(protocol: string): string {
  if (protocol.toLowerCase() === "oidc") {
    return "OIDC";
  }
  if (protocol.toLowerCase() === "saml") {
    return "SAML";
  }
  return protocol.toUpperCase();
}

function formatDedicatedDeploymentModelLabel(model?: string | null): string {
  if (!model) {
    return "single tenant";
  }
  return model.replace(/_/g, " ");
}

function enterpriseStatusBadgeVariant(args: {
  enabled: boolean;
  status?: string | null;
  configured?: boolean | null;
  configurationState?: string | null;
  isError?: boolean;
}): "strong" | "default" | "subtle" {
  if (args.isError) {
    return "default";
  }
  if (args.enabled && (args.configured === true || args.status === "configured")) {
    return "strong";
  }
  if (args.enabled && args.configurationState === "in_progress") {
    return "default";
  }
  if (args.enabled) {
    return "default";
  }
  return "subtle";
}

function enterpriseStatusLabel(args: {
  enabled: boolean;
  status?: string | null;
  configured?: boolean | null;
  configurationState?: string | null;
  isError?: boolean;
}): string {
  if (args.isError) {
    return "Readiness unavailable";
  }
  if (args.enabled && (args.configured === true || args.status === "configured")) {
    return "Configured";
  }
  if (args.enabled && args.configurationState === "in_progress") {
    return "Config in progress";
  }
  if (!args.enabled) {
    return "Plan-gated";
  }
  if (args.status === "not_configured") {
    return "Configuration pending";
  }
  return "Provisioning staged";
}

function toIsoDateBoundary(value: string, mode: "start" | "end"): string | null {
  const raw = value.trim();
  if (!raw) {
    return null;
  }
  const date = new Date(`${raw}${mode === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z"}`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

async function computeBlobSha256(blob: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) {
    return null;
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

type ContractMetaSource =
  | "live"
  | "fallback_feature_gate"
  | "fallback_control_plane_unavailable"
  | "fallback_error";

function contractSourceBadgeVariant(source?: ContractMetaSource | null): "strong" | "default" | "subtle" {
  if (source === "live") {
    return "strong";
  }
  if (source === "fallback_control_plane_unavailable" || source === "fallback_error") {
    return "default";
  }
  return "subtle";
}

type ContractMetaIssue = ControlPlaneContractIssue | null;

function fallbackStatusLabel(issue?: ContractMetaIssue): string | null {
  if (issue?.status === 404) {
    return "route unavailable";
  }
  if (issue?.status === 503) {
    return "control plane unavailable";
  }
  return null;
}

function contractSourceLabel(source?: ContractMetaSource | null, issue?: ContractMetaIssue): string {
  if (source === "live") {
    return "Live contract";
  }
  if (source === "fallback_feature_gate") {
    return "Fallback: feature gate";
  }
  if (source === "fallback_control_plane_unavailable") {
    return "Fallback: control plane unavailable";
  }
  if (source === "fallback_error") {
    const fallbackLabel = fallbackStatusLabel(issue);
    if (fallbackLabel) {
      return `Fallback: ${fallbackLabel}`;
    }
    return "Fallback: request error";
  }
  return "Contract source unknown";
}

function contractSourceDescription(source?: ContractMetaSource | null, issue?: ContractMetaIssue): string {
  if (source === "live") {
    return "Signals are loaded from live control-plane contract responses.";
  }
  if (source === "fallback_feature_gate") {
    return issue?.status === 409
      ? "Feature is currently plan-gated. UI shows fallback guidance until entitlement changes."
      : "Feature is gated, so the UI shows fallback guidance until entitlement changes.";
  }
  if (source === "fallback_control_plane_unavailable") {
    return "Control plane is unavailable; readiness is currently fallback-derived.";
  }
  if (source === "fallback_error") {
    if (issue?.status === 404) {
      return "Readiness load returned 404, so fallback values are shown until the live route is available.";
    }
    if (issue?.status === 503) {
      return "Readiness load returned 503, so fallback values are shown until the control plane recovers.";
    }
    return "Readiness load failed; showing fallback values for continuity.";
  }
  return "Contract source information is unavailable.";
}

type EnterpriseAdditiveState = {
  configured: boolean | null;
  configurationState: string | null;
  deliveryStatus: string | null;
  readinessVersion: string | null;
};

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readEnterpriseAdditiveState(input: unknown): EnterpriseAdditiveState {
  if (!input || typeof input !== "object") {
    return {
      configured: null,
      configurationState: null,
      deliveryStatus: null,
      readinessVersion: null,
    };
  }
  const raw = input as Record<string, unknown>;
  return {
    configured: readBoolean(raw.configured),
    configurationState: readString(raw.configuration_state),
    deliveryStatus: readString(raw.delivery_status),
    readinessVersion: readString(raw.readiness_version),
  };
}

function formatTokenLabel(value?: string | null): string {
  if (!value) {
    return "-";
  }
  return value.replace(/[_-]/g, " ");
}

function isLikelyHttpsUrl(value: string): boolean {
  const raw = value.trim();
  if (!raw) {
    return false;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isLikelyDomain(value: string): boolean {
  const raw = value.trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(raw);
}

function isLikelyEmail(value: string): boolean {
  const raw = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

function normalizeDomainList(values: Array<string | null | undefined> | null | undefined): string[] {
  if (!values || values.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const domain = value.trim().toLowerCase();
    if (!domain || seen.has(domain)) {
      continue;
    }
    seen.add(domain);
    normalized.push(domain);
  }

  return normalized;
}

type CheckoutSessionStatus =
  | "created"
  | "open"
  | "ready"
  | "requires_confirmation"
  | "completed"
  | "expired"
  | "cancelled"
  | "failed";

type CheckoutSessionSummary = {
  session_id: string;
  status: CheckoutSessionStatus | string;
  billing_interval: "monthly" | "yearly";
  billing_provider: string | null;
  target_plan_id: string | null;
  target_plan_code: string | null;
  target_plan_display_name: string | null;
  expires_at: string | null;
  checkout_url: string | null;
  review_url: string | null;
};

type CheckoutSessionEnvelope = {
  session?: CheckoutSessionSummary;
  checkout_session?: CheckoutSessionSummary;
  [key: string]: unknown;
};

type BillingProviderSummary = {
  code: string;
  display_name?: string | null;
};

function formatBillingProviderLabel(
  providerCode?: string | null,
  providers: BillingProviderSummary[] = [],
): string {
  if (!providerCode) {
    return "Manual";
  }
  const match = providers.find((provider) => provider.code === providerCode);
  return match?.display_name ?? providerCode;
}

type CheckoutFlowState = {
  creating: boolean;
  refreshing: boolean;
  completing: boolean;
  error: string | null;
  notice: string | null;
  session: CheckoutSessionSummary | null;
};

function defaultCheckoutFlowState(): CheckoutFlowState {
  return {
    creating: false,
    refreshing: false,
    completing: false,
    error: null,
    notice: null,
    session: null,
  };
}

type SubscriptionActionState = {
  openingPortal: boolean;
  cancelling: boolean;
  resuming: boolean;
  error: string | null;
  notice: string | null;
};

function defaultSubscriptionActionState(): SubscriptionActionState {
  return {
    openingPortal: false,
    cancelling: false,
    resuming: false,
    error: null,
    notice: null,
  };
}

type AuditExportState = {
  exporting: boolean;
  error: string | null;
  notice: string | null;
  contractSource: ContractMetaSource | null;
  contractIssueMessage: string | null;
  contractIssueCode: string | null;
};

type AuditExportReceipt = AuditExportReceiptSummary & {
  format: "json" | "jsonl";
  contentType: string | null;
  sizeBytes: number;
};

function formatAuditExportEvidenceNote(receipt: AuditExportReceipt): string {
  const filters =
    receipt.fromDate || receipt.toDate
      ? `${receipt.fromDate ?? "start"} -> ${receipt.toDate ?? "end"}`
      : "full workspace history";
  const hash = receipt.sha256 ?? "hash unavailable";
  return `Audit export ${receipt.filename} (${receipt.format.toUpperCase()}, ${filters}, SHA-256: ${hash}).`;
}

function defaultAuditExportState(): AuditExportState {
  return {
    exporting: false,
    error: null,
    notice: null,
    contractSource: null,
    contractIssueMessage: null,
    contractIssueCode: null,
  };
}

type EnterpriseWriteState = {
  submitting: boolean;
  error: string | null;
  notice: string | null;
  responseCode: string | null;
};

function defaultEnterpriseWriteState(): EnterpriseWriteState {
  return {
    submitting: false,
    error: null,
    notice: null,
    responseCode: null,
  };
}

function extractCheckoutSession(payload: CheckoutSessionEnvelope): CheckoutSessionSummary | null {
  if (payload.session) {
    return payload.session;
  }
  if (payload.checkout_session) {
    return payload.checkout_session;
  }
  return null;
}

function normalizeBillingProviderCode(providerCode?: string | null): string {
  return (providerCode ?? "").trim().toLowerCase();
}

function isStripeBillingProvider(providerCode?: string | null): boolean {
  return normalizeBillingProviderCode(providerCode) === "stripe";
}

function isMockBillingProvider(providerCode?: string | null): boolean {
  const normalized = normalizeBillingProviderCode(providerCode);
  return normalized === "mock_checkout" || normalized === "mock";
}

function isCheckoutReadyForCompletion(status: string, billingProvider?: string | null): boolean {
  return isMockBillingProvider(billingProvider) && ["created", "open", "ready", "requires_confirmation"].includes(status);
}

function formatBillingActionAvailabilityText(args: {
  availability?: "ready" | "staged" | string;
  providerCode?: string | null;
  selfServeEnabled?: boolean;
  providerSupportsCheckout?: boolean;
  selfServeReasonCode?: string | null;
}): string {
  if (args.selfServeReasonCode === "billing_self_serve_not_configured") {
    return "Contract: billing_self_serve_not_configured. Configure Stripe-backed self-serve before operators rely on in-product upgrade or portal flows.";
  }
  if (isMockBillingProvider(args.providerCode)) {
    return "Mock checkout is kept as a test-only fallback; production self-serve flows rely on Stripe when enabled.";
  }
  if (args.availability === "ready") {
    if (isStripeBillingProvider(args.providerCode)) {
      return "Self-serve checkout is live through Stripe-hosted checkout and webhook confirmation.";
    }
    return "This billing action is available now through the current workspace billing flow.";
  }
  if (args.providerSupportsCheckout && args.selfServeEnabled) {
    return "Provider checkout is configured but not currently ready. Refresh provider state and retry.";
  }
  return "Self-serve checkout is not live for this workspace yet. Continue with the workspace-managed fallback flow.";
}

function formatSelfServeSetupNotice(reasonCode?: string | null): string | null {
  if (reasonCode !== "billing_self_serve_not_configured") {
    return null;
  }
  return "Stripe-backed production self-serve is not configured for this workspace yet. Operators can review billing posture here, but upgrade, portal, and renewal recovery stay in the workspace-managed fallback lane until Stripe is enabled.";
}

function formatCheckoutActionError(
  error: unknown,
  args: {
    action: "create" | "complete" | "refresh";
    providerCode?: string | null;
  },
): string {
  const providerLabel = isStripeBillingProvider(args.providerCode) ? "Stripe" : "the current billing provider";
  if (isControlPlaneRequestError(error)) {
    const normalizedCode = error.code.toLowerCase();
    if (args.action === "complete" && (isStripeBillingProvider(args.providerCode) || normalizedCode.includes("webhook"))) {
      return `${providerLabel} finalizes completion after checkout. Use Refresh session after payment to sync status.`;
    }
    if (args.action === "create" && (normalizedCode.includes("not_ready") || normalizedCode.includes("unavailable"))) {
      return "Checkout is not ready for this workspace yet. Confirm provider readiness and plan eligibility, then retry.";
    }
    if (args.action === "refresh" && error.status === 404) {
      return "Checkout session was not found. Create a new session from this page and continue.";
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (args.action === "create") {
    return "Unable to create checkout session.";
  }
  if (args.action === "complete") {
    return "Unable to complete checkout session.";
  }
  return "Unable to refresh checkout session.";
}

function formatPortalActionError(error: unknown): string {
  if (isControlPlaneRequestError(error)) {
    const normalizedCode = error.code.toLowerCase();
    if (normalizedCode.includes("portal") && normalizedCode.includes("unsupported")) {
      return "The current billing provider does not expose a customer portal for this workspace.";
    }
    if (normalizedCode === "billing_provider_portal_unavailable") {
      return "The current subscription provider does not offer a customer portal for this workspace.";
    }
    if (normalizedCode === "billing_provider_portal_unimplemented") {
      return "This provider-managed portal flow is not available yet for the current billing provider.";
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unable to open billing portal.";
}

function formatSubscriptionActionError(
  error: unknown,
  args: {
    action: "cancel" | "resume";
  },
): string {
  if (isControlPlaneRequestError(error)) {
    const normalizedCode = error.code.toLowerCase();
    if (normalizedCode === "billing_subscription_managed_by_provider") {
      return args.action === "cancel"
        ? "This subscription is managed in the billing provider portal. Open billing portal from this page to change cancellation timing."
        : "This subscription is managed in the billing provider portal. Open billing portal from this page to restore renewal settings.";
    }
    if (normalizedCode === "billing_subscription_not_cancellable") {
      return "This subscription can no longer be scheduled for cancellation from this workspace.";
    }
    if (normalizedCode === "billing_subscription_not_resumable") {
      return "This subscription must be replaced through checkout before renewal can resume.";
    }
    if (normalizedCode === "billing_subscription_missing") {
      return "No workspace subscription is available to update right now. Refresh settings and retry.";
    }
    if (normalizedCode === "billing_subscription_not_paid") {
      return "Only paid subscriptions can change renewal timing from this page.";
    }
    if (normalizedCode === "billing_subscription_plan_unavailable") {
      return "Billing plan details are unavailable right now. Refresh settings and retry.";
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return args.action === "cancel"
    ? "Unable to schedule cancellation"
    : "Unable to resume subscription renewal";
}

function formatEnterpriseWriteError(
  error: unknown,
  args: {
    feature: "sso" | "dedicated_environment";
  },
): string {
  const featureLabel = args.feature === "sso" ? "SSO" : "Dedicated environment";
  if (isControlPlaneRequestError(error)) {
    const normalizedCode = error.code.toLowerCase();
    if (normalizedCode === "workspace_context_not_metadata") {
      const contextSource = typeof error.details.source === "string" ? error.details.source : null;
      return `${featureLabel} live write requires metadata-backed workspace context. Current source: ${
        contextSource ?? "unknown"
      }. Re-open this workspace from onboarding or another metadata-backed entry, then retry.`;
    }
    if (normalizedCode === "workspace_feature_unavailable") {
      return `${featureLabel} live write is still plan-gated for this workspace. Upgrade the plan, then retry.`;
    }
    if (error.status === 404 || error.status === 405) {
      return `${featureLabel} live write is wired in the console, but the control-plane write handler is not enabled yet. Keep this preflight summary and retry after backend rollout.`;
    }
    if (error.status >= 500) {
      return `${featureLabel} write is temporarily unavailable because control-plane write handling is not healthy. Retry after recovery.`;
    }
    if (normalizedCode === "idempotency_conflict") {
      return `${featureLabel} write was already submitted with a different payload. Refresh the form and retry once the desktop service confirms the previous save.`;
    }
    if (error.status === 401 || error.status === 403) {
      return `${featureLabel} configuration requires workspace owner or admin access. Confirm your role and retry once the proper permissions are granted.`;
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return `Unable to submit ${featureLabel.toLowerCase()} configuration.`;
}

function formatAuditExportActionError(error: unknown): string {
  if (isControlPlaneRequestError(error)) {
    const normalizedCode = error.code.toLowerCase();
    if (normalizedCode === "workspace_feature_unavailable") {
      return "Audit export is gated by current plan entitlements. Upgrade to unlock export.";
    }
    if (normalizedCode === "control_plane_base_missing") {
      return "Control plane is unavailable; audit export cannot be generated right now.";
    }
    if (error.message) {
      return `Audit export request failed. Retry after checking workspace/control-plane health. (${error.message})`;
    }
  }
  if (error instanceof Error && error.message) {
    return `Audit export request failed. Retry after checking workspace/control-plane health. (${error.message})`;
  }
  return "Audit export request failed. Retry after checking workspace/control-plane health.";
}

type SettingsSource = "admin-attention" | "admin-readiness" | "onboarding";
type DeliveryContext = "recent_activity" | "week8";

function normalizeSettingsSource(source?: string | null): SettingsSource | null {
  if (source === "admin-attention" || source === "admin-readiness" || source === "onboarding") {
    return source;
  }
  return null;
}

function normalizeDeliveryContext(value?: string | null): DeliveryContext | null {
  return value === "recent_activity" || value === "week8" ? value : null;
}

function normalizeRecentTrackKey(value?: string | null): "verification" | "go_live" | null {
  if (value === "verification" || value === "go_live") {
    return value;
  }
  return null;
}

function normalizeRecentUpdateKind(value?: string | null): ControlPlaneAdminDeliveryUpdateKind | null {
  if (
    value === "verification" ||
    value === "go_live" ||
    value === "verification_completed" ||
    value === "go_live_completed" ||
    value === "evidence_only"
  ) {
    return value;
  }
  return null;
}

type SettingsHrefArgs = {
  pathname: string;
  source?: SettingsSource | null;
  runId?: string | null;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  deliveryContext?: DeliveryContext | null;
  recentTrackKey?: "verification" | "go_live" | null;
  recentUpdateKind?: ControlPlaneAdminDeliveryUpdateKind | null;
  evidenceCount?: number | null;
  recentOwnerLabel?: string | null;
  recentOwnerDisplayName?: string | null;
  recentOwnerEmail?: string | null;
  auditReceiptFilename?: string | null;
  auditReceiptExportedAt?: string | null;
  auditReceiptFromDate?: string | null;
  auditReceiptToDate?: string | null;
  auditReceiptSha256?: string | null;
  intent?: "manage-plan" | "resolve-billing" | "upgrade";
};

function buildAuditExportReceiptContinuityArgs(
  receipt?: AuditExportReceipt | null,
): AuditExportReceiptContinuityArgs {
  return {
    auditReceiptFilename: receipt?.filename ?? null,
    auditReceiptExportedAt: receipt?.exportedAt ?? null,
    auditReceiptFromDate: receipt?.fromDate ?? null,
    auditReceiptToDate: receipt?.toDate ?? null,
    auditReceiptSha256: receipt?.sha256 ?? null,
  };
}

function buildSettingsHref(args: SettingsHrefArgs): string {
  const href = buildHandoffHref(
    args.pathname,
    {
      source: args.source,
      runId: args.runId,
      week8Focus: args.week8Focus,
      attentionWorkspace: args.attentionWorkspace,
      attentionOrganization: args.attentionOrganization,
      deliveryContext: args.deliveryContext,
      recentTrackKey: args.recentTrackKey,
      recentUpdateKind: args.recentUpdateKind,
      evidenceCount: args.evidenceCount,
      recentOwnerLabel: args.recentOwnerLabel,
      recentOwnerDisplayName: args.recentOwnerDisplayName,
      recentOwnerEmail: args.recentOwnerEmail,
      auditReceiptFilename: args.auditReceiptFilename,
      auditReceiptExportedAt: args.auditReceiptExportedAt,
      auditReceiptFromDate: args.auditReceiptFromDate,
      auditReceiptToDate: args.auditReceiptToDate,
      auditReceiptSha256: args.auditReceiptSha256,
    },
    { preserveExistingQuery: true },
  );
  const [basePath, rawQuery] = href.split("?", 2);
  const searchParams = new URLSearchParams(rawQuery ?? "");
  if (args.intent) {
    searchParams.set("intent", args.intent);
  }
  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function buildSettingsIntentHref(
  intent: "manage-plan" | "resolve-billing" | "upgrade",
  args: Omit<SettingsHrefArgs, "pathname" | "intent">,
): string {
  return buildSettingsHref({
    pathname: "/settings",
    ...args,
    intent,
  });
}

function readinessFocusLabel(focus?: string | null): string {
  if (!focus) {
    return "current focus";
  }
  if (focus === "baseline") {
    return "baseline";
  }
  if (focus === "credentials") {
    return "credentials";
  }
  if (focus === "demo_run") {
    return "demo run";
  }
  if (focus === "billing_warning") {
    return "billing warning";
  }
  if (focus === "go_live_ready") {
    return "mock go-live readiness";
  }
  return focus;
}

export function WorkspaceSettingsPanel({
  workspaceSlug,
  highlightIntent = null,
  initialCheckoutSessionId = null,
  runId,
  source,
  week8Focus,
  attentionWorkspace,
  attentionOrganization,
  deliveryContext,
  recentTrackKey,
  recentUpdateKind,
  evidenceCount,
  recentOwnerLabel,
  recentOwnerDisplayName,
  recentOwnerEmail,
}: {
  workspaceSlug: string;
  highlightIntent?: "upgrade" | "manage-plan" | "resolve-billing" | null;
  initialCheckoutSessionId?: string | null;
  runId?: string | null;
  source?: string | null;
  week8Focus?: string | null;
  attentionWorkspace?: string | null;
  attentionOrganization?: string | null;
  deliveryContext?: string | null;
  recentTrackKey?: string | null;
  recentUpdateKind?: string | null;
  evidenceCount?: number | null;
  recentOwnerLabel?: string | null;
  recentOwnerDisplayName?: string | null;
  recentOwnerEmail?: string | null;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["workspace-settings", workspaceSlug],
    queryFn: fetchCurrentWorkspace,
  });
  const {
    data: ssoReadiness,
    isLoading: isSsoLoading,
    isError: isSsoError,
  } = useQuery({
    queryKey: ["workspace-sso-readiness", workspaceSlug],
    queryFn: fetchWorkspaceSsoReadiness,
  });
  const {
    data: dedicatedEnvironmentReadiness,
    isLoading: isDedicatedEnvironmentLoading,
    isError: isDedicatedEnvironmentError,
  } = useQuery({
    queryKey: ["workspace-dedicated-environment-readiness", workspaceSlug],
    queryFn: fetchWorkspaceDedicatedEnvironmentReadiness,
  });
  const [checkout, setCheckout] = useState<CheckoutFlowState>(defaultCheckoutFlowState);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [subscriptionAction, setSubscriptionAction] = useState<SubscriptionActionState>(
    defaultSubscriptionActionState,
  );
  const [auditExport, setAuditExport] = useState<AuditExportState>(defaultAuditExportState);
  const [auditExportReceipt, setAuditExportReceipt] = useState<AuditExportReceipt | null>(null);
  const [auditExportFormat, setAuditExportFormat] = useState<"json" | "jsonl">("jsonl");
  const [auditFromDate, setAuditFromDate] = useState("");
  const [auditToDate, setAuditToDate] = useState("");
  const [ssoDraft, setSsoDraft] = useState({
    protocol: "oidc" as "oidc" | "saml",
    metadataUrl: "",
    entityId: "",
    domains: "",
  });
  const [hydratedSsoConfigKey, setHydratedSsoConfigKey] = useState<string | null>(null);
  const [ssoPreflightNotice, setSsoPreflightNotice] = useState<string | null>(null);
  const [ssoWriteState, setSsoWriteState] = useState<EnterpriseWriteState>(defaultEnterpriseWriteState);
  const [dedicatedDraft, setDedicatedDraft] = useState({
    targetRegion: "",
    dataClassification: "internal" as "internal" | "restricted" | "external",
    requesterEmail: "",
    requestedCapacity: "",
    requestedSla: "",
    networkNotes: "",
  });
  const [hydratedDedicatedConfigKey, setHydratedDedicatedConfigKey] = useState<string | null>(null);
  const [dedicatedPreflightNotice, setDedicatedPreflightNotice] = useState<string | null>(null);
  const [dedicatedWriteState, setDedicatedWriteState] = useState<EnterpriseWriteState>(
    defaultEnterpriseWriteState,
  );

  const workspace = data?.workspace;
  const plan = data?.plan;
  const billingSummary = data?.billing_summary;
  const billingProviders = data?.billing_providers;
  const subscription = data?.subscription;
  const usage = data?.usage;
  const members = data?.members ?? [];
  const providerEntries = billingProviders?.providers ?? [];
  const sessionProviderLabel = formatBillingProviderLabel(
    checkout.session?.billing_provider ?? null,
    providerEntries,
  );
  const currentBillingProvider = providerEntries.find((provider) => provider.is_current) ?? null;
  const metrics = usage ? Object.entries(usage.metrics) : [];
  const overLimitMetrics = metrics.filter(([, metric]) => metric.over_limit);
  const canStartCheckout =
    billingSummary?.action?.kind === "upgrade" &&
    billingSummary.action.availability === "ready";
  const canScheduleCancellation =
    Boolean(subscription) &&
    !subscription?.cancel_at_period_end &&
    !["cancelled", "paused"].includes(subscription?.status ?? "") &&
    ((plan?.monthly_price_cents ?? 0) > 0 || plan?.tier === "paid");
  const canResumeRenewal =
    Boolean(subscription) &&
    subscription?.cancel_at_period_end === true &&
    !["cancelled", "paused"].includes(subscription?.status ?? "");
  const resolvedBillingProviderCode =
    subscription?.billing_provider ?? billingSummary?.provider ?? currentBillingProvider?.code ?? null;
  const isStripeWorkspace = isStripeBillingProvider(resolvedBillingProviderCode);
  const selfServeSetupNotice = formatSelfServeSetupNotice(billingSummary?.self_serve_reason_code ?? null);
  const canOpenBillingPortal =
    Boolean(subscription) && Boolean(currentBillingProvider?.supports_customer_portal);
  const showLocalSubscriptionControls = !isStripeWorkspace && (canScheduleCancellation || canResumeRenewal);
  const showSubscriptionControls = canOpenBillingPortal || showLocalSubscriptionControls;
  const normalizedSource = normalizeSettingsSource(source);
  const normalizedDeliveryContext = normalizeDeliveryContext(deliveryContext);
  const normalizedRecentTrackKey = normalizeRecentTrackKey(recentTrackKey);
  const normalizedRecentUpdateKind = normalizeRecentUpdateKind(recentUpdateKind);
  const normalizedEvidenceCount =
    typeof evidenceCount === "number" && Number.isFinite(evidenceCount) ? evidenceCount : null;
  const handoffHrefArgs = {
    source: normalizedSource,
    runId,
    week8Focus,
    attentionWorkspace,
    attentionOrganization,
    deliveryContext: normalizedDeliveryContext,
    recentTrackKey: normalizedRecentTrackKey,
    recentUpdateKind: normalizedRecentUpdateKind,
    evidenceCount: normalizedEvidenceCount,
    recentOwnerLabel,
    recentOwnerDisplayName,
    recentOwnerEmail,
    ...buildAuditExportReceiptContinuityArgs(auditExportReceipt),
  } satisfies Omit<SettingsHrefArgs, "pathname" | "intent">;
  const adminReturnHref = buildAdminReturnHref("/admin", {
    source: normalizedSource,
    runId,
    queueSurface: normalizedRecentTrackKey,
    week8Focus,
    attentionWorkspace: attentionWorkspace ?? workspaceSlug,
    attentionOrganization,
    deliveryContext: normalizedDeliveryContext,
    recentTrackKey: normalizedRecentTrackKey,
    recentUpdateKind: normalizedRecentUpdateKind,
    evidenceCount: normalizedEvidenceCount,
    recentOwnerLabel,
    recentOwnerDisplayName,
    recentOwnerEmail,
    ...buildAuditExportReceiptContinuityArgs(auditExportReceipt),
  });
  const usageHref = buildSettingsHref({ pathname: "/usage", ...handoffHrefArgs });
  const verificationHref = buildSettingsHref({ pathname: "/verification?surface=verification", ...handoffHrefArgs });
  const goLiveHref = buildSettingsHref({ pathname: "/go-live?surface=go_live", ...handoffHrefArgs });
  const managePlanIntentHref = buildSettingsIntentHref("manage-plan", handoffHrefArgs);
  const resolveBillingIntentHref = buildSettingsIntentHref("resolve-billing", handoffHrefArgs);
  const artifactsEarlyHref = buildSettingsHref({ pathname: "/artifacts", ...handoffHrefArgs });
  const upgradeIntentHref = buildSettingsIntentHref("upgrade", handoffHrefArgs);
  const billingActionHref = billingSummary?.action
    ? buildSettingsHref({
        pathname: billingSummary.action.href,
        ...handoffHrefArgs,
      })
    : null;
  const highlightBillingCard = intentMatchesAction(
    highlightIntent,
    billingActionHref ?? billingSummary?.action?.href,
  );
  const auditExportEnabled = plan?.features?.audit_export === true;
  const auditContractSource: ContractMetaSource | null =
    auditExport.contractSource ?? (auditExportEnabled ? null : "fallback_feature_gate");
  const auditContractIssueMessage =
    auditExport.contractIssueMessage ??
    (!auditExportEnabled ? "Audit export is not available on the current plan." : null);
  const auditContractIssueCode =
    auditExport.contractIssueCode ?? (!auditExportEnabled ? "workspace_feature_unavailable" : null);
  const auditContractIssue: ControlPlaneContractIssue | null =
    auditContractIssueCode && auditContractIssueMessage
      ? {
          code: auditContractIssueCode,
          message: auditContractIssueMessage,
          status: auditContractSource === "fallback_feature_gate" ? 409 : null,
          retryable: false,
          details: {},
        }
      : null;
  const ssoEnabledByPlan = plan?.features?.sso === true;
  const ssoFeatureEnabled = ssoReadiness?.feature_enabled ?? ssoEnabledByPlan;
  const ssoUpgradeHref =
    (ssoReadiness?.upgrade_href
      ? buildSettingsHref({
          pathname: ssoReadiness.upgrade_href,
          ...handoffHrefArgs,
        })
      : null) ??
    (billingSummary?.action?.kind === "upgrade" ? billingActionHref : upgradeIntentHref) ??
    upgradeIntentHref;
  const dedicatedEnvironmentEnabledByPlan = plan?.features?.dedicated_environment === true;
  const dedicatedEnvironmentFeatureEnabled =
    dedicatedEnvironmentReadiness?.feature_enabled ?? dedicatedEnvironmentEnabledByPlan;
  const dedicatedEnvironmentUpgradeHref =
    (dedicatedEnvironmentReadiness?.upgrade_href
      ? buildSettingsHref({
          pathname: dedicatedEnvironmentReadiness.upgrade_href,
          ...handoffHrefArgs,
        })
      : null) ??
    (billingSummary?.action?.kind === "upgrade" ? billingActionHref : upgradeIntentHref) ??
    upgradeIntentHref;
  const ssoProtocols = ssoReadiness?.supported_protocols ?? ["oidc", "saml"];
  const ssoContractSource = (ssoReadiness?.contract_meta?.source ?? null) as ContractMetaSource | null;
  const ssoContractIssue = ssoReadiness?.contract_meta?.issue ?? null;
  const ssoAdditiveState = readEnterpriseAdditiveState(ssoReadiness);
  const ssoConfigured = ssoAdditiveState.configured ?? (ssoReadiness?.status === "configured");
  const ssoConfigurationState = ssoAdditiveState.configurationState;
  const ssoDeliveryStatus = ssoAdditiveState.deliveryStatus;
  const ssoReadinessVersion = ssoAdditiveState.readinessVersion;
  const ssoConfiguredDomains = normalizeDomainList([
    ...(ssoReadiness?.email_domains ?? []),
    ssoReadiness?.email_domain ?? null,
  ]);
  const ssoConfiguredDomainsDraftValue = ssoConfiguredDomains.join(", ");
  const ssoConfiguredIdentity = readString(
    ssoReadiness?.provider_type === "saml" ? ssoReadiness?.audience : ssoReadiness?.client_id,
  );
  const ssoNextSteps = ssoReadiness?.next_steps ?? [
    "Upgrade to a plan with SSO support.",
    "Choose OIDC or SAML as the connection protocol.",
    "Configure identity provider metadata and domain mapping.",
  ];
  const dedicatedEnvironmentNextSteps = dedicatedEnvironmentReadiness?.next_steps ?? [
    "Upgrade to a plan with dedicated environment support.",
    "Confirm region and compliance boundaries for the target deployment.",
    "Review network and access isolation requirements before provisioning.",
  ];
  const dedicatedContractSource = (dedicatedEnvironmentReadiness?.contract_meta?.source ?? null) as ContractMetaSource | null;
  const dedicatedContractIssue = dedicatedEnvironmentReadiness?.contract_meta?.issue ?? null;
  const dedicatedAdditiveState = readEnterpriseAdditiveState(dedicatedEnvironmentReadiness);
  const dedicatedConfigured =
    dedicatedAdditiveState.configured ?? (dedicatedEnvironmentReadiness?.status === "configured");
  const dedicatedConfigurationState = dedicatedAdditiveState.configurationState;
  const dedicatedDeliveryStatus = dedicatedAdditiveState.deliveryStatus;
  const dedicatedReadinessVersion = dedicatedAdditiveState.readinessVersion;
  const dedicatedConfiguredRegion = dedicatedEnvironmentReadiness?.target_region ?? workspace?.data_region ?? null;
  const dedicatedRequesterEmail = readString(dedicatedEnvironmentReadiness?.requester_email);
  const dedicatedDataClassification = readString(dedicatedEnvironmentReadiness?.data_classification);
  const dedicatedRequestedCapacity = readString(dedicatedEnvironmentReadiness?.requested_capacity);
  const dedicatedRequestedSla = readString(dedicatedEnvironmentReadiness?.requested_sla);
  const ssoDomainList = ssoDraft.domains
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item !== "");
  const ssoValidationErrors = [
    !ssoFeatureEnabled ? "SSO write flow is locked until plan upgrade." : null,
    ssoDraft.metadataUrl.trim() === "" ? "Metadata URL is required for preflight." : null,
    ssoDraft.metadataUrl.trim() !== "" && !isLikelyHttpsUrl(ssoDraft.metadataUrl)
      ? "Metadata URL must be a valid HTTPS URL."
      : null,
    ssoDomainList.length === 0 ? "At least one domain is required for preflight." : null,
    ssoDomainList.some((domain) => !isLikelyDomain(domain))
      ? "One or more domains are invalid."
      : null,
  ].filter((item): item is string => item !== null);
  const ssoPreflightReady = ssoValidationErrors.length === 0;
  const ssoSubmitDisabledReason = ssoWriteState.submitting
    ? "Submitting SSO configuration..."
    : !ssoFeatureEnabled
      ? "SSO write flow is locked until plan upgrade."
      : !ssoPreflightReady
        ? ssoValidationErrors[0]
        : null;
  const ssoMetadataHost =
    ssoDraft.metadataUrl.trim() !== "" && isLikelyHttpsUrl(ssoDraft.metadataUrl)
      ? new URL(ssoDraft.metadataUrl).host
      : null;

  const dedicatedValidationErrors = [
    !dedicatedEnvironmentFeatureEnabled
      ? "Dedicated environment write flow is locked until plan upgrade."
      : null,
    dedicatedDraft.targetRegion.trim() === "" ? "Target region is required for preflight." : null,
    dedicatedDraft.requesterEmail.trim() === "" ? "Requester email is required for preflight." : null,
    dedicatedDraft.requesterEmail.trim() !== "" && !isLikelyEmail(dedicatedDraft.requesterEmail)
      ? "Requester email format is invalid."
      : null,
  ].filter((item): item is string => item !== null);
  const dedicatedPreflightReady = dedicatedValidationErrors.length === 0;
  const dedicatedSubmitDisabledReason = dedicatedWriteState.submitting
    ? "Submitting dedicated-environment intake..."
    : !dedicatedEnvironmentFeatureEnabled
      ? "Dedicated environment write flow is locked until plan upgrade."
      : !dedicatedPreflightReady
        ? dedicatedValidationErrors[0]
        : null;

  const readinessCard =
    normalizedSource === "admin-readiness"
      ? {
          title: "Admin readiness follow-up",
          body: `This workspace is aligned with the Week 8 ${readinessFocusLabel(
            week8Focus,
          )} focus. Review billing posture, usage evidence, and feature gating before returning to the admin snapshot.`,
        }
      : null;
  const attentionCard =
    normalizedSource === "admin-attention"
      ? {
          title: "Admin queue billing follow-up",
          body:
            "You arrived here from the admin attention queue. Use this page as billing and feature-gating context, then continue manually into verification, usage, or the go-live drill before returning to the queue.",
        }
      : null;
  const onboardingCard =
    normalizedSource === "onboarding"
      ? {
          title: "Onboarding governance checkpoint",
          body: `Finish the first demo by confirming billing, feature gating, and audit-export readiness so the Week 8 checklist can cite concrete evidence. This page captures the billing plan, the enrolled feature toggles, and the ability to download audit events before you head back to verification or the mock go-live drill.`,
        }
      : null;
  const intentContextMap: Record<
    "manage-plan" | "resolve-billing" | "upgrade",
    {
      title: string;
      body: string;
      actions: Array<{ label: string; href: string }>;
      footnote: string;
    }
  > = {
    "manage-plan": {
      title: "Manage-plan billing intent",
      body:
        "You arrived with intent to inspect the plan binding. Confirm the upgrade readiness before returning to verification evidence or usage pressure to keep the Week 8 trace aligned.",
      actions: [
        { label: "Back to Week 8 checklist", href: verificationHref },
        { label: "Review usage pressure", href: usageHref },
      ],
      footnote: "This intent-aware guidance is purely navigational; it keeps the plan workstream traceable without triggering automation or impersonation.",
    },
    "resolve-billing": {
      title: "Resolve billing warning intent",
      body:
        "This path lands you in settings to resolve past-due or warning statuses. Finish the billing cleanup and confirm the portal-return or local renewal status before returning to the Week 8 checkpoint or admin readiness focus.",
      actions: [
        { label: "Return to Week 8 checklist", href: verificationHref },
        { label: "Return to admin readiness view", href: adminReturnHref },
      ],
      footnote: "These links restore the `admin-readiness` focus once manual resolution finishes; nothing is automated for you.",
    },
    upgrade: {
      title: "Upgrade intent",
      body:
        "You landed here to complete the self-serve upgrade lane and gate the new features. Confirm audit export and feature toggles before continuing to the go-live drill or verification evidence.",
      actions: [
        { label: "Continue to go-live drill", href: goLiveHref },
        { label: "Confirm usage evidence", href: usageHref },
      ],
      footnote: "The upgrade intent keeps the new feature gating decision in the same navigation context—no support or impersonation is happening.",
    },
  };
  const intentCard = highlightIntent ? intentContextMap[highlightIntent] : null;
  const showBillingFollowUpCard =
    !intentCard && (normalizedSource || checkout.session || subscriptionAction.notice || auditExport.notice);
  const governanceClosureCard = {
    title: "Billing and readiness closure lane",
    body:
      "Use this lane to keep plan/billing, audit-export, and feature-gating follow-up in one governance path: resolve settings changes here, attach verification evidence, rehearse go-live readiness, then return to admin readiness focus.",
    actions: [
      {
        label: billingSummary?.status_tone === "warning" ? "Resolve billing warning lane" : "Review plan and billing lane",
        href: billingSummary?.status_tone === "warning" ? resolveBillingIntentHref : managePlanIntentHref,
      },
      { label: "Capture verification evidence", href: verificationHref },
      { label: "Rehearse go-live readiness", href: goLiveHref },
      { label: "Return to admin readiness view", href: adminReturnHref },
    ],
    footnote:
      "Navigation only: these links preserve governance context across settings, verification, go-live, and admin readiness without automation, support tooling, or impersonation.",
  };
  const usagePressureCard = {
    title: "Plan limit and usage pressure",
    body:
      overLimitMetrics.length > 0
        ? "One or more workspace metrics are already over plan. Resolve the limit pressure, confirm the billing or upgrade path, then carry the same evidence trail into verification and admin follow-up."
        : metrics.length > 0
          ? "Use this lane to compare plan limits with current usage before limits block a first demo, a provider expansion, or later Week 8 follow-up."
          : "Usage has not accumulated yet for the current period. Keep this lane ready so the first run, storage growth, and provider expansion can be checked against plan limits when they appear."
    ,
    highlights:
      metrics.length > 0
        ? metrics.slice(0, 3).map(([key, metric]) => ({
            label: formatMetricLabel(key),
            value: `${formatMetricValue(key, metric.used)}${metric.limit !== null ? ` / ${formatMetricValue(key, metric.limit)}` : " / unlimited"}`,
            tone: metric.over_limit ? "warning" : "neutral",
          }))
        : [
            {
              label: "Current period",
              value: `${formatDate(usage?.period_start)} to ${formatDate(usage?.period_end)}`,
              tone: "neutral" as const,
            },
          ],
    actions: [
      { label: "Review usage pressure", href: usageHref },
      {
        label: billingSummary?.status_tone === "warning" ? "Resolve billing warning lane" : "Review plan and billing lane",
        href: billingSummary?.status_tone === "warning" ? resolveBillingIntentHref : managePlanIntentHref,
      },
      { label: "Capture verification evidence", href: verificationHref },
      { label: "Return to admin readiness view", href: adminReturnHref },
    ],
    footnote:
      "This lane is still navigation-only: compare usage against plan limits, decide whether billing action is needed, then keep the same workspace evidence path through verification and back to admin.",
  };
  const billingFollowUpCard = showBillingFollowUpCard
    ? {
        title: normalizedSource === "onboarding" ? "Onboarding billing evidence" : "Billing evidence handoff",
        body:
          normalizedSource === "onboarding"
            ? "Once the billing action (upgrade, checkout, or portal return) is ready, use this panel to capture notes and evidence before you navigate back to verification, usage, or the go-live drill."
            : "Document the billing update, audit export, or portal interaction so the verification/go-live evidence panels can cite the same timeline and you can return to the admin readiness lane.",
        actions:
          normalizedSource === "onboarding"
            ? [
                { label: "Capture verification evidence", href: verificationHref },
                { label: "Review usage pressure", href: usageHref },
              ]
            : [
                { label: "Return to Week 8 checklist", href: verificationHref },
                { label: "Continue to go-live drill", href: goLiveHref },
                { label: "Return to admin readiness view", href: adminReturnHref },
              ],
        footnote:
          "These navigation cues keep checkout, portal, and audit evidence linked to the same workspace timeline; they do not open support workflows, automate remediation, or impersonate any role.",
      }
    : null;

  useEffect(() => {
    if (!initialCheckoutSessionId || checkout.session?.session_id === initialCheckoutSessionId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      setCheckout((current) => ({
        ...current,
        refreshing: true,
        error: null,
        notice: null,
      }));
      try {
        const payload = await fetchBillingCheckoutSession(initialCheckoutSessionId);
        const session = extractCheckoutSession(payload);
        if (cancelled) {
          return;
        }
        setCheckout((current) => ({
          ...current,
          refreshing: false,
          session,
          notice: session ? "Loaded checkout session from the current settings link." : current.notice,
        }));
        if (session) {
          setBillingInterval(session.billing_interval);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setCheckout((current) => ({
          ...current,
          refreshing: false,
          error: error instanceof Error ? error.message : "Unable to load checkout session",
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [checkout.session?.session_id, initialCheckoutSessionId]);

  useEffect(() => {
    const configKey = buildSsoHydrationConfigKey({
      readiness: ssoReadiness,
      configuredIdentity: ssoConfiguredIdentity,
      configuredDomains: ssoConfiguredDomains,
    });
    if (!configKey || hydratedSsoConfigKey === configKey) {
      return;
    }

    setSsoDraft((current) => ({
      ...current,
      protocol: ssoReadiness?.provider_type ?? current.protocol,
      metadataUrl: ssoReadiness?.metadata_url ?? current.metadataUrl,
      entityId: ssoConfiguredIdentity ?? current.entityId,
      domains: ssoConfiguredDomainsDraftValue,
    }));
    setHydratedSsoConfigKey(configKey);
  }, [
    hydratedSsoConfigKey,
    ssoConfigured,
    ssoConfiguredDomainsDraftValue,
    ssoConfiguredIdentity,
    ssoReadiness?.configured_at,
    ssoReadiness?.metadata_url,
    ssoReadiness?.provider_type,
  ]);

  useEffect(() => {
    const configKey = buildDedicatedHydrationConfigKey({
      readiness: dedicatedEnvironmentReadiness,
      configuredRegion: dedicatedConfiguredRegion,
      requesterEmail: dedicatedRequesterEmail,
      requestedCapacity: dedicatedRequestedCapacity,
      requestedSla: dedicatedRequestedSla,
    });
    if (!configKey || hydratedDedicatedConfigKey === configKey) {
      return;
    }

    setDedicatedDraft((current) => ({
      ...current,
      targetRegion: dedicatedConfiguredRegion ?? current.targetRegion,
      dataClassification: dedicatedEnvironmentReadiness?.data_classification ?? current.dataClassification,
      requesterEmail: dedicatedRequesterEmail ?? current.requesterEmail,
      requestedCapacity: dedicatedRequestedCapacity ?? current.requestedCapacity,
      requestedSla: dedicatedRequestedSla ?? current.requestedSla,
      networkNotes: dedicatedEnvironmentReadiness?.network_boundary ?? current.networkNotes,
    }));
    setHydratedDedicatedConfigKey(configKey);
  }, [
    dedicatedConfigured,
    dedicatedConfiguredRegion,
    dedicatedEnvironmentReadiness?.configured_at,
    dedicatedEnvironmentReadiness?.data_classification,
    dedicatedEnvironmentReadiness?.network_boundary,
    dedicatedRequesterEmail,
    dedicatedRequestedCapacity,
    dedicatedRequestedSla,
    hydratedDedicatedConfigKey,
  ]);

  async function createCheckoutSession(): Promise<void> {
    if (!canStartCheckout || checkout.creating || checkout.completing || checkout.refreshing) {
      return;
    }

    setCheckout((current) => ({
      ...current,
      creating: true,
      error: null,
      notice: null,
    }));
    try {
      const payload = await createBillingCheckoutSession({
        billing_interval: billingInterval,
      });
      const session = extractCheckoutSession(payload);
      const isStripeCheckoutSession = isStripeBillingProvider(session?.billing_provider);
      setCheckout((current) => ({
        ...current,
        creating: false,
        session,
        notice: session
          ? isStripeCheckoutSession
            ? "Stripe checkout session prepared. Redirecting to provider-hosted checkout..."
            : "Checkout session prepared. Review details, then complete the upgrade step in this workspace flow."
          : "Checkout request accepted. Refresh to fetch latest session details.",
      }));
      if (isStripeCheckoutSession && session?.checkout_url) {
        window.location.assign(session.checkout_url);
      }
    } catch (error) {
      setCheckout((current) => ({
        ...current,
        creating: false,
        error: formatCheckoutActionError(error, {
          action: "create",
          providerCode: currentBillingProvider?.code ?? resolvedBillingProviderCode,
        }),
      }));
    }
  }

  async function refreshCheckoutSession(): Promise<void> {
    if (!checkout.session?.session_id || checkout.creating || checkout.completing || checkout.refreshing) {
      return;
    }

    setCheckout((current) => ({
      ...current,
      refreshing: true,
      error: null,
      notice: null,
    }));
    try {
      const payload = await fetchBillingCheckoutSession(checkout.session.session_id);
      const session = extractCheckoutSession(payload);
      setCheckout((current) => ({
        ...current,
        refreshing: false,
        session: session ?? current.session,
        notice: isStripeBillingProvider(session?.billing_provider ?? current.session?.billing_provider)
          ? "Checkout status refreshed. Stripe sessions update after provider checkout and webhook confirmation."
          : "Checkout session status refreshed.",
      }));
      if (session) {
        setBillingInterval(session.billing_interval);
      }
    } catch (error) {
      setCheckout((current) => ({
        ...current,
        refreshing: false,
        error: formatCheckoutActionError(error, {
          action: "refresh",
          providerCode: current.session?.billing_provider ?? currentBillingProvider?.code ?? resolvedBillingProviderCode,
        }),
      }));
    }
  }

  async function completeCheckoutSession(): Promise<void> {
    if (!checkout.session?.session_id || checkout.creating || checkout.completing || checkout.refreshing) {
      return;
    }

    setCheckout((current) => ({
      ...current,
      completing: true,
      error: null,
      notice: null,
    }));
    try {
      const payload = await completeBillingCheckoutSession(checkout.session.session_id);
      const session = extractCheckoutSession(payload);
      await invalidateBillingAndEnterpriseQueries();
      setCheckout((current) => ({
        ...current,
        completing: false,
        session: session ?? current.session,
        notice: isStripeBillingProvider(session?.billing_provider ?? current.session?.billing_provider)
          ? "Provider confirmation received. Workspace billing summary has been refreshed."
          : "Checkout session marked completed. Workspace billing summary has been refreshed.",
      }));
    } catch (error) {
      setCheckout((current) => ({
        ...current,
        completing: false,
        error: formatCheckoutActionError(error, {
          action: "complete",
          providerCode: current.session?.billing_provider ?? currentBillingProvider?.code ?? resolvedBillingProviderCode,
        }),
      }));
    }
  }

  async function scheduleSubscriptionCancellation(): Promise<void> {
    if (
      !canScheduleCancellation ||
      subscriptionAction.openingPortal ||
      subscriptionAction.cancelling ||
      subscriptionAction.resuming
    ) {
      return;
    }

    setSubscriptionAction({
      openingPortal: false,
      cancelling: true,
      resuming: false,
      error: null,
      notice: null,
    });

    try {
      await cancelBillingSubscription();
      await invalidateBillingAndEnterpriseQueries();
      setSubscriptionAction({
        openingPortal: false,
        cancelling: false,
        resuming: false,
        error: null,
        notice: "Subscription will now end at the close of the current billing period.",
      });
    } catch (error) {
      setSubscriptionAction({
        openingPortal: false,
        cancelling: false,
        resuming: false,
        error: formatSubscriptionActionError(error, {
          action: "cancel",
        }),
        notice: null,
      });
    }
  }

  async function resumeSubscriptionRenewal(): Promise<void> {
    if (
      !canResumeRenewal ||
      subscriptionAction.openingPortal ||
      subscriptionAction.cancelling ||
      subscriptionAction.resuming
    ) {
      return;
    }

    setSubscriptionAction({
      openingPortal: false,
      cancelling: false,
      resuming: true,
      error: null,
      notice: null,
    });

    try {
      await resumeBillingSubscription();
      await invalidateBillingAndEnterpriseQueries();
      setSubscriptionAction({
        openingPortal: false,
        cancelling: false,
        resuming: false,
        error: null,
        notice: "Automatic renewal has been restored for this subscription.",
      });
    } catch (error) {
      setSubscriptionAction({
        openingPortal: false,
        cancelling: false,
        resuming: false,
        error: formatSubscriptionActionError(error, {
          action: "resume",
        }),
        notice: null,
      });
    }
  }

  async function openBillingPortal(): Promise<void> {
    if (
      !canOpenBillingPortal ||
      subscriptionAction.openingPortal ||
      subscriptionAction.cancelling ||
      subscriptionAction.resuming
    ) {
      return;
    }

    setSubscriptionAction({
      openingPortal: true,
      cancelling: false,
      resuming: false,
      error: null,
      notice: null,
    });

    try {
      const session = await createBillingPortalSession({
        return_url: window.location.href,
      });
      if (!session.portal_url) {
        throw new Error("Billing provider did not return a portal URL");
      }
      window.location.assign(session.portal_url);
    } catch (error) {
      setSubscriptionAction({
        openingPortal: false,
        cancelling: false,
        resuming: false,
        error: formatPortalActionError(error),
        notice: null,
      });
    }
  }

  async function invalidateBillingAndEnterpriseQueries(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["workspace-settings", workspaceSlug],
      }),
      queryClient.invalidateQueries({
        queryKey: ["workspace-sso-readiness", workspaceSlug],
      }),
      queryClient.invalidateQueries({
        queryKey: ["workspace-dedicated-environment-readiness", workspaceSlug],
      }),
    ]);
  }

  async function submitSsoConfiguration(): Promise<void> {
    if (ssoWriteState.submitting || ssoSubmitDisabledReason) {
      return;
    }

    const entityId = ssoDraft.entityId.trim();
    const payload: ControlPlaneWorkspaceSsoSaveRequest = {
      enabled: true,
      provider_type: ssoDraft.protocol,
      connection_mode: "workspace",
      metadata_url: ssoDraft.metadataUrl.trim(),
      email_domain: ssoDomainList[0] ?? null,
      email_domains: ssoDomainList,
      client_id: ssoDraft.protocol === "oidc" && entityId ? entityId : null,
      audience: ssoDraft.protocol === "saml" && entityId ? entityId : null,
      notes: null,
    };

    setSsoWriteState({
      submitting: true,
      error: null,
      notice: null,
      responseCode: null,
    });
    setSsoPreflightNotice(null);

    try {
      await saveWorkspaceSsoReadiness(payload);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["workspace-settings", workspaceSlug],
        }),
        queryClient.invalidateQueries({
          queryKey: ["workspace-sso-readiness", workspaceSlug],
        }),
      ]);
      setSsoWriteState({
        submitting: false,
        error: null,
        notice:
          "SSO configuration was recorded through controlled live write. Settings and readiness were refreshed for the latest status.",
        responseCode: null,
      });
    } catch (error) {
      setSsoWriteState({
        submitting: false,
        error: formatEnterpriseWriteError(error, { feature: "sso" }),
        notice: null,
        responseCode: isControlPlaneRequestError(error) ? error.code : null,
      });
    }
  }

  async function submitDedicatedEnvironmentRequest(): Promise<void> {
    if (dedicatedWriteState.submitting || dedicatedSubmitDisabledReason) {
      return;
    }

    const requesterEmail = dedicatedDraft.requesterEmail.trim();
    const networkNotes = dedicatedDraft.networkNotes.trim();
    const requestedCapacity = dedicatedDraft.requestedCapacity.trim();
    const requestedSla = dedicatedDraft.requestedSla.trim();
    const notes = [
      `Requester: ${requesterEmail}`,
      `Data classification: ${dedicatedDraft.dataClassification}`,
      requestedCapacity ? `Requested capacity: ${requestedCapacity}` : null,
      requestedSla ? `Requested SLA: ${requestedSla}` : null,
      networkNotes ? `Network / isolation notes: ${networkNotes}` : null,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
    const payload: ControlPlaneWorkspaceDedicatedEnvironmentSaveRequest = {
      enabled: true,
      deployment_model: "single_tenant",
      target_region: dedicatedDraft.targetRegion.trim(),
      compliance_notes: `Requested dedicated environment intake for ${formatTokenLabel(
        dedicatedDraft.dataClassification,
      )} data handling.`,
      network_boundary: networkNotes || null,
      requester_email: requesterEmail || null,
      data_classification: dedicatedDraft.dataClassification,
      requested_capacity: requestedCapacity || null,
      requested_sla: requestedSla || null,
      notes: notes || null,
    };

    setDedicatedWriteState({
      submitting: true,
      error: null,
      notice: null,
      responseCode: null,
    });
    setDedicatedPreflightNotice(null);

    try {
      await saveWorkspaceDedicatedEnvironmentReadiness(payload);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["workspace-settings", workspaceSlug],
        }),
        queryClient.invalidateQueries({
          queryKey: ["workspace-dedicated-environment-readiness", workspaceSlug],
        }),
      ]);
      setDedicatedWriteState({
        submitting: false,
        error: null,
        notice:
          "Dedicated environment intake was recorded through controlled live write. Settings and readiness were refreshed for the latest status.",
        responseCode: null,
      });
    } catch (error) {
      setDedicatedWriteState({
        submitting: false,
        error: formatEnterpriseWriteError(error, { feature: "dedicated_environment" }),
        notice: null,
        responseCode: isControlPlaneRequestError(error) ? error.code : null,
      });
    }
  }

  async function exportWorkspaceAudit(): Promise<void> {
    if (auditExport.exporting) {
      return;
    }

    const from = toIsoDateBoundary(auditFromDate, "start");
    const to = toIsoDateBoundary(auditToDate, "end");
    if (auditFromDate && !from) {
      setAuditExport({
        exporting: false,
        error: "Invalid start date. Use YYYY-MM-DD.",
        notice: null,
        contractSource: null,
        contractIssueMessage: null,
        contractIssueCode: null,
      });
      return;
    }
    if (auditToDate && !to) {
      setAuditExport({
        exporting: false,
        error: "Invalid end date. Use YYYY-MM-DD.",
        notice: null,
        contractSource: null,
        contractIssueMessage: null,
        contractIssueCode: null,
      });
      return;
    }
    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      setAuditExport({
        exporting: false,
        error: "Start date must be earlier than end date.",
        notice: null,
        contractSource: null,
        contractIssueMessage: null,
        contractIssueCode: null,
      });
      return;
    }

    setAuditExport({
      exporting: true,
      error: null,
      notice: null,
      contractSource: null,
      contractIssueMessage: null,
      contractIssueCode: null,
    });
    try {
      const result = await downloadWorkspaceAuditExportViewModel({
        format: auditExportFormat,
        from: from ?? undefined,
        to: to ?? undefined,
      });
      const contractSource = result.contract_meta.source;
      if (result.ok) {
        const download = result;
        const sha256 = await computeBlobSha256(download.blob);
        const objectUrl = URL.createObjectURL(download.blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = download.filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
        setAuditExport({
          exporting: false,
          error: null,
          notice: "Audit export downloaded. Attach it to verification/go-live evidence as needed.",
          contractSource,
          contractIssueMessage: null,
          contractIssueCode: null,
        });
        setAuditExportReceipt({
          filename: download.filename,
          format: download.format,
          exportedAt: new Date().toISOString(),
          fromDate: auditFromDate.trim() || null,
          toDate: auditToDate.trim() || null,
          contentType: download.content_type,
          sizeBytes: download.blob.size,
          sha256,
        });
        return;
      }

      const issue = result.error;
      const sourceMessage =
        contractSource === "fallback_feature_gate"
          ? "Audit export is gated by current plan entitlements. Upgrade to unlock export."
          : contractSource === "fallback_control_plane_unavailable"
            ? "Control plane is unavailable; audit export cannot be generated right now."
            : "Audit export request failed. Retry after checking workspace/control-plane health.";
      setAuditExport({
        exporting: false,
        error: `${sourceMessage}${issue.message ? ` (${issue.message})` : ""}`,
        notice: null,
        contractSource,
        contractIssueMessage: issue.message,
        contractIssueCode: issue.code,
      });
    } catch (error) {
      setAuditExport({
        exporting: false,
        error: formatAuditExportActionError(error),
        notice: null,
        contractSource: "fallback_error",
        contractIssueMessage:
          isControlPlaneRequestError(error) || error instanceof Error ? error.message : null,
        contractIssueCode: isControlPlaneRequestError(error) ? error.code : "request_failed",
      });
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {readinessCard ? (
        <Card>
          <CardHeader>
            <CardTitle>{readinessCard.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted">{readinessCard.body}</p>
            <Link
              href={adminReturnHref}
              className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
            >
              Return to admin readiness view
            </Link>
          </CardContent>
        </Card>
      ) : null}
      {attentionCard ? (
        <Card>
          <CardHeader>
            <CardTitle>{attentionCard.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted">{attentionCard.body}</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={verificationHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Continue to verification
              </Link>
              <Link
                href={adminReturnHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Return to admin queue
              </Link>
            </div>
            <p className="text-xs text-muted">
              These links preserve the current admin queue navigation context only. They do not automate remediation,
              open support tooling, or switch identity.
            </p>
          </CardContent>
        </Card>
      ) : null}
      {onboardingCard ? (
        <Card>
          <CardHeader>
            <CardTitle>{onboardingCard.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted">{onboardingCard.body}</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={verificationHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Return to verification
              </Link>
              <Link
                href={goLiveHref}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                Continue with go-live drill prep
              </Link>
            </div>
            <p className="text-xs text-muted">
              These links only preserve the onboarding navigation context—they do not automate actions, open support
              sessions, or impersonate another role.
            </p>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{governanceClosureCard.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted">{governanceClosureCard.body}</p>
          <div className="flex flex-wrap gap-2">
            {governanceClosureCard.actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                {action.label}
              </Link>
            ))}
          </div>
          <p className="text-xs text-muted">{governanceClosureCard.footnote}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{usagePressureCard.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted">{usagePressureCard.body}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {usagePressureCard.highlights.map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs text-muted">{item.label}</p>
                <p className="mt-1 font-medium text-foreground">{item.value}</p>
                <Badge className="mt-2" variant={item.tone === "warning" ? "default" : "subtle"}>
                  {item.tone === "warning" ? "Needs follow-up" : "Tracked"}
                </Badge>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {usagePressureCard.actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
              >
                {action.label}
              </Link>
            ))}
          </div>
          <p className="text-xs text-muted">{usagePressureCard.footnote}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {isLoading ? <p className="text-muted">Loading workspace settings...</p> : null}
          {isError ? <p className="text-muted">Showing fallback workspace context.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Display name</p>
              <p className="mt-1 font-medium text-foreground">{workspace?.display_name ?? workspaceSlug}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Tenant</p>
              <p className="mt-1 font-medium text-foreground">{workspace?.tenant_id ?? "tenant_demo"}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Workspace slug</p>
              <p className="mt-1 font-medium text-foreground">{workspace?.slug ?? workspaceSlug}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Data region</p>
              <p className="mt-1 font-medium text-foreground">{workspace?.data_region ?? "global"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan and access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="strong">{plan?.display_name ?? "Free"}</Badge>
            <Badge variant="default">{workspace?.membership.role ?? "workspace_owner"}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Monthly price</p>
              <p className="mt-1 font-medium text-foreground">{formatPrice(plan?.monthly_price_cents ?? 0)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Active members</p>
              <p className="mt-1 font-medium text-foreground">{members.length}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-muted">Plan limits</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(plan?.limits ?? {}).map(([key, value]) => (
                <Badge key={key} variant="subtle">
                  {key}: {String(value)}
                </Badge>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-muted">Feature readiness</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={ssoFeatureEnabled ? "strong" : "subtle"}>
                Single sign-on {ssoFeatureEnabled ? "enabled" : "staged"}
              </Badge>
              <Badge variant={dedicatedEnvironmentFeatureEnabled ? "strong" : "subtle"}>
                Dedicated environment {dedicatedEnvironmentFeatureEnabled ? "enabled" : "staged"}
              </Badge>
              <Badge variant={auditExportEnabled ? "strong" : "subtle"}>
                Audit export {auditExportEnabled ? "enabled" : "staged"}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted">
              Enterprise capabilities are surfaced per workspace plan. Audit export is downloadable when enabled, and
              the SSO and dedicated-environment sections below expose readiness when the current plan includes those features.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Single Sign-On</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={enterpriseStatusBadgeVariant({
                enabled: ssoFeatureEnabled,
                status: ssoReadiness?.status ?? null,
                configured: ssoConfigured,
                configurationState: ssoConfigurationState,
                isError: isSsoError,
              })}
            >
              {enterpriseStatusLabel({
                enabled: ssoFeatureEnabled,
                status: ssoReadiness?.status ?? null,
                configured: ssoConfigured,
                configurationState: ssoConfigurationState,
                isError: isSsoError,
              })}
            </Badge>
            <Badge variant={ssoFeatureEnabled ? "default" : "subtle"}>
              {ssoFeatureEnabled ? "Plan feature enabled" : "Plan upgrade required"}
            </Badge>
            <Badge variant="subtle">{formatFeatureStatusLabel(ssoReadiness?.status)}</Badge>
            {ssoConfigurationState ? (
              <Badge variant="subtle">config: {formatTokenLabel(ssoConfigurationState)}</Badge>
            ) : null}
            {ssoDeliveryStatus ? (
              <Badge variant={ssoDeliveryStatus === "complete" ? "strong" : "default"}>
                delivery: {formatTokenLabel(ssoDeliveryStatus)}
              </Badge>
            ) : null}
            {ssoReadinessVersion ? <Badge variant="subtle">v{formatTokenLabel(ssoReadinessVersion)}</Badge> : null}
            {isSsoLoading ? <Badge variant="subtle">Loading readiness...</Badge> : null}
            {isSsoError ? <Badge variant="default">Unable to load live status</Badge> : null}
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={contractSourceBadgeVariant(ssoContractSource)}>
                {contractSourceLabel(ssoContractSource, ssoContractIssue)}
              </Badge>
              {ssoContractIssue?.code ? <Badge variant="subtle">code: {ssoContractIssue.code}</Badge> : null}
            </div>
            <p className="mt-2 text-xs text-muted">{contractSourceDescription(ssoContractSource, ssoContractIssue)}</p>
            {ssoContractIssue?.message ? (
              <p className="mt-1 text-xs text-muted">Issue: {ssoContractIssue.message}</p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Connection mode</p>
              <p className="mt-1 font-medium text-foreground">{ssoReadiness?.connection_mode ?? "workspace"}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Provider</p>
              <p className="mt-1 font-medium text-foreground">{ssoReadiness?.provider_type ?? "Not configured"}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-muted">Supported protocols</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ssoProtocols.map((protocol) => (
                <Badge key={protocol} variant="subtle">
                  {formatSsoProtocolLabel(protocol)}
                </Badge>
              ))}
            </div>
          </div>

          {ssoConfigured ? (
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Saved configuration</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">Configured domains</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {ssoConfiguredDomains.length > 0 ? ssoConfiguredDomains.join(", ") : "Not saved"}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">
                    {ssoReadiness?.provider_type === "saml" ? "Audience" : "Client ID"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">{ssoConfiguredIdentity ?? "Not saved"}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">Metadata URL</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {ssoReadiness?.metadata_url ?? "Not saved"}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">Entrypoint URL</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {ssoReadiness?.entrypoint_url ?? "Not saved"}
                  </p>
                </div>
              </div>
              {ssoReadiness?.notes ? (
                <p className="mt-3 text-xs text-muted">Operator notes: {ssoReadiness.notes}</p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-muted">Readiness checklist</p>
            <p className="mt-1 text-xs text-muted">
              {ssoFeatureEnabled
                ? ssoConfigured
                  ? "SSO is marked configured in readiness data. Use this section to validate rollout evidence and keep handoff artifacts current."
                  : "Use this section to drive operator handoff for SSO rollout. Controlled live write can record configuration intent here, while readiness cues and evidence handoff remain the source of truth for rollout status."
                : "This workspace can preview SSO requirements here, but provider setup stays locked until the plan includes the feature."}
            </p>
            {ssoConfigurationState || ssoDeliveryStatus ? (
              <p className="mt-1 text-xs text-muted">
                Runtime state: configuration{" "}
                <span className="text-foreground">{formatTokenLabel(ssoConfigurationState ?? "unknown")}</span> ·
                delivery <span className="text-foreground">{formatTokenLabel(ssoDeliveryStatus ?? "unknown")}</span>
              </p>
            ) : null}
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
              {ssoNextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-muted">Configuration skeleton</p>
            <p className="mt-1 text-xs text-muted">
              Use these inputs to validate request completeness, then submit a controlled live write when the workspace
              is eligible. Success here records configuration intent; rollout still depends on readiness and delivery status.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="rounded-xl border border-border bg-card p-3 text-xs text-muted">
                Protocol
                <select
                  value={ssoDraft.protocol}
                  disabled={!ssoFeatureEnabled}
                  onChange={(event) => {
                    const value = event.currentTarget.value === "saml" ? "saml" : "oidc";
                    setSsoDraft((current) => ({ ...current, protocol: value }));
                    setSsoPreflightNotice(null);
                    setSsoWriteState((current) => ({ ...current, error: null, notice: null, responseCode: null }));
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="oidc">OIDC</option>
                  <option value="saml">SAML</option>
                </select>
              </label>
              <label className="rounded-xl border border-border bg-card p-3 text-xs text-muted">
                IdP metadata URL
                <input
                  type="url"
                  placeholder="https://idp.example.com/.well-known/openid-configuration"
                  value={ssoDraft.metadataUrl}
                  disabled={!ssoFeatureEnabled}
                  onChange={(event) => {
                    setSsoDraft((current) => ({ ...current, metadataUrl: event.currentTarget.value }));
                    setSsoPreflightNotice(null);
                    setSsoWriteState((current) => ({ ...current, error: null, notice: null, responseCode: null }));
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="rounded-xl border border-border bg-card p-3 text-xs text-muted">
                Entity / client ID (optional)
                <input
                  type="text"
                  placeholder="workspace-console"
                  value={ssoDraft.entityId}
                  disabled={!ssoFeatureEnabled}
                  onChange={(event) => {
                    setSsoDraft((current) => ({ ...current, entityId: event.currentTarget.value }));
                    setSsoPreflightNotice(null);
                    setSsoWriteState((current) => ({ ...current, error: null, notice: null, responseCode: null }));
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="rounded-xl border border-border bg-card p-3 text-xs text-muted">
                Domain mappings (comma separated)
                <input
                  type="text"
                  placeholder="example.com, sub.example.com"
                  value={ssoDraft.domains}
                  disabled={!ssoFeatureEnabled}
                  onChange={(event) => {
                    setSsoDraft((current) => ({ ...current, domains: event.currentTarget.value }));
                    setSsoPreflightNotice(null);
                    setSsoWriteState((current) => ({ ...current, error: null, notice: null, responseCode: null }));
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            </div>
            <div className="mt-3 rounded-xl border border-border bg-card p-3 text-xs">
              <p className="text-muted">Preflight summary</p>
              <p className="mt-1 text-foreground">
                Protocol: {ssoDraft.protocol.toUpperCase()} · Domains: {ssoDomainList.length} · Metadata host:{" "}
                {ssoMetadataHost ?? "-"}
              </p>
              <p className="mt-1 text-muted">Entity ID: {ssoDraft.entityId.trim() || "-"}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!ssoPreflightReady}
                onClick={() => {
                  setSsoPreflightNotice(
                    "SSO preflight is ready. Review the summary, then use controlled live write to record configuration intent.",
                  );
                }}
              >
                Validate preflight
              </Button>
              <Button size="sm" disabled={Boolean(ssoSubmitDisabledReason)} onClick={() => void submitSsoConfiguration()}>
                {ssoWriteState.submitting ? "Submitting SSO..." : "Submit SSO configuration"}
              </Button>
              <Link
                href={verificationHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                Capture SSO evidence
              </Link>
              <Link
                href={goLiveHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                Continue to go-live drill
              </Link>
            </div>
            <p className="mt-2 text-xs text-muted">
              Submit status: {ssoSubmitDisabledReason ?? "Ready for controlled live write."}
            </p>
            {!ssoPreflightReady ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
                {ssoValidationErrors.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {ssoPreflightNotice ? <p className="mt-2 text-xs text-emerald-700">{ssoPreflightNotice}</p> : null}
            {ssoWriteState.notice ? <p className="mt-2 text-xs text-emerald-700">{ssoWriteState.notice}</p> : null}
            {ssoWriteState.error ? <p className="mt-2 text-xs text-rose-700">{ssoWriteState.error}</p> : null}
            {ssoWriteState.responseCode ? (
              <p className="mt-1 text-xs text-muted">Latest response code: {ssoWriteState.responseCode}</p>
            ) : null}
          </div>

          {!ssoFeatureEnabled ? (
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Upgrade required</p>
              <p className="mt-1 text-xs text-muted">
                SSO configuration is available as a plan-gated enterprise surface. Upgrade this workspace to unlock
                provider setup.
              </p>
              <div className="mt-3">
                <Link
                  href={ssoUpgradeHref}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                >
                  Upgrade plan
                </Link>
              </div>
            </div>
      ) : null}
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>SSO evidence lane</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3 text-sm text-muted">
      <p>
        After the SSO preflight and controlled write, capture the verification run, status, and notes that prove the
        identity provider can gate the workspace. Keep those references tied to the same workspace context.
      </p>
      <p className="text-xs text-muted">
        {ssoFeatureEnabled
          ? "SSO is already included in this plan, so keep the verification details and linked artifacts stitched into the Week 7/8 governance trail."
          : "SSO remains plan gated; keep this lane ready with the recorded run notes so the supported upgrade can reference them once it is unlocked."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={verificationHref}
          className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
        >
          Capture verification evidence
        </Link>
        <Link
          href={artifactsEarlyHref}
          className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
        >
          Review aligned artifacts
        </Link>
        <Link
          href={goLiveHref}
          className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
        >
          Continue to go-live
        </Link>
        <Link
          href={adminReturnHref}
          className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
        >
          Return to admin readiness
        </Link>
      </div>
      <p className="text-xs text-muted">
        Navigation only—this lane keeps the manual verification flow, artifact linkage, and admin-return path together.
      </p>
    </CardContent>
  </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dedicated environment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={enterpriseStatusBadgeVariant({
                enabled: dedicatedEnvironmentFeatureEnabled,
                status: dedicatedEnvironmentReadiness?.status ?? null,
                configured: dedicatedConfigured,
                configurationState: dedicatedConfigurationState,
                isError: isDedicatedEnvironmentError,
              })}
            >
              {enterpriseStatusLabel({
                enabled: dedicatedEnvironmentFeatureEnabled,
                status: dedicatedEnvironmentReadiness?.status ?? null,
                configured: dedicatedConfigured,
                configurationState: dedicatedConfigurationState,
                isError: isDedicatedEnvironmentError,
              })}
            </Badge>
            <Badge variant={dedicatedEnvironmentFeatureEnabled ? "default" : "subtle"}>
              {dedicatedEnvironmentFeatureEnabled ? "Plan feature enabled" : "Plan upgrade required"}
            </Badge>
            <Badge variant="subtle">{formatFeatureStatusLabel(dedicatedEnvironmentReadiness?.status)}</Badge>
            {dedicatedConfigurationState ? (
              <Badge variant="subtle">config: {formatTokenLabel(dedicatedConfigurationState)}</Badge>
            ) : null}
            {dedicatedDeliveryStatus ? (
              <Badge variant={dedicatedDeliveryStatus === "complete" ? "strong" : "default"}>
                delivery: {formatTokenLabel(dedicatedDeliveryStatus)}
              </Badge>
            ) : null}
            {dedicatedReadinessVersion ? (
              <Badge variant="subtle">v{formatTokenLabel(dedicatedReadinessVersion)}</Badge>
            ) : null}
            {isDedicatedEnvironmentLoading ? <Badge variant="subtle">Loading readiness...</Badge> : null}
            {isDedicatedEnvironmentError ? <Badge variant="default">Unable to load live status</Badge> : null}
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={contractSourceBadgeVariant(dedicatedContractSource)}>
                {contractSourceLabel(dedicatedContractSource, dedicatedContractIssue)}
              </Badge>
              {dedicatedContractIssue?.code ? (
                <Badge variant="subtle">code: {dedicatedContractIssue.code}</Badge>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted">
              {contractSourceDescription(dedicatedContractSource, dedicatedContractIssue)}
            </p>
            {dedicatedContractIssue?.message ? (
              <p className="mt-1 text-xs text-muted">Issue: {dedicatedContractIssue.message}</p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Deployment model</p>
              <p className="mt-1 font-medium text-foreground">
                {formatDedicatedDeploymentModelLabel(dedicatedEnvironmentReadiness?.deployment_model)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Target region</p>
              <p className="mt-1 font-medium text-foreground">
                {dedicatedEnvironmentReadiness?.target_region ?? "Not selected"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-muted">Isolation summary</p>
            <p className="mt-1 text-xs text-muted">
              {dedicatedEnvironmentReadiness?.isolation_summary ??
                "Dedicated environment provisioning and isolation orchestration remain staged for this workspace."}
            </p>
          </div>

          {dedicatedConfigured ? (
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Saved provisioning request</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">Network boundary</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {dedicatedEnvironmentReadiness?.network_boundary ?? "Not saved"}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">Compliance notes</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {dedicatedEnvironmentReadiness?.compliance_notes ?? "Not saved"}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">Requester email</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{dedicatedRequesterEmail ?? "-"}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">Data classification</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {dedicatedDataClassification ? formatTokenLabel(dedicatedDataClassification) : "-"}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">Requested capacity</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{dedicatedRequestedCapacity ?? "-"}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">Requested SLA</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{dedicatedRequestedSla ?? "-"}</p>
                </div>
              </div>
              {dedicatedEnvironmentReadiness?.notes ? (
                <p className="mt-3 whitespace-pre-wrap text-xs text-muted">{dedicatedEnvironmentReadiness.notes}</p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-muted">Readiness checklist</p>
            {dedicatedConfigurationState || dedicatedDeliveryStatus ? (
              <p className="mt-1 text-xs text-muted">
                Runtime state: configuration{" "}
                <span className="text-foreground">{formatTokenLabel(dedicatedConfigurationState ?? "unknown")}</span> ·
                delivery <span className="text-foreground">{formatTokenLabel(dedicatedDeliveryStatus ?? "unknown")}</span>
              </p>
            ) : null}
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
              {dedicatedEnvironmentNextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-muted">Provisioning intake skeleton</p>
            <p className="mt-1 text-xs text-muted">
              This intake panel validates the request locally, then lets operators submit a controlled live write when
              the workspace is eligible. A successful submit records the provisioning request; actual rollout still follows readiness and delivery governance.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="rounded-xl border border-border bg-card p-3 text-xs text-muted">
                Target region request
                <input
                  type="text"
                  placeholder="us-east-1"
                  value={dedicatedDraft.targetRegion}
                  disabled={!dedicatedEnvironmentFeatureEnabled}
                  onChange={(event) => {
                    setDedicatedDraft((current) => ({ ...current, targetRegion: event.currentTarget.value }));
                    setDedicatedPreflightNotice(null);
                    setDedicatedWriteState((current) => ({ ...current, error: null, notice: null, responseCode: null }));
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="rounded-xl border border-border bg-card p-3 text-xs text-muted">
                Data classification
                <select
                  value={dedicatedDraft.dataClassification}
                  disabled={!dedicatedEnvironmentFeatureEnabled}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDedicatedDraft((current) => ({
                      ...current,
                      dataClassification:
                        value === "restricted" || value === "external" ? value : "internal",
                    }));
                    setDedicatedPreflightNotice(null);
                    setDedicatedWriteState((current) => ({ ...current, error: null, notice: null, responseCode: null }));
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="internal">Internal</option>
                  <option value="restricted">Restricted</option>
                  <option value="external">External</option>
                </select>
              </label>
              <label className="rounded-xl border border-border bg-card p-3 text-xs text-muted">
                Requester email
                <input
                  type="email"
                  placeholder="owner@example.com"
                  value={dedicatedDraft.requesterEmail}
                  disabled={!dedicatedEnvironmentFeatureEnabled}
                  onChange={(event) => {
                    setDedicatedDraft((current) => ({ ...current, requesterEmail: event.currentTarget.value }));
                    setDedicatedPreflightNotice(null);
                    setDedicatedWriteState((current) => ({ ...current, error: null, notice: null, responseCode: null }));
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="rounded-xl border border-border bg-card p-3 text-xs text-muted">
                Requested capacity (optional)
                <input
                  type="text"
                  placeholder="6 vCPU / 16 GB memory"
                  value={dedicatedDraft.requestedCapacity}
                  disabled={!dedicatedEnvironmentFeatureEnabled}
                  onChange={(event) => {
                    setDedicatedDraft((current) => ({ ...current, requestedCapacity: event.currentTarget.value }));
                    setDedicatedPreflightNotice(null);
                    setDedicatedWriteState((current) => ({ ...current, error: null, notice: null, responseCode: null }));
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="rounded-xl border border-border bg-card p-3 text-xs text-muted">
                Requested SLA (optional)
                <input
                  type="text"
                  placeholder="99.9% / 24x7"
                  value={dedicatedDraft.requestedSla}
                  disabled={!dedicatedEnvironmentFeatureEnabled}
                  onChange={(event) => {
                    setDedicatedDraft((current) => ({ ...current, requestedSla: event.currentTarget.value }));
                    setDedicatedPreflightNotice(null);
                    setDedicatedWriteState((current) => ({ ...current, error: null, notice: null, responseCode: null }));
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="rounded-xl border border-border bg-card p-3 text-xs text-muted">
                Network/isolation notes (optional)
                <textarea
                  value={dedicatedDraft.networkNotes}
                  disabled={!dedicatedEnvironmentFeatureEnabled}
                  onChange={(event) => {
                    setDedicatedDraft((current) => ({ ...current, networkNotes: event.currentTarget.value }));
                    setDedicatedPreflightNotice(null);
                    setDedicatedWriteState((current) => ({ ...current, error: null, notice: null, responseCode: null }));
                  }}
                  className="mt-2 min-h-[64px] w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            </div>
            <div className="mt-3 rounded-xl border border-border bg-card p-3 text-xs">
              <p className="text-muted">Preflight summary</p>
              <p className="mt-1 text-foreground">
                Region: {dedicatedDraft.targetRegion.trim() || "-"} · Classification:{" "}
                {formatTokenLabel(dedicatedDraft.dataClassification)}
              </p>
              <p className="mt-1 text-muted">Requester: {dedicatedDraft.requesterEmail.trim() || "-"}</p>
              <p className="mt-1 text-muted">
                Capacity: {dedicatedDraft.requestedCapacity.trim() || "-"} · SLA: {dedicatedDraft.requestedSla.trim() || "-"}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!dedicatedPreflightReady}
                onClick={() => {
                  setDedicatedPreflightNotice(
                    "Dedicated environment preflight is ready. Review the summary, then use controlled live write to record the provisioning request.",
                  );
                }}
              >
                Validate preflight
              </Button>
              <Button
                size="sm"
                disabled={Boolean(dedicatedSubmitDisabledReason)}
                onClick={() => void submitDedicatedEnvironmentRequest()}
              >
                {dedicatedWriteState.submitting ? "Submitting intake..." : "Submit provisioning intake"}
              </Button>
              <Link
                href={verificationHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                Attach environment evidence
              </Link>
              <Link
                href={goLiveHref}
                className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                Continue to go-live drill
              </Link>
            </div>
            <p className="mt-2 text-xs text-muted">
              Submit status: {dedicatedSubmitDisabledReason ?? "Ready for controlled live write."}
            </p>
            {!dedicatedPreflightReady ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
                {dedicatedValidationErrors.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {dedicatedPreflightNotice ? (
              <p className="mt-2 text-xs text-emerald-700">{dedicatedPreflightNotice}</p>
            ) : null}
            {dedicatedWriteState.notice ? (
              <p className="mt-2 text-xs text-emerald-700">{dedicatedWriteState.notice}</p>
            ) : null}
            {dedicatedWriteState.error ? (
              <p className="mt-2 text-xs text-rose-700">{dedicatedWriteState.error}</p>
            ) : null}
            {dedicatedWriteState.responseCode ? (
              <p className="mt-1 text-xs text-muted">Latest response code: {dedicatedWriteState.responseCode}</p>
            ) : null}
          </div>

          {!dedicatedEnvironmentFeatureEnabled ? (
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Upgrade required</p>
              <p className="mt-1 text-xs text-muted">
                Dedicated environment delivery is exposed as a plan-gated readiness surface in this slice. Upgrade to
                unlock workspace-level provisioning intake.
              </p>
              <div className="mt-3">
                <Link
                  href={dedicatedEnvironmentUpgradeHref}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                >
                  Upgrade plan
                </Link>
              </div>
            </div>
      ) : null}
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Dedicated environment evidence lane</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3 text-sm text-muted">
      <p>
        Dedicated environment provisioning is staged. Keep the associated delivery notes, compliance summaries, and
        operator decisions tied to verification and go-live so the readiness path is transparent.
      </p>
      <p className="text-xs text-muted">
        {dedicatedEnvironmentFeatureEnabled
          ? "The plan already gates the dedicated deployment, so keep delivery notes, compliance context, and artifacts together as the environment provisions."
          : "Dedicated environment is still plan gated; once the workspace upgrade unlocks it, keep this lane ready with the recorded readiness notes before returning to admin readiness."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={verificationHref}
          className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
        >
          Capture verification evidence
        </Link>
        <Link
          href={artifactsEarlyHref}
          className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
        >
          Review aligned artifacts
        </Link>
        <Link
          href={goLiveHref}
          className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
        >
          Document go-live drill notes
        </Link>
        <Link
          href={adminReturnHref}
          className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
        >
          Return to admin readiness
        </Link>
      </div>
      <p className="text-xs text-muted">
        Navigation only—keep the manual handoff path, documented notes, and admin return process tied to this lane.
      </p>
    </CardContent>
  </Card>

  <Card className={highlightBillingCard ? "border-amber-300 shadow-[0_0_0_1px_rgba(245,158,11,0.35)]" : undefined}>
    <CardHeader>
      <CardTitle>Billing and subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={billingBadgeVariant(billingSummary?.status_tone ?? "neutral")}>
              {billingSummary?.status_label ?? "Billing status unavailable"}
            </Badge>
            <Badge variant="subtle">{billingSummary?.provider ?? "workspace_managed"}</Badge>
            {subscription?.cancel_at_period_end ? <Badge variant="default">Ends at period close</Badge> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Current plan billing</p>
              <p className="mt-1 font-medium text-foreground">{formatPrice(plan?.monthly_price_cents ?? 0)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Billing period</p>
              <p className="mt-1 font-medium text-foreground">
                {formatDate(billingSummary?.current_period_start)} to {formatDate(billingSummary?.current_period_end)}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Subscription status</p>
              <p className="mt-1 font-medium text-foreground">
                {billingSummary?.status ?? subscription?.status ?? "workspace_managed"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Billing provider</p>
              <p className="mt-1 font-medium text-foreground">
                {billingSummary?.provider ?? subscription?.billing_provider ?? "workspace_managed"}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-muted">Cancel at period end</p>
            <p className="mt-1 font-medium text-foreground">
              {subscription?.cancel_at_period_end ? "Enabled" : "Disabled"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-muted">Status summary</p>
            <p className="mt-1 font-medium text-foreground">{billingSummary?.description ?? "Billing summary pending."}</p>
            <p className="mt-2 text-xs text-muted">
              Self-serve enabled: {billingSummary?.self_serve_enabled ? "yes" : "no (workspace-managed fallback)"}
            </p>
            {selfServeSetupNotice ? (
              <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-900">
                <p className="font-medium">Self-serve provider setup required</p>
                <p className="mt-1">{selfServeSetupNotice}</p>
                <p className="mt-1 font-mono">billing_self_serve_not_configured</p>
              </div>
            ) : null}
          </div>
          {providerEntries.length > 0 ? (
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Provider readiness</p>
              <p className="mt-1 font-medium text-foreground">
                Current provider: {currentBillingProvider?.display_name ?? billingProviders?.current_provider_code ?? billingSummary?.provider ?? "Not assigned"}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {providerEntries.map((provider) => {
                  const providerIsMock = isMockBillingProvider(provider.code);
                  return (
                    <div key={provider.code} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{provider.display_name}</p>
                      <Badge variant={provider.is_current ? "strong" : "subtle"}>{provider.status}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {provider.supports_checkout ? "Checkout ready" : "Checkout not enabled"} ·{" "}
                      {provider.supports_subscription_cancel
                        ? "Subscription controls available"
                        : "Subscription controls not enabled"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {provider.supports_webhooks
                        ? `Webhook path: ${provider.webhook_path ?? "configured internally"}`
                        : "Webhook ingestion not enabled"}
                    </p>
                    {providerIsMock ? (
                      <p className="mt-1 text-xs text-muted text-amber-800">
                        This mock checkout entry is retained as a test/fallback option, not a production self-serve provider.
                      </p>
                    ) : null}
                    {provider.notes.map((note) => (
                      <p key={note} className="mt-1 text-xs text-muted">
                        {note}
                      </p>
                    ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {billingSummary?.action ? (
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Next billing action</p>
              <p className="mt-1 font-medium text-foreground">{billingSummary.action.label}</p>
              <p className="mt-2 text-xs text-muted">
                {formatBillingActionAvailabilityText({
                  availability: billingSummary.action.availability,
                  providerCode: currentBillingProvider?.code ?? resolvedBillingProviderCode,
                  selfServeEnabled: billingSummary.self_serve_enabled,
                  providerSupportsCheckout: currentBillingProvider?.supports_checkout,
                  selfServeReasonCode: billingSummary.self_serve_reason_code ?? null,
                })}
              </p>
              {canStartCheckout ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted">Billing interval</p>
                  <div className="inline-flex rounded-full border border-border bg-card p-1">
                    {(["monthly", "yearly"] as const).map((option) => {
                      const isSelected = billingInterval === option;
                      const intervalPrice = option === "yearly" ? plan?.yearly_price_cents : plan?.monthly_price_cents;
                      return (
                        <button
                          key={option}
                          type="button"
                          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                            isSelected ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                          }`}
                          onClick={() => setBillingInterval(option)}
                        >
                          {option === "yearly" ? "Yearly" : "Monthly"} · {formatPrice(intervalPrice ?? 0)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {billingActionHref ? (
                  <Link
                    href={billingActionHref}
                    className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-background"
                  >
                    Open billing action lane
                  </Link>
                ) : null}
                {canStartCheckout ? (
                  <Button
                    size="sm"
                    onClick={() => void createCheckoutSession()}
                    disabled={checkout.creating || checkout.completing || checkout.refreshing}
                  >
                    {checkout.creating ? "Preparing checkout..." : "Create checkout session"}
                  </Button>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-muted">
                After the checkout tracker is ready, revisit <Link href={usageHref}>usage pressure</Link>, update the{" "}
                <Link href={verificationHref}>Week 8 checklist</Link>, and review the <Link href={goLiveHref}>go-live drill</Link>{" "}
                notes to keep the evidence path aligned before returning to the admin view. These are self-serve
                navigation and status cues only; provider completion and support follow-up remain manual.
              </p>
            </div>
          ) : null}
          {intentCard ? (
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="font-medium text-foreground">{intentCard.title}</p>
              <p className="mt-1 text-xs text-muted">{intentCard.body}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {intentCard.actions.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">{intentCard.footnote}</p>
            </div>
          ) : null}
          {billingFollowUpCard ? (
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="font-medium text-foreground">{billingFollowUpCard.title}</p>
              <p className="mt-1 text-xs text-muted">{billingFollowUpCard.body}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {billingFollowUpCard.actions.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">{billingFollowUpCard.footnote}</p>
            </div>
          ) : null}
          {checkout.error ? <p className="text-xs text-red-600">{checkout.error}</p> : null}
          {checkout.notice ? <p className="text-xs text-emerald-700">{checkout.notice}</p> : null}
          {subscriptionAction.error ? <p className="text-xs text-red-600">{subscriptionAction.error}</p> : null}
          {subscriptionAction.notice ? (
            <p className="text-xs text-emerald-700">{subscriptionAction.notice}</p>
          ) : null}
          {auditExport.error ? <p className="text-xs text-red-600">{auditExport.error}</p> : null}
          {auditExport.notice ? <p className="text-xs text-emerald-700">{auditExport.notice}</p> : null}
          {showSubscriptionControls ? (
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Subscription controls</p>
              <p className="mt-1 text-xs text-muted">
                {canOpenBillingPortal
                  ? "Open the billing provider portal to manage payment methods, invoices, and renewal settings."
                  : "Manage renewal timing directly in this workspace while provider portal access is unavailable."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {canOpenBillingPortal ? (
                  <Button
                    size="sm"
                    onClick={() => void openBillingPortal()}
                    disabled={subscriptionAction.openingPortal || subscriptionAction.cancelling || subscriptionAction.resuming}
                  >
                    {subscriptionAction.openingPortal ? "Opening..." : "Open billing portal"}
                  </Button>
                ) : null}
                {showLocalSubscriptionControls && canScheduleCancellation ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void scheduleSubscriptionCancellation()}
                    disabled={subscriptionAction.openingPortal || subscriptionAction.cancelling || subscriptionAction.resuming}
                  >
                    {subscriptionAction.cancelling ? "Scheduling..." : "End at period close"}
                  </Button>
                ) : null}
                {showLocalSubscriptionControls && canResumeRenewal ? (
                  <Button
                    size="sm"
                    onClick={() => void resumeSubscriptionRenewal()}
                    disabled={subscriptionAction.openingPortal || subscriptionAction.cancelling || subscriptionAction.resuming}
                  >
                    {subscriptionAction.resuming ? "Resuming..." : "Resume renewal"}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-muted">Audit export continuity</p>
            <p className="mt-1 text-xs text-muted">
              {auditExportEnabled
                ? "Export workspace audit events for compliance review and attach output into verification/go-live evidence."
                : "Audit export is not enabled on this workspace plan. Upgrade to unlock export downloads."}
            </p>
            <p className="mt-2 text-xs text-muted">
              Navigation-only manual relay: these links preserve the workspace context but do not automatically attach the receipt or close rollout steps for you.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={contractSourceBadgeVariant(auditContractSource)}>
                {contractSourceLabel(auditContractSource, auditContractIssue)}
              </Badge>
              {auditContractIssueCode ? (
                <Badge variant="subtle">code: {auditContractIssueCode}</Badge>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted">
              {contractSourceDescription(auditContractSource, auditContractIssue)}
            </p>
            {auditContractIssue?.message ? (
              <p className="mt-1 text-xs text-muted">Issue: {auditContractIssue.message}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted">
              Date filters are applied as UTC day boundaries in this slice.
            </p>
            <p className="mt-2 text-xs text-muted">
              Governance closure tip: export audit events here, then attach the file in{" "}
              <Link href={verificationHref}>verification</Link>, carry it into the{" "}
              <Link href={goLiveHref}>go-live drill</Link>, and end the loop by returning to the{" "}
              <Link href={adminReturnHref}>admin readiness view</Link>.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-3 sm:col-span-1">
                <p className="text-xs text-muted">Format</p>
                <div className="mt-2 inline-flex rounded-full border border-border bg-background p-1">
                  {(["jsonl", "json"] as const).map((format) => {
                    const selected = auditExportFormat === format;
                    return (
                      <button
                        key={format}
                        type="button"
                        disabled={!auditExportEnabled || auditExport.exporting}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          selected ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                        onClick={() => setAuditExportFormat(format)}
                      >
                        {format.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted">From (optional)</p>
                <input
                  type="date"
                  value={auditFromDate}
                  disabled={!auditExportEnabled || auditExport.exporting}
                  onChange={(event) => setAuditFromDate(event.currentTarget.value)}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted">To (optional)</p>
                <input
                  type="date"
                  value={auditToDate}
                  disabled={!auditExportEnabled || auditExport.exporting}
                  onChange={(event) => setAuditToDate(event.currentTarget.value)}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void exportWorkspaceAudit()}
                disabled={!auditExportEnabled || auditExport.exporting}
              >
                {auditExport.exporting ? "Exporting..." : "Download audit export"}
              </Button>
              <Link
                href={verificationHref}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                Attach in verification
              </Link>
              <Link
                href={goLiveHref}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
              >
                Carry to go-live drill
              </Link>
              {!auditExportEnabled && billingSummary?.action?.kind === "upgrade" ? (
                billingActionHref ? (
                  <Link
                    href={billingActionHref}
                    className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                  >
                    Upgrade plan
                  </Link>
                ) : null
              ) : null}
            </div>
            {!auditExportEnabled ? (
              <p className="mt-2 text-xs text-muted">
                Export disabled reason: current plan does not include audit export.
              </p>
            ) : null}
            {auditExportReceipt ? (
              <div className="mt-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium text-foreground">Latest export receipt</p>
                  <Badge variant="subtle">{auditExportReceipt.format.toUpperCase()}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Keep this receipt with the downloaded file so verification, go-live, and admin follow-up all cite the
                  same export details.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted">Filename</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{auditExportReceipt.filename}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Exported at</p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {formatDateTime(auditExportReceipt.exportedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Filters</p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {auditExportReceipt.fromDate || auditExportReceipt.toDate
                        ? `${auditExportReceipt.fromDate ?? "start"} -> ${auditExportReceipt.toDate ?? "end"}`
                        : "Full workspace history"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Content type</p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {auditExportReceipt.contentType ?? "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">File size</p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {formatFileSize(auditExportReceipt.sizeBytes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">SHA-256</p>
                    <p className="mt-1 break-all text-sm font-medium text-foreground">
                      {auditExportReceipt.sha256 ?? "Unavailable in this browser"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted">
                  Date filters above reflect the manual input on this page; export execution still uses UTC day
                  boundaries for the generated file.
                </p>
                <div className="mt-3 rounded-xl border border-border bg-background p-3">
                  <p className="text-xs text-muted">Evidence note</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {formatAuditExportEvidenceNote(auditExportReceipt)}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Carry this exact note into verification, go-live, or the delivery track so the export file, filter
                    window, and hash stay aligned.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
          {checkout.session ? (
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-muted">Checkout review</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">Session status</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{checkout.session.status}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">Target plan</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {checkout.session.target_plan_display_name ??
                      checkout.session.target_plan_code ??
                      checkout.session.target_plan_id ??
                      "Pro"}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted">Billing interval</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {checkout.session.billing_interval === "yearly" ? "Yearly" : "Monthly"}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 sm:col-span-2">
                  <p className="text-xs text-muted">Session expires at</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {formatDate(checkout.session.expires_at)}
                  </p>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted space-y-1">
                <p>Session owner: {sessionProviderLabel}.</p>
                <p>
                  {isStripeBillingProvider(checkout.session.billing_provider)
                    ? "Stripe manages this session, so completion happens only after its checkout process finishes and the provider webhook confirms the upgrade."
                    : "This session is workspace-managed. When status is ready, use the completion action below to finalize the upgrade."}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void refreshCheckoutSession()}
                  disabled={checkout.creating || checkout.completing || checkout.refreshing}
                >
                  {checkout.refreshing ? "Refreshing..." : "Refresh session"}
                </Button>
                {isCheckoutReadyForCompletion(checkout.session.status, checkout.session.billing_provider) ? (
                  <Button
                    size="sm"
                    onClick={() => void completeCheckoutSession()}
                    disabled={checkout.creating || checkout.completing || checkout.refreshing}
                  >
                    {checkout.completing ? "Completing..." : "Complete upgrade step"}
                  </Button>
                ) : null}
                {checkout.session.checkout_url ? (
                  <Link
                    href={checkout.session.checkout_url}
                    className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                  >
                    Open checkout link
                  </Link>
                ) : null}
                {checkout.session.review_url ? (
                  <Link
                    href={checkout.session.review_url}
                    className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-background"
                  >
                    Open review link
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Audit export evidence lane</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted">
        <p>
          Audit exports are the recorded events used for compliance verification—keep each download, filter note, and file
          hash tied to this workspace before you carry the evidence into verification or go-live.
        </p>
        <p className="text-xs text-muted">
          {auditExportEnabled
            ? "Audit export is available for this plan, so catalog the filters and download details alongside verification, go-live, and admin readiness."
            : "Audit export is still plan gated; once the upgrade unlocks it, return here to note the intended download parameters before continuing the Week 7/8 trail."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={verificationHref}
            className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
          >
            Attach in verification
          </Link>
          <Link
            href={artifactsEarlyHref}
            className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
          >
            Review aligned artifacts
          </Link>
          <Link
            href={goLiveHref}
            className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-card"
          >
            Carry to go-live drill
          </Link>
          <Link
            href={adminReturnHref}
            className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60"
          >
            Return to admin readiness
          </Link>
        </div>
        <p className="text-xs text-muted">
          Navigation only—keep the manual export evidence path aligned with the verification/go-live lane before you slide back into admin readiness.
        </p>
      </CardContent>
    </Card>

    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle>Usage dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted">
            Current billing window: {formatDate(usage?.period_start)} to {formatDate(usage?.period_end)}
          </p>
          <div className="grid gap-4 lg:grid-cols-3">
            {metrics.length === 0 ? (
              <p className="text-xs text-muted">No usage recorded for this period yet.</p>
            ) : null}
            {metrics.map(([key, metric]) => {
              const fraction = formatUsageFraction(metric);
              return (
                <div key={key} className="rounded-2xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted">{key}</p>
                    <Badge variant={metric.over_limit ? "default" : "subtle"}>
                      {metric.over_limit ? "Over limit" : "Within plan"}
                    </Badge>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-foreground"
                      style={{ width: `${fraction}%` }}
                    />
                  </div>
                  <p className="mt-2 font-medium text-foreground">
                    {formatMetricValue(key, metric.used)}
                    {metric.limit !== null ? ` / ${formatMetricValue(key, metric.limit)}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Remaining: {metric.remaining === null ? "unlimited" : formatMetricValue(key, metric.remaining)}
                  </p>
                </div>
              );
            })}
          </div>
          {overLimitMetrics.length > 0 ? (
            <div className="rounded-2xl border border-red-400 bg-red-50/60 p-4 text-sm text-red-800">
              <p className="font-medium">Over-limit warnings</p>
              <ul className="mt-2 space-y-1 list-disc pl-5 text-xs">
                {overLimitMetrics.map(([key, metric]) => (
                <li key={key}>
                  {key} used {formatMetricValue(key, metric.used)} /{" "}
                  {metric.limit === null ? "unlimited" : formatMetricValue(key, metric.limit)}
                  .
                </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
