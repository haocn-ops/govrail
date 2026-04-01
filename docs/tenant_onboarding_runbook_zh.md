# Agent Control Plane 租戶接入 Runbook（MVP）

交付對象：Platform / Solutions / SRE / 接手工程師  
版本：v0.1  
日期：2026-04-01

## 1. 文檔目的

這份手冊回答的是一個很實際的問題：

「如果今天要把一個新 tenant 接進這個 MVP，最小可行流程是什麼？」

它不是未來理想中的自助開通系統，而是基於目前倉庫已落地的能力，整理出一條可手動執行、可驗證、可回滾的接入路徑。

## 2. 適用範圍

目前適用於：

- staging 新 tenant 啟動
- production 受控手動接入
- demo / verify tenant 建立

目前不涵蓋：

- 自助式 tenant provisioning
- 多人審批工作流配置後台
- 自動化 Access application 建立
- 正式 secret 輪替與版本治理

## 3. 前置確認

接入前先確認以下條件成立：

- 目標環境的 Worker 已部署
- D1 migration 已套用完成
- 目標環境的 D1 / R2 / Queue 綁定正確
- 已知道要接入的 `tenant_id`
- 已知道是否要沿用 seed baseline，或改用客製化 provider / policy

若上述任一項不成立，請先回看：

- [deployment_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/deployment_runbook_zh.md)
- [environment_config_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/environment_config_runbook_zh.md)

## 4. 建議接入模式

### 4.1 最小骨架模式

適合：

- staging
- demo
- 新 tenant 的第一天初始化

做法：

- 用 `npm run seed:sql` 生成 baseline
- 匯入 D1
- 再用 admin API 修正 `endpoint_url`、`auth_ref`、policy 細節

### 4.2 客製化管理模式

適合：

- production
- 特殊 provider / policy 組合

做法：

- 只建立必要 secret
- 用 admin API 建立 / 更新 `tool_providers`
- 用 admin API 建立 / 更新 `policies`
- 避免直接把 smoke baseline 全量匯入 production tenant

## 5. 接入步驟

### 5.1 決定 tenant ID

建議：

- staging：`tenant_<team>_staging`
- production：`tenant_<customer_or_domain>`
- verify：`tenant_verify_<date_or_owner>`

避免：

- 與 smoke / demo 共用 `tenant_demo`、`tenant_smoke`
- 把 production tenant 命名成一次性測試 ID

### 5.2 生成 baseline seed

若要一次產出 seed、metadata 與 handoff 文件，可直接用 tenant onboarding bundle 腳本：

```bash
npm run tenant:onboarding:bundle -- --tenant-id tenant_acme --deploy-env staging
```

預設會在 `.onboarding-bundles/tenant_acme/` 生成：

- `seed.sql`
- `bundle.json`
- `handoff.md`
- `provision.sh`
- `verify.sh`

若只需要 SQL，仍可單獨使用：

```bash
npm run seed:sql -- --tenant-id tenant_acme > /tmp/tenant_acme_seed.sql
```

若要固定時間戳：

```bash
npm run seed:sql -- --tenant-id tenant_acme --created-at 2026-04-01T00:00:00.000Z > /tmp/tenant_acme_seed.sql
```

### 5.3 匯入 D1

staging：

```bash
wrangler d1 execute agent-control-plane-staging --remote --file /tmp/tenant_acme_seed.sql
```

production：

```bash
wrangler d1 execute agent-control-plane --remote --file /tmp/tenant_acme_seed.sql
```

### 5.4 建立對應 secrets

若 tenant 需要真實上游憑證，先建立 Worker secret。

若這次不是全新建立，而是要把既有 tenant 的 secret 換成新版本，請先看：

- [secret_rotation_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_runbook_zh.md)
- [secret_rotation_plan.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_plan.example.json)

單筆建立：

```bash
wrangler secret put MCP_API_TOKEN
wrangler secret put A2A_SHARED_KEY
```

批次匯入可參考：

- [secrets.bulk.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/secrets.bulk.example.json)

### 5.5 校正 tool providers

baseline 匯入後，至少確認：

- `endpoint_url` 已改成真實值
- `auth_ref` 已改成對應 secret 引用
- 不需要的 smoke/demo provider 已停用或移除其影響

可用 API：

- `GET /api/v1/tool-providers`
- `POST /api/v1/tool-providers`
- `POST /api/v1/tool-providers/{id}`
- `POST /api/v1/tool-providers/{id}:disable`

常見更新示例：

```bash
curl -X POST "$BASE_URL/api/v1/tool-providers/tp_email" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: tenant_acme" \
  -H "Idempotency-Key: tenant-acme-tool-provider-update-1" \
  -H "X-Subject-Id: platform_admin_1" \
  -H "X-Subject-Roles: platform_admin" \
  -d '{
    "endpoint_url": "https://mcp-email.acme.example.com/rpc",
    "auth_ref": "bearer:MCP_API_TOKEN",
    "status": "active"
  }'
```

校正後至少再查一次：

```bash
curl "$BASE_URL/api/v1/tool-providers" \
  -H "X-Tenant-Id: tenant_acme"
```

### 5.6 校正 policies

至少確認：

- 是否仍需要 `external-send` 類審批
- approver roles 是否符合目標環境
- deny / approval_required 的優先級是否合理

可用 API：

- `GET /api/v1/policies`
- `POST /api/v1/policies`
- `POST /api/v1/policies/{id}`
- `POST /api/v1/policies/{id}:disable`

常見建立示例：

```bash
curl -X POST "$BASE_URL/api/v1/policies" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: tenant_acme" \
  -H "Idempotency-Key: tenant-acme-policy-create-1" \
  -H "X-Subject-Id: platform_admin_1" \
  -H "X-Subject-Roles: platform_admin" \
  -d '{
    "policy_id": "pol_mcp_email_external_approval_v1",
    "channel": "mcp_tool_call",
    "scope": {
      "tool_provider_id": "tp_email",
      "tool_name": "send_email"
    },
    "conditions": {
      "risk_level": "high",
      "target_classification": "external"
    },
    "decision": "approval_required",
    "approval_config": {
      "approver_roles": ["legal_approver"],
      "timeout_seconds": 3600
    },
    "priority": 100,
    "status": "active"
  }'
```

校正後至少再查一次：

```bash
curl "$BASE_URL/api/v1/policies" \
  -H "X-Tenant-Id: tenant_acme"
```

### 5.7 做 tenant 級最小驗收

如果是 staging 或專用 verify tenant，可直接跑：

```bash
BASE_URL="https://<worker>" \
TENANT_ID="tenant_acme" \
VERIFY_OUTPUT_PATH=".onboarding-bundles/tenant_acme/verify-write-summary.json" \
npm run post-deploy:verify
```

若目標環境已把 `NORTHBOUND_AUTH_MODE` 切成 `trusted_edge`，不需要改腳本名稱；內建的驗證腳本與 bundle 內的 `verify.sh` 會自動把 `SUBJECT_ID` / `SUBJECT_ROLES` 映射成 `X-Authenticated-Subject` / `X-Authenticated-Roles`。

這個模式適合用來快速做 handoff，因為腳本會：

- 驗證 tenant 的 health、admin API、A2A SSE 與 MCP SSE
- 建立臨時的 provider / policy / run
- 在結束前把臨時 provider 與 policy 停用，減少殘留配置

若要把最小接入流程收斂成兩個命令，建議直接在 bundle 目錄執行：

```bash
./provision.sh apply
./verify.sh write
```

如果是 production 或共享 tenant，建議分兩段：

1. 先以只讀方式確認 admin 可讀與既有 run 可查
2. 再由受控請求建立一筆小型驗證 run

唯讀驗證：

```bash
BASE_URL="https://<worker>" \
TENANT_ID="tenant_acme" \
RUN_ID="<existing_run_id>" \
VERIFY_OUTPUT_PATH=".onboarding-bundles/tenant_acme/verify-readonly-summary.json" \
npm run post-deploy:verify:readonly
```

readonly 模式更適合正式交付，因為它不會建立新的 run 或修改 provider / policy，只會確認現有 tenant 的讀取與 SSE 能力。

### 5.8 保存接入結果

至少記錄以下資訊，供之後維運與交接：

- `tenant_id`
- `trace_id`
- 已啟用的 `tool_provider_id`
- 已啟用的 `policy_id`
- 對應的 secret 名稱
- 驗收使用的 `run_id`
- 驗收日期與操作者

若使用 tenant onboarding bundle 腳本，建議把生成的 `bundle.json` 與 `handoff.md` 一起存檔，作為最小交接包。

若要降低人工出錯，優先直接執行 bundle 內的 `verify.sh`，它會自動把驗收輸出寫到同一個 bundle 目錄。

若這次驗收本身就是交接證據，建議再把 `VERIFY_OUTPUT_PATH` 輸出的 `verify-write-summary.json` 或 `verify-readonly-summary.json` 一起保存在同一個 bundle 目錄。

## 6. 最小驗收出口

新 tenant 最少要能證明以下幾件事：

- `GET /api/v1/tool-providers` 能讀到當前 tenant 的 provider
- `GET /api/v1/policies` 能讀到當前 tenant 的 policy
- 至少能建立一筆 run
- 至少能查 `run` / `graph` / `events`
- 若產出 artifact，能查 `artifacts` 與正文
- 若使用寫入式驗證，結束後要能在 `status=disabled` 清單查到臨時建立的 provider / policy

若 tenant 預期會走 A2A 或 MCP 真實上游，還應額外確認：

- `auth_ref` 已對到正確 secret
- webhook push 或 MCP 上游轉發不會因憑證缺失失敗

## 7. 回滾與清理

目前 MVP 沒有完整 tenant delete 流程，因此回滾建議採保守策略：

### 7.1 若只是 baseline 匯入錯誤

- 先停用錯誤 `tool_providers`
- 再停用錯誤 `policies`
- 重新建立正確版本

### 7.2 若 secret 名稱配錯

- 修正 `auth_ref`
- 重新寫入正確 secret
- 重新跑驗收

### 7.3 若 verify tenant 不再使用

- 停用其 provider / policy
- 保留審計資料
- 不建議直接手動刪除 D1 歷史，除非有額外治理規範

## 8. 常見接入錯誤

### 8.1 `tool_provider_not_found`

通常代表：

- tenant seed 沒匯入
- 匯入到錯的 D1 環境
- API 呼叫用錯 `X-Tenant-Id`

### 8.2 `upstream_auth_not_configured`

通常代表：

- `auth_ref` 指向的 secret 尚未建立
- staging / production secret 名稱混用

### 8.3 `tenant_access_denied`

通常代表：

- 驗收請求的 tenant header 不正確
- approver role 與目標 tenant 不匹配

### 8.4 `approval_required`

通常不是錯誤，而是政策生效。  
需要確認的是：

- 這是不是你預期的 policy 結果
- approver role 是否真的有對上

## 9. 目前最重要的限制

這份 onboarding runbook 目前仍建立在以下現實上：

- 已有 baseline tenant onboarding bundle，可生成 `seed.sql`、`bundle.json` 與 `handoff.md`
- 沒有 UI 後台管理 provider / policy / secret
- production onboarding 的最終 provisioning、secret 綁定與 provider / policy 校正仍以人工操作為主
- Access / service token 佈建仍需依賴外部平台流程

因此它適合當前 MVP，但還不是長期的正式運營方案。
