# Agent Control Plane

Cloudflare Workers-based multi-tenant agent control plane MVP.

This repository currently includes:

- Northbound run / approval / replay / cancel APIs
- A2A inbound / outbound gateway flows
- MCP proxy with policy and approval enforcement
- Durable Objects for hot run, approval, and rate-limit state
- Workflow orchestration for long-running runs
- D1-backed audit, idempotency, policy, tool provider, artifact, and queue dedupe records
- Seed SQL generation, smoke checks, and post-deploy verification scripts

## Current Status

As of 2026-04-01, the repo has passed:

- `npm run verify:local`
- `npm run verify:build`
- `npm run validate:observability`

A minimal GitHub Actions baseline now mirrors those checks on `push` and `pull_request` via [.github/workflows/ci.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/ci.yml).
A separate manual release gate workflow now exists at [.github/workflows/manual-release-gate.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/manual-release-gate.yml) for `workflow_dispatch`-driven verification and artifact capture without any deploy.

The codebase is in "deployable MVP skeleton" shape:

- local TypeScript and smoke verification are green
- Worker dry-run packaging is green
- staging-style post-deploy verification is implemented
- production-safe readonly post-deploy verification is implemented

One important current boundary:

- northbound auth is assumed to be enforced by Cloudflare Access or another trusted edge layer
- the Worker defaults to a permissive local/test mode, but can now be switched to `NORTHBOUND_AUTH_MODE=trusted_edge` so only trusted edge identity headers are accepted and direct `X-Subject-*` overrides are rejected

It is not yet a fully productionized service. Access rollout, production onboarding automation, external provisioning, secret rotation, monitoring, and environment hardening still need to be completed.

## Quick Start

Install and run the local verification baseline:

```bash
npm install
npm run types
npm run verify:local
npm run verify:build
npm run validate:observability
```

Generate tenant seed SQL:

```bash
npm run seed:sql -- --tenant-id tenant_demo
```

Render a tenant onboarding bundle with seed SQL, metadata JSON, handoff markdown, and executable `apply-request` / `submit-request` / `verify` / `complete-handoff` helpers:

```bash
npm run tenant:onboarding:bundle -- --tenant-id tenant_acme --deploy-env staging
```

Run staging-style post-deploy verification:

```bash
BASE_URL="https://<your-worker-domain>" \
TENANT_ID="tenant_verify" \
npm run post-deploy:verify
```

`post-deploy:verify` 會額外回歸 `runs/{run_id}/graph` 的保留查詢參數與 replay `mode=from_step` 的 metadata 透傳；非 workflow-native anchor fallback 由 `npm run smoke` 持續驗證，避免 replay rewind 語義悄悄退化。

若環境已啟用 `RATE_LIMIT_RUNS_PER_MINUTE` / `RATE_LIMIT_REPLAYS_PER_MINUTE`，可額外傳入 `EXPECT_RATE_LIMIT_RUNS_PER_MINUTE` / `EXPECT_RATE_LIMIT_REPLAYS_PER_MINUTE`，讓 write-mode remote verification 一併驗證 `429 rate_limited`。

若要把驗收結果落成結構化檔案，可再傳入 `VERIFY_OUTPUT_PATH`，腳本會在保留 stdout JSON 的同時，把同一份 summary 寫到指定路徑。

Run production-safe readonly verification against an existing run:

```bash
BASE_URL="https://<your-worker-domain>" \
TENANT_ID="tenant_prod" \
RUN_ID="<existing_run_id>" \
npm run post-deploy:verify:readonly
```

## Command Reference

| Command | Purpose |
|---|---|
| `npm run check` | TypeScript typecheck |
| `npm run smoke` | Mocked end-to-end smoke flow |
| `npm run verify:local` | `check` + `smoke` |
| `npm run verify:build` | Wrangler dry-run package validation |
| `npm run validate:observability` | Validate observability example contracts and refs |
| `npm run access:ingress:plan -- --plan-file <plan.json>` | Render an access ingress plan and checklist for a tenant/environment |
| `npm run github:actions:bootstrap -- --dry-run` | Validate or push the GitHub Actions runtime variables / secret bootstrap |
| `npm run github:actions:inventory -- --format markdown` | Print the GitHub Actions runtime variable / secret / workflow input inventory |
| `npm run provisioning:submit -- --request <file> --endpoint <url>` | Submit a provisioning request artifact to an external workflow or ticket endpoint |
| `npm run seed:sql -- --tenant-id <id>` | Render seed SQL for a tenant |
| `npm run secret:rotation:bundle -- --plan <plan.json>` | Render a secret rotation bundle with checklist and helper script |
| `npm run tenant:onboarding:apply -- --request <file> --mode dry-run` | Dry-run or apply tenant provider/policy changes from a provisioning request |
| `npm run tenant:onboarding:bundle -- --tenant-id <id>` | Render tenant onboarding bundle files for a tenant |
| `npm run tenant:handoff:update -- --bundle <file>` | Fold request/verify evidence back into a handoff-state JSON |
| `npm run post-deploy:verify` | Write-mode remote verification for staging or dedicated verify tenants |
| `npm run post-deploy:verify:readonly` | Readonly remote verification for production or shared tenants |
| `npm run deploy` | Real Wrangler deploy |
| `npm run dev` | Local Wrangler dev server |

## Repo Layout

| Path | Purpose |
|---|---|
| [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | Main Worker router |
| [src/mcp/proxy.ts](/Users/zh/Documents/codeX/agent_control_plane/src/mcp/proxy.ts) | MCP proxy, policy checks, approval gating |
| [src/a2a/inbound.ts](/Users/zh/Documents/codeX/agent_control_plane/src/a2a/inbound.ts) | A2A inbound message / task endpoints |
| [src/a2a/outbound.ts](/Users/zh/Documents/codeX/agent_control_plane/src/a2a/outbound.ts) | Outbound A2A dispatch |
| [src/workflows/run-workflow.ts](/Users/zh/Documents/codeX/agent_control_plane/src/workflows/run-workflow.ts) | Run orchestration workflow |
| [src/durable/run-coordinator.ts](/Users/zh/Documents/codeX/agent_control_plane/src/durable/run-coordinator.ts) | Run hot-state Durable Object |
| [src/durable/approval-session.ts](/Users/zh/Documents/codeX/agent_control_plane/src/durable/approval-session.ts) | Approval session Durable Object |
| [src/durable/rate-limiter.ts](/Users/zh/Documents/codeX/agent_control_plane/src/durable/rate-limiter.ts) | Tenant-scoped fixed-window rate limiter Durable Object |
| [src/lib](/Users/zh/Documents/codeX/agent_control_plane/src/lib) | Shared helpers for DB, auth, approvals, cancellation, queue, runs |
| [migrations](/Users/zh/Documents/codeX/agent_control_plane/migrations) | D1 schema migrations |
| [scripts/smoke.ts](/Users/zh/Documents/codeX/agent_control_plane/scripts/smoke.ts) | Local smoke test harness |
| [scripts/bootstrap_github_actions_runtime.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/bootstrap_github_actions_runtime.mjs) | Bootstrap GitHub Actions runtime variables / secret |
| [scripts/print_github_actions_runtime_inventory.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/print_github_actions_runtime_inventory.mjs) | Print GitHub Actions runtime variable / secret / input inventory |
| [scripts/post_deploy_verify.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/post_deploy_verify.mjs) | Remote verification script |
| [scripts/render_access_ingress_plan.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/render_access_ingress_plan.mjs) | Access ingress plan and checklist renderer |
| [scripts/render_seed_sql.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/render_seed_sql.mjs) | Seed SQL generator |
| [scripts/render_secret_rotation_bundle.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/render_secret_rotation_bundle.mjs) | Secret rotation bundle renderer |
| [scripts/submit_provisioning_request.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/submit_provisioning_request.mjs) | Submit a provisioning request artifact and capture evidence |
| [scripts/render_tenant_onboarding_bundle.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/render_tenant_onboarding_bundle.mjs) | Tenant onboarding bundle renderer |
| [scripts/update_tenant_handoff_state.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/update_tenant_handoff_state.mjs) | Merge bundle/request/verify evidence into a handoff-state JSON |

## Document Map

Start here based on what you need:

- Product / architecture baseline:
  - [agent_control_plane_dev_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/agent_control_plane_dev_spec_zh.md)
- API shapes and endpoint behavior:
  - [docs/api_contract_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/api_contract_spec_zh.md)
- Data model and state transitions:
  - [docs/data_model_state_machine_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/data_model_state_machine_spec_zh.md)
- Policy and approval semantics:
  - [docs/policy_approval_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/policy_approval_spec_zh.md)
- Runtime flow, failure meaning, and evidence sources:
  - [docs/flow_failure_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/flow_failure_runbook_zh.md)
- Deployment, validation, and SQL troubleshooting:
  - [docs/deployment_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/deployment_runbook_zh.md)
- GitHub Actions runtime wiring inventory:
  - [docs/github_actions_runtime_inventory_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/github_actions_runtime_inventory_zh.md)
- Access / service-token ingress governance:
  - [docs/access_ingress_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/access_ingress_runbook_zh.md)
- Observability and alerting baseline:
  - [docs/observability_alerting_baseline_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/observability_alerting_baseline_zh.md)
- Monitoring dashboard template:
  - [docs/monitoring_dashboard_template.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/monitoring_dashboard_template.example.json)
- Observability integration manifest:
  - [docs/observability_integration_manifest.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/observability_integration_manifest.example.json)
- Incident response checklist:
  - [docs/incident_response_checklist_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/incident_response_checklist_zh.md)
- Release checklist:
  - [docs/release_checklist_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/release_checklist_zh.md)
- Environment, secrets, and multi-env guidance:
  - [docs/environment_config_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/environment_config_runbook_zh.md)
- Secret rotation governance:
  - [docs/secret_rotation_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_runbook_zh.md)
- Tenant onboarding:
  - [docs/tenant_onboarding_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/tenant_onboarding_runbook_zh.md)
- Tenant provisioning request example:
  - [docs/tenant_provisioning_request.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/tenant_provisioning_request.example.json)
- Ops handoff summary:
  - [docs/ops_handoff_summary_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/ops_handoff_summary_zh.md)
- Multi-env Wrangler example:
  - [docs/wrangler.multi-env.example.jsonc](/Users/zh/Documents/codeX/agent_control_plane/docs/wrangler.multi-env.example.jsonc)
- Bulk secrets example:
  - [docs/secrets.bulk.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/secrets.bulk.example.json)
- Docs directory index:
  - [docs/README.md](/Users/zh/Documents/codeX/agent_control_plane/docs/README.md)
- Implementation status matrix:
  - [docs/implementation_status_matrix_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/implementation_status_matrix_zh.md)

## Verification Modes

Use the verification paths like this:

- Local code change validation:
  - `npm run verify:local`
- Pre-deploy package validation:
  - `npm run verify:build`
- Observability example contract validation:
  - `npm run validate:observability`
- Staging or isolated verification tenant:
  - `npm run post-deploy:verify`
- Production or shared tenant:
  - `npm run post-deploy:verify:readonly`

## CI Baseline

The GitHub Actions workflow at [.github/workflows/ci.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/ci.yml) is intentionally small:

- it installs dependencies with `npm ci`
- it runs `npm run verify:local`
- it runs `npm run verify:build`
- it runs `npm run validate:observability`

That workflow is meant to catch local type/smoke regressions, Wrangler packaging regressions, and observability contract drift early. It does not perform deploys, post-deploy checks, or tenant-specific release validation.

For human release gating, use [.github/workflows/manual-release-gate.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/manual-release-gate.yml):

- it runs the same local verification baseline
- it runs `validate:observability`
- it can optionally run write-mode remote verification against a staging or verify tenant
- it can optionally run readonly remote verification against a deployed worker
- it uploads logs, JSON summaries, and a short markdown summary as an artifact
- it does not deploy

For controlled staging rollout, use [.github/workflows/deploy-staging.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/deploy-staging.yml):

- it runs `verify:local`
- it runs `wrangler deploy --dry-run --env staging`
- it runs `validate:observability`
- it deploys the `staging` environment
- it runs write-mode `post-deploy:verify`
- it uploads `staging-deploy-manifest.json`, logs, and JSON summary as an artifact
- before first remote use, you can bootstrap the required repo-side values with `npm run github:actions:bootstrap -- --dry-run`
- if you want the exact repo-side wiring matrix first, run `npm run github:actions:inventory -- --format markdown`

For production-safe remote checks without deploy, use [.github/workflows/production-readonly-verify.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/production-readonly-verify.yml):

- it runs readonly `post-deploy:verify:readonly` against an existing `RUN_ID`
- it runs `validate:observability`
- it uploads `production-readonly-manifest.json`, logs, and JSON summary as an artifact
- it does not deploy or mutate production data

For controlled production rollout, use [.github/workflows/deploy-production.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/deploy-production.yml):

- it runs `verify:local`
- it runs `wrangler deploy --dry-run --env=""`
- it runs `validate:observability`
- it can optionally run `wrangler d1 migrations apply ... --remote --env=""`
- it deploys the top-level production worker
- it runs readonly `post-deploy:verify:readonly`
- it uploads `production-deploy-manifest.json`, logs, and JSON summary as an artifact
- it is designed to pair with a protected GitHub `production` environment for human approval
- before first remote use, you can bootstrap the required repo-side values with `npm run github:actions:bootstrap -- --dry-run`
- if you want the exact repo-side wiring matrix first, run `npm run github:actions:inventory -- --format markdown`

For scheduled runtime checks, use [.github/workflows/synthetic-runtime-checks.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/synthetic-runtime-checks.yml):

- it runs scheduled or manual health probes against configured staging / production URLs
- it can run production readonly verification on a schedule using repository variables
- it uploads synthetic health and readonly verify artifacts for incident review
- it currently uses repository variables for URLs / tenant / run ID, so it can start working before deploy credentials are wired
- optional `ACP_SYNTH_*` repository variables unlock A2A and MCP SSE probes; `github:actions:inventory` shows the full matrix

## Known Gaps

The most important remaining work before serious production rollout is:

- real Access / service-token deployment automation and governance rollout
- fully automated production tenant onboarding and external provisioning workflow
- observability now has a concrete SLI/alerting baseline plus dashboard, incident template, and scheduled GitHub Actions runtime checks, but the repo still needs full monitoring-platform and oncall integration
- secret rotation now has a concrete runbook/template, but the repo still needs real rotation automation and secret-store governance
- GitHub `staging` / `production` environments and repository variables are now in place, and the repo can bootstrap them via `npm run github:actions:bootstrap`; remote deploys still require a real Cloudflare API token plus any stricter branch policy you want

## Notes

- `wrangler deploy --dry-run` may print a local Wrangler log write warning in restricted environments; if the dry-run itself succeeds, that warning is usually non-blocking.
- `scripts/post_deploy_verify.mjs --help` prints usage for both write and readonly verification modes.
