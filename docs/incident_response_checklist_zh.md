# Agent Control Plane 事故處置清單

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

- `tenant_id`
- `trace_id`
- `run_id`
- `approval_id`
- `tool_provider_id`
- `policy_id`
- `verify_output_path`
- `deploy version id`

## 6. 事故後收尾

- 更新摘要到 ops handoff
- 如果是配置問題，標記對應環境與修正項
- 如果是流程問題，補到 observability 或 release checklist
- 如果是重複問題，升級成 ticket 或 follow-up task

## 7. 需要 page 的情況

- 5 分鐘內 health 持續失敗
- production readonly verify 連續失敗
- run create 5xx 明顯升高
- workflow failure ratio 突增
- 任何影響 production tenant 的認證或入口失效
