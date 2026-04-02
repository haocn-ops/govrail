# Govrail Policy 與 Approval 補充規格（MVP）

交付對象：Security / Platform / Gateway / Admin UI 工程師  
版本：v0.1  
日期：2026-03-31

## 1. 文檔目的

本文件將主規格中的「治理原則」落地為可執行的 policy 與 approval 規則，定義匹配維度、決策順序、approval 物件內容、審計要求與 MVP 預設策略。

## 2. 核心原則

- 所有 side effect 都必須走 gateway 的統一決策路徑
- policy 的輸出只允許：`allow`、`deny`、`approval_required`
- `approval_required` 不是 UI 提示，而是實際阻斷執行
- 審批決策本身也必須可審計、可追溯、可重放驗證

## 3. Policy 模型

### 3.1 MVP Policy 結構

```json
{
  "policy_id": "pol_send_email_external_v1",
  "tenant_id": "tenant_acme",
  "scope": {
    "channel": "mcp_tool_call",
    "tool_provider_id": "tp_email",
    "tool_name": "send_email"
  },
  "conditions": {
    "target_classification": "external",
    "risk_level": "high"
  },
  "decision": "approval_required",
  "approval_config": {
    "approver_roles": ["legal_approver"],
    "timeout_seconds": 86400
  },
  "priority": 100,
  "status": "active"
}
```

### 3.2 匹配維度

MVP 至少支援以下條件：

| 維度 | 示例 |
|---|---|
| tenant_id | `tenant_acme` |
| channel | `mcp_tool_call` / `a2a_dispatch` / `external_action` |
| agent_id | `agent_procurement_planner` |
| tool_provider_id | `tp_email` |
| tool_name | `send_email` |
| action_name | `erp_update_vendor` |
| risk_level | `low` / `medium` / `high` |
| target_classification | `internal` / `external` / `restricted` |
| labels | `finance`, `legal`, `pii` |

### 3.3 決策優先序

1. `deny`
2. `approval_required`
3. `allow`
4. 無命中時使用預設政策

若有多條命中同一請求，按：

1. `priority` 高者優先
2. 條件更具體者優先
3. 若仍衝突，以更嚴格結果優先

## 4. Enforcement Points

### 4.1 `tools/list`

目的：控制可見性，而不是只在真正執行時再處理。

規則：

- 若 policy 對某工具為 `deny`，則在 `tools/list` 直接隱藏
- 若為 `approval_required`，工具仍可見，但 metadata 必須標示需要審批
- 若工具本身屬禁用 provider，整個 provider 返回空列表或 `403`

### 4.2 `tools/call`

目的：控制真正 side effect 的執行。

規則：

- `allow`：直接轉發並審計
- `deny`：不轉發，回 `422 policy_denied`
- `approval_required`：建立 approval，回 `423 approval_required`

### 4.3 A2A outbound dispatch

對高風險 agent 協作也應套用 policy，尤其是：

- 會觸發外部資料傳遞的 agent
- 會代表本系統執行 side effect 的 agent
- 具跨租戶或跨信任域風險的 agent

MVP 目前已在 workflow 內落地最小 enforcement：

- provider-backed outbound A2A 會先以 `channel = a2a_dispatch` + `tool_provider_id` 查 active policy
- A2A outbound 目前已支援 `conditions_json.labels` 與 `conditions_json.risk_level` 的匹配；`target_classification` 等其他條件尚未納入 A2A dispatch evaluator
- 命中 `deny` 時直接阻斷 dispatch，run 進入 `failed` 並記 `side_effect_blocked`
- 命中 `approval_required` 時建立 approval，待決後才允許繼續 outbound
- 未命中 provider-scoped policy 時，暫仍保留既有 heuristic fallback 作為最小預設策略

## 5. Approval 物件要求

### 5.1 最小欄位

approval 建立時至少保存：

- `approval_id`
- `tenant_id`
- `run_id`
- `step_id`
- `policy_id`
- `subject_type`
- `subject_ref`
- `requested_by`
- `approver_scope_json`
- `status = pending`
- `expires_at`

### 5.2 Approval Payload 摘要

approval 詳情應保存足夠審批但不過量的上下文：

```json
{
  "summary": {
    "action": "send_email",
    "provider": "tp_email",
    "risk_level": "high",
    "reason": "recipient is external"
  },
  "subject_snapshot": {
    "to": ["vendor@example.com"],
    "subject": "Price Difference Summary"
  },
  "trace": {
    "trace_id": "trc_01JQ...",
    "run_id": "run_01JQ...",
    "step_id": "step_01JQ..."
  }
}
```

完整原始 payload 仍應放 R2，不直接塞進 D1。

MVP 目前已在 workflow 內落地最小 approval payload 摘要落盤：命中 `approval_required` 時，會先把 `summary`、`subject_snapshot`、`trace` 寫入 R2 audit 物件，再只在 D1 approval 列保留最小索引欄位。

對 provider-backed A2A outbound dispatch，這份摘要目前至少會保存 `tool_provider_id`、`agent_id`、`endpoint_url`、`risk_level` 與最小原因說明，供人工審批使用。

## 6. Approval 決策規則

### 6.1 Approver 檢查

決策時需同時驗證：

- 決策人屬於相同 tenant
- 決策人命中 `approver_roles` 或其他 scope
- approval 仍為 `pending`
- 未超過 `expires_at`

### 6.2 決策結果

- `approved`：允許 workflow 繼續
- `rejected`：workflow 終止為 `failed`
- `expired`：由排程器或 workflow timeout 轉移為 `expired`
- `cancelled`：上游 run 被取消時同步取消

MVP 目前 workflow 的 approval 等待時間已對齊命中 policy 的 `approval_config.timeout_seconds`；若未配置，才回退到系統預設值。

MVP 目前由 workflow timeout 直接將 approval 轉為 `expired`，並同步將 run 標記為 `failed`、`error_code = approval_expired`。

### 6.3 Rejection 語義

MVP 約定：

- approval 被 `rejected` 後，不做自動 fallback
- run 狀態轉為 `failed`
- `error_code` 建議使用 `approval_rejected`

## 7. 審計事件

### 7.1 必須記錄的事件類型

- `policy_evaluated`
- `approval_created`
- `approval_decided`
- `approval_expired`
- `approval_cancelled`
- `side_effect_blocked`
- `side_effect_executed`

### 7.2 最小審計事件格式

```json
{
  "event_id": "evt_01JQ...",
  "tenant_id": "tenant_acme",
  "run_id": "run_01JQ...",
  "step_id": "step_01JQ...",
  "trace_id": "trc_01JQ...",
  "event_type": "approval_created",
  "created_at": "2026-03-31T12:35:10Z",
  "actor": {
    "type": "system",
    "ref": "gateway"
  },
  "payload": {
    "approval_id": "apr_01JQ...",
    "policy_id": "pol_send_email_external_v1"
  }
}
```

## 8. 預設政策建議

### 8.1 預設允許

下列行為可預設 `allow`：

- 無外部副作用的讀取型 MCP 工具
- 僅查詢 run graph、artifact metadata 的查詢 API
- 低風險、同租戶、內部資料讀取

### 8.2 預設審批

下列行為預設 `approval_required`：

- 外發郵件
- 對 ERP / CRM / 工單系統寫入
- 對外部 API 執行 create/update/delete
- 觸及 PII、法務、財務敏感資料的外傳

### 8.3 預設拒絕

下列行為預設 `deny`：

- 跨 tenant 存取
- 未註冊 tool provider 的執行請求
- 無法識別身份或無法判定風險的高權限操作

## 9. Admin 配置最小需求

MVP 的 policy 管理面至少能做到：

- 建立與停用 policy
- 按 tenant 查詢 policy
- 查看 policy 命中紀錄
- 查看 approval 列表與決策紀錄

不要求第一版就完成複雜 rule builder，但資料模型需預留：

- `priority`
- `status`
- `conditions_json`
- `approval_config_json`

## 10. 與 UI / Workflow 的契合要求

- Approval UI 必須能顯示摘要、風險理由、請求人、到期時間
- UI 的 approve/reject 操作必須帶 `Idempotency-Key`
- Workflow 恢復必須依賴後端 signal，不依賴前端輪詢

## 11. 最小測試清單

- `tools/list` 對 `deny` 工具必須不可見
- `tools/call` 命中 `approval_required` 時，必須建立 approval 且不觸發上游 side effect
- provider-scoped `a2a_dispatch` 命中 `approval_required` 時，必須建立 approval 且在核准前不得發出 outbound 請求
- provider-scoped `a2a_dispatch` 命中 `deny` 時，workflow 必須終止為 `failed`，且不得建立 outbound task
- provider-scoped `a2a_dispatch` 的 `labels` / `risk_level` 條件不命中時，不得誤觸發 approval 或 deny
- 無 approver 權限的使用者不得決策 approval
- 已過期 approval 不得被批准
- `approval_rejected` 後 run 必須進入終態，不得自動繼續
