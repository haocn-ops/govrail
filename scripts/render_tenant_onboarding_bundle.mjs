import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  buildDefaultPolicies,
  buildDefaultToolProviders,
  renderDefaultSeedSql,
} from "./lib/seed_bundle_data.mjs";
import { assertProvisioningRequestContract } from "./lib/provisioning_request_contract.mjs";

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function normalizeDeployEnv(rawValue) {
  const value = (rawValue ?? "staging").trim().toLowerCase();
  if (value !== "staging" && value !== "production") {
    throw new Error(`Unsupported --deploy-env: ${rawValue}`);
  }
  return value;
}

function normalizeOptionalString(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }
  const trimmed = rawValue.trim();
  return trimmed === "" ? null : trimmed;
}

function extractSecretBindingName(authRef) {
  if (typeof authRef !== "string") {
    return null;
  }
  const [scheme, bindingName] = authRef.split(":", 2);
  if (!scheme || !bindingName) {
    return null;
  }
  return bindingName.trim() || null;
}

function buildBundleSummary({
  tenantId,
  deployEnv,
  createdAt,
  baseUrl,
  repoRoot,
  outputDir,
  seedSqlPath,
  metadataPath,
  handoffPath,
  handoffStatePath,
  provisioningRequestPath,
  rollbackRequestPath,
  provisionScriptPath,
  applyRequestScriptPath,
  submitRequestScriptPath,
  completeHandoffScriptPath,
  rollbackScriptPath,
  statusScriptPath,
  verifyScriptPath,
  applyEvidencePath,
  provisioningSubmitEvidencePath,
  rollbackEvidencePath,
  verifyWriteSummaryPath,
  verifyReadonlySummaryPath,
}) {
  const providers = buildDefaultToolProviders(tenantId);
  const policies = buildDefaultPolicies(tenantId);
  const d1DatabaseName = deployEnv === "production" ? "agent-control-plane" : "agent-control-plane-staging";
  const wranglerEnvSuffix = deployEnv === "production" ? "" : " --env staging";
  const writeVerifyCommand = `BASE_URL="${baseUrl}" TENANT_ID="${tenantId}" VERIFY_OUTPUT_PATH="${verifyWriteSummaryPath}" npm --prefix "${repoRoot}" run post-deploy:verify`;
  const readonlyVerifyCommand = `BASE_URL="${baseUrl}" TENANT_ID="${tenantId}" RUN_ID="<existing_run_id>" VERIFY_OUTPUT_PATH="${verifyReadonlySummaryPath}" npm --prefix "${repoRoot}" run post-deploy:verify:readonly`;
  const recommendedVerifyCommand = deployEnv === "production" ? readonlyVerifyCommand : writeVerifyCommand;
  const recommendedVerifySummaryPath = deployEnv === "production" ? verifyReadonlySummaryPath : verifyWriteSummaryPath;

  return {
    ok: true,
    tenant_id: tenantId,
    deploy_env: deployEnv,
    created_at: createdAt,
    base_url: baseUrl,
    repo_root: repoRoot,
    output_dir: outputDir,
    files: {
      seed_sql: seedSqlPath,
      metadata_json: metadataPath,
      handoff_markdown: handoffPath,
      handoff_state_json: handoffStatePath,
      provisioning_request_json: provisioningRequestPath,
      rollback_request_json: rollbackRequestPath,
      provision_script: provisionScriptPath,
      apply_request_script: applyRequestScriptPath,
      submit_request_script: submitRequestScriptPath,
      complete_handoff_script: completeHandoffScriptPath,
      rollback_script: rollbackScriptPath,
      status_script: statusScriptPath,
      verify_script: verifyScriptPath,
    },
    verification_artifacts: {
      write_summary_json: verifyWriteSummaryPath,
      readonly_summary_json: verifyReadonlySummaryPath,
      recommended_summary_json: recommendedVerifySummaryPath,
    },
    handoff_artifacts: {
      apply_request_evidence_json: applyEvidencePath,
      provisioning_submit_evidence_json: provisioningSubmitEvidencePath,
      rollback_evidence_json: rollbackEvidencePath,
    },
    provider_ids: providers.map((provider) => provider.tool_provider_id),
    policy_ids: policies.map((policy) => policy.policy_id),
    provider_defaults: providers.map((provider) => ({
      tool_provider_id: provider.tool_provider_id,
      name: provider.name,
      provider_type: provider.provider_type,
      endpoint_url: provider.endpoint_url,
      auth_ref: provider.auth_ref,
      visibility_policy_ref: provider.visibility_policy_ref,
      execution_policy_ref: provider.execution_policy_ref,
      status: provider.status,
    })),
    policy_defaults: policies.map((policy) => ({
      policy_id: policy.policy_id,
      channel: policy.channel,
      decision: policy.decision,
      tool_provider_id: policy.tool_provider_id,
      tool_name: policy.tool_name,
      priority: policy.priority,
      status: policy.status,
      conditions: JSON.parse(policy.conditions_json),
      approval_config: JSON.parse(policy.approval_config_json),
      })),
    suggested_commands: {
      seed_import: `wrangler d1 execute ${d1DatabaseName} --remote --file ${seedSqlPath}${wranglerEnvSuffix}`,
      provider_list: `curl "${baseUrl}/api/v1/tool-providers" -H "X-Tenant-Id: ${tenantId}"`,
      policy_list: `curl "${baseUrl}/api/v1/policies" -H "X-Tenant-Id: ${tenantId}"`,
      provisioning_request_review: `cat ${provisioningRequestPath}`,
      provisioning_request_submit: `./submit-request.sh https://<ticket-or-cmdb-endpoint>`,
      provision_helper: `./provision.sh apply`,
      apply_request_dry_run: `./apply-request.sh dry-run`,
      apply_request_write: `./apply-request.sh write`,
      complete_handoff: `./complete-handoff.sh`,
      rollback_dry_run: `./rollback.sh dry-run`,
      rollback_write: `./rollback.sh write`,
      status_helper: `./status.sh`,
      post_deploy_verify: recommendedVerifyCommand,
      post_deploy_verify_write: writeVerifyCommand,
      post_deploy_verify_readonly: readonlyVerifyCommand,
      verify_helper: `./verify.sh ${deployEnv === "production" ? "readonly <existing_run_id>" : "write"}`,
    },
    handoff_fields: [
      "tenant_id",
      "trace_id",
      "tool_provider_id",
      "policy_id",
      "secret_binding_names",
      "request_ticket",
      "request_owner",
      "external_system_record",
      "run_id",
      "verification_date",
      "operator",
      "verify_summary_json",
      "handoff_state_json",
      "apply_request_evidence_json",
      "provisioning_submit_evidence_json",
      "verify_script",
      "repo_root",
    ],
  };
}

function buildProvisioningRequest(summary) {
  const providerOverrides = summary.provider_defaults.map((provider) => {
    const currentSecretBinding = extractSecretBindingName(provider.auth_ref);
    const usesMockEndpoint = provider.endpoint_url.startsWith("mock://");
    return {
      tool_provider_id: provider.tool_provider_id,
      name: provider.name,
      provider_type: provider.provider_type,
      current_endpoint_url: provider.endpoint_url,
      desired_endpoint_url: usesMockEndpoint ? "<fill-me>" : provider.endpoint_url,
      current_auth_ref: provider.auth_ref,
      desired_auth_ref: provider.auth_ref ?? "<fill-me>",
      visibility_policy_ref: provider.visibility_policy_ref,
      execution_policy_ref: provider.execution_policy_ref,
      current_status: provider.status,
      desired_status: provider.status,
      suggested_secret_binding_name: currentSecretBinding ?? "<fill-me>",
      required_before_verification: usesMockEndpoint || provider.auth_ref === null,
      status: provider.status,
    };
  });

  return {
    schema_version: "2026-04-01",
    request_type: "tenant_onboarding",
    status: "draft",
    tenant: {
      tenant_id: summary.tenant_id,
      deploy_env: summary.deploy_env,
      base_url: summary.base_url,
    },
    bundle: {
      created_at: summary.created_at,
      repo_root: summary.repo_root,
      output_dir: summary.output_dir,
      metadata_json: summary.files.metadata_json,
      handoff_markdown: summary.files.handoff_markdown,
      handoff_state_json: summary.files.handoff_state_json,
      provisioning_request_json: summary.files.provisioning_request_json,
      rollback_request_json: summary.files.rollback_request_json,
      seed_sql: summary.files.seed_sql,
      provision_script: summary.files.provision_script,
      apply_request_script: summary.files.apply_request_script,
      submit_request_script: summary.files.submit_request_script,
      complete_handoff_script: summary.files.complete_handoff_script,
      rollback_script: summary.files.rollback_script,
      status_script: summary.files.status_script,
      verify_script: summary.files.verify_script,
    },
    external_handoff: {
      request_owner: "<fill-me>",
      requester_team: "<fill-me>",
      change_ticket: "<fill-me>",
      target_completion_date: "<fill-me>",
      approver: "<fill-me>",
      external_system_record: "<fill-me>",
    },
    actions: [
      {
        action_id: "seed_import",
        type: "d1_seed_import",
        required: true,
        command: summary.suggested_commands.seed_import,
        evidence_path: summary.files.seed_sql,
      },
      {
        action_id: "handoff_submission",
        type: "external_submission",
        required: true,
        command: summary.suggested_commands.provisioning_request_submit,
        evidence_path: summary.handoff_artifacts.provisioning_submit_evidence_json,
      },
      {
        action_id: "provider_overrides",
        type: "tool_provider_override",
        required: true,
        items: providerOverrides,
      },
      {
        action_id: "policy_review",
        type: "policy_review",
        required: true,
        items: summary.policy_defaults.map((policy) => ({
          policy_id: policy.policy_id,
          channel: policy.channel,
          scope: {
            tool_provider_id: policy.tool_provider_id,
            tool_name: policy.tool_name,
          },
          conditions: policy.conditions,
          decision: policy.decision,
          approval_config: policy.approval_config,
          priority: policy.priority,
          tool_provider_id: policy.tool_provider_id,
          tool_name: policy.tool_name,
          status: policy.status,
          review_required: true,
          desired_policy: null,
        })),
      },
      {
        action_id: "apply_bundle_changes",
        type: "bundle_apply",
        required: true,
        command: summary.suggested_commands.apply_request_write,
        evidence_path: summary.handoff_artifacts.apply_request_evidence_json,
      },
      {
        action_id: "verification",
        type: "post_deploy_verify",
        required: true,
        mode: summary.deploy_env === "production" ? "readonly" : "write",
        command: summary.suggested_commands.verify_helper,
        evidence_path: summary.verification_artifacts.recommended_summary_json,
      },
      {
        action_id: "handoff_complete",
        type: "handoff_state_update",
        required: true,
        command: summary.suggested_commands.complete_handoff,
        evidence_path: summary.files.handoff_state_json,
      },
    ],
    completion_criteria: [
      "external submission evidence is attached to the bundle",
      "provider endpoint_url and auth_ref are updated from mock defaults",
      "required secrets are provisioned in the target Worker environment",
      "policy review is recorded in the external system",
      "verify summary JSON is attached to the handoff evidence",
      "handoff-state.json reflects the final operator-visible status",
    ],
  };
}

function buildRollbackRequest(summary, provisioningRequest) {
  return {
    schema_version: provisioningRequest.schema_version,
    request_type: "tenant_onboarding_rollback",
    status: "draft",
    tenant: provisioningRequest.tenant,
    bundle: {
      ...provisioningRequest.bundle,
      source_request_json: summary.files.provisioning_request_json,
      rollback_request_json: summary.files.rollback_request_json,
    },
    actions: [
      {
        action_id: "disable_providers",
        type: "tool_provider_override",
        required: true,
        items: summary.provider_defaults.map((provider) => ({
          tool_provider_id: provider.tool_provider_id,
          name: provider.name,
          provider_type: provider.provider_type,
          desired_name: provider.name,
          desired_provider_type: provider.provider_type,
          desired_endpoint_url: provider.endpoint_url,
          desired_auth_ref: provider.auth_ref,
          desired_visibility_policy_ref: provider.visibility_policy_ref,
          desired_execution_policy_ref: provider.execution_policy_ref,
          desired_status: "disabled",
        })),
      },
      {
        action_id: "disable_policies",
        type: "policy_review",
        required: true,
        items: summary.policy_defaults.map((policy) => ({
          policy_id: policy.policy_id,
          channel: policy.channel,
          scope: {
            tool_provider_id: policy.tool_provider_id,
            tool_name: policy.tool_name,
          },
          conditions: policy.conditions,
          decision: policy.decision,
          approval_config: policy.approval_config,
          priority: policy.priority,
          status: policy.status,
          review_required: true,
          desired_policy: {
            policy_id: policy.policy_id,
            channel: policy.channel,
            scope: {
              tool_provider_id: policy.tool_provider_id,
              tool_name: policy.tool_name,
            },
            conditions: policy.conditions,
            decision: policy.decision,
            approval_config: policy.approval_config,
            priority: policy.priority,
            status: "disabled",
          },
        })),
      },
    ],
    completion_criteria: [
      "all default providers for the tenant are disabled",
      "all default policies for the tenant are disabled",
      "rollback evidence JSON is attached to the bundle",
    ],
  };
}

function buildInitialHandoffState(summary, provisioningRequest) {
  return {
    ok: true,
    schema_version: "2026-04-01",
    generated_at: summary.created_at,
    handoff_state: {
      status: "draft",
      previous_status: null,
      updated_at: summary.created_at,
      updated_from: {
        bundle: summary.files.metadata_json,
        request: summary.files.provisioning_request_json,
        verify: null,
        state_in: null,
      },
    },
    bundle: {
      tenant_id: summary.tenant_id,
      deploy_env: summary.deploy_env,
      created_at: summary.created_at,
      base_url: summary.base_url,
      output_dir: summary.output_dir,
      files: summary.files,
      verification_artifacts: summary.verification_artifacts,
      suggested_commands: summary.suggested_commands,
    },
    request: {
      path: summary.files.provisioning_request_json,
      request_type: provisioningRequest.request_type,
      status: provisioningRequest.status,
      external_handoff: provisioningRequest.external_handoff,
      completion_criteria: provisioningRequest.completion_criteria,
      actions: provisioningRequest.actions.map((action) => ({
        action_id: action.action_id,
        type: action.type,
        required: action.required,
        mode: action.mode ?? null,
        evidence_path: action.evidence_path ?? null,
      })),
    },
    verify: null,
    next_actions: [
      "submit provisioning request",
      "import seed SQL and apply provider overrides",
      `run ${summary.suggested_commands.verify_helper}`,
    ],
  };
}

function renderVerifyScript(summary) {
  const defaultMode = summary.deploy_env === "production" ? "readonly" : "write";
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `DEFAULT_BASE_URL="${summary.base_url}"`,
    `DEFAULT_TENANT_ID="${summary.tenant_id}"`,
    `DEFAULT_REPO_ROOT="${summary.repo_root}"`,
    'MODE="${1:-${VERIFY_MODE:-' + defaultMode + '}}"',
    'ARG_RUN_ID="${2:-}"',
    'RUN_ID="${RUN_ID:-${EXISTING_RUN_ID:-${ARG_RUN_ID}}}"',
    'BASE_URL="${BASE_URL:-${DEFAULT_BASE_URL}}"',
    'TENANT_ID="${TENANT_ID:-${DEFAULT_TENANT_ID}}"',
    'REPO_ROOT="${REPO_ROOT:-${DEFAULT_REPO_ROOT}}"',
    'if [ ! -f "$REPO_ROOT/package.json" ]; then',
    '  echo "package.json not found under REPO_ROOT=$REPO_ROOT; override REPO_ROOT before running verify.sh" >&2',
    "  exit 1",
    "fi",
    "",
    'case "$MODE" in',
    "  write)",
    '    VERIFY_OUTPUT_PATH="${VERIFY_OUTPUT_PATH:-${SCRIPT_DIR}/verify-write-summary.json}" \\',
    '      BASE_URL="$BASE_URL" \\',
    '      TENANT_ID="$TENANT_ID" \\',
    '      npm --prefix "$REPO_ROOT" run post-deploy:verify',
    "    ;;",
    "  readonly)",
    '    if [ -z "$RUN_ID" ]; then',
    '      echo "RUN_ID is required for readonly verification" >&2',
    "      exit 1",
    "    fi",
    '    VERIFY_OUTPUT_PATH="${VERIFY_OUTPUT_PATH:-${SCRIPT_DIR}/verify-readonly-summary.json}" \\',
    '      BASE_URL="$BASE_URL" \\',
    '      TENANT_ID="$TENANT_ID" \\',
    '      RUN_ID="$RUN_ID" \\',
    '      npm --prefix "$REPO_ROOT" run post-deploy:verify:readonly',
    "    ;;",
    "  *)",
    '    echo "Usage: $0 {write|readonly} [run_id]" >&2',
    "    exit 1",
    "    ;;",
    "esac",
    "",
  ].join("\n");
}

function renderApplyRequestScript(summary) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `DEFAULT_BASE_URL="${summary.base_url}"`,
    `DEFAULT_TENANT_ID="${summary.tenant_id}"`,
    `DEFAULT_REPO_ROOT="${summary.repo_root}"`,
    'MODE="${1:-dry-run}"',
    'BASE_URL="${BASE_URL:-${DEFAULT_BASE_URL}}"',
    'TENANT_ID="${TENANT_ID:-${DEFAULT_TENANT_ID}}"',
    'REPO_ROOT="${REPO_ROOT:-${DEFAULT_REPO_ROOT}}"',
    'SUBJECT_ID="${SUBJECT_ID:-bundle_applier}"',
    'SUBJECT_ROLES="${SUBJECT_ROLES:-platform_admin}"',
    'OUTPUT_PATH="${OUTPUT_PATH:-${SCRIPT_DIR}/apply-request-evidence.json}"',
    'EXTRA_ARGS=()',
    'if [ "${APPLY_POLICIES:-false}" = "true" ]; then',
    '  EXTRA_ARGS+=("--apply-policies")',
    "fi",
    'if [ "${TRUSTED_EDGE:-false}" = "true" ]; then',
    '  EXTRA_ARGS+=("--trusted-edge")',
    "fi",
    'if [ ! -f "$REPO_ROOT/package.json" ]; then',
    '  echo "package.json not found under REPO_ROOT=$REPO_ROOT; override REPO_ROOT before running apply-request.sh" >&2',
    "  exit 1",
    "fi",
    'node "$REPO_ROOT/scripts/apply_tenant_bundle_changes.mjs" \\',
    '  --request "${SCRIPT_DIR}/provisioning-request.json" \\',
    '  --mode "$MODE" \\',
    '  --base-url "$BASE_URL" \\',
    '  --tenant-id "$TENANT_ID" \\',
    '  --subject-id "$SUBJECT_ID" \\',
    '  --subject-roles "$SUBJECT_ROLES" \\',
    '  --output "$OUTPUT_PATH" \\',
    '  "${EXTRA_ARGS[@]}"',
    "",
  ].join("\n");
}

function renderSubmitRequestScript(summary) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `DEFAULT_REPO_ROOT="${summary.repo_root}"`,
    'ENDPOINT="${1:-${PROVISIONING_ENDPOINT:-}}"',
    'REPO_ROOT="${REPO_ROOT:-${DEFAULT_REPO_ROOT}}"',
    'OUTPUT_PATH="${OUTPUT_PATH:-${SCRIPT_DIR}/provisioning-submit-evidence.json}"',
    'if [ -z "$ENDPOINT" ]; then',
    '  echo "Usage: $0 <endpoint> or set PROVISIONING_ENDPOINT" >&2',
    "  exit 1",
    "fi",
    'node "$REPO_ROOT/scripts/submit_provisioning_request.mjs" \\',
    '  --request "${SCRIPT_DIR}/provisioning-request.json" \\',
    '  --endpoint "$ENDPOINT" \\',
    '  --output "$OUTPUT_PATH"',
    "",
  ].join("\n");
}

function renderCompleteHandoffScript(summary) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `DEFAULT_REPO_ROOT="${summary.repo_root}"`,
    'REPO_ROOT="${REPO_ROOT:-${DEFAULT_REPO_ROOT}}"',
    'REQUEST_PATH="${REQUEST_PATH:-${SCRIPT_DIR}/provisioning-request.json}"',
    'STATE_IN_PATH="${STATE_IN_PATH:-${SCRIPT_DIR}/handoff-state.json}"',
    'OUTPUT_PATH="${OUTPUT_PATH:-${SCRIPT_DIR}/handoff-state.json}"',
    'VERIFY_PATH="${VERIFY_PATH:-}"',
    'if [ -z "$VERIFY_PATH" ] && [ -f "${SCRIPT_DIR}/verify-write-summary.json" ]; then',
    '  VERIFY_PATH="${SCRIPT_DIR}/verify-write-summary.json"',
    "fi",
    'if [ -z "$VERIFY_PATH" ] && [ -f "${SCRIPT_DIR}/verify-readonly-summary.json" ]; then',
    '  VERIFY_PATH="${SCRIPT_DIR}/verify-readonly-summary.json"',
    "fi",
    'ARGS=("--bundle" "${SCRIPT_DIR}/bundle.json" "--request" "$REQUEST_PATH" "--output" "$OUTPUT_PATH")',
    'if [ -f "$STATE_IN_PATH" ]; then',
    '  ARGS+=("--state-in" "$STATE_IN_PATH")',
    "fi",
    'if [ -n "$VERIFY_PATH" ] && [ -f "$VERIFY_PATH" ]; then',
    '  ARGS+=("--verify" "$VERIFY_PATH")',
    "fi",
    'node "$REPO_ROOT/scripts/update_tenant_handoff_state.mjs" "${ARGS[@]}"',
    "",
  ].join("\n");
}

function renderRollbackScript(summary) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `DEFAULT_BASE_URL="${summary.base_url}"`,
    `DEFAULT_TENANT_ID="${summary.tenant_id}"`,
    `DEFAULT_REPO_ROOT="${summary.repo_root}"`,
    'MODE="${1:-dry-run}"',
    'BASE_URL="${BASE_URL:-${DEFAULT_BASE_URL}}"',
    'TENANT_ID="${TENANT_ID:-${DEFAULT_TENANT_ID}}"',
    'REPO_ROOT="${REPO_ROOT:-${DEFAULT_REPO_ROOT}}"',
    'SUBJECT_ID="${SUBJECT_ID:-bundle_rollback}"',
    'SUBJECT_ROLES="${SUBJECT_ROLES:-platform_admin}"',
    'OUTPUT_PATH="${OUTPUT_PATH:-${SCRIPT_DIR}/rollback-evidence.json}"',
    'EXTRA_ARGS=("--apply-policies")',
    'if [ "${TRUSTED_EDGE:-false}" = "true" ]; then',
    '  EXTRA_ARGS+=("--trusted-edge")',
    "fi",
    'node "$REPO_ROOT/scripts/apply_tenant_bundle_changes.mjs" \\',
    '  --request "${SCRIPT_DIR}/rollback-request.json" \\',
    '  --mode "$MODE" \\',
    '  --base-url "$BASE_URL" \\',
    '  --tenant-id "$TENANT_ID" \\',
    '  --subject-id "$SUBJECT_ID" \\',
    '  --subject-roles "$SUBJECT_ROLES" \\',
    '  --output "$OUTPUT_PATH" \\',
    '  "${EXTRA_ARGS[@]}"',
    "",
  ].join("\n");
}

function renderProvisionScript(summary) {
  const d1DatabaseName = summary.deploy_env === "production" ? "agent-control-plane" : "agent-control-plane-staging";
  const wranglerEnvSuffix = summary.deploy_env === "production" ? "" : " --env staging";
  const nextVerifyCommand =
    summary.deploy_env === "production"
      ? "./verify.sh readonly <existing_run_id>"
      : "./verify.sh write";
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `DEFAULT_TENANT_ID="${summary.tenant_id}"`,
    `DEFAULT_DEPLOY_ENV="${summary.deploy_env}"`,
    `DEFAULT_BASE_URL="${summary.base_url}"`,
    `D1_DATABASE_NAME="${d1DatabaseName}"`,
    `WRANGLER_ENV_SUFFIX="${wranglerEnvSuffix}"`,
    'ACTION="${1:-apply}"',
    'TENANT_ID="${TENANT_ID:-${DEFAULT_TENANT_ID}}"',
    'DEPLOY_ENV="${DEPLOY_ENV:-${DEFAULT_DEPLOY_ENV}}"',
    'BASE_URL="${BASE_URL:-${DEFAULT_BASE_URL}}"',
    'SEED_SQL_PATH="${SEED_SQL_PATH:-${SCRIPT_DIR}/seed.sql}"',
    "",
    'case "$ACTION" in',
    "  apply)",
    '    if [ ! -f "$SEED_SQL_PATH" ]; then',
    '      echo "Seed SQL not found: $SEED_SQL_PATH" >&2',
    "      exit 1",
    "    fi",
    '    wrangler d1 execute "$D1_DATABASE_NAME" --remote --file "$SEED_SQL_PATH"$WRANGLER_ENV_SUFFIX',
    '    echo "Seed imported for tenant $TENANT_ID into $D1_DATABASE_NAME"',
    '    echo "Next: run ./apply-request.sh dry-run, then ./apply-request.sh write"',
    "    ;;",
    "  apply-request)",
    '    "${SCRIPT_DIR}/apply-request.sh" "${2:-dry-run}"',
    "    ;;",
    "  submit-request)",
    '    "${SCRIPT_DIR}/submit-request.sh" "${2:-${PROVISIONING_ENDPOINT:-}}"',
    "    ;;",
    "  complete)",
    '    "${SCRIPT_DIR}/complete-handoff.sh"',
    "    ;;",
    "  rollback)",
    '    "${SCRIPT_DIR}/rollback.sh" "${2:-dry-run}"',
    "    ;;",
    "  print)",
    '    cat <<EOF',
    `Tenant: ${summary.tenant_id}`,
    `Deploy env: ${summary.deploy_env}`,
    `D1 database: ${d1DatabaseName}`,
    `Seed SQL: \${SEED_SQL_PATH}`,
    `Base URL: ${summary.base_url}`,
    "",
    "Run:",
    "  ./provision.sh apply",
    "  ./apply-request.sh dry-run",
    "  ./apply-request.sh write",
    "",
    "Then:",
    `  ${nextVerifyCommand}`,
    "EOF",
    "    ;;",
    "  *)",
    '    echo "Usage: $0 {apply|apply-request|submit-request|complete|rollback|print} [args]" >&2',
    "    exit 1",
    "    ;;",
    "esac",
    "",
  ].join("\n");
}

function renderStatusScript(summary) {
  const nextStep =
    "./apply-request.sh dry-run";
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `DEFAULT_TENANT_ID="${summary.tenant_id}"`,
    `DEFAULT_DEPLOY_ENV="${summary.deploy_env}"`,
    `DEFAULT_BASE_URL="${summary.base_url}"`,
    `NEXT_STEP="${nextStep}"`,
    'TENANT_ID="${TENANT_ID:-${DEFAULT_TENANT_ID}}"',
    'DEPLOY_ENV="${DEPLOY_ENV:-${DEFAULT_DEPLOY_ENV}}"',
    'BASE_URL="${BASE_URL:-${DEFAULT_BASE_URL}}"',
    "",
    'if [ -f "${SCRIPT_DIR}/bundle.json" ]; then',
    '  node -e \'const fs = require("node:fs"); const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(JSON.stringify({ tenant_id: data.tenant_id, deploy_env: data.deploy_env, created_at: data.created_at, base_url: data.base_url, files: data.files, verification_artifacts: data.verification_artifacts, suggested_commands: data.suggested_commands }, null, 2));\' "${SCRIPT_DIR}/bundle.json"',
    "else",
    '  cat <<EOF',
    `Tenant: ${summary.tenant_id}`,
    `Deploy env: ${summary.deploy_env}`,
    `Base URL: ${summary.base_url}`,
    `Next verify: ${nextStep}`,
    "EOF",
    "fi",
    "",
    'echo "Next step: ${NEXT_STEP}"',
    'echo "Follow-up: ./submit-request.sh <endpoint> -> ./apply-request.sh write -> ./verify.sh"',
    "",
  ].join("\n");
}

function renderHandoffMarkdown(summary) {
  return `# Tenant Onboarding Bundle

Tenant: \`${summary.tenant_id}\`
Deploy env: \`${summary.deploy_env}\`
Created at: \`${summary.created_at}\`

## Files

- Seed SQL: \`${summary.files.seed_sql}\`
- Metadata JSON: \`${summary.files.metadata_json}\`
- Handoff markdown: \`${summary.files.handoff_markdown}\`
- Provisioning request JSON: \`${summary.files.provisioning_request_json}\`
- Rollback request JSON: \`${summary.files.rollback_request_json}\`
- Provision helper script: \`${summary.files.provision_script}\`
- Apply-request helper script: \`${summary.files.apply_request_script}\`
- Submit-request helper script: \`${summary.files.submit_request_script}\`
- Complete-handoff helper script: \`${summary.files.complete_handoff_script}\`
- Rollback helper script: \`${summary.files.rollback_script}\`
- Verify helper script: \`${summary.files.verify_script}\`
- Handoff state JSON: \`${summary.files.handoff_state_json}\`
- Recommended verify summary JSON: \`${summary.verification_artifacts.recommended_summary_json}\`

## Default Providers

${summary.provider_defaults
  .map(
    (provider) =>
      `- \`${provider.tool_provider_id}\`: endpoint=\`${provider.endpoint_url}\`, auth_ref=${provider.auth_ref ?? "null"}, status=\`${provider.status}\``,
  )
  .join("\n")}

## Default Policies

${summary.policy_defaults
  .map(
    (policy) =>
      `- \`${policy.policy_id}\`: decision=\`${policy.decision}\`, tool_provider_id=${policy.tool_provider_id ?? "null"}, tool_name=${policy.tool_name ?? "null"}, status=\`${policy.status}\``,
  )
  .join("\n")}

## Suggested Commands

~~~bash
${summary.suggested_commands.seed_import}
${summary.suggested_commands.provider_list}
${summary.suggested_commands.policy_list}
# External provisioning handoff
${summary.suggested_commands.provisioning_request_review}
${summary.suggested_commands.provisioning_request_submit}
# Apply provider/policy changes
${summary.suggested_commands.apply_request_dry_run}
${summary.suggested_commands.apply_request_write}
# Recommended post-deploy verification
${summary.suggested_commands.post_deploy_verify}
# Direct bundle helper
${summary.suggested_commands.verify_helper}
# Final handoff state
${summary.suggested_commands.complete_handoff}
# Conservative rollback
${summary.suggested_commands.rollback_dry_run}
~~~

## Handoff Fields

${summary.handoff_fields.map((field) => `- \`${field}\``).join("\n")}

## Notes

- Baseline seed 只提供 MVP 啟動資料，匯入後仍需校正真實 \`endpoint_url\` 與 \`auth_ref\`。
- 建議把驗收輸出的 JSON summary 一起保存在 bundle 目錄，作為交接證據的一部分。
- \`verify.sh\` 已預設寫入 bundle 目錄並設為可執行，適合直接交接給下一位操作者。
- \`provision.sh\` 現在除了 seed import，也會串到 \`apply-request.sh\`、\`submit-request.sh\`、\`complete-handoff.sh\` 與 \`rollback.sh\`。
- \`provisioning-request.json\` 是給外部 provisioning / ticket / handoff 流程用的固定輸入格式，方便後續接系統或人工審核。
- \`handoff-state.json\` 可把 request / verify / 交接狀態折疊成單一證據檔，降低多文件交接遺漏。
- 若是 production，建議先完成受控小流量驗收，再用 readonly 模式保留最終交接證據。
`;
}

async function main() {
  const tenantId = normalizeOptionalString(readArg("--tenant-id"));
  if (!tenantId) {
    throw new Error("Missing required argument: --tenant-id");
  }

  const deployEnv = normalizeDeployEnv(readArg("--deploy-env"));
  const createdAt = readArg("--created-at") ?? new Date().toISOString();
  const baseUrl = readArg("--base-url") ?? "https://<your-worker-domain>";
  const repoRoot = resolve(".");
  const outputDir = resolve(readArg("--output-dir") ?? `.onboarding-bundles/${tenantId}`);

  await mkdir(outputDir, { recursive: true });

  const seedSqlPath = join(outputDir, "seed.sql");
  const metadataPath = join(outputDir, "bundle.json");
  const handoffPath = join(outputDir, "handoff.md");
  const handoffStatePath = join(outputDir, "handoff-state.json");
  const provisioningRequestPath = join(outputDir, "provisioning-request.json");
  const rollbackRequestPath = join(outputDir, "rollback-request.json");
  const provisionScriptPath = join(outputDir, "provision.sh");
  const applyRequestScriptPath = join(outputDir, "apply-request.sh");
  const submitRequestScriptPath = join(outputDir, "submit-request.sh");
  const completeHandoffScriptPath = join(outputDir, "complete-handoff.sh");
  const rollbackScriptPath = join(outputDir, "rollback.sh");
  const statusScriptPath = join(outputDir, "status.sh");
  const verifyScriptPath = join(outputDir, "verify.sh");
  const applyEvidencePath = join(outputDir, "apply-request-evidence.json");
  const provisioningSubmitEvidencePath = join(outputDir, "provisioning-submit-evidence.json");
  const rollbackEvidencePath = join(outputDir, "rollback-evidence.json");
  const verifyWriteSummaryPath = join(outputDir, "verify-write-summary.json");
  const verifyReadonlySummaryPath = join(outputDir, "verify-readonly-summary.json");

  const seedSql = renderDefaultSeedSql(tenantId, createdAt);
  const summary = buildBundleSummary({
    tenantId,
    deployEnv,
    createdAt,
    baseUrl,
    repoRoot,
    outputDir,
    seedSqlPath,
    metadataPath,
    handoffPath,
    handoffStatePath,
    provisioningRequestPath,
    rollbackRequestPath,
    provisionScriptPath,
    applyRequestScriptPath,
    submitRequestScriptPath,
    completeHandoffScriptPath,
    rollbackScriptPath,
    statusScriptPath,
    verifyScriptPath,
    applyEvidencePath,
    provisioningSubmitEvidencePath,
    rollbackEvidencePath,
    verifyWriteSummaryPath,
    verifyReadonlySummaryPath,
  });
  const handoffMarkdown = renderHandoffMarkdown(summary);
  const provisioningRequest = buildProvisioningRequest(summary);
  assertProvisioningRequestContract(provisioningRequest);
  const rollbackRequest = buildRollbackRequest(summary, provisioningRequest);
  const initialHandoffState = buildInitialHandoffState(summary, provisioningRequest);
  const provisionScript = renderProvisionScript(summary);
  const applyRequestScript = renderApplyRequestScript(summary);
  const submitRequestScript = renderSubmitRequestScript(summary);
  const completeHandoffScript = renderCompleteHandoffScript(summary);
  const rollbackScript = renderRollbackScript(summary);
  const statusScript = renderStatusScript(summary);
  const verifyScript = renderVerifyScript(summary);

  await Promise.all([
    writeFile(seedSqlPath, seedSql, "utf8"),
    writeFile(metadataPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    writeFile(handoffPath, handoffMarkdown, "utf8"),
    writeFile(handoffStatePath, `${JSON.stringify(initialHandoffState, null, 2)}\n`, "utf8"),
    writeFile(provisioningRequestPath, `${JSON.stringify(provisioningRequest, null, 2)}\n`, "utf8"),
    writeFile(rollbackRequestPath, `${JSON.stringify(rollbackRequest, null, 2)}\n`, "utf8"),
    writeFile(provisionScriptPath, provisionScript, "utf8"),
    writeFile(applyRequestScriptPath, applyRequestScript, "utf8"),
    writeFile(submitRequestScriptPath, submitRequestScript, "utf8"),
    writeFile(completeHandoffScriptPath, completeHandoffScript, "utf8"),
    writeFile(rollbackScriptPath, rollbackScript, "utf8"),
    writeFile(statusScriptPath, statusScript, "utf8"),
    writeFile(verifyScriptPath, verifyScript, "utf8"),
  ]);

  await chmod(provisionScriptPath, 0o755);
  await chmod(applyRequestScriptPath, 0o755);
  await chmod(submitRequestScriptPath, 0o755);
  await chmod(completeHandoffScriptPath, 0o755);
  await chmod(rollbackScriptPath, 0o755);
  await chmod(statusScriptPath, 0o755);
  await chmod(verifyScriptPath, 0o755);

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
