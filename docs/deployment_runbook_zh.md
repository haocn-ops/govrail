# Agent Control Plane 部署與驗收 Runbook（MVP）

交付對象：Platform / SRE / 後端工程師  
版本：v0.1  
日期：2026-04-01

## 1. 文檔目的

本文件補足主規格中「如何真正把 MVP 跑起來」的部分，涵蓋部署前檢查、Cloudflare 資源準備、首次部署流程、最小驗收步驟，以及常見故障排查。

本文件不取代設計文檔；若需要查欄位、狀態機或 API payload，請回看：

- `agent_control_plane_dev_spec_zh.md`
- `docs/api_contract_spec_zh.md`
- `docs/data_model_state_machine_spec_zh.md`
- `docs/policy_approval_spec_zh.md`
- `docs/flow_failure_runbook_zh.md`
- `docs/environment_config_runbook_zh.md`
- `docs/observability_alerting_baseline_zh.md`

## 2. 當前代碼狀態

截至 2026-03-31，倉庫內 MVP 已通過以下本地驗證：

- `npm run verify:local`
- `npm run verify:build`

這代表 TypeScript、mock smoke flow 與 Worker 打包配置目前是自洽的。  
但這不等於可直接部署到真實 Cloudflare 環境，因為正式環境仍需先準備對應資源並補齊配置。

倉庫另外提供一個 GitHub Actions 的手動 release gate workflow，會在不部署的前提下包裝本地驗證、可選的 write-mode 遠端驗收，以及 readonly 遠端驗證，並把 logs / summary 上傳成 artifact。驗證腳本現在也會輸出結構化步驟事件，讓後續排障時能直接看到每一步的開始時間、耗時與是否成功寫出 evidence。

## 3. 部署前提

### 3.1 本地工具

- Node.js 20+
- npm
- Wrangler 4.x
- 已登入正確的 Cloudflare account

建議先執行：

```bash
npm install
npm run types
npm run verify:local
npm run verify:build
```

### 3.2 Worker 綁定資源

目前 [wrangler.jsonc](/Users/zh/Documents/codeX/agent_control_plane/wrangler.jsonc) 聲明了以下綁定：

| Binding | 類型 | 用途 |
|---|---|---|
| `DB` | D1 | run / approval / policy / audit / idempotency 索引 |
| `ARTIFACTS_BUCKET` | R2 | input、artifact、audit blob |
| `RUN_COORDINATOR` | Durable Object | 單 run 熱狀態協調 |
| `APPROVAL_SESSION` | Durable Object | 單 approval 熱狀態與 signal |
| `RUN_WORKFLOW` | Workflow | 長任務編排 |
| `EVENT_QUEUE` | Queue producer/consumer | audit event fanout 與去重消費 |

### 3.3 首次部署前必做

必須先在 Cloudflare 建立或確認以下資源存在：

- D1 database：`agent-control-plane`
- R2 bucket：`agent-control-plane-artifacts`
- Queue：`agent-control-plane-events`

此外，正式部署前要確認 `wrangler.jsonc` 已補齊真實環境需要的資源標識。  
目前配置已包含 `database_name`、`bucket_name`、`queue` 等名稱，但接手部署時仍應再次核對是否已填入目標環境所需的 ID / env 區段，而不是直接假設可裸跑到 production。

## 4. 首次部署流程

### 4.1 安裝依賴並生成型別

```bash
npm install
npm run types
```

### 4.2 檢查 Wrangler 配置

重點確認：

- `compatibility_date` 是否維持近期日期
- `observability` 是否保持啟用
- `d1_databases` 是否指向正確資料庫
- `r2_buckets` 是否指向正確 bucket
- `queues` producer / consumer 是否綁到同一條 queue
- 若要分 staging / production，需補 `env.staging`
- 可直接參考 [wrangler.multi-env.example.jsonc](/Users/zh/Documents/codeX/agent_control_plane/docs/wrangler.multi-env.example.jsonc)

### 4.3 執行本地驗證

```bash
npm run verify:local
npm run verify:build
```

只要其中任一步失敗，都不應直接部署。

### 4.4 正式部署

```bash
wrangler deploy
```

若是第一次對新環境部署，建議先走 staging，再提升到 production。

### 4.5 部署後快速驗證

倉庫現在提供一個 post-deploy 驗證腳本，會檢查：

- 健康檢查端點可讀
- Agent Card 可讀
- admin API 可讀寫
- run 可建立並完成
- graph / events / artifacts 可查
- `runs/{run_id}/graph` 的 `include_payloads=true` 與 `page_size=1` 保留查詢參數可用
- replay `mode=from_step` 會透傳 `replay_from_step` 與 `replay_start_phase=planner`；非 workflow-native anchor fallback 由 `smoke` 持續驗證
- A2A `message:stream` 會回 `200 text/event-stream`，並送 `ready` / `snapshot`
- MCP `GET /api/v1/mcp/{toolProviderId}` 會回 `200 text/event-stream` 的 ready stream
- artifact 正文可讀
- 若另外提供 rate-limit 期望值，write mode 也可驗證 `POST /api/v1/runs` / replay 的 `429 rate_limited`

預設模式為「寫入式驗收」，適合 staging 或專用驗收 tenant。  
若是 production，建議改用唯讀模式，避免在正式 tenant 中建立驗證資料。

使用方式：

```bash
BASE_URL="https://<your-worker-domain>" \
TENANT_ID="tenant_verify" \
npm run post-deploy:verify
```

production 唯讀模式：

```bash
BASE_URL="https://<your-worker-domain>" \
TENANT_ID="tenant_prod" \
RUN_ID="<existing_run_id>" \
npm run post-deploy:verify:readonly
```

可選環境變數：

- `SUBJECT_ID`
- `SUBJECT_ROLES`
- `VERIFY_MODE`
- `RUN_ID` / `EXISTING_RUN_ID`
- `EXPECT_RATE_LIMIT_RUNS_PER_MINUTE`
- `EXPECT_RATE_LIMIT_REPLAYS_PER_MINUTE`
- `VERIFY_OUTPUT_PATH`

若不提供，腳本預設使用：

- `SUBJECT_ID=post_deploy_verifier`
- `SUBJECT_ROLES=platform_admin,legal_approver`
- `VERIFY_MODE=write`

這兩個 subject 相關環境變數目前會由驗證腳本映射成受信任入口風格的身份標頭：

- `X-Authenticated-Subject`
- `X-Authenticated-Roles`

因此同一支驗證腳本可同時適用於：

- 還在 `permissive` 模式的環境
- 已切到 `NORTHBOUND_AUTH_MODE=trusted_edge` 的 staging / production 環境

若要在 staging / verify tenant 額外驗證限流，可用：

```bash
BASE_URL="https://<your-worker-domain>" \
TENANT_ID="tenant_verify" \
EXPECT_RATE_LIMIT_RUNS_PER_MINUTE="1" \
EXPECT_RATE_LIMIT_REPLAYS_PER_MINUTE="1" \
npm run post-deploy:verify
```

這類 rate-limit 驗證只建議在專用 verify tenant 執行，避免共享 tenant 的同時流量讓固定 60 秒時間窗結果失真。

若要把驗收結果保留成結構化 JSON，可再加：

```bash
BASE_URL="https://<your-worker-domain>" \
TENANT_ID="tenant_verify" \
VERIFY_OUTPUT_PATH="/tmp/post-deploy-verify-summary.json" \
npm run post-deploy:verify
```

腳本會保留原本 stdout JSON，同時把同一份 summary 寫到指定路徑，並附上 `started_at`、`completed_at`、`duration_ms`、`check_count` 與 `checks`，方便交接、artifact 收集或後續 workflow 包裝。若中途失敗，仍會盡量留下 partial summary。

唯讀模式行為：

- 一律不建立、不更新、不停用任何資料
- 仍會檢查 `agent-card`、`tool-providers`、`policies`
- 若提供 `RUN_ID`，則額外檢查該 run 的 `graph`、`events`、`artifacts`
- 仍會檢查 A2A `message:stream` 與可用的 MCP SSE ready stream
- 若該 run 目前尚未產出 artifact，腳本會保留成功並在輸出中標示略過正文檢查

### 4.6 GitHub Actions 手動 release gate

如果你想在正式部署前先做一個人工 gate，可以直接手動觸發：

- Workflow: `Manual Release Gate`
- 檔案: [.github/workflows/manual-release-gate.yml](/Users/zh/Documents/codeX/agent_control_plane/.github/workflows/manual-release-gate.yml)

這個 workflow 預設一定會做兩件事：

- 跑 `npm run verify:local`
- 跑 `npm run verify:build`

若要對 staging / verify tenant 做寫入式遠端驗收，可以把 `verification_mode` 切成 `write`，並補上：

- `base_url`
- `tenant_id`
- `expected_run_rate_limit`（選填）
- `expected_replay_rate_limit`（選填）

若需要再對既有部署做 readonly 驗證，可以把 `verification_mode` 切成 `readonly`，並補上：

- `base_url`
- `tenant_id`
- `run_id`（選填，沒有也能跑，但 artifact 驗證會少一段）

執行後會上傳一個 artifact，裡面包含：

- `verify-local.log`
- `verify-build.log`
- `verify-write.log`（只有 write 模式才有）
- `verify-write-summary.json`（只有 write 模式才有）
- `verify-readonly.log`（只有 readonly 模式才有）
- `verify-readonly-summary.json`（只有 readonly 模式才有）
- `release-gate-manifest.json`，用來機器化讀取 mode、inputs、outcomes 與 artifact 路徑
- `release-gate-summary.md`

這個 workflow 不會做 `wrangler deploy`，也不會替你建立或修改真實環境。

## 5. Migration 與資料初始化

### 5.1 D1 migration

目前 migration 目錄位於 [migrations](/Users/zh/Documents/codeX/agent_control_plane/migrations)，已包含：

- `0000_init.sql`
- `0001_policies.sql`
- `0002_audit_events.sql`
- `0003_queue_dedupe_records.sql`

其中：

- `0000_init.sql`：建立核心主表，例如 `runs`、`run_steps`、`approvals`、`artifacts`、`a2a_tasks`、`mcp_calls`、`idempotency_records`
- `0001_policies.sql`：補充 `policies` 等治理結構
- `0002_audit_events.sql`：建立審計事件索引表
- `0003_queue_dedupe_records.sql`：建立 queue 去重記錄表

部署前需確認目標 D1 已套用最新 migration。  
若 migration 未套用，最常見後果是：

- run / approval / artifact 基礎資料無法寫入
- 建立 policy 失敗
- audit event 寫入失敗
- queue 去重無法工作

若這次是新 tenant 接入，建議先用 tenant onboarding bundle 腳本產出 seed、metadata 與 handoff 資料，再執行匯入：

```bash
npm run tenant:onboarding:bundle -- --tenant-id tenant_acme --deploy-env staging
```

### 5.2 MVP 初始化資料

這個倉庫現在已提供一個可重複執行的 seed SQL 生成腳本：

```bash
npm run seed:sql -- --tenant-id tenant_demo
```

它會輸出一段可直接匯入 D1 的 upsert SQL，內容包含：

- `tool_providers`
- 初始 `policies`

若要先生成檔案，再匯入本地或遠端 D1，可使用：

```bash
npm run seed:sql -- --tenant-id tenant_demo > /tmp/agent_control_plane_seed.sql

wrangler d1 execute agent-control-plane --local --file /tmp/agent_control_plane_seed.sql
```

若要匯入遠端 D1，將 `--local` 改為 `--remote`：

```bash
wrangler d1 execute agent-control-plane --remote --file /tmp/agent_control_plane_seed.sql
```

若需要固定 seed 的時間戳，腳本也支援：

```bash
npm run seed:sql -- --tenant-id tenant_demo --created-at 2026-03-31T00:00:00.000Z
```

目前預設 seed 內容與 smoke 測試使用的是同一套資料定義，至少包含：

- `tp_email`
- `tp_data`
- `pol_mcp_email_external_approval_v1`
- `pol_mcp_data_read_approval_v1`
- `pol_mcp_data_delete_deny_v1`

若不想直接操作 SQL，現在也可以用 admin API 管理：

- `GET /api/v1/tool-providers`
- `GET /api/v1/tool-providers/{tool_provider_id}`
- `POST /api/v1/tool-providers`
- `POST /api/v1/tool-providers/{tool_provider_id}`
- `POST /api/v1/tool-providers/{tool_provider_id}:disable`
- `GET /api/v1/policies`
- `GET /api/v1/policies/{policy_id}`
- `POST /api/v1/policies`
- `POST /api/v1/policies/{policy_id}`
- `POST /api/v1/policies/{policy_id}:disable`

若未建立，MCP proxy 可能出現：

- `404 tool_provider_not_found`
- policy fallback 與預期不一致

### 5.3 Secrets 初始化

若 tenant 的 `tool_providers.auth_ref` 或 run context 的 `a2a_dispatch.auth_ref` 會引用 Worker secret，部署前還需要先把對應 secret 建立好。

逐一建立：

```bash
wrangler secret put MCP_API_TOKEN
wrangler secret put A2A_SHARED_KEY
```

若要一次匯入多個 secret，可先準備 JSON 檔：

- [secrets.bulk.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/secrets.bulk.example.json)
- [secret_rotation_plan.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_plan.example.json)

然後執行：

```bash
wrangler secret bulk /Users/zh/Documents/codeX/agent_control_plane/docs/secrets.bulk.example.json
```

若是 staging 環境，請加上 `--env staging`：

```bash
wrangler secret put MCP_API_TOKEN --env staging
wrangler secret bulk /Users/zh/Documents/codeX/agent_control_plane/docs/secrets.bulk.example.json --env staging
```

`auth_ref` 目前支援的格式：

- `<SECRET_BINDING_NAME>`
- `bearer:<SECRET_BINDING_NAME>`
- `header:<Header-Name>:<SECRET_BINDING_NAME>`

目前代碼會先在 `tool_providers` 寫入與 `context.a2a_dispatch.auth_ref` 解析階段做語法檢查，所以格式本身有問題時，現在會更早回 `400 invalid_request`；只有格式正確但 secret 尚未建立時，才會在執行上游請求時回 `500 upstream_auth_not_configured`。

若要輪替某個已在 production 使用中的 secret，請先參考：

- [secret_rotation_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_runbook_zh.md)

若 secret 未配置，系統會回：

- `500 upstream_auth_not_configured`

若舊資料或執行期仍觸發 `auth_ref` 格式錯誤，系統才會回：

- `500 upstream_auth_invalid`

## 6. 最小驗收流程

以下驗收假設 Worker 已部署並可透過 `BASE_URL` 存取。

### 6.0 當前認證邊界

需要特別注意：

- 目前倉庫中的 Worker 代碼不直接驗證 `Authorization` 內容
- northbound API 的身份校驗，設計上應由 Cloudflare Access 或外部入口層先完成
- 本 runbook 中使用的 `X-Subject-Id` / `X-Subject-Roles` 主要是驗收與測試覆寫手段

因此：

- staging 可在受控條件下用這些覆寫 header 做手動驗收
- production 不應把這種覆寫方式當成正式認證機制
- 若 production 仍能裸用這些 header 進行高權限操作，代表入口層保護還沒補齊

先準備共用變數：

```bash
export BASE_URL="https://<your-worker-domain>"
export TENANT_ID="tenant_smoke"
```

### 6.1 建立 run

在進一步驗收前，建議先確認 health endpoint：

```bash
curl "$BASE_URL/api/v1/health"
```

若只需要探活 status code，也可用：

```bash
curl -I "$BASE_URL/api/v1/health"
```

期望：

- 回 `200`
- `data.ok = true`
- `data.service = "agent-control-plane"`

```bash
curl -X POST "$BASE_URL/api/v1/runs" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -H "Idempotency-Key: run-demo-1" \
  -H "X-Subject-Id: user_requester_1" \
  -d '{
    "input": {
      "kind": "user_instruction",
      "text": "請先等法務審批，再派發給遠端供應商分析 agent"
    },
    "context": {
      "a2a_dispatch": {
        "tool_provider_id": "tp_remote_supplier_analysis",
        "agent_id": "agent_remote_supplier_analysis",
        "message_text": "請分析供應商報價差異",
        "wait_for_completion": true
      }
    },
    "policy_context": {
      "labels": ["external-send"]
    }
  }'
```

若目標是 HTTP(S) 遠端 agent，建議先在當前 tenant 建好對應的 `http_api` provider，再由 `tool_provider_id` 解析實際 `endpoint_url` / `auth_ref`；只有 `mock://` / `demo://` 類型的開發入口仍適合直接放在 run context。

期望：

- 回 `201`
- 取得 `run_id`
- 初始 `status` 為 `queued`

### 6.2 查詢 run 狀態

```bash
curl "$BASE_URL/api/v1/runs/<run_id>" \
  -H "X-Tenant-Id: $TENANT_ID"
```

可能狀態：

- `queued`
- `running`
- `waiting_approval`
- `completed`
- `failed`
- `cancelled`

### 6.3 取回 run graph 與 audit events

```bash
curl "$BASE_URL/api/v1/runs/<run_id>/graph" \
  -H "X-Tenant-Id: $TENANT_ID"

curl "$BASE_URL/api/v1/runs/<run_id>/events" \
  -H "X-Tenant-Id: $TENANT_ID"
```

當命中審批流程時，至少應能看到：

- `approval_created`
- `approval_decided` 或 `approval_expired`

### 6.3.1 取回 artifact 清單與正文

```bash
curl "$BASE_URL/api/v1/runs/<run_id>/artifacts" \
  -H "X-Tenant-Id: $TENANT_ID"

curl "$BASE_URL/api/v1/runs/<run_id>/artifacts/<artifact_id>?include_body=true" \
  -H "X-Tenant-Id: $TENANT_ID"
```

期望：

- 至少存在一筆 artifact
- `run_summary` 或 `a2a_remote_artifact` 至少命中一種
- `include_body=true` 時可直接看到 JSON 正文

### 6.4 完成人工審批

```bash
curl -X POST "$BASE_URL/api/v1/approvals/<approval_id>/decision" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -H "Idempotency-Key: approval-demo-1" \
  -H "X-Subject-Id: user_legal_1" \
  -H "X-Subject-Roles: legal_approver" \
  -d '{
    "decision": "approved",
    "comment": "approved in runbook validation"
  }'
```

期望：

- 回 `200`
- run 從 `waiting_approval` 恢復
- audit event 新增 `approval_decided`

### 6.5 模擬遠端 A2A 任務完成

若這次 run 會派發 outbound A2A，審批通過後可用 webhook 模擬遠端回推：

```bash
curl -X POST "$BASE_URL/api/v1/a2a/webhooks/push" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -d '{
    "task_id": "<task_id>",
    "status": "completed",
    "message_id": "msg_remote_done_1",
    "artifact": {
      "summary": "remote analysis finished",
      "vendor_count": 2
    }
  }'
```

可先透過下列 SQL 找出最新 task：

```sql
SELECT task_id, remote_task_id, run_id, status, updated_at
FROM a2a_tasks
WHERE tenant_id = '<tenant_id>'
ORDER BY updated_at DESC
LIMIT 20;
```

期望：

- webhook 回 `200`
- run 最終轉為 `completed`
- `artifacts` 中新增 `a2a_remote_artifact` 或最終 `run_summary`

### 6.6 驗證 queue 去重

MVP 目前的 queue consumer 會把每個 audit envelope 的 `(queue_name, dedupe_key)` 寫入 D1 `queue_dedupe_records`。  
同一筆 queue message 重送時，應被視為 duplicate 並直接 `ack`，不可造成重複 side effect。

建議驗證：

- 至少存在一筆 `queue_dedupe_records`
- 同一 `dedupe_key` 不應出現兩筆記錄

### 6.7 驗證 admin API 最小可用性

若不想手動逐條驗證，可直接執行：

```bash
BASE_URL="$BASE_URL" \
TENANT_ID="$TENANT_ID" \
npm run post-deploy:verify
```

若是 production 或共享 tenant，改用：

```bash
BASE_URL="$BASE_URL" \
TENANT_ID="$TENANT_ID" \
RUN_ID="<existing_run_id>" \
npm run post-deploy:verify:readonly
```

這支腳本會自動檢查：

- `/.well-known/agent-card.json`
- `GET/POST /api/v1/tool-providers`
- `GET/POST /api/v1/policies`
- `GET /api/v1/a2a/message:stream`
- `GET /api/v1/mcp/{toolProviderId}` 的 SSE ready stream
- `POST /api/v1/runs`
- `GET /api/v1/runs/{run_id}`
- `GET /api/v1/runs/{run_id}/graph`
- `GET /api/v1/runs/{run_id}/events`
- `GET /api/v1/runs/{run_id}/artifacts`
- `GET /api/v1/runs/{run_id}/artifacts/{artifact_id}?include_body=true`

唯讀模式則改為：

- `GET /.well-known/agent-card.json`
- `GET /api/v1/tool-providers`
- `GET /api/v1/policies`
- `GET /api/v1/a2a/message:stream`
- 可用的 `GET /api/v1/mcp/{toolProviderId}` SSE ready stream
- 若提供 `RUN_ID`，再加查：
  - `GET /api/v1/runs/{run_id}`
  - `GET /api/v1/runs/{run_id}/graph`
  - `GET /api/v1/runs/{run_id}/events`
  - `GET /api/v1/runs/{run_id}/artifacts`
  - 若存在 artifact，再查正文

若腳本失敗，請先記下：

- 失敗端點
- HTTP status
- response body
- 同一時段的 Worker logs / D1 查詢結果

## 7. 常用排障 SQL

以下 SQL 可在 D1 dashboard、SQL console 或等效管理工具中執行。

### 7.1 查 run 與終態

```sql
SELECT run_id, status, pending_approval_id, error_code, error_message, created_at, updated_at, completed_at
FROM runs
WHERE tenant_id = '<tenant_id>'
ORDER BY created_at DESC
LIMIT 20;
```

### 7.2 查待審批與決策結果

```sql
SELECT approval_id, run_id, status, requested_by, decision_by, decision_reason_code, expires_at, decided_at
FROM approvals
WHERE tenant_id = '<tenant_id>'
ORDER BY created_at DESC
LIMIT 20;
```

### 7.3 查 audit event

```sql
SELECT event_id, run_id, event_type, actor_type, actor_ref, created_at
FROM audit_events
WHERE tenant_id = '<tenant_id>'
ORDER BY created_at DESC
LIMIT 50;
```

### 7.4 查 queue 去重

```sql
SELECT queue_name, message_type, dedupe_key, run_id, trace_id, processed_at
FROM queue_dedupe_records
WHERE tenant_id = '<tenant_id>'
ORDER BY processed_at DESC
LIMIT 50;
```

### 7.5 查 artifacts

```sql
SELECT artifact_id, run_id, artifact_type, mime_type, r2_key, size_bytes, created_at
FROM artifacts
WHERE tenant_id = '<tenant_id>'
ORDER BY created_at DESC
LIMIT 50;
```

### 7.6 查 tool providers 與 policies

```sql
SELECT tool_provider_id, provider_type, endpoint_url, auth_ref, status, updated_at
FROM tool_providers
WHERE tenant_id = '<tenant_id>'
ORDER BY updated_at DESC;

SELECT policy_id, channel, tool_provider_id, tool_name, decision, priority, status, updated_at
FROM policies
WHERE tenant_id = '<tenant_id>'
ORDER BY priority DESC, updated_at DESC;
```

## 8. 常見故障與處理

### 8.1 `wrangler deploy --dry-run` 通過，但正式部署失敗

優先檢查：

- 目標 Cloudflare account 是否正確
- D1 / R2 / Queue 資源是否已建立
- `wrangler.jsonc` 是否已補齊對應環境配置
- 是否缺少 staging / production 的 env 區段

### 8.2 run 長時間停在 `waiting_approval`

優先檢查：

- `approvals.status` 是否仍是 `pending`
- approver 是否帶了正確 `X-Subject-Roles`
- workflow 是否已經因 timeout 將 approval 轉為 `expired`
- [docs/policy_approval_spec_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/policy_approval_spec_zh.md) 中的 approver role 規則是否與現場設定一致

### 8.3 看到 `tool_provider_not_found`

通常代表：

- 目標 tenant 下沒有對應 `tool_providers` 資料
- API 呼叫使用了錯誤的 `toolProviderId`

需要先補資料，再重試 `tools/list` 或 `tools/call`。

### 8.4 看到重複 queue log

若 log 事件為 `audit_event_queue_duplicate`，通常不是錯誤，而是 at-least-once queue delivery 下的正常去重。  
真正需要處理的是：

- `audit_event_queue_invalid_message`
- `audit_event_queue_process_failed`

此時應回查：

- queue message envelope 是否缺欄位
- `queue_dedupe_records` 是否可寫入
- D1 migration 是否缺少 `0003_queue_dedupe_records.sql`

### 8.5 看到 `tenant_access_denied`

優先檢查：

- 請求 header `X-Tenant-Id` 是否正確
- approval 決策者是否屬於同一 tenant
- 回放、取消、查詢是否誤用了其他 tenant 的 `run_id` / `approval_id`

### 8.6 看到 `run_not_found` 或 `artifact_not_found`

優先檢查：

- `run_id` / `artifact_id` 是否來自同一 tenant
- 是否把另一條驗證資料的 ID 拿到現在環境使用
- `artifacts` 表中是否真的存在該記錄
- 若 artifact 記錄存在，再確認對應 `r2_key` 是否仍在 bucket 中

### 8.7 看到 `task_not_found`

優先檢查：

- webhook push 帶的是 `task_id` 還是 `remote_task_id`
- 該 task 是否屬於目前 `X-Tenant-Id`
- `a2a_tasks` 表中是否已有對應記錄
- inbound / outbound 流程是否其實尚未建立 task 映射

### 8.8 看到 `upstream_auth_not_configured` 或 `upstream_auth_invalid`

優先檢查：

- `tool_providers.auth_ref` 或 `a2a_dispatch.auth_ref` 是否使用支援格式
- 對應 secret 是否已用 `wrangler secret put` / `wrangler secret bulk` 寫入目前環境
- staging / production 是否誤用了對方環境的 secret 名稱
- 若是自定義 header 模式，`header:<Header-Name>:<SECRET_BINDING_NAME>` 是否寫完整

## 9. 建議後續補強

若要把此 MVP 從「可驗證骨架」推進到「可上線服務」，下一批最值得補的項目是：

- production tenant onboarding 的完整自動 provisioning / 外部平台整合流程
- Access / service token 實際部署與輪替說明
- queue / workflow / D1 指標與告警
- post-deploy verify 的 staging 自動化包裝與 production 唯讀驗證模式
