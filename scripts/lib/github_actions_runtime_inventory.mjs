export const GITHUB_ACTIONS_RUNTIME_INVENTORY_VERSION = "2026-04-02";

export const REQUIRED_VARIABLE_NAMES = [
  "CLOUDFLARE_ACCOUNT_ID",
  "ACP_STAGING_BASE_URL",
  "ACP_PRODUCTION_BASE_URL",
  "ACP_PRODUCTION_TENANT_ID",
  "ACP_PRODUCTION_RUN_ID",
];

export const REQUIRED_SECRET_NAMES = ["CLOUDFLARE_API_TOKEN"];

export const RECOMMENDED_PROBE_VARIABLE_NAMES = [
  "ACP_STAGING_TENANT_ID",
  "ACP_SYNTH_SUBJECT_ID",
  "ACP_SYNTH_SUBJECT_ROLES",
];

export const WORKFLOW_RUNTIME_INVENTORY = [
  {
    workflow_id: "ci-baseline",
    name: "CI baseline",
    file: ".github/workflows/ci.yml",
    triggers: ["push", "pull_request", "workflow_dispatch"],
    repository_variables: [],
    repository_secrets: [],
    workflow_dispatch_inputs: [],
    notes: [
      "Runs npm ci, verify:local, verify:build, and validate:observability only.",
      "Does not require any repo-side deploy or runtime wiring.",
    ],
  },
  {
    workflow_id: "manual-release-gate",
    name: "Manual Release Gate",
    file: ".github/workflows/manual-release-gate.yml",
    triggers: ["workflow_dispatch"],
    repository_variables: [],
    repository_secrets: [],
    workflow_dispatch_inputs: [
      {
        name: "verification_mode",
        required: true,
        when: "always",
        description: "local, write, or readonly",
      },
      {
        name: "base_url",
        required: false,
        when: "required when verification_mode=write or readonly",
        description: "Deployed worker base URL",
      },
      {
        name: "tenant_id",
        required: false,
        when: "required when verification_mode=write or readonly",
        description: "Tenant ID for remote verification",
      },
      {
        name: "run_id",
        required: false,
        when: "required when verification_mode=readonly",
        description: "Existing run ID used for readonly verification",
      },
      {
        name: "expected_run_rate_limit",
        required: false,
        when: "optional when verification_mode=write",
        description: "Expected RATE_LIMIT_RUNS_PER_MINUTE",
      },
      {
        name: "expected_replay_rate_limit",
        required: false,
        when: "optional when verification_mode=write",
        description: "Expected RATE_LIMIT_REPLAYS_PER_MINUTE",
      },
    ],
    notes: [
      "Does not deploy.",
      "Remote verification wiring comes entirely from workflow_dispatch inputs.",
    ],
  },
  {
    workflow_id: "deploy-staging",
    name: "Deploy Staging",
    file: ".github/workflows/deploy-staging.yml",
    triggers: ["workflow_dispatch"],
    repository_variables: ["CLOUDFLARE_ACCOUNT_ID"],
    repository_secrets: ["CLOUDFLARE_API_TOKEN"],
    workflow_dispatch_inputs: [
      {
        name: "base_url",
        required: true,
        when: "always",
        description: "Staging worker base URL used after deploy",
      },
      {
        name: "tenant_id",
        required: true,
        when: "always",
        description: "Verify tenant ID used after deploy",
      },
      {
        name: "expected_run_rate_limit",
        required: false,
        when: "optional",
        description: "Expected RATE_LIMIT_RUNS_PER_MINUTE for staging verification",
      },
      {
        name: "expected_replay_rate_limit",
        required: false,
        when: "optional",
        description: "Expected RATE_LIMIT_REPLAYS_PER_MINUTE for staging verification",
      },
    ],
    notes: [
      "CLOUDFLARE_ACCOUNT_ID can also fall back to a repository secret of the same name, but repo variable is preferred.",
      "Deploys with wrangler deploy --env staging and then runs write-mode post-deploy verification.",
    ],
  },
  {
    workflow_id: "production-readonly-verify",
    name: "Production Readonly Verify",
    file: ".github/workflows/production-readonly-verify.yml",
    triggers: ["workflow_dispatch"],
    repository_variables: [],
    repository_secrets: [],
    workflow_dispatch_inputs: [
      {
        name: "base_url",
        required: true,
        when: "always",
        description: "Production worker base URL",
      },
      {
        name: "tenant_id",
        required: true,
        when: "always",
        description: "Production or verify tenant ID",
      },
      {
        name: "run_id",
        required: true,
        when: "always",
        description: "Existing run ID used for readonly verification",
      },
    ],
    notes: ["Does not deploy. It only packages readonly verification and artifact capture."],
  },
  {
    workflow_id: "deploy-production",
    name: "Deploy Production",
    file: ".github/workflows/deploy-production.yml",
    triggers: ["workflow_dispatch"],
    repository_variables: ["CLOUDFLARE_ACCOUNT_ID"],
    repository_secrets: ["CLOUDFLARE_API_TOKEN"],
    workflow_dispatch_inputs: [
      {
        name: "change_ref",
        required: true,
        when: "always",
        description: "Change ticket, release reference, or approval ID",
      },
      {
        name: "base_url",
        required: true,
        when: "always",
        description: "Production worker base URL",
      },
      {
        name: "tenant_id",
        required: true,
        when: "always",
        description: "Tenant ID for readonly verification",
      },
      {
        name: "run_id",
        required: true,
        when: "always",
        description: "Existing production run ID used for readonly verification",
      },
      {
        name: "apply_migrations",
        required: true,
        when: "always",
        description: "yes or no",
      },
      {
        name: "d1_database",
        required: true,
        when: "always",
        description: "Wrangler D1 binding or production database name",
      },
    ],
    notes: [
      "CLOUDFLARE_ACCOUNT_ID can also fall back to a repository secret of the same name, but repo variable is preferred.",
      "Assumes the GitHub production environment already enforces reviewer/protection rules.",
    ],
  },
  {
    workflow_id: "synthetic-runtime-checks",
    name: "Synthetic Runtime Checks",
    file: ".github/workflows/synthetic-runtime-checks.yml",
    triggers: ["schedule", "workflow_dispatch"],
    repository_variables: [
      "ACP_STAGING_BASE_URL",
      "ACP_STAGING_TENANT_ID",
      "ACP_PRODUCTION_BASE_URL",
      "ACP_PRODUCTION_TENANT_ID",
      "ACP_PRODUCTION_RUN_ID",
      "ACP_SYNTH_SUBJECT_ID",
      "ACP_SYNTH_SUBJECT_ROLES",
    ],
    repository_secrets: [],
    workflow_dispatch_inputs: [
      {
        name: "run_production_readonly_verify",
        required: true,
        when: "workflow_dispatch only",
        description: "Whether to run production readonly verification",
      },
      {
        name: "run_sse_probes",
        required: true,
        when: "workflow_dispatch only",
        description: "Whether to run optional SSE probes",
      },
    ],
    notes: [
      "ACP_SYNTH_SUBJECT_ID and ACP_SYNTH_SUBJECT_ROLES are optional for baseline health checks, but required to fully exercise SSE auth probes.",
      "The production readonly verification job requires ACP_PRODUCTION_RUN_ID in addition to base URL and tenant ID.",
    ],
  },
];

export const BOOTSTRAP_REQUIRED_ENV_NAMES = [...REQUIRED_VARIABLE_NAMES, ...REQUIRED_SECRET_NAMES];
export const BOOTSTRAP_OPTIONAL_ENV_NAMES = [...RECOMMENDED_PROBE_VARIABLE_NAMES];

export function buildGithubActionsRuntimeInventory() {
  return {
    version: GITHUB_ACTIONS_RUNTIME_INVENTORY_VERSION,
    bootstrap: {
      required_repository_variables: [...REQUIRED_VARIABLE_NAMES],
      required_repository_secrets: [...REQUIRED_SECRET_NAMES],
      optional_repository_variables: [...RECOMMENDED_PROBE_VARIABLE_NAMES],
      local_environment_for_bootstrap: {
        required: [...BOOTSTRAP_REQUIRED_ENV_NAMES],
        optional: [...BOOTSTRAP_OPTIONAL_ENV_NAMES],
      },
    },
    workflows: WORKFLOW_RUNTIME_INVENTORY.map((workflow) => ({
      workflow_id: workflow.workflow_id,
      name: workflow.name,
      file: workflow.file,
      triggers: [...workflow.triggers],
      repository_variables: [...workflow.repository_variables],
      repository_secrets: [...workflow.repository_secrets],
      workflow_dispatch_inputs: workflow.workflow_dispatch_inputs.map((input) => ({ ...input })),
      notes: [...workflow.notes],
    })),
  };
}
