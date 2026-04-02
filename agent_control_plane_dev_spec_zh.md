# Govrail 開發規格書（Cloudflare 版 MVP）

交付對象：Codex / 工程團隊  
版本：v0.1  
日期：2026-04-01

## 文檔用途

本文件用於指導第一版 Govrail 的工程實作。重點不是自建新的 agent 協議，而是在現有 A2A、MCP 與 Cloudflare 基礎設施之上，構建一層可安全、可治理、可追蹤的控制平面。

### 配套工程文檔

以下補充文檔用於把本規格細化到可並行開發的粒度：

- `docs/api_contract_spec_zh.md`：定義 API request / response、錯誤碼、認證與冪等規則。
- `docs/data_model_state_machine_spec_zh.md`：定義 D1 實體、索引、DO 熱狀態、R2 key 與狀態機。
- `docs/policy_approval_spec_zh.md`：定義 policy 決策、approval 結構、審計事件與預設治理策略。
- `docs/deployment_runbook_zh.md`：定義 Cloudflare 資源準備、部署前檢查、最小驗收流程與常見排障步驟。
- `docs/release_checklist_zh.md`：定義 staging / production 發版前後的可勾選檢查清單。
- `docs/flow_failure_runbook_zh.md`：定義端到端時序、run/approval 狀態轉移、失敗碼與證據定位方式。
- `docs/environment_config_runbook_zh.md`：定義 staging/production 的 wrangler 多環境配置、seed 匯入與 secrets 管理原則。
- `docs/tenant_onboarding_runbook_zh.md`：定義新 tenant 接入、最小驗收出口、回滾與交接要求。
- `docs/implementation_status_matrix_zh.md`：集中標示哪些能力已實作、哪些仍為佔位或保留欄位。

若是第一次接手此倉庫，建議先看：

- `README.md`
- `docs/README.md`
- `docs/implementation_status_matrix_zh.md`

目前倉庫也已提供預設 seed SQL 生成腳本，可用於初始化 tenant 的 `tool_providers` 與 `policies`：

- `npm run seed:sql -- --tenant-id <tenant_id>`

目前建議的驗證入口為：

- `npm run verify:local`
- `npm run verify:build`
- `npm run post-deploy:verify`
- `npm run post-deploy:verify:readonly`

## 一頁結論

- 產品定位：企業級 agent control plane 產品 Govrail，而不是新的 agent framework 或新的通信協議。
- 技術基座：Cloudflare Workers + Durable Objects + Workflows + Queues + D1 + R2。
- 互通邊界：對 agent 使用 A2A，對 tools / resources 使用 MCP。
- 治理原則：所有 side effects 經由 gateway；所有 execution 必須有 trace；所有高風險動作可 pause / approval / resume。
- MVP 目標：6 週內交付可跑的控制平面骨架，支援 run 建立、A2A 任務派發、MCP proxy、approval、artifact/audit、run graph。

## 1. 產品定位與範圍

Govrail 位於 OpenAI Agents、LangGraph、Microsoft Agent Framework 與自研 agents 之上，負責統一身份、路由、治理、審計與可觀測性。

本產品不負責自建模型託管，不負責重新發明 workflow engine，也不負責創造新的標準協議。它的任務是將現有 agent 生態接入一個統一、可控制的作業平面。

### 1.1 MVP 內建能力

- Northbound API：建立 / 查詢 / 重播 run。
- A2A Adapter：inbound / outbound task handling，支援 Agent Card、message:send、task status。
- MCP Proxy：集中轉發與過濾 tools/list、tools/call，並寫入審計索引。
- Approval Flow：高風險動作可轉為人工審批，審批後繼續執行。
- Run Graph / Artifact / Audit：完整記錄每次 hop、tool call、approval、產出物。

### 1.2 明確不做

- 新的 agent-to-agent 協議。
- 新的 agent-to-tool 協議。
- 通用型 workflow 引擎。
- 模型 hosting 平台。
- 大型公開 agent marketplace。

## 2. 總體架構

核心原則：Control plane 跑在 Cloudflare；agent 可以跑在 Cloudflare，也可以跑在外部。互通靠 A2A / MCP，治理靠 gateway、policy、approval、audit。

### 2.1 邏輯架構圖

```text
Users / Apps / Admin UI
        |
   Workers API Layer
        |
  +-----+----------------------+----------------------+
  |                            |                      |
Run Workflow             A2A Adapter             MCP Proxy
  |                            |                      |
Durable Objects          External Agents         MCP Portal / MCP Servers
  |                            |                      |
 D1 (index/state)             Queues               AI Gateway
  |
 R2 (artifacts/audit blobs)  + Analytics Engine
```

### 2.2 元件職責

| 元件 | 主要責任 | 資料特性 |
|---|---|---|
| Workers API | Northbound API、A2A/MCP 邊界、身份驗證、路由 | 無狀態請求處理 |
| Durable Objects | run / approval 熱狀態、互斥、去重、推播協調 | 強一致、單執行緒、短熱狀態 |
| Workflows | 長任務、重試、等待審批、恢復執行 | 持久化執行狀態 |
| D1 | catalog、run index、step index、approval index | 結構化索引與業務態 |
| R2 | artifact、raw payload、audit blob、replay bundle | 大物件、不可變資料 |
| Queues | 非同步派發、webhook 正規化、重試 | at-least-once，需冪等 |
| Analytics Engine | usage/cost/latency 指標聚合 | 高基數分析，不作最終審計真相 |

## 3. 請求生命週期

1. 使用者或外部系統向 Workers API 發送請求，建立 run_id 與 trace_id。
2. Workers 在 D1 建立 runs 索引，並初始化 RunCoordinator Durable Object。
3. RunWorkflow 啟動，根據 catalog / policy 決定要調用哪些 agent 與 tool provider。
4. 若需與其他 agent 協作，透過 A2A Adapter 派發 task；若需調工具，統一走 MCP Proxy。
5. 若命中高風險 side effect（例如外發郵件、寫 ERP、對外 API 修改），轉為 approval_required。
6. 審批通過後 Workflow 恢復執行，最終將 artifact 寫入 R2，並更新 D1 索引與 run 狀態。
7. 整條鏈路的 step、approval、artifact、指標與 audit pointer 都可以在 run graph 追溯。

### 3.1 示例：採購差異分析 → 法務審核 → 對外寄送

- Planner agent 根據用戶指令分配給採購分析 agent。
- 採購分析 agent 經 MCP Proxy 讀取 ERP/BI 工具。
- 系統判定「外發郵件」屬高風險 side effect，建立 approval。
- 法務 approver 通過 UI 批准後，Workflow 繼續。
- Legal review agent 修正文案，輸出 email draft artifact。
- 最終寄送操作仍經 gateway 執行，形成完整 audit trail。

## 4. 核心資料模型

### 4.1 主要實體

| 實體 | 用途 | 建議主鍵 | 主要儲存位置 |
|---|---|---|---|
| Agent | 註冊 agent 身份、framework、endpoint、owner | agent_id | D1 |
| ToolProvider | MCP portal / MCP server / HTTP API 設定 | tool_provider_id | D1 |
| Run | 一次業務請求的總執行實體 | run_id | D1 + DO |
| RunStep | 執行鏈上的單一步驟 | step_id | D1 |
| Approval | 待審批或已決策節點 | approval_id | D1 + DO |
| Artifact | 輸出物或審計包 | artifact_id | D1 index + R2 blob |
| A2ATask | 內外 task 對照與狀態同步 | task_id | D1 |
| MCPCall | 每次工具呼叫索引 | call_id | D1 index + R2 payload |

### 4.2 儲存分層原則

- D1：只放索引、主資料與業務狀態，不放大型 raw payload。
- R2：放 artifact、raw input/output、audit 原文、replay bundle。
- Durable Objects：只放熱狀態，例如 pending approvals、last sequence、idempotency map。
- Analytics Engine：只放聚合指標，不作最終稽核真相來源。

## 5. API 與互通邊界

### 5.1 Northbound API

| Method | Path | 用途 |
|---|---|---|
| POST | /runs | 建立 run，啟動 Workflow |
| GET | /runs/{run_id} | 查詢 run 狀態、workflow status、coordinator 狀態 |
| GET | /runs/{run_id}/graph | 查詢 run steps、approvals、artifacts |
| POST | /approvals/{approval_id}/decision | 人審批准或拒絕，喚醒 Workflow |
| POST | /runs/{run_id}/replay | 以既有輸入與策略重播 |

### 5.2 A2A 邊界

- GET `/.well-known/agent-card.json`：暴露本系統作為 A2A agent gateway 的 Agent Card。
- POST `/a2a/message:send`：接收新 task 或續談 message，映射到 local run。
- POST `/a2a/message:stream`：SSE 方式返回 task 狀態 / 產物更新。
- GET `/a2a/tasks/{id}`：查詢 task 狀態。
- POST `/a2a/tasks/{id}:cancel`：取消任務。
- POST `/a2a/webhooks/push`：接收遠端 agent 的 push 通知。

### 5.3 MCP 邊界

- POST `/mcp/{toolProviderId}`：代理 JSON-RPC 請求，例如 initialize、tools/list、tools/call。
- GET `/mcp/{toolProviderId}`：在需要時承接 SSE / streamable HTTP。
- 治理要點：先在 tools/list 做可見性過濾，再在 tools/call 做 allow / deny / approval_required。

## 6. 安全與治理原則

| 原則 | 說明 |
|---|---|
| 所有 side effect 必須經 gateway | 避免 agent 直接繞過政策與審計層。 |
| 所有執行都要有 trace_id | 確保整條 hop chain 可追蹤。 |
| 所有憑證短期化 | 不要把長期 token 寫進 agent code、Agent Card 或工具 schema。 |
| 所有高風險動作可 pause | 必須支援 human approval 後 resume。 |
| Queue consumer 必須冪等 | 因 Queues 為 at-least-once delivery。 |

### 6.1 第一版風險清單

- 風險：將 raw audit 全灌進 D1。處置：D1 僅存索引，blob 存 R2。
- 風險：把 approval / grant 放在 KV。處置：關鍵狀態只放 DO 或 D1。
- 風險：Queue 重送導致重複 side effect。處置：每次派發必帶 idempotency_key。
- 風險：MCP portal 只是隱藏 UI，而非真正控制入口。處置：Access / OAuth 要成為真正的 enforcement path。

## 7. 6 週 MVP 計畫

| 週次 | 交付目標 | 完成標準 |
|---|---|---|
| 第 1 週 | 定義資料模型與 threat model | Run / Step / Approval / Artifact / A2ATask / MCPCall schema 定稿 |
| 第 2 週 | 完成 Catalog 與 Agent / ToolProvider 註冊 | 可按 capability 與租戶查詢 agent / tool |
| 第 3 週 | 完成 Gateway v1 | A2A send / task query 與 MCP proxy POST 可用 |
| 第 4 週 | 完成 Approval + Workflow 恢復 | 高風險動作可 pause / approve / resume |
| 第 5 週 | 完成 Run Graph + Audit + Artifact | 可查看整條執行鏈與主要輸出物 |
| 第 6 週 | 打通真實業務示例 | 至少一條企業流程端到端演示成功 |

## 8. 建議工程骨架

```text
agent-control-plane/
  wrangler.jsonc
  migrations/
    0000_init.sql
  src/
    index.ts
    types.ts
    lib/
      db.ts
      ids.ts
    durable/
      run-coordinator.ts
      approval-session.ts
    workflows/
      run-workflow.ts
    a2a/
      agent-card.ts
      inbound.ts
      outbound.ts
    mcp/
      proxy.ts
```

### 8.1 實作順序建議

- 先做 /runs、/approvals，再做 Workflow 與 DO。
- 再補 A2A inbound（agent-card.json、message:send、tasks/{id}）。
- 接著做 A2A outbound 的 card cache + remote send。
- 最後加 MCP proxy、tools/list 過濾與 tools/call 審計。

## 9. 驗收標準

- 建立 run 後，可在 3 秒內查到初始狀態與 workflow instance。
- 至少支援一條 A2A 派發鏈路與一條 MCP 工具調用鏈路。
- 高風險動作必須能進入 waiting_approval，批准後可恢復完成。
- 每個 run 至少有 steps、artifacts、主要 audit pointer。
- 所有 Queue side effect 均以 idempotency_key 防重。

## 附錄 A：交付給 Codex 的任務說明模板

- 請先按本文件建立 Cloudflare Workers 專案骨架與 wrangler 配置。
- 先完成 D1 migration 與最小可運行路由：POST /runs、GET /runs/{id}、POST /approvals/{id}/decision。
- 再補 Durable Objects：RunCoordinator、ApprovalSession。
- 再補 RunWorkflow，要求可等待 approval event 後恢復。
- 最後完成 A2A inbound/outbound 與 MCP proxy。
