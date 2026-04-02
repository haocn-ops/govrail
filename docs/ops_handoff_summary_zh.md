# Govrail Ops Handoff Summary

交付對象：SRE / 值班工程師 / 接手工程師  
版本：v0.1  
日期：2026-04-01

## 1. 目的

本文件作為目前倉庫的運維交接摘要，重點不是重複所有 runbook，而是快速回答：

- 現在哪些環境已實際落地
- 驗收證據在哪裡
- 下一位操作者應先看什麼

## 2. 已落地環境

### 2.1 staging

- Worker URL: `https://agent-control-plane-staging.izhenghaocn.workers.dev`
- 驗收 tenant: `tenant_verify_20260401`
- 驗收方式: `npm run post-deploy:verify`
- 最近一次 write verify run_id: `run_mng2gcnga0c3b8ac8dff4333`
- 驗收 summary: `/tmp/agent-control-plane-staging-verify.json`

### 2.2 production

- Console URL: `https://govrail.net`
- API URL: `https://api.govrail.net`
- 驗收 tenant: `tenant_verify_prod_20260401`
- write verify run_id: `run_mng2k03y958a39a20ce0489b`
- write verify summary: `/tmp/agent-control-plane-production-verify-write.json`
- readonly verify summary: `/tmp/agent-control-plane-production-verify-readonly.json`

### 2.3 GitHub environments / variables

- GitHub environment: `staging`
- GitHub environment: `production`
- `production` 已設 required reviewer：`haocn-ops`
- repository variables 已設：
  - `CLOUDFLARE_ACCOUNT_ID`
  - `ACP_STAGING_BASE_URL`
  - `ACP_STAGING_TENANT_ID`
  - `ACP_PRODUCTION_BASE_URL`
  - `ACP_PRODUCTION_TENANT_ID`
  - `ACP_PRODUCTION_RUN_ID`
- Synthetic runtime checks (optional, for SSE probes):
  - `ACP_SYNTH_SUBJECT_ID`
  - `ACP_SYNTH_SUBJECT_ROLES`
- GitHub Actions `Production Readonly Verify` 最近一次成功 run:
  - run id: `23852973146`
  - URL: [actions/runs/23852973146](https://github.com/haocn-ops/agent_control_plane/actions/runs/23852973146)

## 3. 入口保護現況

- staging / production 都以 `NORTHBOUND_AUTH_MODE=trusted_edge` 部署
- `post-deploy:verify` 與 `post-deploy:verify:readonly` 已對齊 trusted headers
- Access / service token 的部署方式請先看：
  - [access_ingress_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/access_ingress_runbook_zh.md)
- 若要先生成一份可交接的入口治理計劃，可直接使用：
  - `npm run access:ingress:plan -- --plan-file docs/access_ingress_plan.example.json --output-dir /tmp/access-ingress-plan`
  - 產物包含 `access-ingress-verify.sh`、`access-ingress-self-check.sh`、`access-ingress-fold-evidence.sh` 與 rotation checklist，可用來降低人工交接錯漏

## 4. 接手優先閱讀順序

1. [docs/implementation_status_matrix_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/implementation_status_matrix_zh.md)
2. [docs/deployment_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/deployment_runbook_zh.md)
3. [docs/environment_config_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/environment_config_runbook_zh.md)
4. [docs/access_ingress_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/access_ingress_runbook_zh.md)
5. [docs/release_checklist_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/release_checklist_zh.md)
6. [docs/observability_alerting_baseline_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/observability_alerting_baseline_zh.md)
7. [docs/secret_rotation_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_runbook_zh.md)

## 5. 常用命令

### 5.1 staging write verify

```bash
BASE_URL="https://agent-control-plane-staging.izhenghaocn.workers.dev" \
TENANT_ID="tenant_verify_20260401" \
VERIFY_OUTPUT_PATH="/tmp/agent-control-plane-staging-verify.json" \
npm run post-deploy:verify
```

### 5.2 production readonly verify

```bash
BASE_URL="https://api.govrail.net" \
TENANT_ID="tenant_verify_prod_20260401" \
RUN_ID="run_mng2k03y958a39a20ce0489b" \
VERIFY_OUTPUT_PATH="/tmp/agent-control-plane-production-verify-readonly.json" \
npm run post-deploy:verify:readonly
```

### 5.3 GitHub Actions 輔助入口

- staging deploy:
  - `Deploy Staging`
  - [.github/workflows/deploy-staging.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/deploy-staging.yml)
- production deploy:
  - `Deploy Production`
  - [.github/workflows/deploy-production.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/deploy-production.yml)
- production readonly verify:
  - `Production Readonly Verify`
  - [.github/workflows/production-readonly-verify.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/production-readonly-verify.yml)
- synthetic runtime checks:
  - `Synthetic Runtime Checks`
  - [.github/workflows/synthetic-runtime-checks.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/synthetic-runtime-checks.yml)
- GitHub runtime bootstrap:
  - `npm run github:actions:bootstrap -- --dry-run`
  - [scripts/bootstrap_github_actions_runtime.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/bootstrap_github_actions_runtime.mjs)
- provisioning submission helper:
  - `npm run provisioning:submit -- --request <file> --endpoint <url>`
  - [scripts/submit_provisioning_request.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/submit_provisioning_request.mjs)
- tenant handoff state helper:
  - `npm run tenant:handoff:update -- --bundle <file> --request <file> --verify <file>`
  - [scripts/update_tenant_handoff_state.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/update_tenant_handoff_state.mjs)
- tenant onboarding apply helper:
  - `npm run tenant:onboarding:apply -- --request <file> --mode dry-run`
  - [scripts/apply_tenant_bundle_changes.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/apply_tenant_bundle_changes.mjs)
- secret rotation bundle:
  - `npm run secret:rotation:bundle -- --plan docs/secret_rotation_plan.example.json --output-dir .secret-rotation`
- tenant onboarding bundle:
  - `npm run tenant:onboarding:bundle -- --tenant-id tenant_acme --deploy-env staging`

## 6. 目前仍需補強的運維項

- 正式 Access application / service token 治理自動化
- 監控 / 告警基線已接到 GitHub Actions runtime checks，但尚未接入完整監控平台與 oncall 值班流程
- secret rotation 已有 runbook 與 bundle template，但尚未接入真正的 secret-store 自動化
- staging / production environments 與 deploy/runtime workflows 已落地，repo 也已有 GitHub runtime bootstrap；但遠端 deploy 仍需提供真實 `CLOUDFLARE_API_TOKEN`
- tenant provisioning 已有 `status.sh` / `provision.sh` / `verify.sh`，但仍未接入外部 provisioning 系統
