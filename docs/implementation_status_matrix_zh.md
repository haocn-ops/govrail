# Govrail 實作狀態矩陣（MVP）

交付對象：接手工程師 / Tech Lead / SRE / 驗收人員  
版本：v0.1  
日期：2026-04-01

## 1. 文檔目的

這份矩陣不是新的設計規格，而是把「目前倉庫真實做到哪裡」集中列出來，避免閱讀者需要在多份文檔與程式碼之間反覆比對。

重點回答三個問題：

- 哪些端點已經可用？
- 哪些能力目前只是佔位或保留欄位？
- 每一塊目前主要靠哪些檔案與哪些驗證手段保證？

## 2. Northbound API 狀態

| 能力 | 路由 | 目前狀態 | 主要檔案 | 驗證方式 | 備註 |
|---|---|---|---|---|---|
| 健康檢查 | `GET/HEAD /api/v1/health` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke`, `post-deploy:verify` | 不要求 tenant / auth |
| 建立 run | `POST /api/v1/runs` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts), [src/lib/runs.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/runs.ts), [src/lib/rate-limit.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/rate-limit.ts), [src/durable/rate-limiter.ts](/Users/zh/Documents/codeX/agent_control_plane/src/durable/rate-limiter.ts) | `smoke`, `post-deploy:verify` | 支援 idempotency；可選啟用 tenant-scoped `RATE_LIMIT_RUNS_PER_MINUTE` 固定窗限流 |
| 查詢 run | `GET /api/v1/runs/{run_id}` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke`, `post-deploy:verify:readonly` | 含 `workflow_status`、`coordinator_state` |
| run graph | `GET /api/v1/runs/{run_id}/graph` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts), [src/lib/db.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/db.ts) | `smoke`, `post-deploy:verify` | 支援 `include_payloads`、`page_size`、`cursor`；`steps` / `approvals` / `artifacts` 同步分頁 |
| run events | `GET /api/v1/runs/{run_id}/events` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts), [src/lib/audit.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/audit.ts) | `smoke`, `post-deploy:verify` | 支援 `page_size`、`cursor` 分頁 |
| run artifacts list | `GET /api/v1/runs/{run_id}/artifacts` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts), [src/lib/db.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/db.ts) | `smoke`, `post-deploy:verify` | 支援 `page_size`、`cursor` 分頁 |
| run artifact detail | `GET /api/v1/runs/{run_id}/artifacts/{artifact_id}` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke`, `post-deploy:verify` | `include_body=true` 可讀正文 |
| approval decision | `POST /api/v1/approvals/{approval_id}/decision` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts), [src/durable/approval-session.ts](/Users/zh/Documents/codeX/agent_control_plane/src/durable/approval-session.ts) | `smoke` | 支援 idempotency 與重複決策保護 |
| replay run | `POST /api/v1/runs/{run_id}/replay` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts), [src/workflows/run-workflow.ts](/Users/zh/Documents/codeX/agent_control_plane/src/workflows/run-workflow.ts), [src/lib/rate-limit.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/rate-limit.ts), [src/durable/rate-limiter.ts](/Users/zh/Documents/codeX/agent_control_plane/src/durable/rate-limiter.ts) | `smoke`, `post-deploy:verify` | `from_step` 會先嘗試以來源 step 做 rewind；若是 `mcp_call` / `a2a_message` 等非 workflow-native step，會按時間順序回退到同 run 內最近的 workflow-native anchor，仍找不到才回 `409 invalid_state_transition`；可選啟用 tenant-scoped `RATE_LIMIT_REPLAYS_PER_MINUTE` 固定窗限流 |
| cancel run | `POST /api/v1/runs/{run_id}:cancel` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts), [src/lib/cancellation.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/cancellation.ts) | `smoke` | 會同步取消 pending approval |

## 3. Admin API 狀態

| 能力 | 路由 | 目前狀態 | 主要檔案 | 驗證方式 | 備註 |
|---|---|---|---|---|---|
| list policies | `GET /api/v1/policies` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts), [src/lib/db.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/db.ts) | `smoke`, `post-deploy:verify` | 支援 `status` 過濾 |
| get policy | `GET /api/v1/policies/{policy_id}` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke`, `post-deploy:verify` | - |
| create policy | `POST /api/v1/policies` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke`, `post-deploy:verify` | 支援 idempotency |
| update policy | `POST /api/v1/policies/{policy_id}` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke`, `post-deploy:verify` | 至少需一個欄位 |
| disable policy | `POST /api/v1/policies/{policy_id}:disable` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke`, `post-deploy:verify` | 重複停用仍回 `200` |
| list tool providers | `GET /api/v1/tool-providers` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts), [src/lib/db.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/db.ts) | `smoke`, `post-deploy:verify` | 支援 `status` 過濾 |
| get tool provider | `GET /api/v1/tool-providers/{id}` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke`, `post-deploy:verify` | - |
| create tool provider | `POST /api/v1/tool-providers` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke`, `post-deploy:verify` | 支援 `auth_ref` |
| update tool provider | `POST /api/v1/tool-providers/{id}` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke`, `post-deploy:verify` | 支援 `auth_ref` 更新 |
| disable tool provider | `POST /api/v1/tool-providers/{id}:disable` | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke`, `post-deploy:verify` | 停用後 MCP 入口回 `422` |

## 4. A2A Gateway 狀態

| 能力 | 路由 | 目前狀態 | 主要檔案 | 驗證方式 | 備註 |
|---|---|---|---|---|---|
| agent card | `GET /.well-known/agent-card.json` | 已實作 | [src/a2a/agent-card.ts](/Users/zh/Documents/codeX/agent_control_plane/src/a2a/agent-card.ts) | `smoke`, `post-deploy:verify` | `streaming=true` |
| inbound send | `POST /api/v1/a2a/message:send` | 已實作 | [src/a2a/inbound.ts](/Users/zh/Documents/codeX/agent_control_plane/src/a2a/inbound.ts) | `smoke` | 支援 idempotency |
| task get | `GET /api/v1/a2a/tasks/{id}` | 已實作 | [src/a2a/inbound.ts](/Users/zh/Documents/codeX/agent_control_plane/src/a2a/inbound.ts) | `smoke` | 會折算 run 終態 |
| task cancel | `POST /api/v1/a2a/tasks/{id}:cancel` | 已實作 | [src/a2a/inbound.ts](/Users/zh/Documents/codeX/agent_control_plane/src/a2a/inbound.ts) | `smoke` | 已終態 task 會回 `409` |
| webhook push | `POST /api/v1/a2a/webhooks/push` | 已實作 | [src/a2a/inbound.ts](/Users/zh/Documents/codeX/agent_control_plane/src/a2a/inbound.ts) | `smoke` | 支援 `task_id` 或 `remote_task_id` |
| message stream | `GET /api/v1/a2a/message:stream` | 已實作 | [src/a2a/inbound.ts](/Users/zh/Documents/codeX/agent_control_plane/src/a2a/inbound.ts), [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke` | 回 `200 text/event-stream`，先送 `ready` 再送 `snapshot` |
| outbound dispatch | run workflow 內部能力 | 已實作 | [src/a2a/outbound.ts](/Users/zh/Documents/codeX/agent_control_plane/src/a2a/outbound.ts), [src/workflows/run-workflow.ts](/Users/zh/Documents/codeX/agent_control_plane/src/workflows/run-workflow.ts), [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke` | HTTP(S) 目標會先由 `context.a2a_dispatch.tool_provider_id` 解析 tenant-scoped `http_api` provider，要求真實遠端 endpoint 為 `https://`，再讀不跟隨 redirect 的同 origin Agent Card `message_send` 做 soft cache；若 card 成功取回但 `message_send` 無效，dispatch 會 fail closed；workflow 已套用 provider-scoped `a2a_dispatch` policy/approval enforcement，並支援 `conditions_json.labels` / `conditions_json.risk_level`；命中 `approval_required` 會先建立 approval、命中 `deny` 會直接阻斷；`mock://` / `demo://` 仍可直接放在 context |

## 5. MCP Proxy 狀態

| 能力 | 路由 | 目前狀態 | 主要檔案 | 驗證方式 | 備註 |
|---|---|---|---|---|---|
| MCP initialize | `POST /api/v1/mcp/{toolProviderId}` | 已實作 | [src/mcp/proxy.ts](/Users/zh/Documents/codeX/agent_control_plane/src/mcp/proxy.ts) | 間接由 `smoke` 覆蓋主流程 | 回傳最小 server info |
| tools/list | `POST /api/v1/mcp/{toolProviderId}` | 已實作 | [src/mcp/proxy.ts](/Users/zh/Documents/codeX/agent_control_plane/src/mcp/proxy.ts) | `smoke` | 套用 policy 與 metadata |
| tools/call | `POST /api/v1/mcp/{toolProviderId}` | 已實作 | [src/mcp/proxy.ts](/Users/zh/Documents/codeX/agent_control_plane/src/mcp/proxy.ts) | `smoke` | 含 approval / deny / allow 分支 |
| MCP GET | `GET /api/v1/mcp/{toolProviderId}` | 已實作 | [src/mcp/proxy.ts](/Users/zh/Documents/codeX/agent_control_plane/src/mcp/proxy.ts) | `smoke` | 回 `200 text/event-stream`，送 `ready` 與 keepalive；停用 provider 仍回 `422` |
| provider auth_ref | 上游轉發 | 已實作 | [src/lib/auth.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/auth.ts), [src/mcp/proxy.ts](/Users/zh/Documents/codeX/agent_control_plane/src/mcp/proxy.ts) | `smoke` | 支援 bearer / custom header |

## 6. Workflow / State 狀態

| 能力 | 目前狀態 | 主要檔案 | 驗證方式 | 備註 |
|---|---|---|---|---|
| run orchestration | 已實作 | [src/workflows/run-workflow.ts](/Users/zh/Documents/codeX/agent_control_plane/src/workflows/run-workflow.ts) | `smoke` | planner -> approval -> A2A -> artifact |
| run coordinator DO | 已實作 | [src/durable/run-coordinator.ts](/Users/zh/Documents/codeX/agent_control_plane/src/durable/run-coordinator.ts) | `smoke` | `GET /runs/{id}` 會回 `coordinator_state` |
| approval session DO | 已實作 | [src/durable/approval-session.ts](/Users/zh/Documents/codeX/agent_control_plane/src/durable/approval-session.ts) | `smoke` | approval 決策與 timeout 協調；workflow 等待上限已對齊命中 policy 的 `approval_config.timeout_seconds` |
| rate limiter DO | 已實作 | [src/durable/rate-limiter.ts](/Users/zh/Documents/codeX/agent_control_plane/src/durable/rate-limiter.ts), [src/lib/rate-limit.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/rate-limit.ts) | `smoke` | tenant-scoped 固定 60 秒時間窗；目前只保護 run create / replay，且 idempotent retry 不應重扣額度 |
| replay from_step rewind | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts), [src/workflows/run-workflow.ts](/Users/zh/Documents/codeX/agent_control_plane/src/workflows/run-workflow.ts) | `smoke`, `post-deploy:verify` | `from_step` 支援 workflow-native anchor rewind；非 workflow-native step 會先按時間順序回退到同 run 內最近的前一個 anchor，找不到才報錯 |

## 7. Audit / Storage 狀態

| 能力 | 目前狀態 | 主要檔案 | 驗證方式 | 備註 |
|---|---|---|---|---|
| audit event 寫入 D1 | 已實作 | [src/lib/audit.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/audit.ts) | `smoke` | - |
| queue fanout | 已實作 | [src/lib/audit.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/audit.ts), [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke` | at-least-once + dedupe |
| queue dedupe | 已實作 | [src/lib/queue.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/queue.ts) | `smoke` | D1 `queue_dedupe_records` |
| approval payload 摘要寫入 R2 | 已實作 | [src/workflows/run-workflow.ts](/Users/zh/Documents/codeX/agent_control_plane/src/workflows/run-workflow.ts), [src/mcp/proxy.ts](/Users/zh/Documents/codeX/agent_control_plane/src/mcp/proxy.ts) | `smoke` | 命中 `approval_required` 時會把 workflow / A2A / MCP approval 的 `summary`、`subject_snapshot`、`trace` 寫入 R2 audit 物件，D1 approval 仍只保留最小索引欄位 |
| artifact 寫入 R2 + D1 | 已實作 | [src/workflows/run-workflow.ts](/Users/zh/Documents/codeX/agent_control_plane/src/workflows/run-workflow.ts) | `smoke`, `post-deploy:verify` | 支援 run summary 與 remote artifact |
| replay source input 讀取 | 已實作 | [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke` | 從 `input.json` 回放 |

## 8. 驗證矩陣

| 驗證入口 | 作用 | 適用場景 |
|---|---|---|
| `npm run check` | 型別與編譯基線 | 每次改碼後 |
| `npm run smoke` | 本地 mock E2E | 功能回歸 |
| `npm run verify:local` | `check + smoke` 聚合入口 | 本地開發完成後 |
| `npm run verify:build` | Worker 打包 dry-run | 部署前 |
| `npm run post-deploy:verify` | staging / 寫入式遠端驗收 | staging 或 verify tenant |
| `npm run post-deploy:verify:readonly` | production / 唯讀驗收 | production 或共享 tenant |

## 9. 入口治理與環境落地狀態

| 能力 | 目前狀態 | 主要檔案 | 驗證方式 | 備註 |
|---|---|---|---|---|
| `trusted_edge` northbound auth mode | 已實作 | [src/lib/http.ts](/Users/zh/Documents/codeX/agent_control_plane/src/lib/http.ts), [src/app.ts](/Users/zh/Documents/codeX/agent_control_plane/src/app.ts) | `smoke`, `post-deploy:verify` | `NORTHBOUND_AUTH_MODE=trusted_edge` 時僅接受 `CF-Access-*` / `X-Authenticated-*` 身份 |
| staging Wrangler env 與資源綁定 | 已實作 | [wrangler.jsonc](/Users/zh/Documents/codeX/agent_control_plane/wrangler.jsonc), [docs/wrangler.multi-env.example.jsonc](/Users/zh/Documents/codeX/agent_control_plane/docs/wrangler.multi-env.example.jsonc) | 實際 deploy + `post-deploy:verify` | 已建立 staging D1 / R2 / Queue 並完成遠端驗收 |
| production Wrangler env 與資源綁定 | 已實作 | [wrangler.jsonc](/Users/zh/Documents/codeX/agent_control_plane/wrangler.jsonc) | 實際 deploy + `post-deploy:verify`, `post-deploy:verify:readonly` | 已建立 production D1 / R2 / Queue 並完成 write / readonly 驗收 |
| Access / service-token ingress runbook | 已實作 | [docs/access_ingress_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/access_ingress_runbook_zh.md) | 文檔交接 | 已收斂 trusted headers、role 映射、verify 檢查點 |
| Access ingress plan renderer | 已實作 | [scripts/render_access_ingress_plan.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/render_access_ingress_plan.mjs), [docs/access_ingress_plan.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/access_ingress_plan.example.json) | `npm run access:ingress:plan` | 可產出 `access-ingress-plan.json` 與 `access-ingress-checklist.md` |
| GitHub Actions runtime bootstrap | 已實作 | [scripts/bootstrap_github_actions_runtime.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/bootstrap_github_actions_runtime.mjs), [docs/deployment_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/deployment_runbook_zh.md) | `npm run github:actions:bootstrap -- --dry-run` | 可對齊 repository variables 與 `CLOUDFLARE_API_TOKEN` secret；真正執行仍需本機提供有效 Cloudflare API token |
| GitHub Actions runtime inventory | 已實作 | [scripts/print_github_actions_runtime_inventory.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/print_github_actions_runtime_inventory.mjs), [docs/github_actions_runtime_inventory_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/github_actions_runtime_inventory_zh.md) | `npm run github:actions:inventory -- --format markdown` | 可列出各 workflow 需要的 repo variables / secrets / workflow inputs，降低 handoff 與 dispatch 誤填 |
| observability integration manifest | 已實作 | [docs/observability_integration_manifest.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/observability_integration_manifest.example.json) | `jq '.'` | 定義 synthetic checks、alert rules、alert routes 與 evidence contract |
| staging deploy workflow | 已實作 | [.github/workflows/deploy-staging.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/deploy-staging.yml) | YAML parse、runbook/checklist 對齊 | workflow 已落地；仍需 GitHub secrets 與實際 dispatch |
| production readonly verify workflow | 已實作 | [.github/workflows/production-readonly-verify.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/production-readonly-verify.yml) | YAML parse、runbook/checklist 對齊 | 不 deploy，只包裝 readonly 驗收與 artifact manifest |
| production deploy workflow | 已實作 | [.github/workflows/deploy-production.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/deploy-production.yml) | YAML parse、runbook/checklist 對齊 | 支援 preflight、可選 migration、deploy、readonly verify；仍依賴 GitHub `production` environment 保護 |
| synthetic runtime checks workflow | 已實作 | [.github/workflows/synthetic-runtime-checks.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/synthetic-runtime-checks.yml) | YAML parse、artifact 驗證 | 支援定時 health probe 與 production readonly verify |
| GitHub staging / production environments | 已落地 | GitHub repo environments | `gh api repos/.../environments` | `production` 已設 required reviewer；`staging` 已建立 |
| GitHub repository runtime variables | 已落地 | GitHub repo variables | `gh api repos/.../actions/variables` | 已設 `CLOUDFLARE_ACCOUNT_ID`、`ACP_STAGING_BASE_URL`、`ACP_PRODUCTION_*` |
| secret rotation bundle renderer | 已實作 | [scripts/render_secret_rotation_bundle.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/render_secret_rotation_bundle.mjs), [docs/secret_rotation_plan.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_plan.example.json) | `npm run secret:rotation:bundle` | 可產出 `rotation-plan.json`、`rotation-checklist.md`、`rotate.sh` |
| onboarding bundle `status.sh` helper | 已實作 | [scripts/render_tenant_onboarding_bundle.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/render_tenant_onboarding_bundle.mjs), [docs/tenant_onboarding_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/tenant_onboarding_runbook_zh.md) | bundle 生成、shell syntax check | 先看摘要再進 `provision.sh` / `verify.sh` |
| tenant provisioning request artifact | 已實作 | [scripts/render_tenant_onboarding_bundle.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/render_tenant_onboarding_bundle.mjs), [docs/tenant_provisioning_request.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/tenant_provisioning_request.example.json) | bundle 生成、JSON schema 對照 | 可產出 `provisioning-request.json` 供外部工單 / CMDB / provisioning 流程使用 |
| onboarding apply helper | 已實作 | [scripts/apply_tenant_bundle_changes.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/apply_tenant_bundle_changes.mjs), [docs/tenant_onboarding_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/tenant_onboarding_runbook_zh.md) | `node --check`, `dry-run` evidence | 可從 `provisioning-request.json` 對 provider / policy 做 dry-run 或寫入更新，並保留 evidence JSON |
| provisioning submission helper | 已實作 | [scripts/submit_provisioning_request.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/submit_provisioning_request.mjs), [docs/tenant_onboarding_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/tenant_onboarding_runbook_zh.md) | `node --check` | 可把 `provisioning-request.json` 提交到外部 endpoint，並保留 submission evidence JSON |
| tenant handoff state helper | 已實作 | [scripts/update_tenant_handoff_state.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/update_tenant_handoff_state.mjs), [docs/tenant_onboarding_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/tenant_onboarding_runbook_zh.md) | `node --check` | 可把 bundle/request/verify 證據折疊成 `handoff-state.json`，降低交接遺漏 |
| onboarding rollback helper | 已實作 | [scripts/render_tenant_onboarding_bundle.mjs](/Users/zh/Documents/codeX/agent_control_plane/scripts/render_tenant_onboarding_bundle.mjs), [docs/tenant_onboarding_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/tenant_onboarding_runbook_zh.md) | bundle 生成、shell syntax check | 生成 `rollback-request.json` 與 `rollback.sh`，可保守停用預設 provider / policy |

## 10. 最重要的當前限制

目前最需要提醒接手方的限制如下：

- replay 的 `from_step` 會對 `mcp_call` / `a2a_message` 等非 workflow-native step 做最小 rewind 回退；若同 run 內找不到最近的 workflow-native anchor，才會失敗
- Worker 內不直接驗證 `Authorization` 內容，production 需依賴外層 Access / gateway
- 目前已有 baseline onboarding bundle、deploy/runtime workflows、GitHub environments、repository variables 與 runtime bootstrap，但仍缺少真正的 Access 自動化、有效 Cloudflare deploy token 接線、監控平台告警接線、secret-store 輪替，以及與真實外部系統打通的全自動流水線
