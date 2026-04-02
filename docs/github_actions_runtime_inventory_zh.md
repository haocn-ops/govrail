# GitHub Actions Runtime 接線清單

交付對象：Platform / SRE / Release Manager / 接手工程師  
版本：v0.1  
日期：2026-04-02

## 1. 文檔目的

這份文件把目前 repo 內 GitHub Actions 真正依賴的接線項集中列出，避免接手時還要逐份 workflow YAML 手動比對。

重點回答四個問題：

- 要先設哪些 repository variables / secrets
- 本機跑 bootstrap 前要先準備哪些環境變數
- 每條 workflow_dispatch 要填哪些 inputs
- 哪些值只是建議設定，哪些是執行時硬依賴

若你偏好 CLI 輸出，而不是讀文檔，可直接使用：

```bash
npm run github:actions:inventory -- --format markdown
```

若要輸出 JSON 給其他工具或交接腳本消費，可使用：

```bash
npm run github:actions:inventory -- --format json
```

## 2. Repository Side 接線項

### 2.1 Repository variables

| 名稱 | 必要性 | 主要用途 | 被哪些 workflow 使用 |
|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | 必填 | 提供 deploy workflow 使用的 Cloudflare account id | `Deploy Staging`, `Deploy Production` |
| `ACP_STAGING_BASE_URL` | 必填（若要跑 staging health probe） | staging worker URL | `Synthetic Runtime Checks` |
| `ACP_STAGING_TENANT_ID` | 選填，但建議 | staging SSE probes 需要的 tenant | `Synthetic Runtime Checks` |
| `ACP_PRODUCTION_BASE_URL` | 必填（若要跑 production probes） | production worker URL | `Synthetic Runtime Checks` |
| `ACP_PRODUCTION_TENANT_ID` | 必填（若要跑 production readonly verify） | production readonly verify tenant | `Synthetic Runtime Checks` |
| `ACP_PRODUCTION_RUN_ID` | 必填（若要跑 production readonly verify） | readonly 驗收既有 run | `Synthetic Runtime Checks` |
| `ACP_SYNTH_SUBJECT_ID` | 選填，但建議 | SSE synthetic identity subject | `Synthetic Runtime Checks` |
| `ACP_SYNTH_SUBJECT_ROLES` | 選填，但建議 | SSE synthetic identity roles | `Synthetic Runtime Checks` |

說明：

- `CLOUDFLARE_ACCOUNT_ID` 目前在 deploy workflows 內優先讀 repository variable，也允許 fallback 到同名 secret；但因為它不是敏感值，建議維持在 variable。
- `ACP_SYNTH_*` 不影響基本 health probes；缺少時，Synthetic Runtime Checks 仍可執行，但 A2A/MCP SSE probes 會標成 `skipped`。

### 2.2 Repository secrets

| 名稱 | 必要性 | 主要用途 | 被哪些 workflow 使用 |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | 必填（deploy workflow） | `wrangler deploy` / remote D1 migrations | `Deploy Staging`, `Deploy Production` |

## 3. 本機 Bootstrap 前要準備的環境變數

目前可用以下指令把 repo-side values 一次性對齊到 GitHub：

```bash
npm run github:actions:bootstrap -- --dry-run
```

真正寫入 GitHub 前，本機至少要先準備：

- `CLOUDFLARE_ACCOUNT_ID`
- `ACP_STAGING_BASE_URL`
- `ACP_PRODUCTION_BASE_URL`
- `ACP_PRODUCTION_TENANT_ID`
- `ACP_PRODUCTION_RUN_ID`
- `CLOUDFLARE_API_TOKEN`

若也要把 SSE synthetic probes 一起 bootstrap，請另外準備：

- `ACP_SYNTH_SUBJECT_ID`
- `ACP_SYNTH_SUBJECT_ROLES`

可先預覽 inventory，再決定要不要實際寫入：

```bash
npm run github:actions:inventory -- --format markdown
npm run github:actions:bootstrap -- --dry-run --include-synthetic
```

## 4. Workflow 矩陣

| Workflow | 檔案 | Repository variables | Repository secrets | workflow_dispatch inputs |
|---|---|---|---|---|
| `CI baseline` | [.github/workflows/ci.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/ci.yml) | 無 | 無 | 無 |
| `Manual Release Gate` | [.github/workflows/manual-release-gate.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/manual-release-gate.yml) | 無 | 無 | `verification_mode`；remote mode 時另外需要 `base_url` / `tenant_id`；readonly 再加 `run_id`；write mode 可選 `expected_*_rate_limit` |
| `Deploy Staging` | [.github/workflows/deploy-staging.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/deploy-staging.yml) | `CLOUDFLARE_ACCOUNT_ID` | `CLOUDFLARE_API_TOKEN` | `base_url`, `tenant_id`, `expected_run_rate_limit?`, `expected_replay_rate_limit?` |
| `Production Readonly Verify` | [.github/workflows/production-readonly-verify.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/production-readonly-verify.yml) | 無 | 無 | `base_url`, `tenant_id`, `run_id` |
| `Deploy Production` | [.github/workflows/deploy-production.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/deploy-production.yml) | `CLOUDFLARE_ACCOUNT_ID` | `CLOUDFLARE_API_TOKEN` | `change_ref`, `base_url`, `tenant_id`, `run_id`, `apply_migrations`, `d1_database` |
| `Synthetic Runtime Checks` | [.github/workflows/synthetic-runtime-checks.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/synthetic-runtime-checks.yml) | `ACP_STAGING_*`, `ACP_PRODUCTION_*`, `ACP_SYNTH_*` | 無 | 手動觸發時可填 `run_production_readonly_verify`, `run_sse_probes` |

## 5. 各 Workflow 補充說明

### 5.1 CI baseline

- 只做 `npm ci`、`verify:local`、`verify:build`、`validate:observability`
- 不依賴任何 deploy credentials、repo variables 或 runtime inputs

### 5.2 Manual Release Gate

- 不做 deploy
- remote 驗收完全依賴手動輸入的 `base_url` / `tenant_id` / `run_id`
- 適合 staging 驗收或 production 唯讀 gate，但不適合替代 deploy workflow 的 credential wiring

### 5.3 Deploy Staging

- 需要真實 `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID` 建議用 repository variable 管理
- deploy 完會直接執行 write-mode `post-deploy:verify`

### 5.4 Production Readonly Verify

- 不需要 deploy credentials
- 只要有既有 production `RUN_ID`，即可對線上環境做唯讀驗收
- 適合 release 後回歸、handoff 或 incident 後二次確認

### 5.5 Deploy Production

- 需要真實 `CLOUDFLARE_API_TOKEN`
- `apply_migrations=yes` 時還要確認 `d1_database` 指向的是正確 production database
- 這條 workflow 預期搭配 GitHub `production` environment reviewer / protection 一起使用

### 5.6 Synthetic Runtime Checks

- 若只設 `ACP_*_BASE_URL`，可先跑 health probes
- 若要排程執行 production readonly verify，還必須補 `ACP_PRODUCTION_TENANT_ID` 與 `ACP_PRODUCTION_RUN_ID`
- 若要把 A2A/MCP SSE 通道一起納入定時探針，建議再補 `ACP_STAGING_TENANT_ID`、`ACP_SYNTH_SUBJECT_ID`、`ACP_SYNTH_SUBJECT_ROLES`

## 6. 建議操作順序

1. 先用 `npm run github:actions:inventory -- --format markdown` 檢查目前需要哪些值。
2. 在本機準備對應環境變數後，先跑 `npm run github:actions:bootstrap -- --dry-run`。
3. 若 Synthetic Runtime Checks 也要覆蓋 SSE probes，再跑 `npm run github:actions:bootstrap -- --dry-run --include-synthetic`。
4. 確認輸出無誤後，再移除 `--dry-run` 寫入 GitHub repo。
5. 實際 dispatch `Deploy Staging` / `Deploy Production` 前，再人工核對 workflow inputs 是否對應到目標 tenant / run。

## 7. 相關文件

- [deployment_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/deployment_runbook_zh.md)
- [environment_config_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/environment_config_runbook_zh.md)
- [release_checklist_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/release_checklist_zh.md)
- [ops_handoff_summary_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/ops_handoff_summary_zh.md)
- [scripts/bootstrap_github_actions_runtime.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/bootstrap_github_actions_runtime.mjs)
- [scripts/print_github_actions_runtime_inventory.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/print_github_actions_runtime_inventory.mjs)
