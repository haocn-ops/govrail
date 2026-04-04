import type {
  ApiKeyRow,
  BillingCheckoutSessionRow,
  OrganizationMembershipRow,
  OrganizationRow,
  PricingPlanRow,
  ServiceAccountRow,
  UserRow,
  WorkspaceAccessRow,
  WorkspaceDeliveryTrackRow,
  WorkspaceEnterpriseFeatureConfigRow,
  WorkspaceInvitationRow,
  WorkspaceMembershipRow,
  WorkspacePlanSubscriptionRow,
  WorkspaceRow,
} from "../types.js";

export interface WorkspaceMemberAccessRow {
  workspace_membership_id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceMembershipRow["role"];
  status: WorkspaceMembershipRow["status"];
  joined_at: string | null;
  invited_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  email: string;
  email_normalized: string;
  display_name: string | null;
}

export interface WorkspaceApiKeyAccessRow extends ApiKeyRow {
  service_account_name: string | null;
}

export interface WorkspaceInvitationAccessRow extends WorkspaceInvitationRow {
  invited_by_email: string | null;
  invited_by_display_name: string | null;
}

export interface WorkspaceDeliveryTrackAccessRow extends WorkspaceDeliveryTrackRow {
  owner_email: string | null;
  owner_display_name: string | null;
}

export async function getOrganizationById(
  env: Env,
  organizationId: string,
): Promise<OrganizationRow | null> {
  return env.DB.prepare(
    `SELECT organization_id, slug, display_name, status, created_by_user_id, created_at, updated_at
       FROM organizations
      WHERE organization_id = ?1`,
  )
    .bind(organizationId)
    .first<OrganizationRow>();
}

export async function getWorkspaceById(env: Env, workspaceId: string): Promise<WorkspaceRow | null> {
  return env.DB.prepare(
    `SELECT workspace_id, organization_id, tenant_id, slug, display_name, status, plan_id, data_region,
            created_by_user_id, created_at, updated_at
       FROM workspaces
      WHERE workspace_id = ?1`,
  )
    .bind(workspaceId)
    .first<WorkspaceRow>();
}

export async function getWorkspaceByTenantId(env: Env, tenantId: string): Promise<WorkspaceRow | null> {
  return env.DB.prepare(
    `SELECT workspace_id, organization_id, tenant_id, slug, display_name, status, plan_id, data_region,
            created_by_user_id, created_at, updated_at
       FROM workspaces
      WHERE tenant_id = ?1`,
  )
    .bind(tenantId)
    .first<WorkspaceRow>();
}

export async function listWorkspacesForUser(env: Env, userId: string): Promise<WorkspaceAccessRow[]> {
  const result = await env.DB.prepare(
    `SELECT w.workspace_id, w.organization_id, w.tenant_id, w.slug, w.display_name, w.status, w.plan_id,
            w.data_region, w.created_by_user_id, w.created_at, w.updated_at,
            o.slug AS organization_slug, o.display_name AS organization_display_name,
            wm.role AS membership_role
       FROM workspace_memberships wm
       INNER JOIN workspaces w
          ON w.workspace_id = wm.workspace_id
       INNER JOIN organizations o
          ON o.organization_id = w.organization_id
       INNER JOIN organization_memberships om
          ON om.organization_id = w.organization_id
         AND om.user_id = wm.user_id
      WHERE wm.user_id = ?1
        AND wm.status = 'active'
        AND w.status = 'active'
        AND o.status = 'active'
        AND om.status = 'active'
      ORDER BY o.display_name ASC, w.display_name ASC`,
  )
    .bind(userId)
    .run();

  return (result.results ?? []) as unknown as WorkspaceAccessRow[];
}

export async function getUserById(env: Env, userId: string): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT user_id, email, email_normalized, display_name, auth_provider, auth_subject, status,
            last_login_at, created_at, updated_at
       FROM users
      WHERE user_id = ?1`,
  )
    .bind(userId)
    .first<UserRow>();
}

export async function getUserByAuthIdentity(
  env: Env,
  authProvider: string,
  authSubject: string,
): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT user_id, email, email_normalized, display_name, auth_provider, auth_subject, status,
            last_login_at, created_at, updated_at
       FROM users
      WHERE auth_provider = ?1 AND auth_subject = ?2`,
  )
    .bind(authProvider, authSubject)
    .first<UserRow>();
}

export async function getUserByEmailNormalized(
  env: Env,
  emailNormalized: string,
): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT user_id, email, email_normalized, display_name, auth_provider, auth_subject, status,
            last_login_at, created_at, updated_at
       FROM users
      WHERE email_normalized = ?1`,
  )
    .bind(emailNormalized)
    .first<UserRow>();
}

export async function getWorkspaceMembership(
  env: Env,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMembershipRow | null> {
  return env.DB.prepare(
    `SELECT workspace_membership_id, workspace_id, user_id, role, status, joined_at, invited_by_user_id,
            created_at, updated_at
       FROM workspace_memberships
      WHERE workspace_id = ?1 AND user_id = ?2`,
  )
    .bind(workspaceId, userId)
    .first<WorkspaceMembershipRow>();
}

export async function getWorkspaceAccessByIdForUser(
  env: Env,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceAccessRow | null> {
  return env.DB.prepare(
    `SELECT w.workspace_id, w.organization_id, w.tenant_id, w.slug, w.display_name, w.status, w.plan_id,
            w.data_region, w.created_by_user_id, w.created_at, w.updated_at,
            o.slug AS organization_slug, o.display_name AS organization_display_name,
            wm.role AS membership_role
       FROM workspace_memberships wm
       INNER JOIN workspaces w
          ON w.workspace_id = wm.workspace_id
       INNER JOIN organizations o
          ON o.organization_id = w.organization_id
       INNER JOIN organization_memberships om
          ON om.organization_id = w.organization_id
         AND om.user_id = wm.user_id
      WHERE wm.workspace_id = ?1
        AND wm.user_id = ?2
        AND wm.status = 'active'
        AND w.status = 'active'
        AND o.status = 'active'
        AND om.status = 'active'`,
  )
    .bind(workspaceId, userId)
    .first<WorkspaceAccessRow>();
}

export async function getOrganizationMembership(
  env: Env,
  organizationId: string,
  userId: string,
): Promise<OrganizationMembershipRow | null> {
  return env.DB.prepare(
    `SELECT membership_id, organization_id, user_id, role, status, joined_at, invited_by_user_id,
            created_at, updated_at
       FROM organization_memberships
      WHERE organization_id = ?1 AND user_id = ?2`,
  )
    .bind(organizationId, userId)
    .first<OrganizationMembershipRow>();
}

export async function listWorkspaceMembers(
  env: Env,
  workspaceId: string,
): Promise<WorkspaceMemberAccessRow[]> {
  const result = await env.DB.prepare(
    `SELECT wm.workspace_membership_id, wm.workspace_id, wm.user_id, wm.role, wm.status, wm.joined_at,
            wm.invited_by_user_id, wm.created_at, wm.updated_at,
            u.email, u.email_normalized, u.display_name
       FROM workspace_memberships wm
       INNER JOIN users u
          ON u.user_id = wm.user_id
      WHERE wm.workspace_id = ?1
      ORDER BY
        CASE wm.role
          WHEN 'workspace_owner' THEN 0
          WHEN 'workspace_admin' THEN 1
          WHEN 'operator' THEN 2
          WHEN 'approver' THEN 3
          WHEN 'auditor' THEN 4
          ELSE 5
        END ASC,
        u.email_normalized ASC`,
  )
    .bind(workspaceId)
    .run();

  return (result.results ?? []) as unknown as WorkspaceMemberAccessRow[];
}

export async function getServiceAccountById(
  env: Env,
  serviceAccountId: string,
): Promise<ServiceAccountRow | null> {
  return env.DB.prepare(
    `SELECT service_account_id, workspace_id, tenant_id, name, description, role, status,
            created_by_user_id, last_used_at, created_at, updated_at
       FROM service_accounts
      WHERE service_account_id = ?1`,
  )
    .bind(serviceAccountId)
    .first<ServiceAccountRow>();
}

export async function listWorkspaceServiceAccounts(
  env: Env,
  workspaceId: string,
): Promise<ServiceAccountRow[]> {
  const result = await env.DB.prepare(
    `SELECT service_account_id, workspace_id, tenant_id, name, description, role, status,
            created_by_user_id, last_used_at, created_at, updated_at
       FROM service_accounts
      WHERE workspace_id = ?1
      ORDER BY created_at DESC, service_account_id DESC`,
  )
    .bind(workspaceId)
    .run();

  return (result.results ?? []) as unknown as ServiceAccountRow[];
}

export async function getApiKeyByKeyHash(env: Env, keyHash: string): Promise<ApiKeyRow | null> {
  return env.DB.prepare(
    `SELECT api_key_id, workspace_id, tenant_id, service_account_id, key_prefix, key_hash, scope_json,
            status, created_by_user_id, last_used_at, expires_at, revoked_at, created_at, updated_at
       FROM api_keys
      WHERE key_hash = ?1`,
  )
    .bind(keyHash)
    .first<ApiKeyRow>();
}

export async function getApiKeyById(env: Env, apiKeyId: string): Promise<ApiKeyRow | null> {
  return env.DB.prepare(
    `SELECT api_key_id, workspace_id, tenant_id, service_account_id, key_prefix, key_hash, scope_json,
            status, created_by_user_id, last_used_at, expires_at, revoked_at, created_at, updated_at
       FROM api_keys
      WHERE api_key_id = ?1`,
  )
    .bind(apiKeyId)
    .first<ApiKeyRow>();
}

export async function listWorkspaceApiKeys(
  env: Env,
  workspaceId: string,
): Promise<WorkspaceApiKeyAccessRow[]> {
  const result = await env.DB.prepare(
    `SELECT k.api_key_id, k.workspace_id, k.tenant_id, k.service_account_id, k.key_prefix, k.key_hash,
            k.scope_json, k.status, k.created_by_user_id, k.last_used_at, k.expires_at, k.revoked_at,
            k.created_at, k.updated_at, s.name AS service_account_name
       FROM api_keys k
       LEFT JOIN service_accounts s
         ON s.service_account_id = k.service_account_id
      WHERE k.workspace_id = ?1
      ORDER BY k.created_at DESC, k.api_key_id DESC`,
  )
    .bind(workspaceId)
    .run();

  return (result.results ?? []) as unknown as WorkspaceApiKeyAccessRow[];
}

export async function getWorkspaceInvitationById(
  env: Env,
  invitationId: string,
): Promise<WorkspaceInvitationRow | null> {
  return env.DB.prepare(
    `SELECT invitation_id, organization_id, workspace_id, email_normalized, role, token_hash, status,
            invited_by_user_id, expires_at, accepted_by_user_id, accepted_at, created_at, updated_at
       FROM workspace_invitations
      WHERE invitation_id = ?1`,
  )
    .bind(invitationId)
    .first<WorkspaceInvitationRow>();
}

export async function getWorkspaceInvitationByTokenHash(
  env: Env,
  tokenHash: string,
): Promise<WorkspaceInvitationRow | null> {
  return env.DB.prepare(
    `SELECT invitation_id, organization_id, workspace_id, email_normalized, role, token_hash, status,
            invited_by_user_id, expires_at, accepted_by_user_id, accepted_at, created_at, updated_at
       FROM workspace_invitations
      WHERE token_hash = ?1`,
  )
    .bind(tokenHash)
    .first<WorkspaceInvitationRow>();
}

export async function listWorkspaceInvitations(
  env: Env,
  workspaceId: string,
): Promise<WorkspaceInvitationAccessRow[]> {
  const result = await env.DB.prepare(
    `SELECT i.invitation_id, i.organization_id, i.workspace_id, i.email_normalized, i.role, i.token_hash,
            i.status, i.invited_by_user_id, i.expires_at, i.accepted_by_user_id, i.accepted_at,
            i.created_at, i.updated_at, u.email AS invited_by_email, u.display_name AS invited_by_display_name
       FROM workspace_invitations i
       LEFT JOIN users u
         ON u.user_id = i.invited_by_user_id
      WHERE i.workspace_id = ?1
      ORDER BY
        CASE i.status
          WHEN 'pending' THEN 0
          WHEN 'accepted' THEN 1
          WHEN 'expired' THEN 2
          ELSE 3
        END ASC,
        i.created_at DESC,
        i.invitation_id DESC`,
  )
    .bind(workspaceId)
    .run();

  return (result.results ?? []) as unknown as WorkspaceInvitationAccessRow[];
}

export async function getWorkspaceDeliveryTrack(
  env: Env,
  workspaceId: string,
  trackKey: WorkspaceDeliveryTrackRow["track_key"],
): Promise<WorkspaceDeliveryTrackRow | null> {
  return env.DB.prepare(
    `SELECT track_id, workspace_id, organization_id, track_key, status, owner_user_id, notes_text,
            evidence_json, created_at, updated_at
       FROM workspace_delivery_tracks
      WHERE workspace_id = ?1 AND track_key = ?2`,
  )
    .bind(workspaceId, trackKey)
    .first<WorkspaceDeliveryTrackRow>();
}

export async function listWorkspaceDeliveryTracks(
  env: Env,
  workspaceId: string,
): Promise<WorkspaceDeliveryTrackAccessRow[]> {
  const result = await env.DB.prepare(
    `SELECT t.track_id, t.workspace_id, t.organization_id, t.track_key, t.status, t.owner_user_id, t.notes_text,
            t.evidence_json, t.created_at, t.updated_at, u.email AS owner_email, u.display_name AS owner_display_name
       FROM workspace_delivery_tracks t
       LEFT JOIN users u
         ON u.user_id = t.owner_user_id
      WHERE t.workspace_id = ?1
      ORDER BY
        CASE t.track_key
          WHEN 'verification' THEN 0
          WHEN 'go_live' THEN 1
          ELSE 2
        END ASC,
        t.updated_at DESC`,
  )
    .bind(workspaceId)
    .run();

  return (result.results ?? []) as unknown as WorkspaceDeliveryTrackAccessRow[];
}

export async function getWorkspaceEnterpriseFeatureConfig(
  env: Env,
  workspaceId: string,
  featureKey: WorkspaceEnterpriseFeatureConfigRow["feature_key"],
): Promise<WorkspaceEnterpriseFeatureConfigRow | null> {
  return env.DB.prepare(
    `SELECT config_id, workspace_id, organization_id, feature_key, status, config_json,
            configured_by_user_id, configured_at, created_at, updated_at
       FROM workspace_enterprise_feature_configs
      WHERE workspace_id = ?1 AND feature_key = ?2`,
  )
    .bind(workspaceId, featureKey)
    .first<WorkspaceEnterpriseFeatureConfigRow>();
}

export async function upsertWorkspaceEnterpriseFeatureConfig(
  env: Env,
  args: {
    configId: string;
    workspaceId: string;
    organizationId: string;
    featureKey: WorkspaceEnterpriseFeatureConfigRow["feature_key"];
    status: WorkspaceEnterpriseFeatureConfigRow["status"];
    configJson: string;
    configuredByUserId: string | null;
    configuredAt: string;
    createdAt: string;
    updatedAt: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO workspace_enterprise_feature_configs (
        config_id, workspace_id, organization_id, feature_key, status, config_json,
        configured_by_user_id, configured_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      ON CONFLICT(workspace_id, feature_key) DO UPDATE SET
        status = excluded.status,
        config_json = excluded.config_json,
        configured_by_user_id = excluded.configured_by_user_id,
        configured_at = excluded.configured_at,
        updated_at = excluded.updated_at`,
  )
    .bind(
      args.configId,
      args.workspaceId,
      args.organizationId,
      args.featureKey,
      args.status,
      args.configJson,
      args.configuredByUserId,
      args.configuredAt,
      args.createdAt,
      args.updatedAt,
    )
    .run();
}

export async function getWorkspacePlanSubscription(
  env: Env,
  workspaceId: string,
): Promise<WorkspacePlanSubscriptionRow | null> {
  return env.DB.prepare(
    `SELECT subscription_id, workspace_id, organization_id, plan_id, billing_provider,
            external_customer_ref, external_subscription_ref, status, current_period_start,
            current_period_end, cancel_at_period_end, created_at, updated_at
       FROM workspace_plan_subscriptions
      WHERE workspace_id = ?1`,
    )
    .bind(workspaceId)
    .first<WorkspacePlanSubscriptionRow>();
}

export async function getWorkspacePlanSubscriptionByExternalRef(
  env: Env,
  args: {
    billingProvider: string;
    externalSubscriptionRef?: string | null;
    externalCustomerRef?: string | null;
  },
): Promise<WorkspacePlanSubscriptionRow | null> {
  const externalSubscriptionRef = args.externalSubscriptionRef?.trim() ?? null;
  const externalCustomerRef = args.externalCustomerRef?.trim() ?? null;
  if (!externalSubscriptionRef && !externalCustomerRef) {
    return null;
  }

  return env.DB.prepare(
    `SELECT subscription_id, workspace_id, organization_id, plan_id, billing_provider,
            external_customer_ref, external_subscription_ref, status, current_period_start,
            current_period_end, cancel_at_period_end, created_at, updated_at
       FROM workspace_plan_subscriptions
      WHERE billing_provider = ?1
        AND (
          (?2 IS NOT NULL AND external_subscription_ref = ?2) OR
          (?3 IS NOT NULL AND external_customer_ref = ?3)
        )
      ORDER BY
        CASE
          WHEN ?2 IS NOT NULL AND external_subscription_ref = ?2 THEN 0
          ELSE 1
        END ASC,
        updated_at DESC
      LIMIT 1`,
  )
    .bind(args.billingProvider, externalSubscriptionRef, externalCustomerRef)
    .first<WorkspacePlanSubscriptionRow>();
}

export async function getBillingCheckoutSessionById(
  env: Env,
  checkoutSessionId: string,
): Promise<BillingCheckoutSessionRow | null> {
  return env.DB.prepare(
    `SELECT checkout_session_id, workspace_id, organization_id, current_plan_id, target_plan_id,
            billing_interval, billing_provider, status, expires_at, completed_at,
            created_by_user_id, created_at, updated_at
       FROM billing_checkout_sessions
      WHERE checkout_session_id = ?1`,
  )
    .bind(checkoutSessionId)
    .first<BillingCheckoutSessionRow>();
}

export type WorkspaceUsageSummaryRow = {
  meter_name: string;
  quantity: number;
};

export async function listWorkspaceUsageSummary(
  env: Env,
  workspaceId: string,
  periodStart: string,
  periodEnd: string,
): Promise<WorkspaceUsageSummaryRow[]> {
  const result = await env.DB.prepare(
    `SELECT meter_name, SUM(quantity) AS total_quantity
       FROM usage_ledger
      WHERE workspace_id = ?1
        AND period_start >= ?2
        AND period_end <= ?3
      GROUP BY meter_name
      ORDER BY meter_name ASC`,
  )
    .bind(workspaceId, periodStart, periodEnd)
    .run();

  return (result.results ?? []).map((row) => ({
    meter_name: String(row.meter_name ?? ""),
    quantity: Number(row.total_quantity ?? 0),
  }));
}

export async function getPricingPlanById(env: Env, planId: string): Promise<PricingPlanRow | null> {
  return env.DB.prepare(
    `SELECT plan_id, code, display_name, tier, status, monthly_price_cents, yearly_price_cents,
            limits_json, features_json, created_at, updated_at
       FROM pricing_plans
      WHERE plan_id = ?1`,
  )
    .bind(planId)
    .first<PricingPlanRow>();
}
