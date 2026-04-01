# Agent Control Plane Access 與入口治理 Runbook（MVP+）

交付對象：Platform / Security / SRE / 後端工程師  
版本：v0.1  
日期：2026-04-01

## 1. 文檔目的

本文件把 northbound 入口保護的實際部署方式單獨收斂出來，回答三個問題：

- production / staging 應如何把 Cloudflare Access 或 service token 接到 Worker 前面
- `NORTHBOUND_AUTH_MODE=trusted_edge` 與入口層配置要如何對齊
- 發版、排障、輪換時應保留哪些證據與檢查點

本文件補足：

- [environment_config_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/environment_config_runbook_zh.md)
- [deployment_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/deployment_runbook_zh.md)
- [release_checklist_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/release_checklist_zh.md)

## 2. 目標安全模型

目前倉庫的 northbound API 採用以下模型：

1. 外層入口先完成身份驗證
2. Worker 不直接驗證 bearer token 本身
3. Worker 只接受入口層已注入的受信任身份上下文

也就是說，production / staging 的正確部署形態不是讓客戶端直接把 `X-Subject-*` 打到 Worker，而是：

- Cloudflare Access 驗證使用者或 service token
- Access / gateway 只把通過驗證的身份映射成 Worker 可接受的 trusted headers
- Worker 以 `NORTHBOUND_AUTH_MODE=trusted_edge` 拒絕本地覆寫式身份 header

## 3. 目前 Worker 端接受的 trusted headers

在 `NORTHBOUND_AUTH_MODE=trusted_edge` 下，Worker 目前接受：

- subject
  - `CF-Access-Authenticated-User-Email`
  - `X-Authenticated-Subject`
- roles
  - `CF-Access-Authenticated-User-Groups`
  - `X-Authenticated-Roles`

Worker 目前會拒絕：

- `X-Subject-Id`
- `X-Subject-Roles`
- `X-Roles`

因此入口層若不是直接使用 Cloudflare Access 原生 headers，就應在 gateway 層把身份正規化成：

- `X-Authenticated-Subject`
- `X-Authenticated-Roles`

## 4. 建議入口拓撲

### 4.1 staging

建議：

- 使用獨立的 Access application
- 使用 staging 專用使用者群組 / service token
- Worker 設定 `NORTHBOUND_AUTH_MODE=trusted_edge`
- verify tenant 與正式 tenant 分離

適用請求來源：

- 平台工程師手動驗收
- release gate / post-deploy verify
- 受控整合測試

### 4.2 production

建議：

- 使用獨立的 production Access application
- approver、operator、service token 權限分組
- Worker 固定 `NORTHBOUND_AUTH_MODE=trusted_edge`
- production tenant 與 verify tenant 分離

適用請求來源：

- 正式業務系統
- 人工 approver / operator
- 受控 readonly 驗收

## 5. 角色與群組映射建議

建議至少保留以下角色來源：

- `platform_admin`
- `legal_approver`
- `ops_oncall`
- `service_release_gate`

建議映射方式：

- Access group 或 gateway identity group
- 入口層統一映射到 `X-Authenticated-Roles`
- Worker 只消費映射後角色，不承擔群組名稱轉譯責任

## 6. service token 使用建議

適用場景：

- GitHub Actions release gate
- 定時健康檢查 / readonly 驗收
- 平台內部自動化流程

建議原則：

1. staging / production 使用不同 token
2. write-mode verify 與 readonly verify 使用不同 token 也更安全
3. token 只給最小可用範圍
4. token 變更時保留輪換時間、操作者、舊 token 失效時間

## 7. 部署檢查點

在把 Worker 切到 `trusted_edge` 前，至少確認：

- Access / gateway 已在 Worker 前面
- trusted headers 只會由入口層注入
- staging / production 都已設 `NORTHBOUND_AUTH_MODE=trusted_edge`
- `post-deploy:verify` 已能透過 `X-Authenticated-*` 成功驗證

## 8. 驗收方式

### 8.1 staging write verify

```bash
BASE_URL="https://<staging-worker>" \
TENANT_ID="tenant_verify_<date>" \
VERIFY_OUTPUT_PATH="/tmp/staging-verify.json" \
npm run post-deploy:verify
```

### 8.2 production readonly verify

```bash
BASE_URL="https://<production-worker>" \
TENANT_ID="tenant_verify_<date>" \
RUN_ID="<existing_run_id>" \
VERIFY_OUTPUT_PATH="/tmp/production-verify-readonly.json" \
npm run post-deploy:verify:readonly
```

重點不是 header 名稱，而是：

- verify 腳本必須能在 `trusted_edge` 下跑通
- summary 要保留 `trace_id`、`run_id`、`duration_ms`、`checks`

## 9. 常見故障

### 9.1 `401 unauthorized`

常見原因：

- 入口層沒有注入 trusted headers
- Access / service token 沒有真的套到 Worker 域名前
- 誤把 `X-Subject-*` 當成 production 身份 header

### 9.2 `403 tenant_access_denied`

常見原因：

- tenant header 與身份不匹配
- approver 角色沒有被映射進 `X-Authenticated-Roles`

### 9.3 verify 腳本通過本地但遠端失敗

常見原因：

- 本地還在 `permissive`
- 遠端已切 `trusted_edge`
- release gate / 手工 curl 還在用舊的 `X-Subject-*`

## 10. 建議保留的交接資訊

至少保留：

- Access application 名稱
- 對應環境：`staging` / `production`
- 使用中的 service token 名稱或用途
- verify summary 路徑
- 最近一次成功 verify 的 `trace_id`
- 最近一次成功 verify 的 `run_id`

## 11. 目前仍未完全平台化的部分

本 runbook 已把部署方式收斂清楚，但以下仍屬後續工作：

- Access application 的全自動建立
- group 到 role 的自動映射管理
- service token 輪換自動化
- policy / tenant / identity 的統一治理後台
