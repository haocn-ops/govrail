# Govrail Docs Index

這個目錄存放 Govrail MVP 的交付文檔、運維手冊與配置範例。

如果你是第一次接手這個倉庫，建議閱讀順序如下。

## 1. 先看哪份

### 想快速了解這個專案現在做到哪裡

- [../README.md](/Users/zh/Documents/codeX/agent_control_plane/README.md)
- [../agent_control_plane_dev_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/agent_control_plane_dev_spec_zh.md)
- [saas_plan_zh.md](./saas_plan_zh.md)
- [saas_v1_execution_plan_zh.md](./saas_v1_execution_plan_zh.md)
- [saas_phase1_data_model_zh.md](./saas_phase1_data_model_zh.md)
- [saas_week8_verification_checklist_zh.md](./saas_week8_verification_checklist_zh.md)（新增 delivery tracking panel、attention queue、返回 admin queue、organization drill-down、Week 8 readiness summary 以及 readiness drill-down 使用說明）
  - 最新檢查項已同步 SaaS trusted session boundary：metadata-backed session 只接受 `x-authenticated-subject` / `cf-access-authenticated-user-email`，不再把 `x-subject-id` 視為可信身份來源。
  - 最新檢查項也同步了 onboarding persisted summary 與 period-aware plan-limit evidence，方便驗收 bootstrap summary 回顯與 subscription billing window 對齊。
  - 最新檢查項也把 `accept-invitation` 的 guardrail 驗收點補進來：trusted session、seat-limit、revoked/expired token、disabled workspace / organization 都要有明確且誠實的頁面文案。
  - 最新檢查項也把 `/session`、`members`、`launchpad` 與 `usage/settings` 的 continuity 補進來：session 現在是顯式 trusted-session checkpoint，members 會誠實提示 pending invitation 先占 `member_seats` reservation，settings 則明確標成 self-serve billing follow-up lane。
  - `/admin` 的 recent delivery activity 卡片現在也可以直接把 `attention_workspace`、`surface`（以及選擇性的 `attention_organization`）帶回治理 jump，這仍然是 navigation-only 的 follow-up contract，沒有 impersonation 或支援自動化的承諾。
  - `/admin` 的 action/attention queue 預設只顯示目前 focus 下的前幾筆 workspace，並提供 `Show more` 以在相同 snapshot 內展開更多項目，同樣只做導航、沒有 impersonation 或自動化支援。上方新增的 focus-state control bar 會把 surface、organization、workspace 與 returned follow-up 狀態用 chip 呈現，chip 上會顯示 filter 標籤、當前值，以及一個 per-chip 的「Clear」連結（存在時），同時當任一 focus 有值時也會顯示「Clear all focus」的 action，讓平台維運可以透過清除單一層級或回到更大治理視角的方式重置 focus，所有操作仍然只是導航提示，沒有實際 impersonation 或 automation 的行為。
  - `/admin` 的 Week 8 readiness summary 卡片不但展示 onboarding baseline / credentials / demo run / billing warning / mock go-live-ready 五個 counts，還可以讓 operators 點擊該指標，把 Week 8 readiness follow-up 列表過濾到對應 workspace，並跳轉到 onboarding、settings、verification 或 go-live surface 繼續觀察。所有的 drill-down 均是 navigation-only 的 governance cues，沒有 impersonation 或 support automation。
  - `/admin` 的 Week 8 readiness follow-up flows carry `source=admin-readiness`, `week8_focus`, and the organization/workspace context so the onboarding, settings, verification, or go-live pages can remind operators where they came from, surface a “Return to admin readiness view” link, and keep the same governance focus when returning to `/admin`. This keeps the whole loop shareable while remaining purely navigation context.
  - 當前驗收邊界仍以 `unit + contract + page + non-browser smoke` 為主，但已新增 23 條最小 true browser smoke，可透過 `npm run web:test:browser:smoke` 執行：
    - 主線：`launchpad -> session -> onboarding -> usage -> settings -> verification -> go-live -> admin`，會在 `/admin` 顯示 `Returned from Week 8 readiness` / `Focus restored` 的 return-state banner。
    - admin-attention 分支：`admin -> verification -> admin` 會驗證 `Open verification checklist`、workspace surface 上的 `Return to admin queue`，以及 `/admin` 的 `Admin queue focus restored` queue-return banner；`admin -> verification -> go-live -> admin` 則在此基礎上再補 `Continue to go-live drill` 與 go-live surface 上的相同 queue-return continuity。
    - admin recent-delivery 分支：`admin recent delivery activity -> verification -> admin` 與 `admin recent delivery activity -> verification -> go-live -> admin`，前者會顯式保留 `delivery_context=recent_activity` 並驗證 workspace surface 上的 recent-activity context copy 與返回 `/admin` 後的 queue-return continuity；後者則在此基礎上再補 `Continue to go-live drill` 與 go-live surface 上的相同 recent-context continuity。
    - admin organization-focus 分支：`admin organization focus -> verification -> admin`，會顯式保留 `attention_organization`，並驗證 Governance focus 的 Organization chip、`Focused organization` cue、queue-return banner，以及 `Clear all focus` 回到 broader admin 視角的連續性。
    - admin focus-chip 分支：`admin organization + workspace + return focus -> per-chip clear`，會驗證 `Workspace`、`Follow-up return`、`Organization` 三個 chip 的 `Clear` 會逐層放寬治理視角，而不會一次把較高層 focus 一起丟掉。
    - admin readiness 分支：`admin readiness baseline -> onboarding -> admin`，會驗證 `week8_focus=baseline` 的 Governance focus 與 `Drill-down active: Baseline gaps`、`Open onboarding flow`、`Finish onboarding`、workspace surface 上的 `Return to admin readiness view`，以及返回 `/admin` 後的 `Returned from Week 8 readiness` / `Clear readiness focus`。
    - admin readiness onboarding follow-up 分支：`baseline -> onboarding -> verification -> admin` 與 `baseline -> onboarding -> go-live -> admin`，會驗證 onboarding 內的 `Step 6: Capture verification evidence` / `Step 7: Rehearse go-live` CTA 仍保留 `source=admin-readiness`、`week8_focus=baseline` 與 readiness return continuity。
    - admin readiness credentials onboarding 分支：`credentials -> onboarding -> verification -> admin` 與 `credentials -> onboarding -> go-live -> admin`，會驗證 `week8_focus=credentials` 的 summary drill-down 進入 onboarding 後，仍可沿著 `Step 6: Capture verification evidence` / `Step 7: Rehearse go-live` 保留 admin-readiness continuity。
    - admin readiness chip-toggle 分支：`admin readiness baseline -> clear readiness focus -> credentials toggle -> clear`，只在 `/admin` 內驗證 `week8_focus` 的 clear/toggle continuity，並確認 `attention_organization` / `attention_workspace` 這類較高層 governance focus 不會在切換 readiness drill-down 時被一起清掉。
    - admin readiness action-variant 分支：`billing_warning -> settings -> admin` 與 `demo_run -> verification -> admin`，會驗證 summary card 的 primary action 能保留 `week8_focus`、workspace/organization context 與 `Return to admin readiness view`，並在返回 `/admin` 後恢復 readiness banner。
    - admin readiness go-live 分支：`go_live_ready -> go-live -> admin` 與 `demo_run -> verification -> go-live -> admin`，會驗證 readiness 線從 summary/verification 進入 `go-live` 仍保留 `source=admin-readiness`、`week8_focus` 與 return banner continuity。
    - admin readiness demo-run go-live follow-up 分支：`demo_run -> verification -> go-live -> settings -> admin` 與 `demo_run -> verification -> go-live -> verification -> admin`，會驗證 go-live 內的 `Review billing + settings` / `Reopen verification evidence` CTA 仍保留 `source=admin-readiness`、`week8_focus=demo_run` 與 readiness return continuity。
    - admin readiness go-live follow-up 分支：`go_live_ready -> go-live -> verification -> admin` 與 `go_live_ready -> go-live -> settings -> admin`，會驗證 go-live 內的 `Reopen verification evidence` / `Review billing + settings` CTA 仍保留 admin-readiness continuity。
    - admin readiness settings follow-up 分支：`billing_warning -> settings -> verification -> admin` 與 `billing_warning -> settings -> go-live -> admin`，會驗證 settings 內的 `Capture verification evidence` / `Rehearse go-live readiness` CTA 仍保留 admin-readiness continuity。
  - 這一輪也順手修正了 checklist handoff helper 在 server/client 邊界上的引用方式；完整 browser e2e 仍後置，不應把目前覆蓋寫成真實跨頁點擊與渲染時序已 fully covered。現況是 23 條最小真實 browser smoke 已覆蓋主線、attention、recent-activity、organization-focus、focus-chip，以及 onboarding/settings/go-live 內的多條 readiness action variants，但仍不是 verification/go-live/admin 的 full browser e2e。

### 想對接 API 或補後端行為

- [api_contract_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/api_contract_spec_zh.md)
- [data_model_state_machine_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/data_model_state_machine_spec_zh.md)
- [policy_approval_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/policy_approval_spec_zh.md)

### 想部署、驗收或排障

- [deployment_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/deployment_runbook_zh.md)
- [github_actions_runtime_inventory_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/github_actions_runtime_inventory_zh.md)
- [environment_config_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/environment_config_runbook_zh.md)
- 其 billing portal 區段說明 customer portal 返回邏輯：API `return_url` > `STRIPE_CUSTOMER_PORTAL_RETURN_URL` > `BILLING_RETURN_BASE_URL`，這個返回路徑只在 portal 完成後觸發，與 webhook 或 checkout success 無關。
- [access_ingress_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/access_ingress_runbook_zh.md)
- [access_ingress_plan.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/access_ingress_plan.example.json)
- [observability_alerting_baseline_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/observability_alerting_baseline_zh.md)
- [monitoring_dashboard_template.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/monitoring_dashboard_template.example.json)
- [observability_integration_manifest.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/observability_integration_manifest.example.json)
- [incident_response_checklist_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/incident_response_checklist_zh.md)
- [secret_rotation_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_runbook_zh.md)
- [ops_handoff_summary_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/ops_handoff_summary_zh.md)
- [enterprise_surface_runbook_zh.md](./enterprise_surface_runbook_zh.md)
- [saas_mock_go_live_drill_zh.md](./saas_mock_go_live_drill_zh.md)
- [tests_observability_wave1_wave2_min_plan_zh.md](./tests_observability_wave1_wave2_min_plan_zh.md)
- [final_delivery_summary_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/final_delivery_summary_zh.md)
- [flow_failure_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/flow_failure_runbook_zh.md)
- [saas_week8_verification_checklist_zh.md](./saas_week8_verification_checklist_zh.md)
- 如果是要交接給下一位工程師，優先把 `post-deploy:verify` 當成驗收出口來看
- 如果是新 tenant 接入，優先把 onboarding bundle 內的 `provision.sh`、`apply-request.sh`、`verify.sh` 和 `complete-handoff.sh` 當成最小接入與驗收出口來看
- 如果是新 tenant 接入，先用 onboarding bundle 內的 `status.sh` 快速看摘要，再用 `submit-request.sh`、`apply-request.sh`、`verify.sh` 完成接入與驗收

## 2. 各文件用途

| 文件 | 用途 |
|---|---|
| [api_contract_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/api_contract_spec_zh.md) | API 端點、錯誤碼、冪等、A2A、MCP 契約 |
| [data_model_state_machine_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/data_model_state_machine_spec_zh.md) | D1 表結構、狀態機、artifact / audit / queue 模型 |
| [policy_approval_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/policy_approval_spec_zh.md) | policy 匹配、approval 規則與治理約束 |
| [flow_failure_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/flow_failure_runbook_zh.md) | 執行路徑、失敗語義、證據來源與排障方向 |
| [deployment_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/deployment_runbook_zh.md) | 部署步驟、驗收流程、D1 SQL 查詢、常見故障 |
| [github_actions_runtime_inventory_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/github_actions_runtime_inventory_zh.md) | GitHub Actions 所需 repo variables / secrets / inputs 對照清單 |
| [release_checklist_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/release_checklist_zh.md) | staging / production 發版前後的可勾選清單 |
| [environment_config_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/environment_config_runbook_zh.md) | staging / production 配置、secrets、graph / replay / SSE 驗證節奏 |
| [access_ingress_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/access_ingress_runbook_zh.md) | Access / service token / trusted-edge 部署方式與入口治理檢查點 |
| [access_ingress_plan.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/access_ingress_plan.example.json) | Access / service token 部署計劃模板，供生成 checklist 與驗證命令 |
| [access:ingress:plan](/Users/zh/Documents/codeX/agent_control_plane/scripts/render_access_ingress_plan.mjs) | 根據 ingress plan 模板生成 access-ingress-plan 與 checklist |
| [observability_alerting_baseline_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/observability_alerting_baseline_zh.md) | 可觀測性、SLI、告警門檻與 oncall 排障順序 |
| [monitoring_dashboard_template.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/monitoring_dashboard_template.example.json) | 可直接對接監控系統的 dashboard 模板 |
| [observability_integration_manifest.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/observability_integration_manifest.example.json) | synthetic checks、alert routes、evidence contract 的跨平台接入契約 |
| [incident_response_checklist_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/incident_response_checklist_zh.md) | oncall 事故處置與升級清單 |
| [secret_rotation_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_runbook_zh.md) | `auth_ref` 對應 Worker secret 的輪替、回滾與交接流程 |
| [secret:rotation:bundle](/Users/zh/Documents/codeX/agent_control_plane/scripts/render_secret_rotation_bundle.mjs) | 根據 rotation plan 生成 rotation-plan、checklist 與 rotate.sh |
| [ops_handoff_summary_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/ops_handoff_summary_zh.md) | 目前已落地環境、verify 證據與接手入口摘要 |
| [final_delivery_summary_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/final_delivery_summary_zh.md) | 本輪交付的完成項、部署結果、驗收證據與下一步建議 |
| [enterprise_surface_runbook_zh.md](./enterprise_surface_runbook_zh.md) | enterprise 能力（audit export / SSO / dedicated environment）啟用前提、入口、失敗回退與驗收手冊 |
| [tests_observability_wave1_wave2_min_plan_zh.md](./tests_observability_wave1_wave2_min_plan_zh.md) | Wave 1/2 hardening 最小測試集（單元 / 契約 / 頁面級）與優先級落地計劃 |
| [saas_plan_zh.md](./saas_plan_zh.md) | SaaS 化產品定位、資料模型、技術演進與 8 週里程碑 |
| [saas_v1_execution_plan_zh.md](./saas_v1_execution_plan_zh.md) | SaaS v1 的 4 週執行計劃、並行開發工作流、檔案 ownership 與驗收標準 |
| [saas_phase1_data_model_zh.md](./saas_phase1_data_model_zh.md) | SaaS 第一階段資料模型、workspace 與 tenant 映射，以及 migration 0004 說明 |
| [tenant_onboarding_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/tenant_onboarding_runbook_zh.md) | 新 tenant 接入步驟、tenant onboarding bundle 生成、驗收出口、回滾與交接資訊 |
| [tenant_provisioning_request.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/tenant_provisioning_request.example.json) | 外部 provisioning / ticket / CMDB 可直接對接的 request manifest 範例 |
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
- 已有 baseline tenant onboarding bundle 與 apply/submit/handoff helper，但 Access / service token、最終 provisioning、secret 輪替與告警體系仍待補強
- staging 建議使用寫入式驗收
- production 建議優先使用唯讀驗收
- 交接時至少要留下 `base_url`、`tenant_id`、`trace_id`、`run_id`、`tool_provider_id`、`policy_id`
