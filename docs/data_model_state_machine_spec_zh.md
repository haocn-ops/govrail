# Govrail 資料模型與狀態機補充規格（MVP）

交付對象：D1 / Durable Objects / Workflow 工程師  
版本：v0.1  
日期：2026-04-01

## 1. 文檔目的

本文件補足主規格中的實體定義、狀態轉移、索引、冪等與儲存邊界，讓 migration、DO 實作與 workflow 編排能有一致的工程基礎。

## 2. ID 與命名規則

- `tenant_`：租戶
- `agent_`：agent
- `tp_`：tool provider
- `run_`：run
- `step_`：run step
- `apr_`：approval
- `art_`：artifact
- `task_`：A2A task
- `mcp_`：MCP call
- `evt_`：audit / domain event

目前代碼使用 `prefix_<time_base36><entropy>` 格式的自定義 ID，例如：

- `run_mnet47que78cb54d53d1429d`
- `apr_mnet47qvb936411072f64a66`
- `evt_mnet47r0568e6b9c2bea4d93`

它不是嚴格 ULID，但具備近似時間有序特性，設計目標仍然是：

- 便於按時間排序
- 便於 R2 key 與 D1 索引對齊
- 在多 region 下可安全產生

## 3. D1 主表

### 3.1 agents

| 欄位 | 型別 | 說明 |
|---|---|---|
| agent_id | text pk | Agent 主鍵 |
| tenant_id | text | 所屬租戶 |
| name | text | 顯示名稱 |
| framework | text | `openai_agents` / `langgraph` / `custom` |
| endpoint_url | text | 對外 A2A 或 webhook 入口 |
| auth_type | text | `none` / `access_service_token` / `oauth2` |
| capabilities_json | text | JSON array |
| status | text | `active` / `disabled` |
| created_at | text | RFC3339 UTC |
| updated_at | text | RFC3339 UTC |

索引：

- `(tenant_id, status)`
- `(tenant_id, name)`

### 3.2 tool_providers

| 欄位 | 型別 | 說明 |
|---|---|---|
| tool_provider_id | text pk | Tool provider 主鍵 |
| tenant_id | text | 所屬租戶 |
| name | text | 顯示名稱 |
| provider_type | text | `mcp_server` / `mcp_portal` / `http_api` |
| endpoint_url | text | JSON-RPC endpoint |
| auth_ref | text | 憑證引用，不存明文；支援 `bearer:SECRET`、`header:Header-Name:SECRET` 或直接 `SECRET` |
| visibility_policy_ref | text | tools/list 可見性規則引用 |
| execution_policy_ref | text | tools/call 規則引用 |
| status | text | `active` / `disabled` |
| created_at | text | RFC3339 UTC |
| updated_at | text | RFC3339 UTC |

索引：

- `(tenant_id, status)`
- `(tenant_id, provider_type)`

### 3.2.1 policies

MVP 將 policy 落在 D1，讓 `tools/list` 與 `tools/call` 共用同一套規則來源。

| 欄位 | 型別 | 說明 |
|---|---|---|
| policy_id | text pk | Policy 主鍵 |
| tenant_id | text | 所屬租戶 |
| channel | text | `mcp_tool_call` / `a2a_dispatch` / `external_action` |
| tool_provider_id | text null | 指向特定 provider，null 表示通配 |
| tool_name | text null | 指向特定 tool，null 表示通配 |
| decision | text | `allow` / `deny` / `approval_required` |
| approver_roles_json | text | approver roles 陣列 |
| priority | integer | 數值越大優先級越高 |
| status | text | `active` / `disabled` |
| conditions_json | text | 條件 JSON，MVP 至少支援 `risk_level`、`target_classification`、`labels` |
| approval_config_json | text | approval 配置 JSON，例如 `timeout_seconds` |
| created_at | text | RFC3339 UTC |
| updated_at | text | RFC3339 UTC |

索引：

- `(tenant_id, channel, status, priority desc)`
- `(tenant_id, channel, tool_provider_id, tool_name, status)`

### 3.3 runs

| 欄位 | 型別 | 說明 |
|---|---|---|
| run_id | text pk | Run 主鍵 |
| tenant_id | text | 所屬租戶 |
| trace_id | text | 全鏈路追蹤 ID |
| parent_run_id | text null | 父 run |
| replay_source_run_id | text null | replay 來源 run |
| entry_agent_id | text null | 入口 agent |
| status | text | run 狀態 |
| workflow_instance_id | text | workflow instance 識別 |
| current_step_id | text null | 當前 step |
| pending_approval_id | text null | 等待中的 approval |
| input_blob_key | text | 原始輸入 R2 key |
| context_json | text | 精簡上下文 |
| error_code | text null | 失敗碼 |
| error_message | text null | 精簡失敗訊息 |
| created_by | text | user/service 主體 ID |
| created_at | text | RFC3339 UTC |
| updated_at | text | RFC3339 UTC |
| completed_at | text null | 完成時間 |

索引：

- `(tenant_id, created_at desc)`
- `(tenant_id, status, updated_at desc)`
- `(trace_id)`
- `(parent_run_id)`
- `(replay_source_run_id)`

### 3.4 run_steps

| 欄位 | 型別 | 說明 |
|---|---|---|
| step_id | text pk | Step 主鍵 |
| tenant_id | text | 所屬租戶 |
| run_id | text | 所屬 run |
| parent_step_id | text null | 樹狀鏈接 |
| sequence_no | integer | 單一 run 內單調遞增 |
| step_type | text | `agent_dispatch` / `mcp_call` / `approval_wait` / `artifact_write` |
| actor_type | text | `system` / `agent` / `human` / `tool` |
| actor_ref | text null | agent_id 或 tool_provider_id |
| status | text | step 狀態 |
| input_blob_key | text null | request payload blob |
| output_blob_key | text null | response payload blob |
| started_at | text | RFC3339 UTC |
| ended_at | text null | RFC3339 UTC |
| error_code | text null | 失敗碼 |
| metadata_json | text | 精簡 metadata |

索引：

- `(run_id, sequence_no)`
- `(tenant_id, run_id, status)`

### 3.5 approvals

| 欄位 | 型別 | 說明 |
|---|---|---|
| approval_id | text pk | Approval 主鍵 |
| tenant_id | text | 所屬租戶 |
| run_id | text | 對應 run |
| step_id | text | 觸發該 approval 的 step |
| policy_id | text | 命中的 policy |
| subject_type | text | `tool_call` / `a2a_dispatch` / `external_action` |
| subject_ref | text | tool name 或 action name |
| status | text | approval 狀態 |
| requested_by | text | 請求主體 |
| approver_scope_json | text | approver 條件 |
| decision_by | text null | 決策人 |
| decision_comment | text null | 決策備註 |
| decision_reason_code | text null | 決策原因碼 |
| expires_at | text null | 超時時間 |
| created_at | text | RFC3339 UTC |
| decided_at | text null | RFC3339 UTC |

索引：

- `(tenant_id, status, created_at desc)`
- `(run_id, status)`
- `(decision_by, decided_at desc)`

### 3.6 artifacts

| 欄位 | 型別 | 說明 |
|---|---|---|
| artifact_id | text pk | Artifact 主鍵 |
| tenant_id | text | 所屬租戶 |
| run_id | text | 所屬 run |
| step_id | text null | 產生該 artifact 的 step |
| artifact_type | text | `email_draft` / `report` / `audit_bundle` |
| mime_type | text | MIME type |
| r2_key | text | 實體內容位置 |
| sha256 | text | 完整性校驗 |
| size_bytes | integer | 大小 |
| created_at | text | RFC3339 UTC |

索引：

- `(run_id, created_at)`
- `(tenant_id, artifact_type, created_at desc)`

### 3.7 a2a_tasks

| 欄位 | 型別 | 說明 |
|---|---|---|
| task_id | text pk | Local task 主鍵 |
| tenant_id | text | 所屬租戶 |
| run_id | text | 對應 local run |
| direction | text | `inbound` / `outbound` |
| remote_task_id | text | 遠端 task ID |
| remote_agent_id | text | 遠端 agent ID |
| remote_endpoint_url | text | 遠端 endpoint |
| last_remote_message_id | text null | 最新 message |
| status | text | `pending` / `in_progress` / `completed` / `failed` / `cancelled` |
| created_at | text | RFC3339 UTC |
| updated_at | text | RFC3339 UTC |

索引：

- `(run_id)`
- `(tenant_id, remote_task_id)`

### 3.8 audit_events

| 欄位 | 型別 | 說明 |
|---|---|---|
| event_id | text pk | Audit event 主鍵 |
| tenant_id | text | 所屬租戶 |
| run_id | text | 所屬 run |
| step_id | text null | 關聯 step |
| trace_id | text | 全鏈路追蹤 ID |
| event_type | text | `policy_evaluated` / `approval_created` / `approval_decided` / `approval_expired` / `approval_cancelled` / `side_effect_blocked` / `side_effect_executed` |
| actor_type | text | `system` / `human` / `agent` / `tool` |
| actor_ref | text null | actor 識別 |
| payload_json | text | 精簡事件 payload |
| created_at | text | RFC3339 UTC |

索引：

- `(tenant_id, run_id, created_at desc)`
- `(tenant_id, event_type, created_at desc)`

### 3.9 mcp_calls

| 欄位 | 型別 | 說明 |
|---|---|---|
| call_id | text pk | MCP call 主鍵 |
| tenant_id | text | 所屬租戶 |
| run_id | text | 所屬 run |
| step_id | text | 對應 step |
| tool_provider_id | text | 所屬 provider |
| tool_name | text | 調用工具名稱 |
| policy_decision | text | `allow` / `deny` / `approval_required` |
| approval_id | text null | 若需審批則關聯 approval |
| request_blob_key | text | 原始 request |
| response_blob_key | text null | 原始 response |
| started_at | text | RFC3339 UTC |
| ended_at | text null | RFC3339 UTC |
| status | text | `pending` / `completed` / `failed` / `blocked` |
| error_code | text null | 失敗碼 |

索引：

- `(run_id, started_at)`
- `(tenant_id, tool_provider_id, started_at desc)`
- `(approval_id)`

### 3.10 idempotency_records

| 欄位 | 型別 | 說明 |
|---|---|---|
| record_id | text pk | 主鍵 |
| tenant_id | text | 所屬租戶 |
| route_key | text | 例如 `POST:/api/v1/runs` |
| idempotency_key | text | 呼叫方提交 |
| payload_hash | text | 標準化 payload hash |
| resource_type | text | `run` / `approval_decision` / `mcp_call` |
| resource_id | text | 對應主資源 ID |
| created_at | text | RFC3339 UTC |
| expires_at | text | RFC3339 UTC |

唯一鍵：

- `(tenant_id, route_key, idempotency_key)`

### 3.11 queue_dedupe_records

| 欄位 | 型別 | 說明 |
|---|---|---|
| record_id | text pk | Queue 去重記錄主鍵 |
| tenant_id | text | 所屬租戶 |
| queue_name | text | Queue 名稱，例如 `agent-control-plane-events` |
| message_type | text | 目前為 `audit_event` |
| dedupe_key | text | side effect 去重鍵 |
| run_id | text | 所屬 run |
| trace_id | text | 全鏈路追蹤 ID |
| processed_at | text | 首次成功處理時間，RFC3339 UTC |

唯一鍵：

- `(queue_name, dedupe_key)`

索引：

- `(tenant_id, processed_at desc)`

## 4. Durable Objects 熱狀態

### 4.1 RunCoordinator

責任：

- 維護單一 run 的熱狀態與序列號
- 協調 workflow signal、A2A push、approval resume
- 提供同一 run 下的互斥與冪等去重

最小狀態：

```json
{
  "run_id": "run_01JQ...",
  "tenant_id": "tenant_acme",
  "status": "running",
  "last_sequence_no": 7,
  "pending_approval_id": "apr_01JQ...",
  "current_step_id": "step_01JQ...",
  "inflight_keys": {
    "dispatch_remote_task_001": "accepted"
  }
}
```

### 4.2 ApprovalSession

責任：

- 封裝 approval 的等待、決策與信號轉發
- 保證 approval 只被決策一次

最小狀態：

```json
{
  "approval_id": "apr_01JQ...",
  "run_id": "run_01JQ...",
  "status": "pending",
  "decision": null,
  "decided_by": null
}
```

### 4.3 RateLimiter

責任：

- 以 tenant-scoped 固定時間窗做 run mutation 限流
- 對 `POST /api/v1/runs` 與 `POST /api/v1/runs/{run_id}/replay` 提供最小 429 保護

最小狀態：

```json
{
  "tenant_id": "tenant_acme",
  "scope": "runs_create",
  "window_start_ms": 1711886400000,
  "count": 1
}
```

原則：

- `scope` 目前至少支援 `runs_create` 與 `runs_replay`
- 60 秒時間窗內同 tenant、同 scope 的次數會累加
- idempotent retry 若命中既有結果，不應再增加計數
- 未啟用限流時，對應 env 變數設為空或 `0` 即可

## 5. R2 物件鍵規範

### 5.1 Blob 路徑

```text
tenants/{tenant_id}/runs/{run_id}/input.json
tenants/{tenant_id}/runs/{run_id}/steps/{step_id}/request.json
tenants/{tenant_id}/runs/{run_id}/steps/{step_id}/response.json
tenants/{tenant_id}/runs/{run_id}/artifacts/{artifact_id}
tenants/{tenant_id}/runs/{run_id}/audit/{event_id}.json
tenants/{tenant_id}/runs/{run_id}/replay/bundle.json
```

### 5.2 原則

- D1 只保存 key、hash、size、類型
- 可重放或法遵相關資料一律落 R2
- 高容量 payload 不得直接塞進 D1 `*_json` 欄位

## 6. 狀態機

### 6.1 Run 狀態轉移

```text
queued -> running
running -> waiting_approval
waiting_approval -> running
running -> completed
running -> failed
running -> cancelled
waiting_approval -> cancelled
waiting_approval -> failed
```

不允許：

- `completed -> *`
- `failed -> *`
- `cancelled -> *`

### 6.2 Step 狀態轉移

```text
pending -> running
running -> completed
running -> failed
running -> blocked
blocked -> running
pending -> cancelled
running -> cancelled
```

### 6.3 Approval 狀態轉移

```text
pending -> approved
pending -> rejected
pending -> expired
pending -> cancelled
```

## 7. Workflow 編排要求

### 7.1 RunWorkflow 最小流程

1. 初始化 run 與 input blob
2. 將 run 轉為 `running`
3. 建立 planner / dispatch step
4. 視路由結果進入：
   - A2A outbound
   - MCP tool call
   - 直接產出 artifact
5. 若命中高風險 policy，建立 approval 與 `approval_wait` step
6. workflow 等待 approval signal
7. 審批通過後恢復執行
8. 寫 artifact、更新 run 終態、落 audit bundle

### 7.2 Approval 等待規則

- workflow 等待的不是輪詢 D1，而是由 `ApprovalSession` 或 API handler 送 signal
- signal payload 最小欄位：

```json
{
  "approval_id": "apr_01JQ...",
  "decision": "approved",
  "decided_by": "user_001",
  "decided_at": "2026-03-31T12:36:00Z"
}
```

### 7.3 失敗語義

- 可重試失敗：上游 5xx、網路超時、Queue 暫時失敗
- 不可重試失敗：policy denied、approval rejected、資料驗證錯誤
- Workflow 層需將不可重試失敗落為 run `failed`，並寫入 `error_code`

## 8. Queue 與冪等

### 8.1 Queue consumer 規則

- `audit_events` 落 D1 後，MVP 會同步 fan out 精簡 envelope 到 `EVENT_QUEUE`
- 每個 message 都要帶：
  - `message_type`，目前固定為 `audit_event`
  - `tenant_id`
  - `run_id`
  - `dedupe_key`
  - `trace_id`
  - `event_id`
  - `event_type`
- audit event fanout 建議直接使用 `audit_event:{event_id}` 作為 `dedupe_key`
- consumer 在執行 side effect 前，先將 `(queue_name, dedupe_key)` 寫入 D1 `queue_dedupe_records`
- 若 dedupe 已存在，consumer 應視為重送並 `ack`
- 若 message schema 無效，consumer 應記錄 warning 並 `ack`
- 若處理途中失敗，consumer 應記錄 error 並 `retry`

### 8.2 Side effect 去重鍵

建議組成：

```text
{run_id}:{step_id}:{action_type}:{target_fingerprint}
```

## 9. 最小 migration 建議

MVP 第一個 migration 至少建立：

- `agents`
- `tool_providers`
- `policies`
- `runs`
- `run_steps`
- `approvals`
- `artifacts`
- `a2a_tasks`
- `mcp_calls`
- `idempotency_records`
- `audit_events`
- `queue_dedupe_records`
- `rate_limit_windows` 若採 D1 狀態表方案；若採 Durable Object 方案，則由 `RATE_LIMITER` binding 持有計數，不另建 D1 表

不要求第一版就建立所有外鍵約束，但至少要有：

- 主鍵
- 唯一鍵
- 關鍵查詢索引
- 狀態欄位的 enum 約束或應用層校驗

## 10. 最小測試清單

- 同一 run 下 `sequence_no` 不得重複或回退
- approval 決策只能成功一次
- workflow 在 `waiting_approval` 期間重啟後仍可恢復
- Queue 重送不得造成重複 `tools/call` side effect
- 大 payload 必須落 R2，D1 只保留 pointer
