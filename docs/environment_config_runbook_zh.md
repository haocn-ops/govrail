# Agent Control Plane 環境配置與 Secrets 手冊（MVP）

交付對象：Platform / SRE / Security / 後端工程師  
版本：v0.1  
日期：2026-04-01

## 1. 文檔目的

本文件說明目前 MVP 在 `dev`、`staging`、`production` 三類環境下，應如何管理：

- Wrangler 多環境配置
- Cloudflare 資源命名
- Worker bindings
- 租戶 seed 與測試資料
- 外部 A2A / MCP 憑證引用策略

本文件的重點不是「未來可能怎麼做」，而是根據目前代碼的真實依賴，給出可直接落地的配置方式。

## 2. 目前代碼的環境依賴現況

### 2.1 已經直接依賴的 Cloudflare bindings

目前 Worker 代碼直接使用以下 bindings：

- `DB`
- `ARTIFACTS_BUCKET`
- `RUN_COORDINATOR`
- `APPROVAL_SESSION`
- `RATE_LIMITER`
- `RUN_WORKFLOW`
- `EVENT_QUEUE`

也就是說，目前分環境的核心工作主要是「綁定不同資源」，而不是注入大量 Worker secrets。

### 2.1.1 可選的 runtime vars

目前另外支援兩個可選的 Worker runtime vars，用來對 run 建立與 replay 做 tenant-scoped 限流：

- `RATE_LIMIT_RUNS_PER_MINUTE`
- `RATE_LIMIT_REPLAYS_PER_MINUTE`

另外還支援一個 northbound 身份收斂開關：

- `NORTHBOUND_AUTH_MODE`
  - `permissive`（預設）：保留本地 / smoke / 手動驗收用的 `X-Subject-*` 覆寫能力
  - `trusted_edge`：只接受受信任入口注入的身份 header，拒絕直接傳入的 `X-Subject-*`

兩者都以固定 60 秒時間窗計算；若未設定、設為空字串，或設為 `0`，代表不啟用該類限流。

### 2.2 目前沒有直接依賴的 Worker secrets

截至 2026-03-31，倉庫內代碼沒有直接讀取例如：

- `env.API_KEY`
- `env.MCP_TOKEN`
- `env.A2A_SHARED_SECRET`
- `process.env.*`

因此：

- 目前 MVP 可以在沒有自定義 secrets 的情況下完成本地 `check`、`smoke` 與 `dry-run`
- 真實環境中若需要上游憑證，應先設計為資料層 `auth_ref` 或平台 secret 引用，而不是把明文憑證塞進 D1

## 3. 建議環境切分

### 3.1 環境用途

| 環境 | 用途 | 資料要求 |
|---|---|---|
| `dev` | 本地開發、mock smoke、手動驗證 | 可使用本地 D1 / R2 模擬 |
| `staging` | 真實 Cloudflare 資源聯調、驗收、回歸 | 使用獨立 staging 資源 |
| `production` | 正式租戶流量 | 與 staging 完全隔離 |

### 3.2 建議資源命名

| 類型 | staging 建議 | production 建議 |
|---|---|---|
| Worker | `agent-control-plane-staging` | `agent-control-plane` |
| D1 | `agent-control-plane-staging` | `agent-control-plane` |
| R2 | `agent-control-plane-staging-artifacts` | `agent-control-plane-artifacts` |
| Queue | `agent-control-plane-staging-events` | `agent-control-plane-events` |
| Workflow 名稱 | `agent-control-plane-staging-run-workflow` | `agent-control-plane-run-workflow` |

重點是：

- staging 與 production 必須使用不同名稱
- 不要共用同一條 queue 或同一個 bucket
- 不要讓 staging seed 汙染 production tenant

## 4. Wrangler 多環境配置建議

建議在 `wrangler.jsonc` 中加入：

- 頂層作為 production 預設
- `env.staging`

可直接參考範例檔：

- [wrangler.multi-env.example.jsonc](/Users/zh/Documents/codeX/agent_control_plane/docs/wrangler.multi-env.example.jsonc)

### 4.1 實務原則

- DO class 與 Workflow class 名稱可共用，但 binding 名稱要保持一致
- 真正變動的是每個環境對應的資源名稱與 ID
- 若 staging / production 的 domain 不同，也應在 Access / API Gateway 層一併分開

### 4.2 部署命令

部署 staging：

```bash
wrangler deploy --env staging
```

部署 production：

```bash
wrangler deploy
```

### 4.3 Migration 與 seed 命令

本地或指定環境生成 seed SQL：

```bash
npm run seed:sql -- --tenant-id tenant_demo > /tmp/agent_control_plane_seed.sql
```

匯入 staging D1：

```bash
wrangler d1 execute agent-control-plane-staging --remote --file /tmp/agent_control_plane_seed.sql
```

匯入 production D1：

```bash
wrangler d1 execute agent-control-plane --remote --file /tmp/agent_control_plane_seed.sql
```

### 4.4 驗證命令約定

目前倉庫已提供以下驗證入口：

- `npm run verify:local`
  - 依序執行 `check` 與 `smoke`
- `npm run verify:build`
  - 執行 `wrangler deploy --dry-run`
- `BASE_URL="https://<worker>" TENANT_ID="tenant_verify" npm run post-deploy:verify`
  - staging 寫入式驗證遠端 Worker 的 northbound / admin / artifact / graph / replay / SSE 流程
- `BASE_URL="https://<worker>" TENANT_ID="tenant_prod" RUN_ID="<existing_run_id>" npm run post-deploy:verify:readonly`
  - production 唯讀驗證既有 run、admin API 與可用 SSE ready stream

建議節奏：

- 本地開發完成後先跑 `npm run verify:local`
- 準備部署前再跑 `npm run verify:build`
- staging 部署完成後跑 `npm run post-deploy:verify`
- production 部署完成後優先跑 `npm run post-deploy:verify:readonly`

目前這兩個 post-deploy 驗證入口都會額外檢查：

- `GET /api/v1/runs/{run_id}/graph` 的保留查詢參數與 page limit
- replay `mode=from_step` 的 metadata 透傳；非 workflow-native anchor fallback 由 `smoke` 持續驗證
- A2A `message:stream` 的 SSE snapshot
- 可用 MCP provider 的 SSE ready stream
- write mode 會再確認新建的 provider / policy 最後都已停用，且能從 `status=disabled` 清單與單筆 GET 查回
- 若另外提供 `EXPECT_RATE_LIMIT_RUNS_PER_MINUTE` / `EXPECT_RATE_LIMIT_REPLAYS_PER_MINUTE`，write mode 也會驗證對應的 `429 rate_limited`
- 驗證腳本本身會以結構化 JSON lines 輸出每個檢查步驟，並在 summary 裡記錄 `started_at`、`completed_at`、`duration_ms`、`check_count` 與 `checks`
- 若提供 `VERIFY_OUTPUT_PATH`，兩種模式都可把驗收結果額外寫成結構化 JSON；即使中途失敗，也會盡量寫出帶 partial checks 的 failure summary，方便交接與 workflow artifact 收集

### 4.5 交接時建議保留的驗證證據

如果這次驗證是要交給下一位工程師或跨團隊接手，建議至少保留：

- 驗證命令
- `base_url`
- `tenant_id`
- `trace_id`
- `run_id`
- `tool_provider_id`
- `policy_id`
- `VERIFY_OUTPUT_PATH` 產出的 JSON summary 路徑
- `check_count` 與 `duration_ms`，方便快速判斷驗收範圍與耗時

若這次同時是新 tenant onboarding，建議把 `VERIFY_OUTPUT_PATH` 指到 onboarding bundle 目錄，讓 `seed.sql`、`bundle.json`、`handoff.md` 與 verify summary 一起保存。

readonly 驗證雖然不會建立新資料，但仍建議記錄 `RUN_ID`，這樣接手的人可以直接回查同一筆 run 的 graph、events 與 artifacts。

## 5. Seeds 與 tenant 初始化原則

### 5.1 什麼可以共用

以下內容可以在 staging / production 之間共享結構，但不應直接共用資料列：

- 預設 `tool_providers` schema
- 預設 `policies` 規則結構
- approver role 命名慣例

### 5.2 什麼不應共用

以下內容不應直接從 staging 複製到 production：

- 測試 tenant ID
- mock `endpoint_url`
- 測試 approver 帳號
- demo 或 smoke 專用 policy

### 5.3 目前 seed 的定位

目前 `npm run seed:sql` 生成的是「MVP 啟動用基線資料」，不是 production 最終 catalog。

也就是說，它適合：

- 本地驗證
- staging 啟動
- 新 tenant 的最小骨架

但 production 正式接入前，仍應把：

- 真實 `endpoint_url`
- `auth_ref`
- policy 條件
- approver roles

改成符合現場環境的值。

## 6. Secrets 與憑證建議

### 6.1 目前推薦做法

對外部 A2A / MCP provider 的憑證，建議採用：

1. Worker secret 或平台 secret store 保存明文
2. D1 `tool_providers.auth_ref` 只保存引用名，不保存明文
3. 真正發請求時，根據 `auth_ref` 去讀 secret

### 6.2 目前尚未落地的部分

截至 2026-03-31，MVP 已落地以下能力：

- `tool_providers.auth_ref` 可在 MCP upstream request 中生效
- `tool_providers.auth_ref` 也可透過 `context.a2a_dispatch.tool_provider_id` 在 outbound A2A request 中生效
- secret 值會從同名 Worker binding 讀取，不從 D1 讀明文

目前支援的 `auth_ref` 格式：

- `<SECRET_BINDING_NAME>`
  - 預設注入 `Authorization: Bearer <secret>`
- `bearer:<SECRET_BINDING_NAME>`
  - 明確注入 `Authorization: Bearer <secret>`
- `header:<Header-Name>:<SECRET_BINDING_NAME>`
  - 以自定義 header 注入，例如 `header:X-Api-Key:A2A_SHARED_KEY`

目前代碼會在 `tool_providers` 建立/更新與 `context.a2a_dispatch.auth_ref` 解析時先驗證 `auth_ref` 語法，因此像缺少欄位、binding 名稱含空白、或 `header:` 格式少了 binding 名稱，會更早回 `400 invalid_request`。真正的 secret 仍是在發請求時才讀取，所以 `auth_ref` 語法正確但 secret 沒有建立，仍會在執行時回 `500 upstream_auth_not_configured`。

常見示例：

- MCP provider：`bearer:MCP_API_TOKEN`
- A2A outbound：`header:X-Api-Key:A2A_SHARED_KEY`

若是 HTTP(S) 型 outbound A2A，建議把 `endpoint_url` / `auth_ref` 固定在 `tool_providers`，run context 只傳 `tool_provider_id` 與 `agent_id`。目前只有 `mock://` / `demo://` 的開發場景仍允許直接放在 `context.a2a_dispatch.endpoint_url`，而 provider-backed 的真實遠端 endpoint 應使用 `https://`。

目前仍尚未落地的部分：

- `auth_ref` 的輪替 / 版本管理
- 多 header 組合或簽名型 auth
- secrets store 與 `auth_ref` 的治理後台

因此 production 接入前，仍應補上憑證輪替與審計策略，但至少不需要再把 token 明文寫入 D1。

若要執行 rotation，請直接看：

- [secret_rotation_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_runbook_zh.md)
- [secret_rotation_plan.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_plan.example.json)

### 6.3 Access / northbound API 身份

目前 API 契約假設 northbound 入口由以下方式保護：

- Cloudflare Access
- Bearer token / service token

但截至 2026-04-01，目前 Worker 代碼的真實邊界仍是：

- Worker 直接要求 `X-Tenant-Id`
- `NORTHBOUND_AUTH_MODE=permissive` 時可接受 `X-Subject-Id` / `X-Subject-Roles` 作為本地或驗收覆寫
- `Authorization` 的真實驗證需由 Access / API Gateway / 上游入口完成

若把 `NORTHBOUND_AUTH_MODE=trusted_edge` 打開，則：

- 所有 `/api/v1/*` 請求都要帶受信任入口注入的身份
- 目前接受 `CF-Access-Authenticated-User-Email` 或 `X-Authenticated-Subject`
- roles 目前接受 `CF-Access-Authenticated-User-Groups` 或 `X-Authenticated-Roles`
- 直接帶 `X-Subject-Id` / `X-Subject-Roles` / `X-Roles` 會被 Worker 直接拒絕

倉庫內建的 `post-deploy:verify` 已經對齊這個行為：

- `SUBJECT_ID` 會映射為 `X-Authenticated-Subject`
- `SUBJECT_ROLES` 會映射為 `X-Authenticated-Roles`

所以同一支驗證腳本可以直接驗證已切到 `trusted_edge` 的環境，不需要再退回舊的 `X-Subject-*` 覆寫方式。

這代表：

- 本地 smoke 與部分手動驗收命令可以不帶真正的 Bearer token
- staging / production 若要達到預期安全模型，必須先把入口層保護補上，並把 `NORTHBOUND_AUTH_MODE` 設成 `trusted_edge`
- 不應把覆寫 header 暴露給未受控的外部客戶端

建議：

- staging 與 production 使用不同 Access application
- staging 測試群組與 production approver 群組分離
- 不要只依賴 `X-Subject-Id` / `X-Subject-Roles` 進 production

## 7. 目前最需要補的配置能力

若要把這個 MVP 推向真實服務，最優先的下一批配置工作是：

1. 在 `wrangler.jsonc` 補 `env.staging`
2. 為 staging / production 建立獨立 D1 / R2 / Queue
3. 增加 Access / service token 的實際部署說明
4. 增加 secret 輪替與 `auth_ref` 治理策略
5. 在 CI 或部署流水線中接入 `verify:build`、`post-deploy:verify` 與 `post-deploy:verify:readonly`
