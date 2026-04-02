# Govrail 事故處置清單

交付對象：SRE / oncall / Platform  
版本：v0.1  
日期：2026-04-01

## 1. 目的

這份清單是給 oncall 直接照著跑的，不是長篇 runbook。目標是讓事故處置先穩住、再判斷要不要升級。

## 2. 第一分鐘

- 確認是否是 `staging` 還是 `production`
- 記下 `base_url`
- 記下 `trace_id`
- 記下失敗端點與 HTTP status
- 看最近一次 deploy 或 verify 是否剛發生

## 3. 十分鐘內

- 對照 `README.md` 的 current status 與 known gaps
- 打開 [docs/observability_alerting_baseline_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/observability_alerting_baseline_zh.md)
- 打開 [docs/observability_integration_manifest.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/observability_integration_manifest.example.json)
- 打開 [docs/ops_handoff_summary_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/ops_handoff_summary_zh.md)
- 打開 [docs/final_delivery_summary_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/final_delivery_summary_zh.md)
- 看是 `401` / `403` / `429` / `5xx` 哪一類

## 4. 分流判斷

- `401` / `403`
  - 優先看 ingress / Access / header mapping
- `429`
  - 優先看 tenant 限流配置與當前流量
- `5xx`
  - 優先看 Worker logs、最近 deploy、D1 / R2 / Queue / Workflow 狀態
- `approval timeout`
  - 優先看審批流程與 pending approvals
- `MCP upstream auth` 錯誤
  - 優先看 `auth_ref`、secret binding、provider 變更

## 5. 必記欄位

- `alert_rule_id`
- `alert_route_id`
- `check_id`
- `environment`
- `service`
- `timestamp`
- `request_id` (若可取得)
- `tenant_id`
- `trace_id`
- `run_id`
- `approval_id`
- `tool_provider_id`
- `policy_id`
- `verify_output_path`
- `deploy_version_id`

## 5.1 最小證據包（建議 JSON）

事故期間請盡量產出一份可機器讀取的 evidence JSON（不要只截圖）。下面欄位與 `observability_integration_manifest.example.json` 的 evidence contract 對齊：

```json
{
  "service": "govrail-control-plane",
  "environment": "production",
  "timestamp": "2026-04-02T00:00:00.000Z",
  "base_url": "https://<worker>",
  "tenant_id": "tenant_prod",
  "alert_rule_id": "health_5xx_burst",
  "alert_route_id": "page_primary",
  "check_id": "health_global",
  "request_id": "<optional>",
  "trace_id": "<trace>",
  "run_id": "<optional>",
  "approval_id": "<optional>",
  "tool_provider_id": "<optional>",
  "policy_id": "<optional>",
  "verify_output_path": "<optional>",
  "deploy_version_id": "<optional>",
  "notes": "Short human summary + what changed + scope"
}
```

## 6. 路由與升級

- `page`
  - 10 分鐘內要有 ack，15 分鐘內沒有 owner 就升級 secondary
- `ticket`
  - 當班先補證據與環境資訊，1 個工作日內要有人接手
- `info`
  - 只記錄趨勢與背景，不打斷當班

如果告警是 synthetic check 觸發：

- 先在 manifest 裡找到對應 `check_id`
- 確認 header、tenant、environment 是否與預期一致
- 保存 synthetic summary 或 verify summary，避免只截圖不留證據

## 7. 事故後收尾

- 更新摘要到 ops handoff
- 如果是配置問題，標記對應環境與修正項
- 如果是流程問題，補到 observability 或 release checklist
- 如果是重複問題，升級成 ticket 或 follow-up task

## 8. 需要 page 的情況

- 5 分鐘內 health 持續失敗
- production readonly verify 連續失敗
- run create 5xx 明顯升高
- workflow failure ratio 突增
- 任何影響 production tenant 的認證或入口失效
