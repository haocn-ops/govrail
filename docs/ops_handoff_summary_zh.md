# Agent Control Plane Ops Handoff Summary

交付對象：SRE / 值班工程師 / 接手工程師  
版本：v0.1  
日期：2026-04-01

## 1. 目的

本文件作為目前倉庫的運維交接摘要，重點不是重複所有 runbook，而是快速回答：

- 現在哪些環境已實際落地
- 驗收證據在哪裡
- 下一位操作者應先看什麼

## 2. 已落地環境

### 2.1 staging

- Worker URL: `https://agent-control-plane-staging.izhenghaocn.workers.dev`
- 驗收 tenant: `tenant_verify_20260401`
- 驗收方式: `npm run post-deploy:verify`
- 最近一次 write verify run_id: `run_mng2gcnga0c3b8ac8dff4333`
- 驗收 summary: `/tmp/agent-control-plane-staging-verify.json`

### 2.2 production

- Worker URL: `https://agent-control-plane.izhenghaocn.workers.dev`
- 驗收 tenant: `tenant_verify_prod_20260401`
- write verify run_id: `run_mng2k03y958a39a20ce0489b`
- write verify summary: `/tmp/agent-control-plane-production-verify-write.json`
- readonly verify summary: `/tmp/agent-control-plane-production-verify-readonly.json`

## 3. 入口保護現況

- staging / production 都以 `NORTHBOUND_AUTH_MODE=trusted_edge` 部署
- `post-deploy:verify` 與 `post-deploy:verify:readonly` 已對齊 trusted headers
- Access / service token 的部署方式請先看：
  - [access_ingress_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/access_ingress_runbook_zh.md)

## 4. 接手優先閱讀順序

1. [docs/implementation_status_matrix_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/implementation_status_matrix_zh.md)
2. [docs/deployment_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/deployment_runbook_zh.md)
3. [docs/environment_config_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/environment_config_runbook_zh.md)
4. [docs/access_ingress_runbook_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/access_ingress_runbook_zh.md)
5. [docs/release_checklist_zh.md](/Users/zh/Documents/codeX/agent_control_plane/docs/release_checklist_zh.md)

## 5. 常用命令

### 5.1 staging write verify

```bash
BASE_URL="https://agent-control-plane-staging.izhenghaocn.workers.dev" \
TENANT_ID="tenant_verify_20260401" \
VERIFY_OUTPUT_PATH="/tmp/agent-control-plane-staging-verify.json" \
npm run post-deploy:verify
```

### 5.2 production readonly verify

```bash
BASE_URL="https://agent-control-plane.izhenghaocn.workers.dev" \
TENANT_ID="tenant_verify_prod_20260401" \
RUN_ID="run_mng2k03y958a39a20ce0489b" \
VERIFY_OUTPUT_PATH="/tmp/agent-control-plane-production-verify-readonly.json" \
npm run post-deploy:verify:readonly
```

## 6. 目前仍需補強的運維項

- 正式 Access application / service token 治理自動化
- 監控 / 告警基線已成文，但尚未接入真實監控系統與 oncall 值班流程
- secret rotation 已有 runbook 與 plan template，但尚未自動化
- deploy / release automation 的更完整流水線
- tenant provisioning 的半自動或自動化
