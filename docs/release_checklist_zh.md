# Govrail 發布檢查清單（MVP）

交付對象：SRE / 值班工程師 / 發布負責人  
版本：v0.1  
日期：2026-04-01

## 1. 文檔目的

這份清單不是要取代完整 runbook，而是把發版時最容易漏掉的動作壓成一份可勾選的 checklist。

目前建議固定以 GitHub Actions workflow artifact 作為交付證據來源，不再依賴口頭描述或臨時路徑。

適合用在：

- staging 發版
- production 受控變更窗口
- handoff 給非原作者執行部署

若需要背景說明或細節，請回看：

- [deployment_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/deployment_runbook_zh.md)
- [environment_config_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/environment_config_runbook_zh.md)
- [tenant_onboarding_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/tenant_onboarding_runbook_zh.md)

## 2. 發版前

### 2.1 代碼與配置

- [ ] 已確認本次要部署的工作目錄正確
- [ ] 已確認目標環境是 `staging` 還是 `production`
- [ ] 已確認 `wrangler.jsonc` / `env.staging` 指向正確資源
- [ ] 已確認本次不會誤用 demo / smoke tenant

### 2.2 本地驗證

- [ ] `npm install`
- [ ] `npm run types`
- [ ] `npm run verify:local`
- [ ] `npm run verify:build`

### 2.3 CI 先行確認

- [ ] 對應 PR / push 的 GitHub Actions 已通過
- [ ] CI 已通過 `verify:local`、`verify:build`、`web:test`、`validate:observability` 與 `provisioning:validate -- --request docs/tenant_provisioning_request.example.json`
- [ ] 如需人工 release gate，已手動觸發 `Manual Release Gate` workflow
- [ ] 已確認推薦路徑為 `Manual Release Gate -> Deploy Staging -> Deploy Production -> Production Readonly Verify`
- [ ] 如需 GitHub Actions 直接部署 staging，已確認 `Deploy Staging` workflow 的 `base_url` / `tenant_id` 正確
- [ ] 如需 GitHub Actions 跑 production 唯讀驗收，已確認 `Production Readonly Verify` workflow 的 `base_url` / `tenant_id` / `run_id` 正確
- [ ] 如需 GitHub Actions 直接部署 production，已確認 `Deploy Production` workflow 的 `change_ref` / `base_url` / `tenant_id` / `run_id` / `apply_migrations`
- [ ] 如需同步 GitHub runtime 參數與 secret，已執行 `npm run github:actions:bootstrap -- --dry-run`
- [ ] 已確認 repository variables 中的 `CLOUDFLARE_ACCOUNT_ID`、`ACP_*` runtime check 參數正確
- [ ] 若要對 staging / verify tenant 做遠端寫入式驗收，已選對 `verification_mode=write`
- [ ] 如有遠端驗收，已下載或記錄 workflow artifact 中的 logs / summary
- [ ] 如需交接，已保留遠端驗收輸出的 JSON summary，或明確記錄 `VERIFY_OUTPUT_PATH`
- [ ] 已確認 summary 內含 `started_at`、`completed_at`、`duration_ms`、`check_count` 與 `checks`
- [ ] 已確認 workflow artifact 內有 `release-gate-manifest.json`，可直接讀取 inputs / outcomes / artifact 路徑
- [ ] 如需在本地複核 workflow artifact，已執行 `npm run release:artifact:validate -- --manifest <manifest.json> --artifact-dir <artifact-dir>`
- [ ] 若走 `Deploy Staging`，已確認 repository secrets 中存在 `CLOUDFLARE_API_TOKEN`
- [ ] 若走 `Deploy Staging` / `Deploy Production`，已確認 `CLOUDFLARE_ACCOUNT_ID` 由 repository variable 或 secret 提供
- [ ] 如有使用 `Deploy Staging`，已確認 artifact 內有 `staging-deploy-manifest.json`
- [ ] 如有使用 `Production Readonly Verify`，已確認 artifact 內有 `production-readonly-manifest.json`
- [ ] 如有使用 `Deploy Production`，已確認 GitHub `production` environment protection 已啟用
- [ ] 如有使用 `Deploy Production`，已確認 artifact 內有 `production-deploy-manifest.json`
- [ ] 如有使用 `Synthetic Runtime Checks`，已確認 artifact 內有 `synthetic-summary.json` / `synthetic-runtime-health-manifest.json`，或 `production-readonly-summary.json` / `synthetic-runtime-production-manifest.json`
- [ ] 已確認 artifact 目錄命名固定為 `release-gate/`、`staging-deploy/`、`production-deploy/`、`production-readonly-verify/`、`synthetic-runtime-checks/`
- [ ] 已確認 production deploy 雖可由 workflow 執行，但仍需受控人審與變更窗口

### 2.4 資源與資料

- [ ] D1 migration 已套用到目標環境
- [ ] 目標 tenant 所需 seed / policy / provider 已確認
- [ ] 若是新 tenant，已完成 onboarding 準備
- [ ] 若是新 tenant，已生成或保存 onboarding bundle（`seed.sql` / `bundle.json` / `handoff.md`）
- [ ] 若是新 tenant 且有驗收交接需求，已規劃 verify summary 輸出位置（例如 bundle 目錄下的 `verify-write-summary.json` 或 `verify-readonly-summary.json`）
- [ ] 若要快速比對驗收範圍，已確認 summary 會記錄 `check_count` 與 `duration_ms`
- [ ] 若依賴 `auth_ref`，對應 Worker secret 已存在

### 2.5 安全與入口

- [ ] 已確認 Access / service token / 上游入口保護狀態
- [ ] 已確認 staging / production 的 `NORTHBOUND_AUTH_MODE=trusted_edge`
- [ ] 已確認 production 不會只依賴 `X-Subject-Id` / `X-Subject-Roles`
- [ ] 已確認 staging 與 production 的 Access 群組或 token 範圍隔離
- [ ] 若本次涉及 trusted-edge / Access 入口治理，已用 `npm run access:ingress:plan:strict -- --plan-file <plan.json> --output-dir <dir>` 生成可交接 bundle

## 3. 發版執行

### 3.1 staging

執行：

```bash
wrangler deploy --env staging
```

或手動觸發：

- `Deploy Staging` workflow

完成後確認：

- [ ] deploy 成功
- [ ] 綁定資源與 staging 預期一致
- [ ] 無明顯 Wrangler 配置錯誤
- [ ] 若使用 `Deploy Staging`，已確認 `staging-deploy-summary.md` 與 `staging-deploy-manifest.json`

### 3.2 production

執行：

```bash
wrangler deploy
```

或手動觸發：

- `Deploy Production` workflow

完成後確認：

- [ ] deploy 成功
- [ ] 綁定資源與 production 預期一致
- [ ] 沒有把 staging resource 名稱帶進 production
- [ ] 如需套 migration，已確認 `apply_migrations` 與 `d1_database` 指向正確 production DB
- [ ] 若使用 `Deploy Production`，已確認 `production-deploy-summary.md` / `production-deploy-manifest.json`
- [ ] 如需 deploy 後再做安全回歸，已準備 `Production Readonly Verify` workflow 或等價唯讀命令

## 4. 發版後驗收

### 4.1 staging 驗收

```bash
BASE_URL="https://<worker>" \
TENANT_ID="tenant_verify" \
npm run post-deploy:verify
```

驗收完成前至少確認：

- [ ] `GET /api/v1/health` 回 `200`
- [ ] 如有外部探針，`HEAD /api/v1/health` 也回 `200`
- [ ] Agent Card 可讀
- [ ] tool providers / policies admin API 可用
- [ ] run 可建立並完成
- [ ] graph / events / artifacts 可查
- [ ] artifact 正文可讀

### 4.2 production 驗收

```bash
BASE_URL="https://<worker>" \
TENANT_ID="tenant_prod" \
RUN_ID="<existing_run_id>" \
npm run post-deploy:verify:readonly
```

或手動觸發：

- `Production Readonly Verify` workflow

驗收完成前至少確認：

- [ ] `GET /api/v1/health` 回 `200`
- [ ] 如有外部探針，`HEAD /api/v1/health` 也回 `200`
- [ ] Agent Card 可讀
- [ ] admin API list 可讀
- [ ] 既有 run 可查
- [ ] graph / events / artifacts 可查
- [ ] 若存在 artifact，正文可讀
- [ ] 若走 workflow，已保存 `production-readonly-summary.md` / `production-readonly-manifest.json`
- [ ] 若走 `Deploy Production` workflow，已保存 `production-deploy-summary.md` / `production-deploy-manifest.json`

## 5. 若驗收失敗先看哪裡

### 5.1 build / deploy 失敗

- [ ] 先看 Wrangler 輸出
- [ ] 再看 binding / env 是否對錯環境
- [ ] 再確認 D1 / R2 / Queue 資源是否存在

### 5.2 遠端驗收失敗

- [ ] 記錄失敗端點
- [ ] 記錄 HTTP status
- [ ] 記錄 response body
- [ ] 回查 Worker logs
- [ ] 回查 D1 中對應 `run_id` / `approval_id` / `task_id`

### 5.3 常見錯誤

- `tool_provider_not_found`
  - 多半是 tenant baseline / provider 未建立
- `upstream_auth_not_configured`
  - 多半是 secret 未建立或環境用錯
- `tenant_access_denied`
  - 多半是 tenant header、approver role 或入口保護設定不一致
- `run_not_found` / `artifact_not_found`
  - 多半是驗收用 ID 來自另一個 tenant 或另一個環境

## 6. 回滾決策

若發版後失敗，需要先回答：

- 是配置問題，還是代碼問題？
- 是否只影響新 tenant / verify tenant？
- 是否已對 production tenant 造成不可接受影響？

### 6.1 優先修配置的情況

- secret 名稱錯
- tenant seed / provider / policy 錯
- Access / token / env 配置錯

### 6.2 優先回滾代碼的情況

- 新版本 Worker 無法正常處理既有 run 查詢
- 核心 northbound API 大面積失敗
- MCP / A2A 入口出現明顯行為退化

## 7. 發版結束後要留下什麼

至少留下：

- [ ] 發版時間
- [ ] 發版人
- [ ] 目標環境
- [ ] 驗收命令
- [ ] 驗收結果
- [ ] 如有 onboarding / handoff，保存 bundle 路徑與 verify summary 路徑
- [ ] 如有失敗，記錄失敗端點與處理方式

這份資訊後續會直接影響：

- 值班排障速度
- tenant 接入信心
- 下一次變更窗口的風險評估
