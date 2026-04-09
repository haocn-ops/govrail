# Govrail

Govrail is a Cloudflare Workers-based multi-tenant agent control plane MVP.

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
- `npm run web:test`
- `npm run provisioning:validate -- --request docs/tenant_provisioning_request.example.json`
- `npm run validate:observability`

A minimal GitHub Actions baseline now mirrors those checks on `push` and `pull_request` via [.github/workflows/ci.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/ci.yml), including the root `verify:local` / `verify:build` pair, `web:test`, observability example validation, and a frozen tenant provisioning contract check against `docs/tenant_provisioning_request.example.json`.
A separate manual release gate workflow now exists at [.github/workflows/manual-release-gate.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/manual-release-gate.yml) for `workflow_dispatch`-driven verification and artifact capture without any deploy.

The codebase is in "deployable MVP skeleton" shape:

- local TypeScript and smoke verification are green
- Worker dry-run packaging is green
- staging-style post-deploy verification is implemented
- production-safe readonly post-deploy verification is implemented

One important current boundary:

- northbound auth is assumed to be enforced by Cloudflare Access or another trusted edge layer
- the Worker defaults to a permissive local/test mode, but can now be switched to `NORTHBOUND_AUTH_MODE=trusted_edge` so only trusted edge identity headers are accepted and direct `X-Subject-*` overrides are rejected
- workspace-scoped API keys can now authenticate northbound runtime calls via `Authorization: Bearer <key>` or `X-API-Key`, with the Worker deriving `tenant_id` from the bound workspace/service account instead of trusting a caller-supplied `X-Tenant-Id`
- the runtime currently enforces a minimal scope gate on API keys that include `runs:write`; keys with empty scope still work for backward compatibility, while future iterations will tighten the guard and rely on additional scopes such as `runs:manage`, `approvals:write`, `a2a:write`, and `mcp:call` when those APIs become scoped

It is not yet a fully productionized service. Access rollout, production onboarding automation, external provisioning, secret rotation, monitoring, and environment hardening still need to be completed.

## Production Endpoints

- Console: `https://govrail.net`
- API: `https://api.govrail.net`

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
| `npm run observability:bundle -- --output-dir .observability-bundles/production --environment production --run-id <existing_run_id>` | Render an actionable observability handoff bundle with runtime inputs, alert refs, and evidence templates |
| `npm run access:ingress:plan -- --plan-file <plan.json>` | Render an access ingress plan and checklist for a tenant/environment |
| `npm run access:ingress:plan:strict -- --plan-file <plan.json>` | Fail early if the access ingress plan is missing handoff owner, change reference, readonly run-id source, token audience, or other required governance metadata |
| `npm run github:actions:bootstrap -- --dry-run` | Validate or push the GitHub Actions runtime variables / secret bootstrap |
| `npm run github:actions:inventory -- --format markdown` | Print the GitHub Actions runtime variable / secret / workflow input inventory |
| `npm run provisioning:validate -- --request <file>` | Validate that a tenant provisioning request still matches the frozen external handoff contract |
| `npm run provisioning:submit -- --request <file> --endpoint <url>` | Submit a provisioning request artifact to an external workflow or ticket endpoint |
| `npm run release:artifact:validate -- --manifest <manifest.json> --artifact-dir <dir>` | Validate that a release/deploy artifact manifest still matches the frozen artifact layout, summary path, and verify-summary contract |
| `npm run seed:sql -- --tenant-id <id>` | Render seed SQL for a tenant |
| `npm run secret:rotation:bundle -- --plan <plan.json>` | Render a secret rotation bundle with checklist and helper script |
| `npm run secret:rotation:bundle:strict -- --plan <plan.json>` | Fail early when the rotation plan is missing verify output paths, rollback coverage, or other required evidence hooks |
| `npm run secret:rotation:validate -- --manifest <manifest.json> --artifact-dir <dir>` | Validate that a generated secret-rotation bundle still matches the frozen manifest, evidence-template, and file-layout contract |
| `npm run synthetic:artifact:validate -- --manifest <manifest.json> --artifact-dir <dir>` | Validate that a synthetic runtime artifact manifest still matches the frozen summary/log layout and runtime-check schema |
| `npm run tenant:onboarding:apply -- --request <file> --mode dry-run` | Dry-run or apply tenant provider/policy changes from a provisioning request |
| `npm run tenant:onboarding:bundle -- --tenant-id <id>` | Render tenant onboarding bundle files for a tenant |
| `npm run tenant:handoff:validate -- --bundle <bundle.json> --state <handoff-state.json>` | Validate that the onboarding bundle and folded request/submission/apply/verify evidence still form a consistent handoff-state contract |
| `npm run tenant:handoff:update -- --bundle <file>` | Fold request/verify evidence back into a handoff-state JSON |
| `npm run post-deploy:verify` | Write-mode remote verification for staging or dedicated verify tenants |
| `npm run post-deploy:verify:readonly` | Readonly remote verification for production or shared tenants |
| `npm run web:preview:staging` | Build the web console with the `web` staging env and open the Cloudflare/OpenNext local preview |
| `npm run web:deploy:staging:dry-run` | Dry-run the isolated `workers.dev` web staging deploy without touching production routes |
| `npm run web:deploy:staging` | Deploy the isolated `workers.dev` web staging console |
| `npm run web:test:e2e` | Run the full root-level web non-browser e2e batch from `web/tests/e2e` |
| `npm run web:test:e2e:file -- tests/e2e/saas-mainline-smoke.e2e.test.ts` | Run one targeted root-level web non-browser e2e file for focused debugging or contract checks |
| `npm run web:test:browser:smoke` | Run the default browser smoke suite on the production-backed local server |
| `npm run web:test:browser:smoke:stable` | Run the same browser smoke suite with explicit stable-server settings |
| `npm run web:test:browser:smoke:dev` | Run the browser smoke suite against a local Next dev server for quicker iteration |
| `npm run web:test:browser:spike` | Print the browser harness readiness report and boundary summary |
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

## Week 8 readiness summary

The Week 8 readiness summary card also lets platform_admin dive deeper into the follow-up work behind each indicator. Each metric can filter the Week 8 readiness follow-up list down to the workspaces that contributed to that count (e.g., those with a recent successful demo run but no billing warning), and it links directly to the onboarding, billing, verification, or go-live surfaces where that follow-up happens. All of these actions remain navigation-only governance cues; there is no impersonation, automation, or support tooling behind the drill-downs.

When a readiness metric launches onboarding, settings, verification, or go-live, the target surface receives `source=admin-readiness`, the current `week8_focus`, and the workspace/organization context. Each surface now shows a reminder banner explaining what focus launched the follow-up and offers a “Return to admin readiness view” link that preserves the same week8_focus and governance filter, so the navigation lane circles back without losing the original context.

## Verification Modes

Use the verification paths like this:

- Local code change validation:
  - `npm run verify:local`
- Pre-deploy package validation:
  - `npm run verify:build`
- Observability example contract validation:
  - `npm run validate:observability`
- Root-level web non-browser e2e, full batch:
  - `npm run web:test:e2e`
- Root-level web non-browser e2e, targeted single file:
  - `npm run web:test:e2e:file -- tests/e2e/saas-mainline-smoke.e2e.test.ts`
- Staging or isolated verification tenant:
  - `npm run post-deploy:verify`
- Web staging preview or deploy from repo root:
  - `npm run web:preview:staging`
  - `npm run web:deploy:staging:dry-run`
  - `npm run web:deploy:staging`
- Browser smoke against an existing staging console URL:
  - `PLAYWRIGHT_BASE_URL="https://<web-staging>.workers.dev" npm run web:test:browser:session-checkpoint:existing-server`
  - `PLAYWRIGHT_BASE_URL="https://<web-staging>.workers.dev" npm run web:test:browser:mainline-console-verification:existing-server`
- Production or shared tenant:
  - `npm run post-deploy:verify:readonly`

`npm run web:test:e2e -- <file>` 仍會帶上整包 `web/tests/e2e/*.test.ts`；若只需 targeted 單檔重跑，請改用 `npm run web:test:e2e:file -- <file>`。

## CI Baseline

The GitHub Actions workflow at [.github/workflows/ci.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/ci.yml) is intentionally small:

- it installs dependencies with `npm ci`
- it runs `npm run verify:local`
- it runs `npm run verify:build`
- it runs `npm run web:test`
- it runs `npm run provisioning:validate -- --request docs/tenant_provisioning_request.example.json`
- it runs `npm run validate:observability`

That workflow is meant to catch local type/smoke regressions, web contract drift, Wrangler packaging regressions, frozen provisioning contract drift, and observability contract drift early. It does not perform deploys, post-deploy checks, or tenant-specific release validation.

For human release gating, use [.github/workflows/manual-release-gate.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/manual-release-gate.yml):

- it runs the same local verification baseline
- it runs `validate:observability`
- it can optionally run write-mode remote verification against a staging or verify tenant
- it can optionally run readonly remote verification against a deployed worker
- it uploads logs, JSON summaries, and a short markdown summary as an artifact
- it validates `release-gate-manifest.json` against the frozen artifact contract before upload
- it does not deploy

For controlled staging rollout, use [.github/workflows/deploy-staging.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/deploy-staging.yml):

- it runs `verify:local`
- it runs `wrangler deploy --dry-run --env staging`
- it runs `validate:observability`
- it deploys the `staging` environment
- it runs write-mode `post-deploy:verify`
- it uploads `staging-deploy-manifest.json`, logs, and JSON summary as an artifact
- it validates `staging-deploy-manifest.json` before upload so artifact naming/path drift fails inside the workflow
- before first remote use, you can bootstrap the required repo-side values with `npm run github:actions:bootstrap -- --dry-run`
- if you want the exact repo-side wiring matrix first, run `npm run github:actions:inventory -- --format markdown`

For production-safe remote checks without deploy, use [.github/workflows/production-readonly-verify.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/production-readonly-verify.yml):

- it runs readonly `post-deploy:verify:readonly` against an existing `RUN_ID`
- it runs `validate:observability`
- it uploads `production-readonly-manifest.json`, logs, and JSON summary as an artifact
- it validates `production-readonly-manifest.json` before upload
- it does not deploy or mutate production data

For controlled production rollout, use [.github/workflows/deploy-production.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/deploy-production.yml):

- it runs `verify:local`
- it runs `wrangler deploy --dry-run --env=""`
- it runs `validate:observability`
- it can optionally run `wrangler d1 migrations apply ... --remote --env=""`
- it deploys the top-level production worker
- it runs readonly `post-deploy:verify:readonly`
- it uploads `production-deploy-manifest.json`, logs, and JSON summary as an artifact
- it validates `production-deploy-manifest.json` before upload
- it is designed to pair with a protected GitHub `production` environment for human approval
- before first remote use, you can bootstrap the required repo-side values with `npm run github:actions:bootstrap -- --dry-run`
- if you want the exact repo-side wiring matrix first, run `npm run github:actions:inventory -- --format markdown`

For scheduled runtime checks, use [.github/workflows/synthetic-runtime-checks.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/synthetic-runtime-checks.yml):

- it runs scheduled or manual health probes against configured staging / production URLs
- it can run production readonly verification on a schedule using repository variables
- it uploads synthetic health and readonly verify artifacts for incident review
- it now writes `synthetic-runtime-health-manifest.json` and `synthetic-runtime-production-manifest.json`, plus markdown summaries, and validates both artifact contracts before upload
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
- Stripe customer portal creation accepts an optional `return_url` in the request payload; absent that override, the Worker uses `STRIPE_CUSTOMER_PORTAL_RETURN_URL`, and only falls back to `BILLING_RETURN_BASE_URL` / `settings?intent=manage-plan` when both are missing. This URL is the portal's post-session return target, not the checkout success redirect or webhook endpoint.
