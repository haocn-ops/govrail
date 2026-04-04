# Govrail SaaS v1 開發執行文檔

交付對象：Founder / Product / Tech Lead / Full-stack 工程師 / 並行開發 agent  
版本：v0.2  
日期：2026-04-04

## 1. 文檔目的

這份文檔不是新的產品規劃，而是把「接下來 4 週應該怎麼開發」落成可執行的工程文檔。

它主要解決 4 個問題：

- 目前 SaaS 化到底做到哪個成熟度
- 接下來應該先補哪些缺口
- 哪些任務可以並行
- 每條任務線應該主要落在哪些檔案

本文件以目前倉庫真實代碼為準，不以早期規劃文檔中的缺口描述為唯一依據。

## 2. 當前判斷

### 2.1 當前成熟度

目前 Govrail 已經不是「SaaS 概念驗證」，而是：

- 已有 multi-tenant SaaS data model
- 已有 `/api/v1/saas/*` 後端主幹
- 已有 Web Console 與 onboarding / members / api keys / settings / usage / admin 等 SaaS surface
- 已有 service account、workspace invitation、workspace API key、workspace billing session、workspace delivery tracking

但它仍未達到「完整自助式 SaaS v1」。

### 2.2 目前最關鍵的缺口

目前最值得優先補的不是 workflow runtime，而是 SaaS 外層：

- Console session / workspace context 仍保留 `metadata -> env-fallback -> preview-fallback`
- 若 upstream 不可用，部分控制台 API 仍會回 preview/fallback data，容易掩蓋真實問題
- billing 雖已有 checkout/session/subscription 骨架，但 production self-serve path 尚未完全收口
- onboarding 仍是「產品內 + runbook/script 混合模式」，未完全產品化
- SSO / audit export / dedicated environment 仍偏 readiness / staged surface

## 3. 本輪開發目標

本輪 4 週總目標：

把目前的「可演示托管式 SaaS Beta」推進到「可小規模真實試用的 SaaS v1」。

### 3.0 當前執行狀態

截至 2026-04-03，本文件對應的執行狀態如下：

- 第一波並行開發已完成：
  - `A` workspace/session hardening
  - `B` critical route hardening
  - `C` mutation/detail proxy consistency
- 已完成驗證：
  - `npm run check`
  - `npm run web:check`
- 第二波並行開發已完成：
  - `D1` billing backend hardening
  - `D2` billing frontend/productization
  - `E1` onboarding backend/productization
  - `E2` onboarding frontend/productization
- 第二波完成後已通過驗證：
  - `npm run check`
  - `npm run web:check`
- 已新增 `web:test` 最小測試入口：
  - `npm --prefix web run test`（對應 `web/package.json#test`，目前覆蓋 `web/lib/__tests__/*.test.ts` 與 `web/app/api/**/__tests__/*.test.ts`）
  - `npm run web:test`（倉庫根腳本，轉發到 `npm --prefix web run test`）
- 已新增細分測試入口：
  - `npm run web:test:unit`
  - `npm run web:test:contract`
  - `npm run web:test:page`
  - `npm run web:test:e2e`
- 第三波中的 route/source 護欄已補齊一層最小入口：
  - 已納入當前 `web:test` 入口：
    - `web/components/__tests__/handoff-query-surface-a.test.ts`
    - `web/components/__tests__/handoff-query-surface-b.test.ts`
    - `web/lib/__tests__/control-plane-proxy.test.ts`
    - `web/lib/__tests__/workspace-context.test.ts`
    - `web/lib/__tests__/workspace-context-metadata-guard.test.ts`
    - `web/lib/__tests__/enterprise-surface-routes.test.ts`
    - `web/app/api/workspace-context/__tests__/route.test.ts`
    - `web/app/api/control-plane/__tests__/metadata-guard.routes.test.ts`
    - `web/tests/page-level/workspace-context-hardening.page.test.ts`
    - `web/tests/page-level/settings-enterprise-write.page.test.ts`
    - `web/tests/page-level/settings-saved-refresh-coupling.page.test.ts`
    - `web/tests/page-level/verification-go-live-handoff.page.test.ts`
    - `web/tests/page-level/delivery-track-context-handoff.page.test.ts`
    - `web/tests/page-level/handoff-query-continuity-contract.page.test.ts`
    - `web/tests/page-level/console-pages-handoff-contract.page.test.ts`
  - 目前已細分為 `unit` / `contract` / `page` / `e2e`；其中 `e2e` 已落地最小 non-browser smoke，完整瀏覽器 e2e 仍後置。

本節用來幫助接手人快速判斷哪些工作流已進入實作階段，避免文檔與實際推進狀態脫節。

### 3.0.1 第三波已落地內容（同步）

截至 2026-04-04，第三波低風險收斂與文檔化已完成以下內容：

- enterprise backend additive readiness contract：
  - enterprise surfaces（`audit export` / `SSO` / `dedicated environment`）延續加法式 readiness contract，不破壞既有 workspace/billing 主流程，並維持 metadata-only guard 與 fallback 語義邊界。
- enterprise frontend contract normalize：
  - 前端對 enterprise/billing 狀態與 provider 語義做 normalize，降低 staged/ready、provider-managed/workspace-managed 表述不一致造成的誤判。
- settings enterprise surface productization：
  - `settings` 已作為三個 enterprise 能力的統一操作入口，具備更明確的 plan gate、狀態判讀與回退導向。
- SSO / dedicated environment controlled live write 同步：
  - 兩個 enterprise surface 已從通用 write-prep 文檔階段前進到 controlled live write 同步階段：目前已具備受控 web `POST` wrapper、metadata guard 與 delivery/readiness contract，可支撐受控 rollout；但仍不等同完全無條件的全面自助開放。
- enterprise fallback helper 與 service 再收口：
  - `web/services/control-plane.ts` 新增 `buildEnterpriseFallbackMeta` / `getEnterpriseFallbackUpgradeHref` / `getEnterpriseFallbackPlanCode` 等共用 helper，使 SSO / dedicated environment 的 fallback contract metadata、upgrade href 與 plan code 在 409 / 503 / generic request failure 場景中保持一致。`saveWorkspaceSsoReadiness` / `saveWorkspaceDedicatedEnvironmentReadiness` 透過這些 helper 進行 controlled live write，`downloadWorkspaceAuditExportViewModel` 也同步回傳 contract meta；相對應的 `web/lib/__tests__/control-plane-service.test.ts` 現在有 dedicated 409 fallback test，確保 contract source / issue / upgrade href / plan code 固定。這也讓 `settings` 頁面的 enterprise submit flow 能直接呼叫這些 service helper、維持原本的 contract 與手動錯誤映射，對應 `web/tests/page-level/settings-enterprise-write.page.test.ts`（含 upgrade card / next-steps / helper import）與 `web/tests/page-level/settings-saved-refresh-coupling.page.test.ts`（含 saved section coupling 與 source badges）進一步鎖定語義，並透過 `web/tests/e2e/saas-mainline-smoke.e2e.test.ts` 的 non-browser smoke 驗證 fallback upgrade href 與 contract source。
- service mutation helper 再收口：
  - `web/services/control-plane.ts` 的 `createRun`、`createWorkspace`、`bootstrapWorkspace`、`createApiKey` / `revokeApiKey` / `rotateApiKey`、`createServiceAccount` / `disableServiceAccount`、`createWorkspaceInvitation` / `revokeWorkspaceInvitation` / `acceptWorkspaceInvitation` 已改為復用可配置 `fallbackMessage/fallbackCode` 的 `postJson(...)`，把非 2xx 情況統一收斂為結構化 `ControlPlaneRequestError`，不再混用裸 `Error(status)`。這讓 service 層的 mutation/error contract 與前面已完成的 route-wrapper/helper 化口徑更一致，也讓後續 `enterprise live-write backend` 與 `settings live wiring` 可以直接站在統一的 service failure semantics 上推進。
  - 這組收斂也讓 `createRun`/`createWorkspace`/`createApiKey` 之外的 workspace-mutating flow（`service_account`/`invitation`/`tool_provider` 的創建與狀態切換）共享同一份 `ControlPlaneRequestError` 反映與 plan-limit metadata，進一步把控制台端的 mutation contract 往 `run/workspace/api-key/service-account/invitation/tool-provider` 的整體一致性靠攏。
- tool-provider service/UI 對齊：
  - `web/services/control-plane.ts` 新增 plan-limit aware 的 `createToolProvider(...)` / `updateToolProviderStatus(...)`，並以 `planLimit` metadata 保留 `plan_limit_exceeded` 語義；`web/components/agents/tool-provider-list.tsx` 現已改為直接復用這些 service helper，而不是在元件內維護另一套 `postJson(...)`。相對應的 `web/lib/__tests__/control-plane-service.test.ts` 已補上 tool-provider mutation 的 request/error contract 與 plan-limit passthrough 護欄。
  - `web/components/api-keys/api-keys-panel.tsx`、`web/components/api-keys/create-api-key-form.tsx`、`web/components/service-accounts/create-service-account-form.tsx`、`web/components/members/create-invitation-form.tsx` 以及 `web/components/agents/tool-provider-list.tsx` 目前都依賴 `ControlPlaneRequestError` 來選出 limit/error copy，並有對應的 page-level contract tests（`web/tests/page-level/api-keys-form-error-contract.page.test.ts`、`web/tests/page-level/access-forms-error-contract.page.test.ts`、`web/tests/page-level/tool-provider-list-contract.page.test.ts`）鎖定這些文字與 helper import，避免改動時錯誤語義漂移。
  - 進一步地，`web/components/service-accounts/service-accounts-panel.tsx` 與 `web/components/members/invitations-panel.tsx` 的 disable/revoke action error 也已改為復用結構化錯誤語義，並由 `web/tests/page-level/service-accounts-panel-error-contract.page.test.ts`、`web/tests/page-level/invitations-panel-error-contract.page.test.ts` 固定 helper/copy/red-banner 契約，避免控制台在 create-action 與 detail-action 之間再次分叉成兩套 generic 文案。
- route wrapper identity hardening：
  - route wrapper 身份與 workspace header forwarding 規則已進一步收斂，核心 metadata-only 路由維持嚴格錯誤返回，不再用高擬真 fallback 掩蓋問題。
  - `W12-C11` 目前又向前收了一層：workspace-scoped detail mutation routes 已抽出 `proxyWorkspaceScopedDetailPost(...)`，`tool-provider` detail routes 也開始透過獨立 `route-helpers.ts` 收斂 path/init 樣板；這一段仍維持 `in_progress` 口徑，表示 helper family 正在繼續收口，而不是已全面完成。
- 測試計劃與 runbook 已新增：
  - 最小測試計劃：`docs/tests_observability_wave1_wave2_min_plan_zh.md`
  - enterprise surface runbook：`docs/enterprise_surface_runbook_zh.md`
  - enterprise route/source 護欄：`web/lib/__tests__/enterprise-surface-routes.test.ts`

這一波以「不擴大風險面、先補可驗收 contract 與運維文檔」為優先，為後續 tests-observability 與 enterprise feature 深化提供穩定基線。

### 3.0.2 下一步建議並行槽位（更新）

前一輪建議的三條槽位中：

- 槽位 A `enterprise backend 深化`：additive readiness contract 已落地，現轉入 controlled live write 契約同步。
- 槽位 B `settings write-prep`：通用 write-prep 已落地，現轉入 controlled live write 導流、提交與回退同步。
- 槽位 C `route-contract-tests`：已補一層最小 source/route 護欄，且目前 `web:test` 已覆蓋 `web/lib` 與 `web/app/api` 兩層最小契約測試。

建議把下一步切成 3 條新的可並行槽位，降低互相阻塞：

1. 槽位 A1：enterprise live-write backend  
  目標：為 `SSO` / `dedicated environment` 等 enterprise surface 定義真實寫入 API 與 payload/錯誤契約，從 controlled live write 同步邁向真正可驗收的受控寫入。
2. 槽位 B1：settings live wiring  
  目標：把目前 settings 的 controlled live write 導流逐步接到真實 mutation，補齊提交後狀態刷新、錯誤映射與回退說明。
3. 槽位 C1：page-level tests / observability  
  目標：補 `Topbar` / `Members` 的頁面級驗證與最小觀測口徑，並逐步把既有 `web/app/api` 契約測試納入統一測試入口。

建議節奏：

1. 先把 C1 的頁面級最小驗收補齊，延續已完成的 P0 route-contract-tests。  
2. 同步推進 A1/B1，避免 settings UI 與 backend live-write 契約再次脫節。  

### 3.0.3 當前並行槽位狀態（同步）

截至 2026-04-04，目前並行槽位狀態建議按以下口徑同步：

- 槽位 A（enterprise backend 深化）：`in_progress`
  - additive readiness contract 已落地，SSO / dedicated environment 已進入 controlled live write 同步口徑；下一步轉入 `enterprise live-write backend`。
- 槽位 B（settings write-prep）：`in_progress`
  - settings enterprise surface 已從通用 write-prep 前進到 controlled live write 導流與提交準備，下一步轉入 `settings live wiring`；當前仍需保持「受控 rollout，不等同全面自助開放」邊界，避免過度承諾。
- 槽位 C（route-contract-tests）：`in_progress`
  - 已有 `web/lib/__tests__/control-plane-proxy.test.ts`、`web/lib/__tests__/workspace-context.test.ts`、`web/lib/__tests__/workspace-context-metadata-guard.test.ts`、`web/lib/__tests__/enterprise-surface-routes.test.ts` 納入當前最小入口；
  - `web/app/api/workspace-context/__tests__/route.test.ts`、`web/app/api/control-plane/__tests__/metadata-guard.routes.test.ts` 目前也已納入當前 `web:test`；
  - 下一步優先補頁面級與 observability，並把當前混合入口進一步細分為 unit/contract/e2e。
- 槽位 E（docs/tests observability sync）：`in_progress`
  - 聚焦把擴大的 shared handoff helper（含 `buildHandoffHref`）覆蓋面、delivery panel continuity contract、`settings -> verification/go-live` 覆蓋口徑、`onboarding/api-keys/access forms/tool-provider` 的新增 page-level contract，以及 `W12-E01` 邊界聲明同步到執行文檔與最小測試計劃，避免測試覆蓋口徑漂移。

### 3.0.4 本輪並行拆解狀態（2026-04-03，同步）

以下狀態是「本輪拆解中的執行狀態」，不是最終完成狀態：

- 槽位 A2（page-level validation）：`completed`
  - 範圍：`Topbar` fallback warning badge、`Members` metadata guard 頁面表現。
  - 已落地 `web/tests/page-level/workspace-context-hardening.page.test.ts` 與 `web:test:page`，先以前置 page-level/source contract 補齊回歸網。
- 槽位 B2（enterprise backend contract deepen）：`completed`
  - 範圍：SSO 多域名原生契約（向後兼容 `email_domain`）、dedicated intake 字段持久化與 readiness 回顯深化。
  - 已完成 `normalize -> save(config_json) -> parse -> readiness` 對齊；維持 controlled live write，不擴大為全面 self-serve GA。
- 槽位 C2（enterprise settings/service 對齊）：`completed`
  - 範圍：settings 提交流與 backend 新契約對齊、錯誤映射與刷新閉環。
  - 已完成 settings/service/type 對齊，並補齊草稿回填與已保存配置回顯。
- 槽位 D2（docs/tests 口徑同步）：`completed`
  - 範圍：開發執行文檔、tests-observability 最小計劃、enterprise runbook 的同輪同步。
  - 口徑：文檔已回寫為本輪真實已落地狀態，不把未合併代碼寫成已完成；`W12-E01` 明確為可執行 non-browser smoke，`W12-P04/P05/P07/P08/P09/P11/P12/P13` 明確作為 settings handoff、verification/go-live continuity、console pages continuity 與 `service-accounts/api-keys/usage/verification` explicit-surface continuity 的 page/source 契約主回歸網。
- 槽位 E2（docs/tests 邊界同步）：`completed`
  - 範圍：共享 handoff helper（含 `buildHandoffHref`）、delivery panel continuity contract、`settings -> verification/go-live` 導流覆蓋面、`W12-E01` 邊界聲明更新。
  - 口徑：`settings` 到 verification/go-live 的導流 affordance、console pages continuity 與 surface query continuity 不歸入 full e2e 完成聲明，而是由 page/source contract（`W12-P04/P05/P07/P08/P09/P11/P12`）承擔主回歸網。

### 3.0.5 W12-E01 邊界同步（2026-04-03）

- `W12-E01` 現口徑為「可執行 non-browser smoke」，不是「完整瀏覽器端到端旅程」。
- smoke 已覆蓋：
  - `workspace-context` metadata mainline（`GET + POST`）
  - `settings` submit path + success affordance + saved-sections 最小 source-assisted contract
  - `settings` 側 verification/go-live handoff affordance 與 audit export execution contract
  - shared handoff-query 在 settings/go-live/delivery surfaces 的 continuity contract（source-assisted+execution）
  - 更深一層 source-assisted+execution continuity：`surface -> verification/go-live -> admin return`、`onboarding/playground/usage` shared helper query-key continuity，以及 `artifacts/logs/members` console-page continuity smoke
- smoke 未覆蓋（由 page/source contract 補位）：
  - verification/go-live 與 delivery panel 的完整跨頁連續旅程（含 UI 交互時序與真實導航）
  - 真實瀏覽器互動細節與完整 verification/go-live 端到端旅程
- 本輪同步補充：
  - `artifacts/logs` 的 verification/go-live 導流已顯式帶 `surface`（`/verification?surface=verification`、`/go-live?surface=go_live`），並由 page/source contract 固定語義。
  - shared handoff continuity 新增主要落在 page/source contract（`web/tests/page-level/handoff-query-continuity-contract.page.test.ts`、`web/tests/page-level/console-pages-handoff-contract.page.test.ts`、`web/components/__tests__/handoff-query-surface-a.test.ts`），覆蓋 `verification/go-live/api-keys/service-accounts`、`onboarding/playground/usage` 與 console pages 的 helper continuity 口徑。
  - `service-accounts/api-keys/usage/verification` 的 explicit `surface` 收斂已補齊：`usage`、`service-accounts`、`api-keys` 與 `verification checklist` 上的 handoff 入口現統一顯式帶 `verification?surface=verification`；對應 source/page contract 已同步收緊。
  - `workspace launchpad` 與 `accept-invitation` 入口鏈已補一層 continuity 護欄：前者把 recommended/all-surfaces 中的 `verification/go-live` 收斂到顯式 `surface`，後者把 onboarding path builder 改為保留既有 query，避免 `surface` 被 continuity query 吃掉。
  - `web:test:e2e` 本輪已加深為 source-assisted+execution smoke，但仍維持 non-browser 邊界聲明，未宣告 browser e2e 完成。

### 3.0.6 Invitation continuity 合約同步（2026-04-03）

- 前提：invitation continuity 已落地，`members` 的 invitation 入口已作為主鏈路之一。
- 本輪新增同步鏈路：
  - `members -> accept-invitation -> members/playground/verification/go-live`
- 合約重點（對齊 shared handoff continuity）：
  - `members -> accept-invitation` 在適用場景（onboarding handoff）下延續 shared continuity query 語義，不改寫 key 命名。
  - `accept-invitation` 的 next-step builder 在導流到 `members/playground/verification/go-live` 時，不丟失：
    - `week8_focus`、`attention_workspace`、`attention_organization`、`delivery_context`、`recent_track_key`、`recent_update_kind`、`evidence_count`、`recent_owner_label`。
  - `verification/go-live` 導流繼續保留顯式 `surface`：
    - `/verification?surface=verification`
    - `/go-live?surface=go_live`
- 邊界聲明（避免口徑漂移）：
  - 上述覆蓋層級歸入 `W12-E01` 的 source-assisted+execution non-browser smoke 與 page/source contract 主回歸網。
  - 這不是完整 browser e2e，不宣告真實跨頁點擊時序、渲染與導航全覆蓋。

### 3.0.7 Backend slices 同步（2026-04-04）

本輪已完成、且需要回寫到執行口徑的 backend slices 如下：

- session / workspace identity boundary 已收緊：
  - `/api/v1/saas/*` 的 user resolution 現只接受可信 authenticated subject header：`x-authenticated-subject` 或 `cf-access-authenticated-user-email`。
  - 直接依賴 `x-subject-id` 的 SaaS session 解析已被拒絕；web `workspace-context` 也已同步成只有在有可信 subject 時才會打 `/api/v1/saas/me`，否則誠實回落到 `env-fallback` / `preview-fallback`，不再用 env 預設 subject 假裝 live metadata session。
- workspace / organization access gate 已收緊：
  - SaaS workspace 存取現在同時要求 active workspace、active organization、active workspace membership 與 active organization membership。
  - disabled workspace、disabled organization membership 與不再 active 的 access path，現已從 `/api/v1/saas/me` 與 workspace detail 主鏈路中被排除。
- invitation / seat-limit guard 已收緊：
  - invitation 建立與接受都會套用 `member_seats` 限額，pending invitation 會一併計入 seat reservation。
  - disabled workspace / organization、disabled membership 與非 pending invitation 不再可被接受，避免 invitation path 繞過 workspace 狀態與 seat gate。
  - web `accept-invitation` page 也已把這批保護邊界轉成可見敘事：trusted session 缺失、seat-limit、revoked/expired token，以及 disabled workspace / organization 都有獨立文案，不再只把 backend 原始錯誤直接丟給使用者。
- usage / billing period 對齊已完成：
  - `src/app.ts` 的 usage ledger 寫入與 plan-limit 判定現已統一跟隨 subscription billing period，不再混用與訂閱週期脫節的時間窗。
  - `run`、`replay`、`tool-provider` 等會消耗配額的路徑，現在都會把 subscription period 一起帶入 usage 記錄與 limit 判斷，避免 usage 顯示、billing 週期與限流報錯三者各說各話。
  - `web/components/usage/workspace-usage-dashboard.tsx` 也會把 `period_start` / `period_end` 顯式展示成 `Current usage window`，並在 over-limit 時保留回到 settings / upgrade lane 的可見 CTA，方便把 period boundary 帶進 verification evidence。
- plan-limit detail contract 已標準化：
  - workspace / run / provider / seat-limit 等 `plan_limit_exceeded` 類錯誤，現已對齊為同一組 detail 欄位：`scope`、`used`、`limit`、`remaining`、`workspace_id`、`plan_id`、`plan_code`、`upgrade_href`、`period_start`、`period_end`。
  - `web/services/control-plane.ts` 已同步擴充 `PlanLimitState` 與 `parsePlanLimitError(...)`，控制台不再只拿到局部 limit 訊息，而能顯示剩餘額度、升級導流與計費週期邊界。
- `workspace_onboarding_states` 持久化已落地：
  - 已新增 `migrations/0007_workspace_onboarding_states.sql`，作為 onboarding 狀態持久化的最小表結構。
  - workspace create 會持久化 `workspace_created` 初始狀態；bootstrap 完成後會把 bootstrap summary 一起寫回；`buildWorkspaceOnboardingState(...)` 也已改為合併持久化狀態，而不是僅依賴即時計算。
  - 這代表 onboarding 已從「僅靠當下 API 現算」前進到「可回看、可恢復、可延續」的 state persistence 基線，但目前持久化主體仍聚焦在 create/bootstrap summary，尚未擴展到所有 demo/evidence milestone。
- root smoke / web service test 覆蓋已同步補齊：
  - 倉庫根層 `npm run smoke` 已新增並固定以下 backend mainline：workspace create idempotency（含 plan 回傳）、disabled workspace / inactive org membership guard、invitation seat limit、bootstrap provider limit、usage/billing period 對齊、plan-limit detail contract、bootstrap onboarding persistence、trusted subject identity requirement、disabled workspace invitation accept guard。
  - web service 單元契約已由 `web/lib/__tests__/control-plane-service.test.ts` 補上 plan-limit 擴展欄位斷言，固定 `remaining`、`planId`、`planCode`、`upgradeHref`、`periodStart`、`periodEnd` 等解析結果，避免 backend detail contract 與 web service parsing 再次漂移。
  - 本輪對應驗證口徑已包含：
    - `npm run check`
    - `npm run smoke`
    - `npm --prefix web run check`
    - `node --import tsx --test lib/__tests__/control-plane-service.test.ts`（在 `web/` 目錄下）

### 3.1 成功標準

至少達成以下結果：

- 核心控制台頁面不再依賴 preview/fallback 假資料
- workspace / organization / membership 由真實 session 與 metadata 決定
- billing 具備可試運行的正式自助升級主路徑
- onboarding 關鍵步驟可在產品內完成並可回看狀態
- 至少一項 enterprise 能力從 staged/readiness 推到可用版本

### 3.2 本輪不做

- 不追求完整 PLG 註冊體驗
- 不做複雜多套餐、多幣種、多市場計費
- 不做完整 marketplace 或通用 workflow builder
- 不重寫 Worker runtime 與 northbound API 主幹

## 4. 開發原則

- 保留既有 `tenant_id` runtime 隔離鍵，不重寫 control plane 核心
- SaaS 元資料層與 console session 層優先補齊
- 先讓真實資料可見、錯誤顯性，再做更多 fallback 美化
- 優先做能直接影響可售賣性與可運營性的能力
- 並行開發時，盡量以不重疊的檔案集切分 ownership

## 5. 4 週里程碑

### Week 1：Session / Context Hardening

目標：

- 收口 workspace context
- 減少 preview / env fallback 對正式控制台的干擾
- 統一 Web proxy 的身份與 workspace header 注入

完成定義：

- 核心 SaaS 頁面在沒有 metadata 時回明確錯誤或顯示 local/dev mode，而不是默默回 preview data
- workspace context 能清楚區分 production-like metadata 模式與 local fallback 模式
- 主要 proxy route 的 headers 行為一致

### Week 2：Billing Productionization

目標：

- 明確 self-serve billing 主路徑
- 跑通 checkout -> completion/webhook -> subscription state update
- 完成基本 cancel / resume / portal flow

完成定義：

- Pro 升級可從 settings 發起
- subscription 狀態可正確回寫 workspace
- mock provider 降級為測試/開發用途，非正式主路徑

### Week 3：Onboarding Productization

目標：

- 把 workspace 建立後的核心初始化流程產品化
- 把 bootstrap、service account、API key、first demo run 串成統一流程

完成定義：

- onboarding 可展示真實狀態、下一步與失敗原因
- provisioning / evidence / rollback 至少有產品內狀態承載點

### Week 4：Enterprise Readiness

目標：

- 至少完成一項 enterprise feature
- 補齊監控與 e2e 覆蓋

完成定義：

- `audit export` 或 `SSO` 或 `dedicated environment` 至少一項可交付
- SaaS 關鍵路徑有測試與監控

## 6. 工作流拆解

### 工作流 A：Workspace Session / Context

範圍：

- `web/lib/workspace-context.ts`
- `web/app/api/workspace-context/route.ts`
- `web/components/topbar.tsx`
- `web/components/onboarding/workspace-onboarding-wizard.tsx`

目標：

- 讓 metadata-backed context 與 fallback mode 有明確邊界
- local/dev mode 可以保留，但不能偽裝成真實 SaaS session

待辦：

- 統一 context source label 與語意
- 明確標記哪些情況屬於 local/dev fallback
- 優化 workspace context API 回應，方便前端顯示真實狀態
- 讓 onboarding 與 topbar 對 fallback 狀態給出更明確提示

驗收：

- 當 source 不是 `metadata` 時，UI 會清楚標示為 fallback
- metadata 可用時，不再退回 preview 模式
- onboarding wizard 透過 `selectWorkspaceContext` helper 保持 workspace selection/fallback 語義，讓 page 端的 context badge 與 handoff copy 與共享 service helper 進度同步。

### 工作流 B：Critical Route Hardening

範圍：

- `web/lib/control-plane-proxy.ts`
- `web/app/api/control-plane/workspace/route.ts`
- `web/app/api/control-plane/me/route.ts`
- `web/app/api/control-plane/members/route.ts`

目標：

- 核心身份與 workspace surface 不再以 preview 資料掩蓋 upstream 問題

待辦：

- 區分「可接受 fallback」與「必須嚴格失敗」的 route
- 對 `workspace`、`me`、`members` 等核心 surface 返回結構化錯誤
- 減少富假資料 fallback

驗收：

- upstream 缺失時，核心 route 會回明確錯誤
- 不再對 `workspace` 與 `me` 返回高擬真 preview 資料

### 工作流 C：Mutation / Detail Proxy Consistency

範圍：

- `web/app/api/control-plane/workspaces/route.ts`
- `web/app/api/control-plane/workspaces/[workspaceId]/bootstrap/route.ts`
- `web/app/api/control-plane/workspace/billing/checkout-sessions/route.ts`
- `web/app/api/control-plane/workspace/billing/checkout-sessions/[sessionId]/route.ts`
- `web/app/api/control-plane/workspace/billing/checkout-sessions/[sessionId]/complete/route.ts`
- `web/app/api/control-plane/workspace/billing/subscription/cancel/route.ts`
- `web/app/api/control-plane/workspace/billing/subscription/resume/route.ts`
- `web/app/api/control-plane/workspace/billing/providers/route.ts`
- `web/app/api/control-plane/workspace/billing/portal-sessions/route.ts`
- `web/app/api/control-plane/workspace/sso/route.ts`
- `web/app/api/control-plane/workspace/dedicated-environment/route.ts`
- `web/app/api/control-plane/workspace/audit-events/export/route.ts`

目標：

- 減少 route wrapper 重複邏輯
- 統一 workspace / subject / roles / tenant headers 的轉發行為

待辦：

- 收斂 `getBaseUrl` / `getAuthenticatedSubject` / `getAuthenticatedRoles` 重複邏輯
- 讓 mutation 與 detail route 行為一致
- 補齊錯誤返回與 no-store 行為一致性

驗收：

- route wrapper 之間 header forwarding 規則一致
- 減少重複樣板碼

### 3.0.7 Route wrapper consistency 進度（2026-04-??）

- 本輪聚焦把 mutation/detail route 內「`getBaseUrl` + `fetch` + `cache: \"no-store\"` + workspace header」的樣板抽往共用 helper，再把該 helper 的 `x-authenticated-*`/`x-workspace-*`/`x-tenant-id` 透傳語義統一。
- 目前 `workspace` / `me` / `members` 等 metadata-only 路由已把 `workspace_context_not_metadata` 412 guard 與 `controlPlaneErrorResponse` contract 鎖定；下一步是讓剩餘 mutation/detail route 也復用這套 helper、並維持 `no-store`/content-type/`idempotency-key`/header 轉發一致後才算真正完成。
- 先行 contract 護欄會在 `web/app/api/control-plane/__tests__/metadata-guard.routes.test.ts` 以及 `web/lib/__tests__/control-plane-proxy.test.ts` 中加入 `workspace_context_not_metadata`、`cache: \"no-store\"` 與 header 一致性的斷言，文檔在 helper 替換完成後再標記為「已完成」，目前以「本輪同步 route wrapper consistency 护栏」口徑描述。
### 3.0.7 Route wrapper consistency 進度（2026-04-*/未完成）

- 本輪聚焦進一步把 `getBaseUrl` + `fetch` + `no-store` + workspace header 的樣板從各個 route 內抽出，直接復用 `proxyControlPlane` / `proxyControlPlaneOrFallback`，並統一 `x-authenticated-*`/`x-workspace-*`/`x-tenant-id` 的轉發行為。
- 目前 metadata-only 路由（例如 `workspace`/`me`/`members`）已把 `workspace_context_not_metadata` 412 guard 和 `controlPlaneErrorResponse` 香度口徑寫死，還需要讓其余 mutation/detail route 也共享 helper 才算完成。
- 先行 contract 护栏會在 `web/app/api/control-plane/__tests__/metadata-guard.routes.test.ts` 及全局 proxy test 中加強 `workspace_context_not_metadata` 412 以及 `cache: "no-store"` / header 一致性驗證，並於後續再把文檔中這段進展標記為“已完成”。
- 最新一輪已把 `web/tests/route-wrapper-consistency.test.ts` 再往前推到 `workspaces` 與 `workspaces/[workspaceId]/bootstrap`：除了既有 mutation/detail route 的 `proxyControlPlane` / `POST` / `idempotency-key` contract 外，現在也會驗證 workspace create 的 `includeTenant:false + content-type/body passthrough`，以及 bootstrap route 的 forwarded auth headers（`x-authenticated-*` 優先、`cf-access-*` 回退）、`x-workspace-id` / 條件式 `x-workspace-slug` / `x-tenant-id` 注入與空 `workspaceId` 400 guard。這讓 WorkFlow C 在 helper 化尚未完全完成前，至少已有一層更接近真實 wrapper 邊界的 source-contract 回歸網。
- 本輪又把這條線再前推一步：`web/app/api/control-plane/workspaces/route.ts` 與 `web/app/api/control-plane/workspaces/[workspaceId]/bootstrap/route.ts` 已開始共用新抽出的 `web/app/api/control-plane/workspaces/route-helpers.ts`，其中 `buildWorkspaceCreateProxyInit` / `buildWorkspaceBootstrapProxyInit` / `buildForwardedAuthHeaders` 把 POST body、`content-type`、`idempotency-key`、forwarded auth headers 與條件式 workspace/tenant header 注入收斂為可直接執行的純 helper；對應的 `web/app/api/control-plane/__tests__/workspace-route-helpers.test.ts` 已把這些 helper 的 runtime 語義鎖進 `web:test:contract`。
- 同時，`web/tests/route-wrapper-consistency.test.ts` 也開始把尚未 helper 化的 legacy direct-fetch POST wrapper 納入 `W12-C11`：`invitations`、`invitations:accept`、`service-accounts`、`api-keys`、`tool-providers`、`runs` 現在都會被檢查 `getBaseUrl` 503 guard、`await request.text()` body passthrough、`accept/content-type/idempotency-key`、workspace/auth headers 與 `cache:"no-store"` / upstream `content-type` passthrough，減少這批 route 在尚未重構前悄悄漂移的風險。
- `W12-C11` 的 fallback wrapper 也補進來了：`workspace/delivery` 現在會被固定 `GET` 的 `404/503 -> buildFallbackTrack` 預覽回退語義與 `POST` 的 `body.length === 0 ? undefined : body` passthrough，`admin/overview` 也會被固定 `includeTenant:false` 與 `404/503 -> preview summary` 的 fallback contract。這讓 route wrapper consistency 不再只盯 mutation path，也把兩個關鍵 fallback surface 一併拉進回歸網。
- 本輪再往前推了一層真正的 helper 化：新增 `web/app/api/control-plane/post-route-helpers.ts`，把 `CONTROL_PLANE_BASE_URL` 解析、`control_plane_base_missing` 503 回應、workspace-scoped/authenticated POST headers（含 `accept` / `content-type` / `idempotency-key` / auth/workspace/tenant headers）與 upstream response passthrough 收斂為共用 helper；`invitations`、`service-accounts`、`api-keys`、`tool-providers`、`runs`、`invitations:accept` 的 POST wrapper 已改為復用這層 helper，讓 `W12-C11` 開始從「只靠 contract 守住」前進到「實際減少 route 內樣板碼」。
- 最新一輪又補上第二層 helper 收斂：`post-route-helpers.ts` 新增 `buildProxyControlPlanePostInit(...)`，把 `proxyControlPlane(...)` 路由常見的 `POST + application/json + idempotency-key + body passthrough` init 組裝收成純 helper；`invitations/[invitationId]:revoke`、`api-keys/[apiKeyId]:revoke|rotate`、`service-accounts/[serviceAccountId]:disable`、`tool-providers/[toolProviderId]`、`tool-providers/[toolProviderId]:disable` 已切到這套 helper，`web/tests/route-wrapper-consistency.test.ts` 也同步改成固定「helper import/usage + 無 direct fetch/headers 樣板」契約。
- 本輪再把 metadata-guarded enterprise/write 與 fallback POST wrapper 也一起收進來：`workspace/sso`、`workspace/dedicated-environment` 目前都改為在保留 `requireMetadataWorkspaceContext(...)` guard、upstream path 與 request `accept/content-type` 來源語義的前提下，直接復用 `buildProxyControlPlanePostInit(...)`；`workspace/delivery POST` 也改為復用同一套 helper，保留 `includeTenant:true`、`content-type: application/json` 與空 body -> `undefined` 的語義。對應的 `web/lib/__tests__/enterprise-surface-routes.test.ts` 與 `web/tests/route-wrapper-consistency.test.ts` 已同步固定這批 enterprise/delivery wrapper 的 helper import/usage 契約。這讓 `W12-C11` 從 collection/detail mutation wrapper 再擴到 metadata-guarded enterprise POST wrapper 與 delivery POST；整體狀態仍保守維持 `in_progress`，因為 route family 雖已大幅收斂，但尚未宣告所有 wrapper 完全歸一。
- 本輪又把 collection POST wrapper 再往上收了一層：`post-route-helpers.ts` 新增 `proxyWorkspaceScopedPostRequest(...)` 與 `proxyAuthenticatedPostRequest(...)` 兩個高階代理 helper，把 `getControlPlaneBaseUrl` 503 guard、`await request.text()`、workspace/authenticated headers 組裝與 `proxyControlPlanePost(...)` 串接一起內聚；`invitations`、`service-accounts`、`api-keys`、`tool-providers`、`runs`、`invitations:accept` 現在都直接復用這層 helper。`runs` 仍保留 request-derived `content-type ?? "application/json"`，`invitations:accept` 仍保留 `headers()` 推導 subject/roles 的 fallback 語義，但 route 內的 baseUrl/body/header 樣板已被移除。對應的 `web/app/api/control-plane/__tests__/post-route-helpers.test.ts` 與 `web/tests/route-wrapper-consistency.test.ts` 已同步固定這批 collection helper 的 runtime/source contract。這讓 `W12-C11` 的 collection POST wrapper 從「共用 headers helper」進一步提升為「直接共用 request -> upstream 代理 helper」。
- 最新一輪也順手把 billing POST init 再收了一層：`web/app/api/control-plane/workspace/billing/route-helpers.ts` 的 `buildBillingPostProxyInit(...)` 已改為直接復用共享 `buildProxyControlPlanePostInit(...)`，不再維護另一套 billing 專屬的 `content-type` / `idempotency-key` / body 樣板；對應的 `web/app/api/control-plane/__tests__/billing-route-helpers.test.ts`、`web/app/api/control-plane/__tests__/billing-routes.test.ts` 與 `web/tests/route-wrapper-consistency.test.ts` 已同步固定這層 helper 委派契約。這一段仍維持「局部 helper family 收口」口徑，不把整體 `W12-C11` 提前寫成完成。
- 最新一輪也把 run detail GET wrapper 往前收了一層：`web/app/api/control-plane/runs/route-helpers.ts` 新增 `buildRunPath(...)` 與 `proxyRunDetailRequest(...)`，把 `runs/[runId]`、`runs/[runId]/graph`、`runs/[runId]/events`、`runs/[runId]/artifacts` 這四條 detail route 的 upstream path 與 query passthrough 收斂為共享 helper；對應的 `web/app/api/control-plane/__tests__/run-route-helpers.test.ts` 與 `web/tests/route-wrapper-consistency.test.ts` 已同步固定這層 helper import/usage 契約。這讓 `W12-C11` 從 POST/detail mutation 再向 GET detail family 推進，但整體狀態仍保守維持 `in_progress`。
- 本輪再把 metadata-only GET family 收了一層：`web/app/api/control-plane/get-route-helpers.ts` 新增 `proxyMetadataGet(...)`，把 `workspace`、`me`、`members` 三條 metadata-backed GET route 的 `resolveWorkspaceContextForServer(...)`、`requireMetadataWorkspaceContext(...)` 與 `proxyControlPlane(...)` 樣板收進共享 helper；對應的 `web/app/api/control-plane/__tests__/metadata-get-route-helpers.test.ts`、`web/app/api/control-plane/__tests__/metadata-guard.routes.test.ts`、`web/lib/__tests__/workspace-context-metadata-guard.test.ts` 與 `web/tests/route-wrapper-consistency.test.ts` 已同步切到 helper 契約。這讓 `W12-C11` 不再只覆蓋 mutation/detail，也開始把 metadata-only GET family 納入實際 helper 化範圍。
- 本輪也把 fallback GET family 往前收了一層：`web/app/api/control-plane/fallback-route-helpers.ts` 新增 `proxyFallbackGet(...)`，把 `admin/overview` 與 `workspace/delivery GET` 的 `404/503 -> preview` 語義、`includeTenant` 邊界與 fallback meta 收進共享 helper，同時保留既有 preview payload 形狀不變；對應的 `web/app/api/control-plane/__tests__/fallback-route-helpers.test.ts` 與 `web/tests/route-wrapper-consistency.test.ts` 已把這層 helper import/usage 鎖進 contract 回歸網。
- `workspaces` 這條線也再收了一層：`web/app/api/control-plane/workspaces/route-helpers.ts` 內的 `buildWorkspaceCreateProxyInit(...)` / `buildWorkspaceBootstrapProxyInit(...)` 現在都改為站在共享 `buildProxyControlPlanePostInit(...)` 之上，再疊加 forwarded auth 與條件式 workspace/tenant header 注入，而不是維護另一套獨立的 POST body/idempotency 組裝。對應的 `web/app/api/control-plane/__tests__/workspace-route-helpers.test.ts` 已同步固定這層 runtime contract。整體口徑仍維持 `W12-C11 in_progress`，不把整個 wrapper family 提前寫成完成。
- 本輪也補了一層 system wrapper source-contract：`web/app/api/control-plane/__tests__/system-routes.test.ts` 現在固定 `health` route 的 `/api/v1/health + includeTenant:false` 與 `policies` route 的 preview fallback payload（`previewPolicies` + `page_info.next_cursor:null`），讓非 workspace wrapper 不再完全游離於主要回歸網之外；這一段偏向獨立 contract 加固，不單獨把更大 SaaS 里程碑寫成完成。
- 本輪也把 service 層與 settings 頁面再收一層：`web/services/control-plane.ts` 引進 `buildEnterpriseFallbackMeta` / `getEnterpriseFallbackUpgradeHref` / `getEnterpriseFallbackPlanCode` 等 helper，用以標準化 SSO / dedicated environment 在 `409 + workspace_feature_unavailable`、`503 + control_plane_base_missing` 與 `generic request failure` 的 contract metadata、upgrade href 與 plan code，並讓 `saveWorkspaceSsoReadiness` / `saveWorkspaceDedicatedEnvironmentReadiness` 回傳 normalized readiness、拋出結構化 `ControlPlaneRequestError` 失敗，再加上 `downloadWorkspaceAuditExportViewModel` 對 `contract_meta.source` 與 `issue` 的欄位補齊，使 `settings` 頁面能直接呼叫這些 service helper 而不再自己寫 raw `fetch`。對應的 page-level 與 non-browser smoke 測試（`web/tests/page-level/settings-enterprise-write.page.test.ts`、`web/tests/page-level/settings-saved-refresh-coupling.page.test.ts`、`web/tests/e2e/saas-mainline-smoke.e2e.test.ts`）同步加入 `saveWorkspace...` 的 import/usage、upgrade card 文字與 dedicated upgrade href 的斷言，進一步把 enterprise live-write contract 與 fallback guidance 鎖進 W12-C11 的 helper化進度。
- `admin overview` 也補進了明確的 `contract_meta` 呈現：`web/services/control-plane.ts` 現在會把 live/fallback admin summary 正規化為 `contract_meta.source + issue`，`web/components/admin/admin-overview-panel.tsx` 會顯式展示 live contract 與 preview fallback badge/說明，避免 admin snapshot 在 fallback 情況下仍被誤讀為真實 readiness；對應的 `web/tests/page-level/admin-overview-handoff.page.test.ts` 已把這層 source/page contract 固定下來。
- `delivery track` 這個獨立 surface 也補進了同一套 live vs preview/fallback source contract：`web/app/api/control-plane/workspace/delivery/route.ts` 的 fallback preview 現會明確帶出 `contract_meta`，`web/services/control-plane.ts` 的 `fetch/saveWorkspaceDeliveryTrack(...)` 會在 live/fallback 兩路都正規化 `contract_meta.source`，`web/components/delivery/workspace-delivery-track-panel.tsx` 也會顯式展示 source badge 與 guidance copy，避免 delivery evidence panel 在 fallback 情況下仍被誤讀為 live 狀態；對應的 `web/app/api/control-plane/__tests__/fallback-route-helpers.test.ts`、`web/lib/__tests__/control-plane-service.test.ts` 與 `web/tests/page-level/delivery-track-context-handoff.page.test.ts` 已補齊這層 contract 回歸網。
- 本輪再往前收了一步：`admin / delivery / settings` 三個 surface 的 fallback source 語義已從單一的 `preview/fallback` 進一步細分為可區分的 `404 / 503 / 409` UI contract，讓頁面能把 `route unavailable`、`control plane unavailable` 與 plan-gated 情境拆開呈現；這仍是收口中的前端 contract 進展，用來降低誤讀與誤導，不代表這三個 surface 已經可被寫成 fully GA。
- `web/tests/e2e/saas-mainline-smoke.e2e.test.ts` 本輪也再補了一條 settings enterprise live-write error smoke：現在會顯式用 non-browser execution 驗證 `saveWorkspaceSsoReadiness(...)` 的 `idempotency_conflict` 與 `saveWorkspaceDedicatedEnvironmentReadiness(...)` 的 `401/403` 類 owner/admin access failure，並以 source-assisted 方式固定 `formatEnterpriseWriteError(...)` 的對應 copy。這讓 settings 的 enterprise submit flow 不只守 success/fallback/handoff，也把兩條最容易在 rollout 過程中漂移的 failure semantics 拉進主 smoke 網，但仍維持 non-browser 邊界，不宣告完整 browser e2e。

驗收：

- route wrapper 之間 header forwarding 規則一致
- 減少重複樣板碼

### 工作流 D：Billing Productionization

範圍：

- `src/lib/billing-providers.ts`
- `src/app.ts` billing routes / webhook handling
- `web/services/control-plane.ts`
- `web/components/settings/workspace-settings-panel.tsx`
- `web/components/usage/workspace-usage-dashboard.tsx`

目標：

- 把 billing 從 scaffold 推到可試運行主路徑

本輪已完成：

- `resolveWorkspaceCheckoutProvider` 依照自助 provider 優先級（Stripe > 其他），只有在 `allowMockCheckout` 顯式打開時才回退到 `mock_checkout`，預設無 Stripe 時直接回傳 `null` 以觸發 `billing_self_serve_not_configured`。這讓 production 自助升級明確依靠 Stripe，而 mock checkout 保留在 local/staging/test 或實驗性測試場景。
- `src/app.ts` 的 billing summary 與 checkout session 建立流程同步讀取 `BILLING_SELF_SERVE_PROVIDER`、產生 `configuredSelfServeProvider` / `allowMockCheckout`，並在沒有正式 provider 時直接回錯與文案區分 ready/staged 兩種狀態。
- 設定與 usage 頁面文案已把 mock checkout 明確標示為 test-only fallback、同時推薦生產環境以 `stripe` 為 self-serve provider，並由新的 page-level tests（`web/tests/page-level/billing-self-serve-provider.page.test.ts`）把這個語義鎖死在 source/page contract 層，避免 UI 內容或文檔回退。
  - billing summary 的 `upgrade / manage-plan / resolve-billing` 關鍵 action 文案與 CTA 已由 page/source contract 補一層護欄，確保 Stripe-first、past-due warning、trial/cancelled fallback 等語義不會悄悄漂移。
- billing route wrappers 與 service 請求層已新增 source-contract + non-browser smoke：`checkout-sessions` / `providers` / `portal-sessions` / `subscription:cancel|resume` 的 method/path/idempotency semantics、以及 `billing_self_serve_not_configured` / `billing_provider_portal_unavailable` 這類結構化錯誤，現在都會在 `web:test:contract` / `web:test:e2e` 內被驗證；`web/lib/__tests__/control-plane-service.test.ts` 補的 portal-unavailable 錯誤 guard 會把 `status/code/message/details` 串成 `ControlPlaneRequestError` 往上報，降低錯誤語義回退風險。
- `web/tests/e2e/billing-mainline-smoke.e2e.test.ts` 也進一步把 `billing_subscription_plan_unavailable` / `billing_subscription_not_paid` 拉進 non-browser smoke：現在 portal session、cancel 與 resume 在 plan 不可用或非付費訂閱場景下，會顯式核對 `status/code/message`，避免 settings 端已經依賴的錯誤分支只剩 page/source contract 在守。
- 同一個 smoke 檔也再補了 `billing_subscription_not_cancellable`：現在 cancel action 在 non-browser smoke 層會顯式驗證 `status=409`、`code=billing_subscription_not_cancellable` 與空 `details` 的結構化錯誤行為，讓 settings 的 cancel/resume error narrative 不只依賴 page/source contract。
- billing route wrapper contract 已再補一層 runtime guard：`billing-routes.test.ts` 確認所有 GET route 只透過 `proxyControlPlane` 且不帶 body/idempotency，而 POST route 則只能呼叫 proxy helper、不得自行 `fetch`/`getBaseUrl`，確保 header/`cache:no-store`/body passthrough 這些 runtime 行為不被繞過。新抽出的 `buildBillingGetProxyInit` / `buildBillingPostProxyInit` 已把 POST 的 `content-type`、`idempotency-key` 與 `await request.text()` 封成共用 helper，便於讓 `test:contract` 能直接驗證這些通用選項。
  - `proxyControlPlane` 的 header merge 也已收斂為可測的純函數：`buildProxyControlPlaneHeaders` 現在會在缺省時注入 `x-authenticated-*` / `x-workspace-*` / `x-tenant-id`，同時保留 caller 顯式傳入的身份/workspace/tenant header，不再默默覆寫上游已明確設定的 access-control 語義；對應單元測試已納入 `web:test:unit`。
- Stripe checkout completion / webhook / portal 的邊界已再補一層 page/source contract：非 `mock_checkout` session 會固定回 `billing_checkout_completion_deferred`、Stripe webhook 的 payload normalization 與缺失 checkout session error 不會漂移、`settings` 也會持續維持 `resolve-billing`、portal return 與 local renewal fallback 的分流文案；新增的 page-level tests `web/tests/page-level/billing-summary-actions.page.test.ts`、`web/tests/page-level/settings-past-due-flow.page.test.ts`、`web/tests/page-level/billing-webhook-portal-contract.page.test.ts`、`web/tests/page-level/billing-portal-return-webhook-normalization.page.test.ts`、`web/tests/page-level/settings-billing-portal-return-evidence.page.test.ts`、`web/tests/page-level/settings-billing-action-error.page.test.ts` 會把 billing summary CTA（upgrade/manage-plan/resolve-billing）、past-due notice+refresh/intent、portal-return notice -> evidence handoff、webhook payload、portal return fallback（explicit -> env `STRIPE_CUSTOMER_PORTAL_RETURN_URL` -> `buildAbsoluteBillingManagementUrl`）、action error narratives，以及 `normalizeIncomingBillingWebhookRequest` 的 `cancel_at_period_end` spread normalization 一起鎖死；`web/tests/page-level/settings-checkout-refresh.page.test.ts` 也確保 refresh notice/flag 的 reset 由 page/source contract 保護，`web/lib/__tests__/control-plane-service.test.ts` 的 portal session payload test 也確保 `createBillingPortalSession` 會把 `return_url` 直接作為 JSON payload 送到 `/api/control-plane/workspace/billing/portal-sessions`，避免 manage-plan/resolve-billing return intent 在 service 層跑掉。
  - 同一檔案又補上了 `billing_provider_portal_unimplemented`、`billing_subscription_managed_by_provider`、`billing_subscription_not_resumable` 三個案例的 `ControlPlaneRequestError` 封裝，`test:unit` 入口的 service contract 現在能快速驗證 provider-managed、不可取消、不可恢復這類真實阻斷語義，讓 settings human-friendly 關鍵提示不會悄悄漂移。
  - `settings` 端對訂閱操作錯誤的文案也同步更新：新增 `formatSubscriptionActionError`，把 portal-managed、not_cancellable、not_resumable、subscription_missing、not_paid、plan_unavailable 等錯誤映射成穩定可理解的提示，並用 `settings-billing-action-error.page.test.ts` 與 `settings-billing-subscription-action-feedback.page.test.ts` 鎖死這層感知回饋與 Week 8/evidence handoff 語義。
  - provider return intent contract 塑造了 `billing-provider-return-intent.page.test.ts`：從 `src/app.ts` 的 `returnIntent`/`manage_plan_href` 開始，檢查 `settings` 的 `manage-plan` / `resolve-billing` intent card、portal follow-up copy 與 onboard/verification handoff 的交互路徑，確保 backend 決定的 `return_intent` 與前端的 evidence handoff 導流連在一起。
- `web/tests/e2e/billing-stripe-flow-smoke.e2e.test.ts` 已把 Stripe checkout create/fetch/complete lifecycle 的 upgrade->manage-plan 語義、Stripe-completed checkout 後的 active/manage-plan summary，以及 `past_due -> resolve-billing -> portal return` 的 return URL / intent 一起放進 non-browser smoke 裡核對，新增的 `checkout.session.completed` guard 也把 workspace/client_reference_id 與外部 refs 的 fallback 直接對照；這仍是非完整 upstream/browser e2e 的 smoke。
- 同一條 billing smoke 本輪也再往更像真實 Stripe upstream response 推了一小步：`web/tests/e2e/billing-stripe-flow-smoke.e2e.test.ts` 現在已補進 `createBillingPortalSession(...)` 的 execution，固定 `return_url` passthrough 與 Stripe-like portal response shape；`web/tests/page-level/billing-webhook-portal-contract.page.test.ts` 也把 `checkout.session.completed` 的 `metadata` object guard 一起鎖進 source contract，`web/tests/page-level/billing-provider-return-intent.page.test.ts` 進一步固定 settings 端會把 `window.location.href` 透過 `createBillingPortalSession(...)` 帶回 backend，讓 portal return intent 的 contract 更完整。
- billing smoke 已從單純 request/service 語義前推到 source-assisted flow，但驗收邊界仍停留在 non-browser smoke + page/source contract，尚未宣稱完整 upstream/browser e2e 或 billing GA。
- 最新一輪也把 `web/tests/e2e/billing-mainline-smoke.e2e.test.ts` 再補了一條 provider-managed resume error smoke：`resumeBillingSubscription` 現在會在 non-browser smoke 層顯式核對 `billing_subscription_managed_by_provider` 的 `status/code/details.billing_provider/details.manage_plan_href`，讓 cancel 與 resume 在 provider-managed 場景下都保有結構化錯誤語義護欄。
- 執行 plan 與環境配置文檔已同步把 `mock_checkout` 约束為 testing-only，強調 production self-serve 仍以 Stripe 為推薦配置，並提醒驗收仍以 page/source contract + non-browser smoke 為主，不等同完整 browser e2e 或 billing GA。
- 相關文檔與測試計劃已同步記錄上述 guard，提醒團隊 `mock_checkout` 只屬於 testing fallback、production self-serve 仍指向 Stripe，驗收也集中在 page/source contract + non-browser smoke 層級。

仍待完成：

- 跑通更接近真實 Stripe upstream response 的 checkout / webhook / portal smoke/contract，確保 self-serve 入口對應的 plan 變更穩定。
- 將 billing source-contract / smoke 範圍擴展到更多 UI 路徑，並逐步從目前的 request/service smoke 前進到更貼近真實 Stripe upstream response 的 flow smoke。
- 保持對新 page-level tests 的監控，讓 source/page contract 在未來的 `npm run web:test:page`/`web:test` 執行中持續驗證 `mock_checkout` test-only 的語義。

驗收：

- 能從 UI 發起升級並正確完成 plan 變更，且 `billing_self_serve_not_configured` 在無正式 provider 時依舊會被回傳。
- billing 異常流有明確狀態，同時驗收邊界保持在 page/source contract 與 non-browser smoke，還未宣稱完整 browser e2e 或 billing GA 已落地。

### 工作流 E：Onboarding Productization

範圍：

- `web/components/onboarding/*`
- `web/components/home/workspace-launchpad.tsx`
- `web/components/service-accounts/*`
- `web/components/api-keys/*`
- `web/components/playground/*`
- `src/app.ts` onboarding summary / bootstrap / delivery tracking logic

目標：

- 把 onboarding 從 script-assisted flow 推進到產品內 state machine

待辦：

- 讓 onboarding checklist 完全對應真實後端狀態
- 補一層更接近真實操作時序的 browser e2e；當前仍以 page/source contract + non-browser smoke 為主

本輪已完成補強：

- onboarding wizard 已顯式接入 `latest_demo_run`、`latest_demo_run_hint`、`blockers`、`recommended_next`、`delivery_guidance`
- `workspace-onboarding-wizard` 也進一步把 `recommended_next`、`blockers`、`latest_demo_run_hint` 與 `delivery_guidance` 收斂成統一的 guided recovery lane：優先導向 primary blocker，其次才是 demo run monitor/retry、verification evidence 與 go-live drill；對應的 `web/tests/page-level/onboarding-first-demo.page.test.ts` 與 `web/tests/page-level/onboarding-playground-usage-handoff.page.test.ts` 會固定 status badge、recommended-next CTA、delivery guidance copy 與 shared handoff continuity，避免 onboarding 又退回 wizard-only heuristics。
- `workspace-launchpad`、`playground` 與 `usage` 也開始直接消費同一組 onboarding signals：launchpad 新增 `Onboarding recovery lane`，會根據 `latest_demo_run_hint` / `delivery_guidance` / `recommended_next` 切換主要 CTA；`playground` 的 handoff guide 現在會在 demo attention、verification 與 go-live 之間切換 action surface，且 `verification/go-live` 明確維持 explicit `surface` query；`usage` 的 `Governed first demo signal` 也會把 `latest_demo_run_hint` 與 `delivery_guidance` 收進 callout/meta lines。對應的 `web/components/__tests__/handoff-query-surface-c.test.ts`、`web/components/__tests__/handoff-query-surface-d.test.ts`、`web/tests/page-level/onboarding-playground-usage-handoff.page.test.ts` 與 `web/tests/e2e/saas-mainline-smoke.e2e.test.ts` 已把這批 source/page/smoke contract 固定下來。
- onboarding create 成功路徑已抽出 `selectWorkspaceContext(...)` 共用 helper，workspace 建立後改走共享 workspace-context selection contract，不再在頁面內保留獨立 raw `fetch`；`web/tests/page-level/onboarding-workspace-context-contract.page.test.ts` 會固定 `create -> context-switch -> invalidate -> refresh` 的最小時序。
- `playground` / `verification` 已補 first-demo recovery/evidence lane，失敗、進行中、成功三態均有對應 CTA
- `verification/go-live` handoff 已統一維持 explicit `surface`：
  - `/verification?surface=verification`
  - `/go-live?surface=go_live`
- `service-accounts` / `invitations` / `api-keys` 的 create-action 表單已改為直接承接 service 層的結構化錯誤語義，避免前端保留另一套 generic copy；對應的 `web/tests/page-level/access-forms-error-contract.page.test.ts` 與 `web/tests/page-level/api-keys-form-error-contract.page.test.ts` 已納入 `test:page`。
- `service-accounts` disable 與 `invitations` revoke 的 detail-action 也已補齊結構化錯誤 copy，對應 `web/tests/page-level/service-accounts-panel-error-contract.page.test.ts` 與 `web/tests/page-level/invitations-panel-error-contract.page.test.ts` 已納入 `test:page`，讓 create-action / detail-action 的 error contract 維持一致。
- `tool-provider-list` 的 create/enable/disable 仍透過 service helper 與 `plan_limit_exceeded` metadata 對齊，並由 `web/tests/page-level/tool-provider-list-contract.page.test.ts` 固定 helper import 與 plan-limit copy。
- `workspace-context` route 在 fallback source 帶 warning 時，現也會同步寫出 `x-govrail-workspace-context-warning` header，並由 `web/tests/page-level/workspace-context-hardening.page.test.ts` 固定這層 source-contract，讓 topbar warning badge 與 route response contract 口徑保持一致。
- 對應 source/page contract 與 non-browser smoke 已同步更新，first-demo recovery lane 不再依賴舊的 wizard-only 語義

驗收：

- onboarding 頁可作為唯一主要入口
- 建立 workspace 後可持續追蹤整個初始化進度

### 工作流 F：Enterprise Surface

範圍：

- `web/components/settings/*`
- `web/app/api/control-plane/workspace/sso/route.ts`
- `web/app/api/control-plane/workspace/dedicated-environment/route.ts`
- `web/app/api/control-plane/workspace/audit-events/export/route.ts`
- `src/app.ts` 對應 SaaS workspace feature routes

目標：

- 至少將一個 enterprise surface 推到可用

待辦：

- 優先順序建議：`audit export` > `SSO` > `dedicated environment`
- 補 feature gating、權限、錯誤流與 UI 提示

驗收：

- 至少一個能力從 staged/readiness 變成真可交付功能

## 7. 並行開發建議

### 第一波可直接並行

- A：Workspace Session / Context
- B：Critical Route Hardening
- C：Mutation / Detail Proxy Consistency

理由：

- 三條線檔案集合基本可分離
- 都屬於 Week 1
- 完成後可直接降低後續 billing / onboarding 誤判

### 第二波適合在 Week 1 收尾後並行

- D：Billing Productionization
- E：Onboarding Productization

理由：

- 兩者都依賴更穩定的 session / proxy / route surface
- 但檔案層面仍可較好拆分

### 第三波

- F：Enterprise Surface
- e2e / observability / docs sync

### 下一波並行槽位建議

- 槽位 1：enterprise backend
  - 對齊 `src/app.ts` enterprise 相關 workspace feature routes，優先收口 `audit export`、`SSO`、`dedicated environment` 的後端可交付語義與錯誤流。
- 槽位 2：enterprise frontend
  - 對齊 `web/components/settings/*` 與 `web/services/control-plane.ts`，補齊 enterprise 能力的狀態呈現、引導文案、權限提示與操作閉環。
- 槽位 3：tests-observability
  - 補 SaaS 關鍵路徑 e2e、核心 mutation/route smoke 與 enterprise 能力監控口徑，確保「可用」有可回歸驗證與可觀測證據。
- 槽位 4：docs-runbook
  - 同步執行文檔、運維手冊與交付說明，沉澱 enterprise 能力的啟用條件、故障處理與回退流程。

### 下一輪實際排程（本輪拆解）

- 槽位 1：A2 page-level validation（Topbar / Members）
- 槽位 2：B2 enterprise backend contract deepen（SSO 多域名 + dedicated intake 回顯）
- 槽位 3：C2 enterprise settings/service 對齊
- 槽位 4：D2 docs/tests 同步

### 下一輪實際排程（預同步）

- 槽位 1：B3 enterprise dedicated structured round-trip（`requester_email` / `data_classification`）
  - 目標：補齊 dedicated intake 字段在 backend 的 `request -> normalize -> save -> parse -> readiness` 全鏈路。
  - 當前狀態：`completed`（`requester_email` / `data_classification` 已與 `requested_capacity` / `requested_sla` 一起完成 structured round-trip 與回顯收口）。
- 槽位 2：C3 enterprise contract tests 補強
  - 目標：新增 enterprise field round-trip 的最小 contract/source 護欄，覆蓋 SSO 與 dedicated 的新增字段語義。
  - 當前狀態：`completed`（已補齊 enterprise field round-trip 護欄並納入現有 `test:contract`）。
- 槽位 3：T3 e2e 後置
  - 目標：維持 `unit -> contract -> page` 作為當前主回歸網，`e2e` 在執行基座穩定後再引入。
  - 當前狀態：`in_progress`（`web:test:e2e` 與最小 non-browser smoke 已落地，覆蓋 `workspace-context GET+POST`、`settings` submit/success/saved-sections、settings 側 handoff affordance + audit export execution contract，以及 shared handoff-query continuity（source-assisted+execution）；完整瀏覽器 e2e 仍後置，不作為本輪阻塞）。

### 下一輪建議並行槽位（更新）

- 槽位 0：L5 dashboard / launchpad continuity
  - 目標：把 `/` launchpad dashboard 也拉進 shared handoff continuity，讓 `source` / `week8_focus` / `attention_workspace` / `attention_organization` / `delivery_context` / recent metadata 可以從首頁繼續帶往 `session`、`usage`、`settings`、`verification`、`go-live` 等 launch surfaces，同時維持 navigation-only 邊界。
  - 當前狀態：`completed`（`/` dashboard page 現已與 onboarding/usage/settings 同級解析 `source` / `week8_focus` / `attention_workspace` / `attention_organization` / `delivery_context` / recent metadata，並透過 `WorkspaceLaunchpad` 將 shared handoff continuity 帶往 `session`、`usage`、`settings`、`verification`、`go-live` 等 launch surfaces；對應 page/source contract 與 non-browser smoke 也已同步更新，且仍維持 navigation-only 邊界與 `verification/go-live` explicit `surface` semantics）。
- 槽位 1：S4 settings page-level guard
  - 目標：補 `settings` enterprise surface（SSO / dedicated saved sections + live-write submit/error semantics）與 `settings -> verification/go-live` handoff affordance 的 page-level/source contract 護欄，並把 shared handoff helper 的導流語義收斂到統一契約，防止展示、提交流程與導流語義回歸。
  - 當前狀態：`completed`（已納入 `web/tests/page-level/workspace-context-hardening.page.test.ts`、`web/tests/page-level/settings-enterprise-write.page.test.ts`、`web/tests/page-level/settings-saved-refresh-coupling.page.test.ts`、`web/tests/page-level/verification-go-live-handoff.page.test.ts`、`web/tests/page-level/delivery-track-context-handoff.page.test.ts`；其中 `W12-P04` 聚焦 submit/error/success/preflight + handoff query passthrough，`W12-P05` 聚焦 saved sections + submit payload + draft hydration + audit/export handoff，`W12-P06` 補齊 settings affordance，`W12-P07/P08/P09` 補齊 shared handoff helper 與 delivery panel continuity 契約）。
- 槽位 2：A4 audit export route contract
  - 目標：為 `audit-events/export` route wrapper 補最小 contract/source 測試（upstream path、method、accept header passthrough）。
  - 當前狀態：`completed`（已納入 `web/lib/__tests__/enterprise-surface-routes.test.ts`，覆蓋 query/path/method/accept passthrough）。
- 槽位 3：T4 e2e 後置
  - 目標：維持 `unit -> contract -> page` 主回歸網，`e2e` 待執行基座穩定後再納入。
  - 當前狀態：`in_progress`（`web:test:e2e` 與最小 non-browser smoke 已落地，覆蓋 `workspace-context` metadata mainline、`settings` submit/saved-sections、settings 側 handoff affordance + audit export execution contract，以及 shared handoff-query continuity 合約；verification/go-live 頁面級 continuity 與真實瀏覽器互動仍由 page/source contract 承擔，完整瀏覽器 e2e 後置，避免誤寫為 e2e 已完成）。

### 下一輪建議並行槽位（預同步：execution harness）

- 槽位 0：browser-e2e spike（後置但可先做最小基座）
  - 目標：在不誇大 coverage 的前提下，補一條更接近真實操作時序的 browser e2e 或最小基座探針，優先覆蓋 `launchpad/session/onboarding/settings/verification/go-live` 之間的一小段 continuity，作為後續完整瀏覽器 e2e 的落腳點。
  - 當前狀態：`in_progress`（已從單純 probe 前推到一組 17 條最小 true browser smoke：`web/playwright.config.ts` 會以本機 Chrome 啟動 browser runner。其一，[`web/tests/browser/launchpad-session-onboarding.smoke.spec.ts`](./../web/tests/browser/launchpad-session-onboarding.smoke.spec.ts) 已覆蓋 `launchpad -> session -> onboarding -> usage -> settings -> verification -> go-live -> admin` 的最小真實導航與 handoff continuity，且顯式保留 `/verification?surface=verification`、`/go-live?surface=go_live`，並在 `/admin` 恢復 `readiness_returned=1` 與 Week 8 readiness return banner；其二，[`web/tests/browser/admin-attention-queue-return.smoke.spec.ts`](./../web/tests/browser/admin-attention-queue-return.smoke.spec.ts) 與 [`web/tests/browser/admin-attention-verification-go-live-return.smoke.spec.ts`](./../web/tests/browser/admin-attention-verification-go-live-return.smoke.spec.ts) 已分別覆蓋 `admin-attention -> verification -> admin` 與 `admin-attention -> verification -> go-live -> admin` 的最小真實導航與 queue-return continuity，驗證 `Return to admin queue`、`Continue to go-live drill` 與 `/admin` 上的 `Admin queue focus restored`；其三，[`web/tests/browser/admin-recent-activity-verification-return.smoke.spec.ts`](./../web/tests/browser/admin-recent-activity-verification-return.smoke.spec.ts) 與 [`web/tests/browser/admin-recent-activity-verification-go-live-return.smoke.spec.ts`](./../web/tests/browser/admin-recent-activity-verification-go-live-return.smoke.spec.ts) 已補上 `admin recent delivery activity -> verification -> admin` 與 `admin recent delivery activity -> verification -> go-live -> admin` 的 recent-context continuity，顯式保留 `delivery_context=recent_activity` 並驗證 recent metadata 與 admin return；其四，[`web/tests/browser/admin-organization-focus-return.smoke.spec.ts`](./../web/tests/browser/admin-organization-focus-return.smoke.spec.ts) 已補上 `admin organization focus -> verification -> admin` 的 focus continuity，顯式保留 `attention_organization` 並驗證 Governance focus chip、`Focused organization`、queue-return banner 與 `Clear all focus`；其五，[`web/tests/browser/admin-focus-chip-clear.smoke.spec.ts`](./../web/tests/browser/admin-focus-chip-clear.smoke.spec.ts) 已補上 `organization + workspace + queue return` 疊加時的 per-chip clear continuity，驗證 `Workspace`、`Follow-up return`、`Organization` 的 `Clear` 會逐層放寬 focus；其六，[`web/tests/browser/admin-readiness-baseline-onboarding-return.smoke.spec.ts`](./../web/tests/browser/admin-readiness-baseline-onboarding-return.smoke.spec.ts) 已補上 `admin readiness baseline -> onboarding -> admin` 的最小真實導航與 readiness-return continuity，驗證 `week8_focus=baseline`、`Drill-down active: Baseline gaps`、`Open onboarding flow`、`Finish onboarding`、workspace surface 上的 `Return to admin readiness view`，以及返回 `/admin` 後的 `Returned from Week 8 readiness` / `Clear readiness focus`；其七，[`web/tests/browser/admin-readiness-chip-toggle.smoke.spec.ts`](./../web/tests/browser/admin-readiness-chip-toggle.smoke.spec.ts) 已補上純 `/admin` 內的 readiness chip clear/toggle continuity，驗證 `Clear readiness focus` 與 `Credentials ready` drill-down toggle 只會增減 `week8_focus`，而不會把 `attention_organization` / `attention_workspace` 一起清掉；其八，[`web/tests/browser/admin-readiness-billing-warning-settings-return.smoke.spec.ts`](./../web/tests/browser/admin-readiness-billing-warning-settings-return.smoke.spec.ts) 與 [`web/tests/browser/admin-readiness-demo-run-verification-return.smoke.spec.ts`](./../web/tests/browser/admin-readiness-demo-run-verification-return.smoke.spec.ts) 已補上 readiness workspace/surface action variants，分別驗證 `billing_warning -> settings -> admin` 與 `demo_run -> verification -> admin` 的 summary primary action continuity、`Return to admin readiness view` 與 admin return banner；其九，[`web/tests/browser/admin-readiness-go-live-ready-go-live-return.smoke.spec.ts`](./../web/tests/browser/admin-readiness-go-live-ready-go-live-return.smoke.spec.ts) 與 [`web/tests/browser/admin-readiness-demo-run-verification-go-live-return.smoke.spec.ts`](./../web/tests/browser/admin-readiness-demo-run-verification-go-live-return.smoke.spec.ts) 已補上 readiness 到 go-live 的 follow-up variants，分別驗證 `go_live_ready -> go-live -> admin` 與 `demo_run -> verification -> go-live -> admin` 的 continuity；其十，[`web/tests/browser/admin-readiness-billing-warning-settings-verification-return.smoke.spec.ts`](./../web/tests/browser/admin-readiness-billing-warning-settings-verification-return.smoke.spec.ts) 與 [`web/tests/browser/admin-readiness-billing-warning-settings-go-live-return.smoke.spec.ts`](./../web/tests/browser/admin-readiness-billing-warning-settings-go-live-return.smoke.spec.ts) 已補上 settings workspace-level follow-up variants，驗證 `billing_warning -> settings -> verification -> admin` 與 `billing_warning -> settings -> go-live -> admin` 的 continuity；其十一，[`web/tests/browser/admin-readiness-go-live-ready-go-live-verification-return.smoke.spec.ts`](./../web/tests/browser/admin-readiness-go-live-ready-go-live-verification-return.smoke.spec.ts) 與 [`web/tests/browser/admin-readiness-go-live-ready-go-live-settings-return.smoke.spec.ts`](./../web/tests/browser/admin-readiness-go-live-ready-go-live-settings-return.smoke.spec.ts) 已補上 go-live workspace-level follow-up variants，驗證 `go_live_ready -> go-live -> verification -> admin` 與 `go_live_ready -> go-live -> settings -> admin` 的 continuity，包含 `Reopen verification evidence`、`Review billing + settings`、`source=admin-readiness`、`week8_focus=go_live_ready` 與 readiness return banner。`npm --prefix web run test:browser:smoke` 可直接執行；`web/scripts/browser-e2e-spike.mjs` 與 `npm --prefix web run test:browser:spike` 則保留為主線 readiness report，固定 direct dependency / resolvable / config / system browser / smoke spec 的對齊。這仍不是完整 browser e2e，也不宣告真實跨頁點擊與渲染時序已全面覆蓋；現況只是把可分享的治理 continuity 擴到主線、attention、recent-activity、organization-focus、focus-chip 與多條 readiness action variants。）
- 槽位 1：members service execution
  - 目標：為 `fetchWorkspaceMembersViewModel` 補 service execution 單元測試，覆蓋 `live / workspace_context_not_metadata / fallback_feature_gate / fallback_control_plane_unavailable / fallback_error` 語義映射。
  - 當前狀態：`completed`（已納入 `web/lib/__tests__/control-plane-service.test.ts` 並可由 `web:test:unit` 執行；同檔已補 enterprise save mutation 的 non-2xx throw contract）。
- 槽位 2：workspace-context route execution deepen
  - 目標：在 `web/app/api/workspace-context/__tests__/route.test.ts` 進一步補強 execution 路徑，聚焦 cf-access header/cookie 的選擇與回寫一致性。
  - 當前狀態：`completed`（metadata 成功路徑、GET explicit-over-cf-access 與 cf-access-only、POST body-absent cookie selection/回寫一致性均已落地，且 `source/header` 對齊語義已覆蓋）。
- 槽位 3：e2e 後置
  - 目標：維持 `unit -> contract -> page` 主回歸網，`e2e` 仍待執行基座穩定後再引入。
  - 當前狀態：`in_progress`（`web:test:e2e` 與最小 non-browser smoke 已落地，`W12-E01` 已從 skeleton/skip 推進為可執行；smoke 邊界外的完整跨頁 continuity（含真實導航時序）與真實瀏覽器互動仍由 page/source contract + 後置瀏覽器 e2e 承擔，不作為當前阻塞項）。

### 本輪文檔口徑補記（2026-04-04）

- `session` 已升級為 Week 3 / Week 8 的顯式 trusted-session checkpoint：它會提示只有 metadata-backed SaaS session 才應被視為可信 launch point，並把 `onboarding`、`settings`、`verification`、`go-live`、`members`、`usage` 等 lane 明確標記為 navigation-only follow-up。
- `members -> accept-invitation -> onboarding/usage/verification` 的 continuity 已補齊：pending invitations 會占用 `member_seats` reservation，invite redemption 也已明確要求從 recipient 自己的 trusted SaaS session 完成，避免把 borrowed browser / fallback context 誤當成可信登入。
- `settings` 現口徑已明確是 self-serve billing follow-up lane：portal / checkout / subscription action / audit export 相關 CTA 與 evidence handoff 仍是 workspace-scoped navigation/status cues，不是 support workflow、不是 automation，也不是 impersonation。
- `admin readiness` 與 `attention queue` 的 return continuity 已收斂到共享治理契約：workspace surfaces 會顯式提供 `Return to admin queue` 或 `Return to admin readiness view`，並把 `queue_surface`、`week8_focus`、organization/workspace context 與 recent metadata 帶回 `/admin`。
- `launchpad / onboarding / usage` 現已具備 page/source contract 與 non-browser smoke 護欄，且首頁 dashboard 也已補齊 shared handoff query passthrough；這代表首頁入口 continuity 已進入可回歸狀態，但驗收邊界仍是 page/source contract + non-browser smoke，不應把它寫成完整 browser e2e 已覆蓋。
- browser harness 現已具備一組 17 條最小真實 smoke：主線 `launchpad -> session -> onboarding -> usage -> settings -> verification -> go-live -> admin` 可在 Playwright + 本機 Chrome 下執行，補到真實瀏覽器導航時序的一小段驗收，且顯式保留 `surface=verification` / `surface=go_live`，並在 `/admin` 恢復 `readiness_returned=1` 後展示 `Returned from Week 8 readiness` / `Focus restored` banner；另外也已有 attention 分支 `admin -> verification -> admin`、`admin -> verification -> go-live -> admin`，recent-delivery 分支 `admin recent delivery activity -> verification -> admin`、`admin recent delivery activity -> verification -> go-live -> admin`，organization-focus 分支 `admin organization focus -> verification -> admin`，focus-chip 分支 `admin organization + workspace + return focus -> per-chip clear`，readiness 導航分支 `admin readiness baseline -> onboarding -> admin`，readiness admin-only 分支 `admin readiness baseline -> clear readiness focus -> credentials toggle -> clear`，readiness action-variant 分支 `admin readiness billing_warning -> settings -> admin`、`admin readiness demo_run -> verification -> admin`，readiness go-live 分支 `admin readiness go_live_ready -> go-live -> admin`、`admin readiness demo_run -> verification -> go-live -> admin`，settings workspace-level 分支 `admin readiness billing_warning -> settings -> verification -> admin`、`admin readiness billing_warning -> settings -> go-live -> admin`，以及 go-live workspace-level 分支 `admin readiness go_live_ready -> go-live -> verification -> admin`、`admin readiness go_live_ready -> go-live -> settings -> admin`，用來驗證 `admin-attention` / `admin-readiness` source、`delivery_context=recent_activity`、`week8_focus=baseline|credentials|billing_warning|demo_run|go_live_ready`、`attention_organization`、`attention_workspace`、`Return to admin queue`、`Return to admin readiness view`、`Continue to go-live drill`、`Reopen verification evidence`、`Review billing + settings`、`Clear all focus`、per-chip `Clear`、`Clear readiness focus`，以及 `/admin` 上的 `Admin queue focus restored` / `Returned from Week 8 readiness`。其中本輪還修正了 `buildVerificationChecklistHandoffHref` 從 `use client` 模組被 server page 直接引用的邊界風險，改由 `web/lib/handoff-query.ts` 提供 server-safe helper 給 `playground/usage/verification` server pages 使用；但這仍不等於 full browser e2e，只是把治理導流 continuity 再往前推了一小段。

## 8. 建議任務卡格式

每張任務卡至少包含：

- 背景
- 目標
- 檔案範圍
- 不可修改的檔案
- 驗收標準
- 測試命令
- 風險與回退方式

推薦命名：

- `SAAS-W1-A workspace-context-hardening`
- `SAAS-W1-B critical-route-fallback-cleanup`
- `SAAS-W1-C mutation-proxy-consistency`
- `SAAS-W2-D billing-self-serve-path`
- `SAAS-W3-E onboarding-productization`
- `SAAS-W4-F enterprise-surface`

## 9. 本輪推薦驗證命令

倉庫級：

- `npm run check`
- `npm run web:check`

必要時補充：

- 針對變更的 route / component 補最小手動驗證
- 若 billing 或 onboarding 流改動較大，至少做一輪頁面跳轉與 mutation smoke

## 10. 文檔更新規則

當以下事項完成時，需要同步更新本文件：

- 工作流狀態從 `planned` 進入 `in_progress`
- 工作流完成定義改變
- 真正文件 ownership 或依賴關係發生變化
- fallback / billing / onboarding 的策略與本文不一致

---

目前建議先啟動的並行槽位如下：

- 槽位 1：A `workspace/session`
- 槽位 2：B `critical route hardening`
- 槽位 3：C `mutation/detail proxy consistency`

待第一波合併與驗證後，再啟動：

- 槽位 4：D `billing productionization`
- 槽位 5：E `onboarding productization`
