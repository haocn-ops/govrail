# Agent Control Plane Secret Rotation Runbook（MVP）

交付對象：Platform / SRE / Security / 後端工程師
版本：v0.1
日期：2026-04-01

## 1. 文檔目的

這份手冊專門處理 `auth_ref` 對應的 Worker secret 輪替。

它不改 request auth 邏輯，也不改 provider / A2A 的行為，只負責把「秘密值如何換新、如何切換、如何回滾」講清楚，避免 rotation 只能靠口頭交接。

## 2. 核心原則

- `auth_ref` 只保存 secret binding 名稱，不保存明文。
- rotation 先創建新 binding，再切換 `auth_ref`，最後再刪舊 binding。
- 同一輪切換中，新舊 binding 可以短暫共存，避免 cutover 時間窗失敗。
- `tool_providers.auth_ref` 和 `context.a2a_dispatch.auth_ref` 用同一套流程處理。

## 3. 建議命名

建議為每次 rotation 使用新的 binding 名稱，而不是覆蓋原本 secret。

常見格式：

- `<BASE_NAME>_V2`
- `<BASE_NAME>_<YYYYMMDD>`
- `<BASE_NAME>_NEXT`

示例：

- `MCP_API_TOKEN_V2`
- `A2A_SHARED_KEY_20260401`

## 4. Rotation 流程

### 4.1 先填計劃

先把 rotation 的 scope 寫進計劃模板：

- [secret_rotation_plan.example.json](/Users/zh/Documents/codeX/agent_control_plane/docs/secret_rotation_plan.example.json)

至少要確認：

- tenant
- deploy env
- 受影響的 provider
- 舊 binding
- 新 binding
- cutover 驗證命令

### 4.2 建立新 secret

在目標環境先建立新的 secret binding：

```bash
wrangler secret put MCP_API_TOKEN_V2 --env staging
wrangler secret put A2A_SHARED_KEY_V2 --env staging
```

若是 production，請把 `--env staging` 去掉，並確定是在正確帳號與正確 Worker 上操作。

### 4.3 切換 `auth_ref`

只更新資料層中的 `auth_ref`，不要改 request auth 邏輯：

- `bearer:MCP_API_TOKEN` -> `bearer:MCP_API_TOKEN_V2`
- `header:X-Api-Key:A2A_SHARED_KEY` -> `header:X-Api-Key:A2A_SHARED_KEY_V2`

如果有多個 provider 共用同一個 secret，請先列出影響面，再一起切換。

### 4.4 驗證切換

切換後立刻跑一次對應環境的驗證：

```bash
BASE_URL="https://<worker>" \
TENANT_ID="<tenant_id>" \
VERIFY_OUTPUT_PATH="/tmp/secret-rotation-verify.json" \
npm run post-deploy:verify
```

如果是 production readonly，只要拿既有 `RUN_ID`：

```bash
BASE_URL="https://<worker>" \
TENANT_ID="<tenant_id>" \
RUN_ID="<existing_run_id>" \
VERIFY_MODE=readonly \
VERIFY_OUTPUT_PATH="/tmp/secret-rotation-readonly.json" \
npm run post-deploy:verify:readonly
```

### 4.5 刪除舊 secret

驗證通過且觀察窗穩定後，再刪除舊 binding：

```bash
wrangler secret delete MCP_API_TOKEN --env staging
```

如果暫時還不確定，先保留舊 binding，等下一輪 deploy 或觀察結束後再清理。

## 5. 回滾原則

如果切換後驗證失敗：

1. 先把 `auth_ref` 切回舊 binding。
2. 保留新 binding，方便重試與比對。
3. 用 `post-deploy:verify` 再驗一次。
4. 等確認穩定後，再決定是否刪除新 binding。

## 6. 常見錯誤

- `upstream_auth_not_configured`
  - 代表 secret binding 名稱正確，但目前環境沒建立那個 secret。
- `upstream_auth_invalid`
  - 代表 `auth_ref` 格式本身有誤。
- `invalid_request`
  - 代表在建立或更新 provider 時就被格式檢查擋下了。

## 7. 交接時建議保存

- `tenant_id`
- `deploy_env`
- `tool_provider_id`
- `current_auth_ref`
- `next_auth_ref`
- `secret_binding_name`
- `rotation_window`
- `verify_output_path`
- `rollback_auth_ref`
