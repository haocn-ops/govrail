# Agent Control Plane 可觀測性與告警基線（MVP）

交付對象：SRE / Platform / oncall 工程師  
版本：v0.1  
日期：2026-04-01

## 1. 文檔目的

這份文檔不是監控系統實作，也不是警報平台整合手冊。它的目標很單純：把 Agent Control Plane 的最小可行 SLI、告警門檻與排障順序定下來，讓後續不管接 Cloudflare Logs、Dashboard、Sentry 還是其他監控平台，都能用同一套語義。

目前倉庫已經具備：

- 結構化 JSON 日誌
- `request_id` / `trace_id`
- `run_id` / `approval_id` / `tool_provider_id`
- `post-deploy:verify` 的結構化驗收 summary
- staging / production 的 write / readonly 驗證入口

這份基線就是把這些證據轉成可操作的 SLI 和告警模板。

## 2. 值班原則

### 2.1 先頁面，後工單

- 會直接影響使用者請求成功率或資料正確性的問題，優先 page
- 會影響某個 tenant 或某個 provider 的局部異常，先開 ticket
- 暫時性的上游抖動，先觀察 15 到 30 分鐘再決定是否升級

### 2.2 黃金訊號

建議所有 dashboard 都先看這四個維度：

- `traffic`
- `errors`
- `latency`
- `saturation`

如果監控平台只能先做一張圖，先把 `errors` 和 `latency` 做出來。

## 3. 核心 SLI

### 3.1 Northbound API

| SLI | 定義 | 建議來源 | 建議門檻 |
|---|---|---|---|
| Health 可用率 | `GET /api/v1/health` 成功率 | Worker logs / synthetic check | 5 分鐘成功率 < 99.5% 頁面；1 小時成功率 < 99.9% 開 ticket |
| 建立 run 成功率 | `POST /api/v1/runs` 成功率 | API logs | 10 分鐘 5xx 比例 > 1% 頁面；429 比例異常升高先看限流配置 |
| Run 完成率 | 成功建立的 run 最終 `completed` 比例 | D1 `runs` + workflow logs | 30 分鐘內 `failed` 比例 > 5% 開 ticket；> 10% 頁面 |
| Replay 成功率 | `POST /api/v1/runs/{id}/replay` 成功率 | API logs | 10 分鐘 5xx 比例 > 1% 頁面 |
| 認證/授權錯誤率 | `401` / `403` 比例 | API logs | 突增通常是入口或 header 配置錯誤；5 分鐘內超過基線 3 倍頁面 |

### 3.2 Workflow / Approval

| SLI | 定義 | 建議來源 | 建議門檻 |
|---|---|---|---|
| Approval 等待時間 | `waiting_approval` 狀態持續時間 | D1 `runs` / `approvals` | 30 分鐘內未決策且數量持續增長，開 ticket；接近 timeout 時頁面 |
| Approval timeout 比例 | `approval_expired` / `approval_created` | audit events | 1 小時內超過 5% 開 ticket；超過 10% 頁面 |
| Workflow 失敗率 | `failed` / `completed + failed + cancelled` | D1 `runs` | 30 分鐘內超過 5% 開 ticket；超過 10% 頁面 |

### 3.3 A2A / MCP

| SLI | 定義 | 建議來源 | 建議門檻 |
|---|---|---|---|
| A2A inbound 成功率 | `POST /api/v1/a2a/message:send` 成功率 | API logs | 10 分鐘 5xx 比例 > 1% 頁面 |
| A2A stream 可用率 | `GET /api/v1/a2a/message:stream` 成功率 | synthetic check | 5 分鐘內 401/5xx 升高，優先檢查入口 header 與 tenant 設定 |
| MCP call 成功率 | `POST /api/v1/mcp/{provider}` 成功率 | API logs | 10 分鐘 5xx 比例 > 1% 頁面 |
| MCP provider 可用率 | `GET /api/v1/mcp/{provider}` ready stream 成功率 | synthetic check | 任一 active provider 連續失敗 3 次開 ticket |
| upstream auth 錯誤率 | `upstream_auth_invalid` / `upstream_auth_not_configured` | API logs | 只要非預期出現就開 ticket；若集中在新 tenant 或新 provider，優先找配置問題 |

### 3.4 Storage / Queue

| SLI | 定義 | 建議來源 | 建議門檻 |
|---|---|---|---|
| Artifact write 成功率 | artifact 寫入成功率 | workflow logs / D1 | 任何連續失敗立即頁面 |
| Queue dedupe 命中率 | duplicate message 比例 | queue consumer logs | 突然大幅上升通常表示上游重送或 idempotency key 發生問題 |
| Invalid queue message 比例 | `invalid_count` / queue batch size | queue consumer logs | > 0 先開 ticket，持續出現再頁面 |

## 4. 建議告警模板

### 4.1 Page 級

- `health_5xx_burst`
  - 條件：5 分鐘內 health 成功率低於 99.5%
  - 第一個動作：確認 Worker 是否整體報錯，對照最近 deploy
- `run_create_error_burst`
  - 條件：10 分鐘內 `POST /api/v1/runs` 5xx 比例高於 1%
  - 第一個動作：看 D1 / workflow / queue 是否異常
- `workflow_failure_spike`
  - 條件：30 分鐘內 run `failed` 比例高於 10%
  - 第一個動作：分辨是 approval、A2A、MCP 還是 artifact 失敗
- `production_readonly_check_failed`
  - 條件：production readonly synthetic check 連續失敗 2 次
  - 第一個動作：先確認 production 入口、證書與 tenant header

### 4.2 Ticket 級

- `approval_backlog_building`
  - 條件：pending approvals 持續增加，且最老一筆超過 30 分鐘
  - 第一個動作：確認是否卡在人審或 approval session
- `mcp_upstream_config_drift`
  - 條件：`upstream_auth_not_configured` 或 `upstream_auth_invalid` 出現
  - 第一個動作：檢查 `auth_ref`、secret binding、provider 變更
- `queue_invalid_message`
  - 條件：consumer 收到 invalid message
  - 第一個動作：回查 queue producer 的 payload schema

## 5. Dashboard 建議版面

### 5.1 第一屏

- `health` 成功率
- `run create` / `replay` 成功率
- `run failed` 比例
- `pending approvals` 數量

### 5.2 第二屏

- A2A inbound / outbound 成功率
- MCP call 成功率
- Artifact write 失敗數
- Queue duplicate / invalid message 數量

### 5.3 第三屏

- 最近 10 次 deploy 與 verify summary
- 最近 24 小時內的 `401` / `403` / `429` / `5xx` 統計
- 最近一次 production readonly verify 結果

## 6. 排障順序

### 6.1 先看什麼

1. 先看最近一次 `deploy` 或 `verify` 是否剛變更
2. 再看 `request_id` / `trace_id`
3. 再看 `run_id` / `approval_id` / `tool_provider_id`
4. 再看 D1 / R2 / Queue / workflow 的對應證據

### 6.2 典型判斷

- `401` / `403` 突增：先看入口層或 header 映射
- `429` 突增：先看限流配置與 tenant 流量
- `5xx` 突增：先看 Worker logs 與最近 deploy
- `approval timeout` 突增：先看人審流程與 approval session
- `MCP upstream auth` 報錯：先看 `auth_ref` 與 secret binding

## 7. 最小落地建議

如果現在只能先做一件事，建議按這個順序：

1. 先做 `health`、`run create`、`read-only production verify` 三個 synthetic check
2. 再把 `run failed`、`approval backlog`、`MCP upstream auth error` 做成 ticket 級告警
3. 最後再補 SLO 和週報趨勢圖

## 8. 交接欄位

每次事故或變更，至少記錄：

- `base_url`
- `tenant_id`
- `trace_id`
- `run_id`
- `approval_id`
- `tool_provider_id`
- `policy_id`
- `verify_output_path`
- `deploy version id`

