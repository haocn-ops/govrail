# Agent Control Plane Docs Index

這個目錄存放 Agent Control Plane MVP 的交付文檔、運維手冊與配置範例。

如果你是第一次接手這個倉庫，建議閱讀順序如下。

## 1. 先看哪份

### 想快速了解這個專案現在做到哪裡

- [../README.md](/Users/zh/Documents/codeX/agent_control_plane/README.md)
- [../agent_control_plane_dev_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/agent_control_plane_dev_spec_zh.md)

### 想對接 API 或補後端行為

- [api_contract_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/api_contract_spec_zh.md)
- [data_model_state_machine_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/data_model_state_machine_spec_zh.md)
- [policy_approval_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/policy_approval_spec_zh.md)

### 想部署、驗收或排障

- [deployment_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/deployment_runbook_zh.md)
- [environment_config_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/environment_config_runbook_zh.md)
- [access_ingress_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/access_ingress_runbook_zh.md)
- [observability_alerting_baseline_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/observability_alerting_baseline_zh.md)
- [secret_rotation_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_runbook_zh.md)
- [ops_handoff_summary_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/ops_handoff_summary_zh.md)
- [final_delivery_summary_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/final_delivery_summary_zh.md)
- [flow_failure_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/flow_failure_runbook_zh.md)
- 如果是要交接給下一位工程師，優先把 `post-deploy:verify` 當成驗收出口來看
- 如果是新 tenant 接入，優先把 onboarding bundle 內的 `provision.sh` 和 `verify.sh` 當成最小接入與驗收出口來看

## 2. 各文件用途

| 文件 | 用途 |
|---|---|
| [api_contract_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/api_contract_spec_zh.md) | API 端點、錯誤碼、冪等、A2A、MCP 契約 |
| [data_model_state_machine_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/data_model_state_machine_spec_zh.md) | D1 表結構、狀態機、artifact / audit / queue 模型 |
| [policy_approval_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/policy_approval_spec_zh.md) | policy 匹配、approval 規則與治理約束 |
| [flow_failure_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/flow_failure_runbook_zh.md) | 執行路徑、失敗語義、證據來源與排障方向 |
| [deployment_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/deployment_runbook_zh.md) | 部署步驟、驗收流程、D1 SQL 查詢、常見故障 |
| [release_checklist_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/release_checklist_zh.md) | staging / production 發版前後的可勾選清單 |
| [environment_config_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/environment_config_runbook_zh.md) | staging / production 配置、secrets、graph / replay / SSE 驗證節奏 |
| [access_ingress_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/access_ingress_runbook_zh.md) | Access / service token / trusted-edge 部署方式與入口治理檢查點 |
| [observability_alerting_baseline_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/observability_alerting_baseline_zh.md) | 可觀測性、SLI、告警門檻與 oncall 排障順序 |
| [secret_rotation_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_runbook_zh.md) | `auth_ref` 對應 Worker secret 的輪替、回滾與交接流程 |
| [ops_handoff_summary_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/ops_handoff_summary_zh.md) | 目前已落地環境、verify 證據與接手入口摘要 |
| [final_delivery_summary_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/final_delivery_summary_zh.md) | 本輪交付的完成項、部署結果、驗收證據與下一步建議 |
| [tenant_onboarding_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/tenant_onboarding_runbook_zh.md) | 新 tenant 接入步驟、tenant onboarding bundle 生成、驗收出口、回滾與交接資訊 |
| [implementation_status_matrix_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/implementation_status_matrix_zh.md) | 一頁查看已實作 / 佔位 / 保留欄位 / 驗證方式 |
| [wrangler.multi-env.example.jsonc](/Users/zh/Documents/codeX/agent_control_plane/docs/wrangler.multi-env.example.jsonc) | Wrangler 多環境配置範例 |
| [secrets.bulk.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/secrets.bulk.example.json) | `wrangler secret bulk` 匯入範例 |
| [secret_rotation_plan.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_plan.example.json) | secret rotation 計劃模板，包含舊新 binding、驗證命令與 rollback 提示 |

## 3. 建議操作順序

### 本地改完代碼後

- `npm run verify:local`
- `npm run verify:build`

### staging 部署後

- `BASE_URL="https://<worker>" TENANT_ID="tenant_verify" npm run post-deploy:verify`
- 會驗證 health、agent card、graph、replay metadata、A2A SSE snapshot 與 MCP SSE ready stream
- 另外會建立一筆暫時的 provider / policy，最後確認兩者已停用並可在 `status=disabled` 清單中查到

### production 部署後

- `BASE_URL="https://<worker>" TENANT_ID="tenant_prod" RUN_ID="<existing_run_id>" npm run post-deploy:verify:readonly`
- 會驗證既有 run、graph、artifact 與可用的 SSE ready stream
- 這是較適合 handoff 的 production gate，因為它不會建立新的 run、provider 或 policy

## 4. 目前最值得注意的限制

- 目前仍是 MVP，還不是完整 production 服務
- 已有 baseline tenant onboarding bundle，但 Access / service token、最終 provisioning、secret 輪替與告警體系仍待補強
- staging 建議使用寫入式驗收
- production 建議優先使用唯讀驗收
- 交接時至少要留下 `base_url`、`tenant_id`、`trace_id`、`run_id`、`tool_provider_id`、`policy_id`
