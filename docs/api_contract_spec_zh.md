# Agent Control Plane API 契約補充規格（MVP）

交付對象：API / Workflow / Gateway 工程師  
版本：v0.1  
日期：2026-04-01

## 1. 文檔目的

本文件補足主規格中 Northbound API、A2A Gateway 與 MCP Proxy 的實作細節，目標是讓不同工程師可以依據一致的 request / response、錯誤碼、認證與冪等規則並行開發。

本文件與主文檔一起使用，若有衝突，以本文件的 API 契約為準。

## 2. 通用約定

### 2.1 基本格式

- API base path：`/api/v1`
- 內容格式：`application/json`
- 時間格式：RFC3339 UTC，例如 `2026-03-31T12:34:56Z`
- 所有資源 ID 目前採用 `prefix_<time_base36><entropy>` 自定義格式，例如 `run_mnet47que78cb54d53d1429d`
- 這類 ID 由毫秒時間戳的 base36 表示與隨機熵片段組成，目標是「近似時間有序」，不是嚴格 ULID
- 所有 mutation 類請求都必須支援 `Idempotency-Key`

### 2.2 通用標頭

| Header | 必填 | 用途 |
|---|---|---|
| Authorization | 是 | Bearer token 或 Cloudflare Access 身份 |
| Content-Type | POST 時是 | `application/json` |
| X-Tenant-Id | 是 | 多租戶隔離鍵 |
| X-Subject-Id | 否 | 本地 / 測試環境覆寫 subject_id |
| X-Subject-Roles | 否 | 本地 / 測試環境覆寫 roles，使用逗號分隔或 JSON array |
| X-Request-Id | 否 | 呼叫方提供的請求 ID，若未提供則系統產生 |
| Idempotency-Key | mutation 時是 | 防止重試造成重複建立與 side effect |
| X-Trace-Id | 否 | 若未提供則由系統建立 |

### 2.3 身份與授權

- MVP 階段 northbound API 以 Cloudflare Access JWT 或 service token 驗證。
- API 內部需將身份正規化為：
  - `subject_id`
  - `subject_type`：`user` | `service`
  - `tenant_id`
  - `roles[]`
- 任何跨 tenant 的請求都必須回 `403 tenant_access_denied`。

#### 2.3.1 當前代碼邊界說明

目前 Worker 代碼本身：

- 直接要求 `X-Tenant-Id`
- 預設仍允許以 `X-Subject-Id` / `X-Subject-Roles` 覆寫本地測試身份
- 不直接在 Worker 內驗證 `Authorization` header 的內容

但目前已新增一個收斂 production 邊界的 runtime 開關：

- `NORTHBOUND_AUTH_MODE=permissive`（預設）
  - 保持目前本地 smoke / 手動驗收行為
  - 可接受 `X-Subject-Id` / `X-Subject-Roles`
- `NORTHBOUND_AUTH_MODE=trusted_edge`
  - 所有 `/api/v1/*` 請求都必須帶受信任入口注入的身份
  - 目前接受 `CF-Access-Authenticated-User-Email` 或 `X-Authenticated-Subject`
  - roles 目前接受 `CF-Access-Authenticated-User-Groups` 或 `X-Authenticated-Roles`
  - 直接帶 `X-Subject-Id` / `X-Subject-Roles` / `X-Roles` 會回 `401 unauthorized`

也就是說，當前 MVP 的真實假設是：

- production / staging 的 northbound 認證由 Cloudflare Access、API Gateway 或其他入口層先完成
- Worker 內部只消費「已被入口層信任」的身份上下文
- 本地、smoke、手動驗收流程可使用 `X-Subject-Id` / `X-Subject-Roles` 模擬身份

因此：

- 文件中的 `Authorization` 要求代表目標部署形態，而不是本地 smoke 測試時 Worker 內部一定會拒絕無 token 請求
- production 不應只依賴 `X-Subject-Id` / `X-Subject-Roles`
- staging / production 建議把 `NORTHBOUND_AUTH_MODE` 設為 `trusted_edge`

### 2.4 標準成功回應包裝

```json
{
  "data": {},
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 2.5 標準錯誤回應包裝

```json
{
  "error": {
    "code": "run_not_found",
    "message": "Run does not exist in current tenant",
    "details": {}
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 2.6 錯誤碼

| HTTP | code | 用途 |
|---|---|---|
| 400 | invalid_request | JSON 結構或欄位錯誤 |
| 401 | unauthorized | 無法驗證身份 |
| 403 | tenant_access_denied | 租戶或權限不匹配 |
| 404 | run_not_found | 查無 run |
| 404 | approval_not_found | 查無 approval |
| 404 | policy_not_found | 查無 policy |
| 404 | tool_provider_not_found | 查無 tool provider |
| 404 | artifact_not_found | 查無 artifact |
| 404 | task_not_found | 查無 A2A task |
| 404 | tool_not_found | MCP tool provider 下查無指定 tool |
| 404 | mcp_call_not_found | 冪等回放時找不到既有 MCP call 記錄 |
| 404 | not_found | 路由不存在 |
| 409 | idempotency_conflict | 相同 idempotency key 對應不同 payload |
| 409 | invalid_state_transition | 狀態不允許此操作 |
| 409 | approval_already_decided | approval 已決策 |
| 409 | policy_already_exists | policy 已存在 |
| 409 | tool_provider_already_exists | tool provider 已存在 |
| 422 | policy_denied | 被 policy 拒絕 |
| 423 | approval_required | 需要人工審批 |
| 429 | rate_limited | 超出配額或速率限制 |
| 500 | internal_error | 未分類內部錯誤 |
| 500 | upstream_auth_invalid | `auth_ref` 格式不合法 |
| 500 | upstream_auth_not_configured | `auth_ref` 指向的 Worker secret 未配置 |
| 503 | upstream_unavailable | 遠端 agent 或 MCP server 不可用 |

補充說明：

- `tool_providers` 建立/更新與 `context.a2a_dispatch.auth_ref` 解析階段，若 `auth_ref` 格式本身錯誤，現在會更早回 `400 invalid_request`
- 只有格式正確但 secret binding 未配置時，才會在實際發起上游請求時回 `500 upstream_auth_not_configured`
- `upstream_auth_invalid` 仍保留作為執行期防線，用來處理舊資料或非預期輸入

## 3. 冪等規則

### 3.1 適用端點

- `POST /api/v1/runs`
- `POST /api/v1/approvals/{approval_id}/decision`
- `POST /api/v1/runs/{run_id}/replay`
- `POST /api/v1/policies`
- `POST /api/v1/policies/{policy_id}:disable`
- `POST /api/v1/a2a/message:send`
- 所有經 MCP Proxy 產生 side effect 的 `tools/call`

### 3.2 行為定義

- 相同 `tenant_id + route + idempotency_key` 視為同一個 mutation。
- 若 payload hash 相同，回傳第一次建立的結果與 `200` 或 `201`。
- 若 payload hash 不同，回 `409 idempotency_conflict`。
- 冪等紀錄至少保存 24 小時；高風險 side effect 建議保存 7 天。
- 若 mutation 已命中既有 idempotency 記錄並直接回傳既有結果，不應再消耗 rate limit 額度。

### 3.3 Rate limit 規則

- 目前 rate limit 只套用在 `POST /api/v1/runs` 與 `POST /api/v1/runs/{run_id}/replay`
- 限流 scope 為 tenant-scoped，並分成 `runs_create` 與 `runs_replay`
- 兩者都使用固定 60 秒時間窗
- 若 Worker 設定 `RATE_LIMIT_RUNS_PER_MINUTE > 0`，系統會對同 tenant 的 `POST /api/v1/runs` 套用限流；命中時回 `429 rate_limited`
- 若 Worker 設定 `RATE_LIMIT_REPLAYS_PER_MINUTE > 0`，系統會對同 tenant 的 replay 套用限流；命中時回 `429 rate_limited`
- `rate_limited` 的 `error.details` 至少包含 `scope`、`limit`、`remaining`、`retry_after_seconds`、`window_started_at`、`window_ends_at`

## 4. Northbound API

### 4.0 健康檢查

`GET /api/v1/health`

`HEAD /api/v1/health`

#### 說明

- 不要求 `X-Tenant-Id`
- 不要求 `Authorization`
- 適合 deploy 後探活、外部監控與最小可用性檢查
- `HEAD` 形式可用於不需要 response body 的探活器

#### Response `200`

```json
{
  "data": {
    "ok": true,
    "service": "agent-control-plane",
    "version": "0.1.0",
    "now": "2026-04-01T12:34:56.000Z"
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

#### HEAD Response `200`

- 無 response body
- 可用於 load balancer / uptime probe / rollout health gate

### 4.1 建立 Run

`POST /api/v1/runs`

#### Request

```json
{
  "input": {
    "kind": "user_instruction",
    "text": "分析本月採購價差並生成外發郵件草稿"
  },
  "entry_agent_id": "agent_procurement_planner",
  "context": {
    "conversation_id": "conv_01JQ...",
    "source_app": "web_console"
  },
  "policy_context": {
    "risk_tier": "default",
    "labels": ["finance", "external-send"]
  },
  "options": {
    "async": true,
    "priority": "normal"
  }
}
```

#### 驗證規則

- `input.kind` MVP 僅支援：`user_instruction` | `structured_payload`
- `entry_agent_id` 可選；若未提供，由 catalog router 選擇
- `options.priority` 僅支援：`low` | `normal` | `high`
- 若此 mutation 命中既有 idempotency 記錄並直接回傳既有結果，不應再消耗 rate limit 額度
- 若 `POST /api/v1/runs` 被限流，`error.details.scope` 會是 `runs_create`

#### Response `201`

```json
{
  "data": {
    "run_id": "run_01JQ...",
    "status": "queued",
    "workflow_status": "running",
    "coordinator_id": "run_01JQ...",
    "trace_id": "trc_01JQ...",
    "created_at": "2026-03-31T12:34:56Z"
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 4.2 查詢 Run

`GET /api/v1/runs/{run_id}`

#### Response `200`

```json
{
  "data": {
    "run_id": "run_01JQ...",
    "tenant_id": "tenant_acme",
    "status": "waiting_approval",
    "workflow_status": "paused",
    "entry_agent_id": "agent_procurement_planner",
    "current_step_id": "step_01JQ...",
    "pending_approval_id": "apr_01JQ...",
    "trace_id": "trc_01JQ...",
    "coordinator_state": {
      "run_id": "run_01JQ...",
      "status": "waiting_approval",
      "last_sequence_no": 2,
      "pending_approval_id": "apr_01JQ...",
      "current_step_id": "step_01JQ..."
    },
    "created_at": "2026-03-31T12:34:56Z",
    "updated_at": "2026-03-31T12:36:10Z",
    "completed_at": null
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

#### Query 目前實作狀態

- `include_payloads`：已啟用，會在回傳的 `artifacts` 中展開 `body`
- `page_size`：已啟用，限制 `steps` / `approvals` / `artifacts` 的每頁筆數
- `cursor`：已啟用，為不透明分頁游標，會和 `page_info.next_cursor` 搭配接續查下一頁

目前 `steps`、`approvals`、`artifacts` 都會跟隨同一個 `cursor` 一起翻頁。

### 4.3 查詢 Run Graph

`GET /api/v1/runs/{run_id}/graph`

#### Query

| 參數 | 必填 | 預設 | 說明 |
|---|---|---|---|
| include_payloads | 否 | false | 是否在 `artifacts` 中同步回傳 `body` |
| page_size | 否 | 100 | `steps` / `approvals` / `artifacts` 每頁上限 |
| cursor | 否 | - | 不透明分頁游標 |

#### Response `200`

```json
{
  "data": {
    "run": {
      "run_id": "run_01JQ...",
      "status": "completed"
    },
    "steps": [
      {
        "step_id": "step_01",
        "type": "agent_dispatch",
        "status": "completed",
        "parent_step_id": null,
        "started_at": "2026-03-31T12:34:57Z",
        "ended_at": "2026-03-31T12:35:02Z"
      }
    ],
    "approvals": [
      {
        "approval_id": "apr_01",
        "status": "approved",
        "decision_by": "user_legal_001",
        "decided_at": "2026-03-31T12:36:00Z"
      }
    ],
    "artifacts": [
      {
        "artifact_id": "art_01",
        "type": "email_draft",
        "mime_type": "application/json",
        "r2_key": "tenants/tenant_acme/runs/run_01/artifacts/art_01.json"
      }
    ],
    "page_info": {
      "next_cursor": null
    }
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 4.4 Approval 決策

`POST /api/v1/approvals/{approval_id}/decision`

#### Request

```json
{
  "decision": "approved",
  "comment": "法務已確認內容可寄送",
  "reason_code": "legal_review_passed"
}
```

#### 驗證規則

- `decision` 僅支援：`approved` | `rejected`
- 同一 approval 只能決策一次
- 決策人必須命中 approval policy 中的 approver scope
- 若 approval 已過期，回 `409 invalid_state_transition`

#### Response `200`

```json
{
  "data": {
    "approval_id": "apr_01JQ...",
    "status": "approved",
    "run_id": "run_01JQ...",
    "workflow_signal_status": "accepted",
    "decided_at": "2026-03-31T12:36:00Z"
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 4.5 Replay Run

`POST /api/v1/runs/{run_id}/replay`

#### Request

```json
{
  "mode": "from_input",
  "reason": "驗證新 policy 是否仍可完成",
  "overrides": {
    "policy_version": "pol_ver_2026_03_31",
    "entry_agent_id": "agent_procurement_planner_v2"
  }
}
```

#### 規則

- `mode` 僅支援：`from_input` | `from_step`
- replay 會建立新的 `run_id`
- 原始 run 與 replay run 必須在 `parent_run_id` / `replay_source_run_id` 關聯
- `from_input` 會以原始 input 重新建立一個新 run
- `from_step` 會先解析來源 step type；若該 step 是 workflow-native，會直接以 `planner`、`approval_wait`、`a2a_dispatch` 對應的最小 rewind 起跑
- 若 `from_step_id` 指向非 workflow-native step，例如 `mcp_call` 或 `a2a_message`，系統會在同一個 run 內按時間順序回退到最近的前一個 workflow-native anchor；可用 anchor 類型為 `planner`、`approval_wait`、`a2a_dispatch`
- 若找到 anchor，系統會以該 anchor 做最小 rewind，並在 replay run 的 graph step `metadata_json` 中觀察到 `replay_from_step` 與 `replay_start_phase`
- 若找不到任何可用 anchor，才回 `409 invalid_state_transition`
- `post-deploy:verify` 會用 `mode=from_step` 與 `from_step_id=<source step_id>` 驗證 replay metadata 與 graph 可讀性
- replay 命中既有 idempotency 記錄並直接回傳既有結果時，不應再消耗 rate limit 額度
- 若 replay 被限流，`error.details.scope` 會是 `runs_replay`

#### Response `201`

```json
{
  "data": {
    "run_id": "run_01JQ...",
    "replay_source_run_id": "run_01JP...",
    "status": "queued",
    "workflow_status": "running",
    "replay_mode": "from_input",
    "replay_from_step_id": null,
    "created_at": "2026-03-31T12:40:00Z"
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 4.5.0 取消 Run

`POST /api/v1/runs/{run_id}:cancel`

#### 規則

- 需帶 `Idempotency-Key`
- 僅 `queued` / `running` / `waiting_approval` 可取消
- 若 run 仍有 pending approval，該 approval 必須同步轉為 `cancelled`

#### Response `200`

```json
{
  "data": {
    "run_id": "run_01JQ...",
    "status": "cancelled",
    "cancelled_at": "2026-03-31T12:36:10Z"
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 4.5.1 查詢 Run Audit Events

`GET /api/v1/runs/{run_id}/events`

#### Query

| 參數 | 必填 | 預設 | 說明 |
|---|---|---|---|
| page_size | 否 | 100 | 每頁事件上限 |
| cursor | 否 | - | 不透明分頁游標 |

#### Response `200`

```json
{
  "data": {
    "run": {
      "run_id": "run_01JQ...",
      "status": "completed"
    },
    "items": [
      {
        "event_id": "evt_01JQ...",
        "run_id": "run_01JQ...",
        "step_id": "step_01JQ...",
        "trace_id": "trc_01JQ...",
        "event_type": "policy_evaluated",
        "actor": {
          "type": "system",
          "ref": "mcp_gateway"
        },
        "payload": {
          "channel": "mcp_tool_call",
          "tool_name": "send_email",
          "decision": "approval_required",
          "policy_id": "pol_mcp_email_external_approval_v1"
        },
        "created_at": "2026-03-31T12:35:10Z"
      }
    ],
    "page_info": {
      "next_cursor": null
    }
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 4.5.2 查詢 Run Artifacts

`GET /api/v1/runs/{run_id}/artifacts`

#### Query

| 參數 | 必填 | 預設 | 說明 |
|---|---|---|---|
| page_size | 否 | 100 | 每頁 artifact 上限 |
| cursor | 否 | - | 不透明分頁游標 |

#### Response `200`

```json
{
  "data": {
    "run": {
      "run_id": "run_01JQ...",
      "status": "completed"
    },
    "items": [
      {
        "artifact_id": "art_01JQ...",
        "run_id": "run_01JQ...",
        "step_id": null,
        "artifact_type": "run_summary",
        "mime_type": "application/json",
        "r2_key": "tenants/tenant_acme/runs/run_01/artifacts/art_01JQ.json",
        "sha256": "d0f3...",
        "size_bytes": 196,
        "created_at": "2026-03-31T12:36:20Z"
      }
    ],
    "page_info": {
      "next_cursor": null
    }
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 4.5.3 查詢單個 Artifact

`GET /api/v1/runs/{run_id}/artifacts/{artifact_id}`

#### Query

| 參數 | 必填 | 預設 | 說明 |
|---|---|---|---|
| include_body | 否 | false | 為 `true` 或 `1` 時，同步回傳 artifact 正文 |

#### Response `200`

```json
{
  "data": {
    "artifact_id": "art_01JQ...",
    "run_id": "run_01JQ...",
    "step_id": null,
    "artifact_type": "run_summary",
    "mime_type": "application/json",
    "r2_key": "tenants/tenant_acme/runs/run_01/artifacts/art_01JQ.json",
    "sha256": "d0f3...",
    "size_bytes": 196,
    "created_at": "2026-03-31T12:36:20Z",
    "body": {
      "run_id": "run_01JQ...",
      "summary": "MVP workflow completed and produced a placeholder artifact."
    }
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

#### 規則

- `artifact_id` 必須屬於目前租戶與指定 `run_id`
- 若 `include_body=true`，系統會從 R2 讀取正文；JSON 內容回傳解析後物件，其他 MIME type 回傳字串
- 若 D1 有 artifact 記錄但 R2 中正文遺失，回 `500 internal_error`

### 4.6 查詢 Policy

`GET /api/v1/policies`

#### Query

| 參數 | 必填 | 預設 | 說明 |
|---|---|---|---|
| status | 否 | 全部 | `active` 或 `disabled` |

#### Response `200`

```json
{
  "data": {
    "items": [
      {
        "policy_id": "pol_mcp_email_external_approval_v1",
        "tenant_id": "tenant_acme",
        "channel": "mcp_tool_call",
        "scope": {
          "tool_provider_id": "tp_email",
          "tool_name": "send_email"
        },
        "decision": "approval_required",
        "priority": 100,
        "status": "active",
        "conditions": {
          "risk_level": "high",
          "target_classification": "external"
        },
        "approval_config": {
          "approver_roles": ["legal_approver"],
          "timeout_seconds": 86400
        },
        "created_at": "2026-03-31T12:34:56Z",
        "updated_at": "2026-03-31T12:34:56Z"
      }
    ],
    "page_info": {
      "next_cursor": null
    }
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 4.7 查詢單個 Policy

`GET /api/v1/policies/{policy_id}`

#### Response `200`

回應格式同 `GET /api/v1/policies` 中的單筆 policy 物件。

### 4.7 建立 Policy

`POST /api/v1/policies`

#### Request

```json
{
  "policy_id": "pol_mcp_email_internal_deny_v1",
  "channel": "mcp_tool_call",
  "scope": {
    "tool_provider_id": "tp_email",
    "tool_name": "send_email"
  },
  "conditions": {
    "risk_level": "high",
    "target_classification": "internal"
  },
  "decision": "deny",
  "priority": 120,
  "status": "active"
}
```

#### 驗證規則

- `channel` 必填
- `decision` 僅支援：`allow` | `deny` | `approval_required`
- `priority` 必須為非負整數
- `conditions` MVP 僅支援：`risk_level`、`target_classification`、`labels`
- `approval_config.timeout_seconds` 若提供，必須為正整數

#### Response `201`

回應格式同 `GET /api/v1/policies` 中的單筆 policy 物件。

### 4.8 停用 Policy

`POST /api/v1/policies/{policy_id}:disable`

#### 規則

- 若 policy 已是 `disabled`，仍回傳 `200`
- 停用後必須立即影響後續 `tools/list` / `tools/call` 的 policy 命中結果

#### Response `200`

回應格式同 `GET /api/v1/policies` 中的單筆 policy 物件，但 `status = disabled`。

### 4.9 更新 Policy

`POST /api/v1/policies/{policy_id}`

#### Request

```json
{
  "status": "active",
  "priority": 130,
  "conditions": {
    "risk_level": "medium",
    "target_classification": "internal"
  }
}
```

#### 驗證規則

- 至少必須提供一個欄位
- `channel` 若提供，不可為空字串
- `decision` 若提供，僅支援：`allow` | `deny` | `approval_required`
- `priority` 若提供，必須為非負整數
- `conditions` 若提供，MVP 僅支援：`risk_level`、`target_classification`、`labels`
- `approval_config.timeout_seconds` 若提供，必須為正整數
- `status` 若提供，僅支援：`active` | `disabled`

#### Response `200`

回應格式同 `GET /api/v1/policies` 中的單筆 policy 物件。

### 4.10 查詢 Tool Providers

`GET /api/v1/tool-providers`

#### Query

| 參數 | 必填 | 預設 | 說明 |
|---|---|---|---|
| status | 否 | 全部 | `active` 或 `disabled` |

#### Response `200`

```json
{
  "data": {
    "items": [
      {
        "tool_provider_id": "tp_email",
        "tenant_id": "tenant_acme",
        "name": "Email Gateway",
        "provider_type": "mcp_server",
        "endpoint_url": "https://mcp-email.example.com/rpc",
        "auth_ref": "bearer:MCP_API_TOKEN",
        "visibility_policy_ref": null,
        "execution_policy_ref": null,
        "status": "active",
        "created_at": "2026-03-31T12:34:56Z",
        "updated_at": "2026-03-31T12:34:56Z"
      }
    ],
    "page_info": {
      "next_cursor": null
    }
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 4.11 建立 Tool Provider

`POST /api/v1/tool-providers`

#### Request

```json
{
  "tool_provider_id": "tp_secure_admin",
  "name": "Secure MCP Admin",
  "provider_type": "mcp_server",
  "endpoint_url": "https://secure-admin.example.com/mcp",
  "auth_ref": "bearer:MCP_API_TOKEN",
  "status": "active"
}
```

#### 驗證規則

- `name` 必填
- `provider_type` 僅支援：`mcp_server` | `mcp_portal` | `http_api`
- `endpoint_url` 必填
- `status` 若提供，僅支援：`active` | `disabled`
- `auth_ref`、`visibility_policy_ref`、`execution_policy_ref` 若提供空字串，會正規化為 `null`

#### Response `201`

回應格式同 `GET /api/v1/tool-providers` 中的單筆 tool provider 物件。

### 4.12 停用 Tool Provider

`POST /api/v1/tool-providers/{tool_provider_id}:disable`

#### 規則

- 若 tool provider 已是 `disabled`，仍回傳 `200`
- 停用後，`GET /api/v1/mcp/{toolProviderId}` 與 `POST /api/v1/mcp/{toolProviderId}` 應回 `422 policy_denied`

#### Response `200`

回應格式同 `GET /api/v1/tool-providers` 中的單筆 tool provider 物件，但 `status = disabled`。

### 4.13 查詢單個 Tool Provider

`GET /api/v1/tool-providers/{tool_provider_id}`

#### Response `200`

回應格式同 `GET /api/v1/tool-providers` 中的單筆 tool provider 物件。

### 4.14 更新 Tool Provider

`POST /api/v1/tool-providers/{tool_provider_id}`

#### Request

```json
{
  "endpoint_url": "https://secure-admin-updated.example.com/mcp",
  "auth_ref": "header:X-Api-Key:A2A_SHARED_KEY",
  "status": "active"
}
```

#### 驗證規則

- 至少必須提供一個欄位
- `name` 若提供，不可為空字串
- `provider_type` 若提供，僅支援：`mcp_server` | `mcp_portal` | `http_api`
- `endpoint_url` 若提供，不可為空字串
- `status` 若提供，僅支援：`active` | `disabled`
- `auth_ref`、`visibility_policy_ref`、`execution_policy_ref` 若提供空字串，會正規化為 `null`

#### Response `200`

回應格式同 `GET /api/v1/tool-providers` 中的單筆 tool provider 物件。

## 5. A2A Gateway 契約

### 5.1 Agent Card

`GET /.well-known/agent-card.json`

MVP 至少包含：

- `endpoints.*` 在真實回應中會帶上當前 origin，形成絕對 URL
- 下方 JSON 僅示意路徑結構

```json
{
  "name": "Agent Control Plane Gateway",
  "version": "0.1.0",
  "capabilities": {
    "tasks": true,
    "streaming": true
  },
  "endpoints": {
    "message_send": "/api/v1/a2a/message:send",
    "message_stream": "/api/v1/a2a/message:stream",
    "task_get": "/api/v1/a2a/tasks/{id}",
    "task_cancel": "/api/v1/a2a/tasks/{id}:cancel"
  }
}
```

### 5.1.1 Message Stream 目前實作狀態

`GET /api/v1/a2a/message:stream`

當前 MVP 會回傳最小可用的 SSE snapshot stream。  
Agent Card 中 `capabilities.streaming = true`，呼叫端可以透過 `message_stream` endpoint 取得目前 tenant 下最近 A2A tasks 的快照。

SSE 事件順序：

- `ready`：回傳 endpoint、transport、request_id、trace_id 與 tenant_id
- `snapshot`：回傳最近 task 快照，包含 task 狀態、run 狀態與 artifact 清單

HTTP status：`200`

Response headers 至少包含：

- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache, no-transform`

### 5.2 接收訊息

`POST /api/v1/a2a/message:send`

#### Request

```json
{
  "message_id": "msg_remote_001",
  "task_id": "task_remote_001",
  "conversation_id": "conv_remote_001",
  "sender": {
    "agent_id": "agent_supplier_analysis"
  },
  "target": {
    "agent_id": "agent_control_plane"
  },
  "content": {
    "type": "text",
    "text": "請分析供應商 A 與 B 的報價差異"
  },
  "metadata": {
    "remote_endpoint": "https://remote-agent.example.com",
    "trace_id": "trc_remote_001"
  }
}
```

#### 處理規則

- 若 `task_id` 第一次出現，建立新的 local run 與 `a2a_tasks` 映射。
- 若為已存在 task 的續談，附加到既有 run thread。
- 需保存 `remote_task_id`、`remote_message_id` 與 `remote_agent_endpoint`。
- 需帶 `Idempotency-Key`
- 若命中冪等重放且 payload 相同，回既有 task 視圖

#### Response `202`

```json
{
  "data": {
    "accepted": true,
    "task_id": "task_01JQ...",
    "run_id": "run_01JQ...",
    "status": "in_progress",
    "trace_id": "trc_01JQ...",
    "created_at": "2026-03-31T12:34:56Z"
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 5.3 查詢 Task

`GET /api/v1/a2a/tasks/{id}`

#### 規則

- 若 run 已進入 `completed` / `failed` / `cancelled`，task 查詢會優先回傳對應終態
- 否則回傳 `a2a_tasks.status`

#### Response 最小欄位

```json
{
  "data": {
    "task_id": "task_remote_001",
    "status": "in_progress",
    "run_id": "run_01JQ...",
    "last_message_at": "2026-03-31T12:36:00Z"
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 5.4 取消 Task

`POST /api/v1/a2a/tasks/{id}:cancel`

- 若尚未進入不可逆 side effect，可轉移 run 到 `cancelled`
- 若已進入外部 side effect 執行中，需回 `409 invalid_state_transition`

#### Response `200`

```json
{
  "data": {
    "task_id": "task_01JQ...",
    "run_id": "run_01JQ...",
    "status": "cancelled",
    "cancelled_at": "2026-03-31T12:37:00Z"
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 5.5 接收遠端 Task 狀態回推

`POST /api/v1/a2a/webhooks/push`

#### Request

```json
{
  "task_id": "task_local_001",
  "status": "completed",
  "message_id": "msg_remote_done_001",
  "artifact": {
    "summary": "remote analysis finished",
    "vendor_count": 2
  }
}
```

#### 規則

- `task_id` 或 `remote_task_id` 至少必須提供一個
- 若兩者都不存在，回 `400 invalid_request`
- 若查不到對應 task，回 `404 task_not_found`
- webhook 更新會先寫回 `a2a_tasks.status`
- 若 Workflow 尚未終態，系統會再送出 `a2a.task.status` signal
- 若 payload 帶 `artifact`，Workflow 可將其落到 R2 / `artifacts`

#### Response `200`

```json
{
  "data": {
    "accepted": true,
    "task_id": "task_local_001",
    "run_id": "run_01JQ...",
    "status": "completed",
    "updated_at": "2026-03-31T12:40:00Z"
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

### 5.6 Outbound A2A 補充約定

當 run context 內包含：

```json
{
  "a2a_dispatch": {
    "tool_provider_id": "tp_remote_agent",
    "agent_id": "agent_remote"
  }
}
```

當 `tool_provider_id` 存在時，系統會先從當前 tenant 的 `tool_providers` 解析 `endpoint_url`、`auth_ref` 與 `status`，目前要求該 provider 必須是啟用中的 `http_api`，且 outbound 用到的 HTTP(S) endpoint 必須是 `https://`。

若未提供 `tool_provider_id`，目前只允許 `mock://` 或 `demo://` 類型的直接 outbound endpoint，方便本地開發與 smoke 驗證；HTTP(S) 直連目標會在 `POST /api/v1/runs` 入口被拒絕。

解析出的 `auth_ref` 目前支援：

- `<SECRET_BINDING_NAME>`：注入 `Authorization: Bearer <secret>`
- `bearer:<SECRET_BINDING_NAME>`：注入 `Authorization: Bearer <secret>`
- `header:<Header-Name>:<SECRET_BINDING_NAME>`：注入自定義 header

當解析出的 `endpoint_url` 是 HTTPS 遠端目標時，MVP 目前會先嘗試讀取同 origin 的 `/.well-known/agent-card.json`，且不跟隨 redirect。若其中存在同 origin 的 `endpoints.message_send`，就以該 endpoint 作為實際發送地址；若 card 取回失敗，或 card URL 本身落到不同 origin，則回退到 provider 上配置的 `endpoint_url`。但若 card 成功取回、卻缺少有效的同 origin `message_send`，dispatch 會直接失敗，不再靜默回退。這個 card cache 只作為 Worker 內的 soft state，不影響 D1 中的 `a2a_tasks`、run step 與 audit 記錄。

## 6. MCP Proxy 契約

### 6.1 入口

- `POST /api/v1/mcp/{toolProviderId}`
- `GET /api/v1/mcp/{toolProviderId}` 用於 SSE 或 streamable HTTP

#### 當前 MVP 行為

- `POST` 為主要可用入口
- `GET` 會回傳最小 SSE ready stream，HTTP status 為 `200`
- 若 tool provider 已停用，`GET` 與 `POST` 都會回 `422 policy_denied`

### 6.2 Request 模式

MVP 對外維持 JSON-RPC 2.0 透傳，但在入口層先做：

1. 身份驗證
2. tool provider 查找
3. policy pre-check
4. audit envelope 建立
5. upstream 轉發
6. response 審計與標準化錯誤轉換

若 `tool_providers.auth_ref` 有值，upstream 轉發前需先解析並附帶對應的 auth header。  
目前支援格式：

- `<SECRET_BINDING_NAME>`
- `bearer:<SECRET_BINDING_NAME>`
- `header:<Header-Name>:<SECRET_BINDING_NAME>`

#### 透傳請求示例

```json
{
  "jsonrpc": "2.0",
  "id": "rpc_01",
  "method": "tools/call",
  "params": {
    "name": "send_email",
    "arguments": {
      "to": "vendor@example.com",
      "subject": "Price Difference Summary"
    }
  }
}
```

### 6.3 `tools/list` 規則

- 先按 tenant、agent、policy 過濾不可見工具
- policy 來源優先讀取 D1 `policies` 表；若無命中，再走平台預設 fallback 規則
- 回傳前補上平台 metadata：
  - `risk_level`
  - `requires_approval`
  - `provider_id`

### 6.4 `tools/call` 規則

- 每次 `tools/call` 必須建立 `mcp_calls` 索引與 raw payload blob
- 呼叫方必須帶 `X-Run-Id`，且該 run 必須存在於目前 tenant；否則回 `404 run_not_found`
- `tools/call` 與 `tools/list` 必須共用同一套 D1 policy 決策邏輯，避免可見性與實際執行結果不一致
- policy 決策結果只能是：
  - `allow`
  - `deny`
  - `approval_required`
- 若為 `approval_required`，proxy 不直接轉發，回：

```json
{
  "error": {
    "code": "approval_required",
    "message": "This tool call requires human approval",
    "details": {
      "approval_id": "apr_01JQ..."
    }
  },
  "meta": {
    "request_id": "req_01JQ...",
    "trace_id": "trc_01JQ..."
  }
}
```

## 7. 狀態列舉

### 7.1 Run Status

- `queued`
- `running`
- `waiting_approval`
- `completed`
- `failed`
- `cancelled`

### 7.2 Step Status

- `pending`
- `running`
- `completed`
- `failed`
- `cancelled`
- `blocked`

### 7.3 Approval Status

- `pending`
- `approved`
- `rejected`
- `expired`
- `cancelled`

## 8. 最小測試清單

- `POST /runs` 在相同 `Idempotency-Key` 下重試，不得建立兩個 run
- `GET /runs/{id}` 必須返回 trace_id、workflow_status、pending_approval_id
- `POST /approvals/{id}/decision` 在已決策後再次提交，必須回 `409 approval_already_decided`
- `tools/list` 必須能按 policy 隱藏工具
- `tools/call` 命中 `approval_required` 時，不得呼叫上游 MCP server
