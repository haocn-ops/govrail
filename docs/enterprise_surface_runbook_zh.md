# Enterprise Surface Runbook（中文）

交付對象：Platform Admin / Workspace Owner / SRE  
適用範圍：`audit export`、`SSO`、`dedicated environment` 三個 enterprise 能力

## 1. 使用前說明

本手冊聚焦 console 目前已提供的 enterprise surface，目標是讓操作者在單一 workspace 內完成：

- 啟用前提檢查
- UI / API 入口確認
- 狀態判讀
- 常見失敗排障
- 操作回退
- 最小驗收

建議先開啟 `/settings?intent=manage-plan`，以同一個 workspace 連續檢查三個能力，避免上下文切換造成誤判。

### 1.1 當前邊界（避免過度承諾）

目前 enterprise surfaces 的口徑需要分開理解：

- `audit export`：仍是穩定的讀取 / 匯出能力。
- `SSO` / `dedicated environment`：已從通用 staged write-prep 前進到 controlled live write 同步階段。
- 所謂 controlled live write，指的是：
  - 已可用 delivery/readiness contract 定義受控 rollout 條件；
  - runbook 與 settings 已可按 live-write 準備來描述驗收、提交與回退；
  - repo 目前已暴露受控的 web `POST` wrapper；
  - 但這仍不代表已全面開啟無條件的 self-serve live write。

因此，若看到可操作入口，應先理解為受控 rollout / write 導流與治理引導，而不是「任何 workspace 都已全面開通 live write」。

## 2. Audit Export

### 2.1 啟用前提

- Workspace 目前 plan 已包含 `audit_export` feature。
- 當前登入者為 workspace owner / admin，且可訪問 settings。
- 目標 workspace 可正常讀取 `/api/control-plane/workspace`。

### 2.2 UI / 接口入口

- UI：`/settings` → `Audit export` 區塊 → `Download audit export`
- API：`GET /api/control-plane/workspace/audit-events/export`

### 2.3 預期狀態

- 啟用時：文案顯示可下載，按鈕可點擊，下載檔名與 workspace 對應。
- 未啟用時：顯示 plan gate 文案，按鈕禁用，必要時提供升級入口。

### 2.4 常見失敗

- `workspace_context_not_metadata`：目前在 fallback context，metadata-only 路由被保護。
- 匯出接口非 2xx：通常為 workspace 權限、上下文或後端可用性問題。
- 使用者誤以為已啟用：實際是 plan feature 未開。

### 2.5 操作回退

- 先回到 `/settings?intent=upgrade` 走 plan 升級路徑。
- 若短期無法升級，改走現有審計證據流程（手動收集 run/audit 相關證據）。
- 回退後在交接備註標明「該 workspace 為 plan-gated，不是系統故障」。

### 2.6 驗收建議

- UI 驗收：可成功下載一次 export，確認檔案可讀。
- API 驗收：直接呼叫 export route，確認 status 與 content-type。

## 3. SSO

### 3.1 啟用前提

- Workspace plan 具備 `sso` feature，或至少可看到 readiness surface。
- 可取得身份提供方（OIDC/SAML）必要資訊。
- Workspace metadata context 正常。

### 3.2 UI / 接口入口

- UI：`/settings` → `Single Sign-On`
- API：`GET /api/control-plane/workspace/sso`
- 受控寫入：`POST /api/control-plane/workspace/sso`

### 3.3 預期狀態

- `feature_enabled=true`：可見啟用狀態與 readiness checklist。
- `feature_enabled=false`：顯示 plan gate 與 upgrade 引導。
- `status` 常見值：`staged` / `not_configured` / `configured`。
- 若 `delivery_status=ga`：表示可進入 controlled live write rollout 視角，但仍需遵守受控開通與回退流程。
- 本輪 contract 深化（已落地）：
  - SSO 仍以 controlled live write 為邊界，不宣告全面自助開通。
  - 多域名口徑採加法式擴展：保留 `email_domain` 單域名兼容，並已支持 `email_domains` 作為額外域名映射承載。
  - readiness 可回顯 `entrypoint_url`、`audience`、`client_id`、`signing_certificate` 等已保存配置字段。

### 3.4 常見失敗

- `workspace_feature_unavailable`（通常 409）：plan 未開啟該能力。
- `control_plane_base_missing`（通常 503）：控制面 base URL 未配置。
- readiness 載入失敗：UI 顯示「Unable to load live status」。

### 3.5 操作回退

- 若 plan 未開：回退到升級流程，不在當前 workspace 強行配置。
- 若環境未配置：先補齊 control plane base 相關設定，再重試。
- 若 provider 資料不完整：暫停變更，保留 readiness 截圖與缺失清單。

### 3.6 驗收建議

- 確認 `/settings` 與 `/api/control-plane/workspace/sso` 對 `feature_enabled` 與 `status` 表現一致。
- 至少完成一次「從 settings 進入 upgrade，再返回 settings 重新判讀狀態」的流程驗收。
- 若 workspace 已進入多域名受控寫入範圍，驗收時需額外確認：
  - 主域名與附加域名回顯不衝突；
  - 舊有單域名 payload 仍可被讀取與顯示（向後兼容）。

## 4. Dedicated Environment

### 4.1 啟用前提

- Workspace plan 具備 `dedicated_environment` feature，或可查看 readiness surface。
- 已明確目標 region 與隔離邊界需求（合規、網路、存取）。

### 4.2 UI / 接口入口

- UI：`/settings` → `Dedicated environment`
- API：`GET /api/control-plane/workspace/dedicated-environment`
- 受控寫入：`POST /api/control-plane/workspace/dedicated-environment`

### 4.3 預期狀態

- 啟用時：展示 deployment model、target region、isolation summary。
- 未啟用時：展示 plan gate 文案與升級入口。
- readiness checklist 應可用於跟進部署前置條件。
- 若 `delivery_status=ga`：表示可進入 controlled live write rollout 視角，但仍不等同全面自助開通。
- 本輪 contract 深化（已落地）：
  - dedicated intake 在 controlled live write 下已強化字段回顯，當前最小可回看字段包含 `network_boundary`、`compliance_notes`、`requested_capacity`、`requested_sla`、`notes`。
  - dedicated intake 的 `requester_email`、`data_classification` 已完成 backend structured round-trip，並可在 readiness / settings 回顯。
  - 深化目標是「提交內容可在 readiness 中被明確回看」，不是立即擴大到全面自助交付承諾。

### 4.4 常見失敗

- `workspace_feature_unavailable`：feature 尚未對該 workspace 開通。
- `control_plane_base_missing`：無法拉取 live readiness。
- 顯示資料不完整：region/isolation 還未填充，屬流程未完成而非必然故障。

### 4.5 操作回退

- 先保持 workspace 在 shared/default 模式，不做半套 dedicated 切換。
- 將 region/compliance/network 缺口記錄到交接清單，待升級或配置完成後重試。

### 4.6 驗收建議

- 檢查 UI 展示欄位與 API 回傳一致。
- 至少完成一次「未啟用 -> 升級入口 -> 返回檢查」的閉環驗收。
- 若 workspace 已啟用 intake 深化字段，需補一輪「提交 -> 回顯 -> 再次讀取」一致性驗收，確保非僅 `notes` 文本拼接可見。
- dedicated intake 字段驗收建議至少覆蓋：
  - `requester_email`、`data_classification`、`requested_capacity`、`requested_sla` 的「提交 -> 回顯 -> 再讀取」一致性；
  - 與 `network_boundary`、`compliance_notes`、`notes` 一起驗證非僅 `notes` 文本拼接可見。

## 5. 跨能力通用失敗與回退策略

### 5.1 通用失敗

- `workspace_context_not_metadata`：當前 workspace 來源為 fallback，metadata-only 保護生效。
- 權限不足：非 owner/admin 進入管理能力時被拒絕。
- 控制面不可用：`CONTROL_PLANE_BASE_URL` 缺失或上游不可達。

### 5.2 通用回退

1. 先確認 workspace context source（metadata / fallback）。
2. 再確認 plan feature gate，而不是直接判定系統故障。
3. 若為配置問題，先回到 runbook 做環境修復；若為產品 gate，走升級流程。

## 6. 建議驗收節奏（最小）

- 最小測試入口（當前已落地）：
  - `npm --prefix web run test`
  - `npm run web:test`
  - `npm run web:test:unit`
  - `npm run web:test:contract`
  - `npm run web:test:page`
  - `npm run web:test:e2e`
  - `npm run web:test:e2e:file -- tests/e2e/saas-mainline-smoke.e2e.test.ts`
- 補充說明：
  - `web:test` 目前已拆為 `unit -> contract -> page` 三層串聯，並保持舊入口兼容。
  - `npm run web:test:e2e` 會執行整包 non-browser smoke；若只需快速重跑 enterprise 主線 smoke，請改用 `npm run web:test:e2e:file -- tests/e2e/saas-mainline-smoke.e2e.test.ts`，不要期待 `npm run web:test:e2e -- <file>` 只跑單檔。
  - `page` 層目前覆蓋 `Topbar` fallback warning badge、`Members` 的 metadata guard / plan-gated / control-plane-unavailable / no-members live-only、`Settings` 中 enterprise saved sections / audit export 展示語義與 live-write submit/error 語義，以及 shared handoff continuity source contract（已擴到 `verification/go-live/api-keys/service-accounts`，並納入 `onboarding/playground/usage` 相關護欄）。
  - enterprise live-write 與 route wrapper 相關的最小 source/route 護欄目前由 `web/lib/__tests__/enterprise-surface-routes.test.ts` 提供（含 `audit-events:export` contract）。
  - 本輪 route wrapper consistency 進度會把 mutation/detail route 從各自的 `getBaseUrl + fetch` 樣板換成 `proxyControlPlane` helper，並讓 `workspace_context_not_metadata` 412 guard、`cache: "no-store"`、`x-authenticated-*`/`x-workspace-*`/`x-tenant-id` header 轉發在測試中得以驗證（`metadata-guard.routes.test.ts`、`control-plane-proxy.test.ts`）。
  - execution harness 當前已落地：
    - `unit` 已覆蓋 audit export service 映射，以及 members service（`fetchWorkspaceMembersViewModel`）的 `live / workspace_context_not_metadata / fallback_feature_gate / fallback_control_plane_unavailable / fallback_error` 映射，並補上 enterprise save mutation 的 non-2xx throw contract。
    - `contract` 已覆蓋 `workspace-context` route 的 metadata `GET/POST` 執行路徑，並包含 cf-access/cookie 的選擇與回寫一致性驗證，以及 explicit auth headers 優先於 cf-access headers 的執行語義。
  - `e2e` 已補最小 non-browser smoke 入口（`npm run web:test:e2e`）；若只需快速重跑 enterprise 主線，請改用 `npm run web:test:e2e:file -- tests/e2e/saas-mainline-smoke.e2e.test.ts`。目前除 `workspace-context` metadata path 與 `settings` live-write affordance contract 外，也已補一層 source-assisted+execution 的 handoff continuity smoke（含 surface -> verification/go-live -> admin-return continuity，以及 onboarding/playground/usage shared helper continuity）；但仍不等同完整瀏覽器端到端驗收，不作為當前最小驗收阻塞項。
  - 目前已能覆蓋 `workspace-context` 與 `workspace/me/members` 的 route-contract 最小護欄。
  - 但這仍主要是最小 contract / source guard，並不等同完整 e2e 或完整 route execution harness。
- 構建驗收：
  - `npm run check`
  - `npm run web:check`
- 機器覆蓋與邊界（對齊當前 `unit -> contract -> page -> e2e(non-browser)`）：
  - 機器 contract（已覆蓋）：
    - `unit`：save mutation non-2xx 會拋出結構化 `ControlPlaneRequestError`（避免失敗被吞）。
    - `page/source`：`settings` 的 submit affordance、success/error、saved sections（含 `Saved configuration` / `Saved provisioning request`）與 draft hydration / payload 字段耦合（W12-P04/W12-P05）不回歸。
    - `e2e(non-browser)`：`npm run web:test:e2e` 已覆蓋 `workspace-context` metadata 主路徑 `GET + POST`，以及 `settings` 的 submit -> readiness refresh -> saved-sections 最小 contract loop（含 source-assisted 檢查）；若只需 targeted 重跑主線，請改用 `npm run web:test:e2e:file -- tests/e2e/saas-mainline-smoke.e2e.test.ts`。
  - 機器 contract（已覆蓋，含本輪 shared handoff continuity 同步）：
    - 共享 helper 護欄（machine）：
      - `settings` 的 handoff URL helper（`buildSettingsHref`）需持續保留 `source/week8_focus/attention_workspace/attention_organization/delivery_context/recent_track_key/recent_update_kind/evidence_count/recent_owner_label/intent` 等 query passthrough 語義。
      - `go-live` 頁的 backlink helper（`buildGoLiveHref`）需持續保留 `verification/usage` 回鏈與 handoff query 透傳語義。
      - 本輪已把 `verification` 導出的 shared handoff helper 收斂到 `go-live` / `api-keys` / `service-accounts`，並補上對應 page/source contract 護欄，固定同一組 handoff query key 不漂移（含 admin-return continuity）。
      - `onboarding` / `playground` / `usage` 也已納入 shared helper continuity（`buildHandoffHref`）的 source-contract 護欄；`artifacts/logs/members`、`workspace-launchpad` 與 `accept-invitation` 的 handoff continuity 亦已在 page/source contract 補一層最小護欄。
      - `verification` 導流上的 explicit `surface` 口徑本輪已進一步收斂：`onboarding/playground/usage/artifacts/logs/service-accounts/api-keys/verification checklist` 的 handoff 入口已統一顯式使用 `verification?surface=verification`（以及 `go-live?surface=go_live`），並由 source/page contract 固定語義。
      - 目前仍屬 source/page contract 覆蓋，不宣告為完整跨頁點擊成功或 full e2e。
    - page/source contract 護欄（machine）：
      - `settings` 內 delivery panel / context card（attention/readiness/onboarding/intent/billing follow-up）需保持 `verificationHref` / `goLiveHref` 導流語義不回歸。
      - `verification` / `go-live` 頁需保持 handoff notice 顯示條件、`WorkspaceDeliveryTrackPanel` 與 context 參數承接語義不回歸。
      - `audit export` 的跨頁證據導流語義（`Attach in verification` / `Carry to go-live drill`）需保持存在。
      - 本輪已新增 `handoff-query-continuity-contract.page.test.ts`，固定 `verification/go-live/api-keys/service-accounts` 的 helper 共用導流語義。
      - 同步補上 `components/__tests__/handoff-query-surface-a.test.ts` 與 `tests/page-level/console-pages-handoff-contract.page.test.ts`，覆蓋 `onboarding/playground/usage` 與 console pages 的 query parsing / handoff args continuity 最小語義；其中 `artifacts/logs` 到 verification/go-live 的導流已顯式帶 `surface`（`/verification?surface=verification`、`/go-live?surface=go_live`）並由 page/source contract 固定。
    - non-browser smoke（machine）：
      - 已覆蓋 source-assisted+execution 的 handoff continuity 煙霧（含 surface->verification/go-live->admin return、onboarding/playground/usage continuity、members->service-accounts->api-keys/playground->verification continuity、workspace-launchpad continuity、accept-invitation continuity，以及 artifacts/logs/members 的 console-page continuity）。
      - `artifacts/logs` 的 explicit surface 導流與 console pages mapping 目前仍以 page/source contract 為主，不宣告已覆蓋真實跨頁點擊成功。
  - non-browser smoke 邊界（寫實）：
    - 不覆蓋真實瀏覽器點擊/跳轉/渲染時序。
    - 不覆蓋第三方登入流程與實際 provider 回調。
    - 不覆蓋完整端到端 UI 行為（含 `onboarding/playground/usage/artifacts/logs/members/service-accounts/api-keys` 到 verification/go-live 的真實跨頁點通）；因此不可用來替代完整瀏覽器 e2e 驗收。
- `多 surface handoff（settings + onboarding/playground/usage/artifacts/logs/members/service-accounts/api-keys）` 新版 checklist（建議按順序）：
  1. 機器檢查：跑 `npm run web:test:unit`，確認 save mutation 非 2xx throw contract 正常。
  2. 機器檢查：跑 `npm run web:test:page`，確認 settings submit/error/success 與 saved-sections/draft-hydration contract 正常（W12-P04/W12-P05）。
  3. 機器檢查：跑 `npm run web:test:e2e`，確認整包 non-browser smoke 可執行；若只需快速重跑 enterprise 主線，改用 `npm run web:test:e2e:file -- tests/e2e/saas-mainline-smoke.e2e.test.ts` 驗證 `workspace-context GET+POST` + `settings` submit->refresh->saved loop + source-assisted/execution handoff continuity。
  4. 機器檢查（共享 helper 護欄）：確認 handoff helper 在多 surface 仍保留一致 query passthrough（至少與 `settings/go-live` 當前 key 集一致）。
  5. 機器檢查（page/source contract）：確認 `settings` 的 delivery panel/context card 與 `Attach in verification` / `Carry to go-live drill` 導流語義仍在。
  6. 機器檢查（page/source contract）：確認 `verification/go-live` 頁仍承接 handoff context，且 `WorkspaceDeliveryTrackPanel`/notice 顯示語義不回歸。
  7. 機器檢查（page/source contract，已補強）：本輪新增 `onboarding` first-demo recovery lane，`workspace-onboarding-wizard`、`playground`、`verification` 共享 evidence 語義，`latestDemoRunHint` / blocker / recommended-next 會出現在前端；對應的 contract 由 `web/tests/page-level/onboarding-first-demo.page.test.ts` 及 `web/tests/e2e/saas-mainline-smoke.e2e.test.ts` 保障，仍不等同完整瀏覽器 e2e。
  8. 人工檢查：在同一 workspace 實際提交 SSO / dedicated，確認 refresh 後 saved sections 字段與提交一致。
  9. 人工檢查：刷新頁面或重新進入同 workspace，再讀一次 readiness，確認不是本地草稿殘留。
  10. 人工檢查（跨頁點通）：從上述各 surface 實際點擊到 verification/go-live，再返回 source surface，確認鏈接可達、上下文不丟失、回退路徑可用。
  11. 人工檢查：覆蓋失敗路徑（plan gate、metadata 非法、control-plane 不可用），確認不會誤覆蓋既有 saved sections，且回退指引可操作。
- 後續規劃（尚未落地）：
  - 將 `web/tests/e2e/saas-mainline-smoke.e2e.test.ts` 從 non-browser smoke 推進到更接近真實瀏覽器流的 smoke。

## 7. 交接輸出建議

每次驗收後至少保留：

- workspace slug / workspace id
- 三個能力當前狀態（enabled/staged/not_configured 等）
- 失敗碼（若有）與回退決策
- 驗收時間與操作者

## 8. Invitation continuity（members 鏈路）同步口徑

在 invitation continuity 已落地的前提下，runbook 需要與測試/文檔口徑保持一致：

- 同步鏈路：
  - `members -> accept-invitation -> members/playground/verification/go-live`
- 合約檢查點（source/page contract + non-browser smoke）：
  - `members` 到 `accept-invitation` 的入口在 onboarding handoff 場景應沿用 shared continuity query。
  - `accept-invitation` next-step builder 需保留核心 continuity keys：
    - `week8_focus`、`attention_workspace`、`attention_organization`、`delivery_context`、`recent_track_key`、`recent_update_kind`、`evidence_count`、`recent_owner_label`。
  - `verification/go-live` 必須保留顯式 `surface`：
    - `/verification?surface=verification`
    - `/go-live?surface=go_live`
- 邊界聲明：
  - 以上屬 `W12-E01` non-browser/source-assisted+execution smoke 與 page/source contract 覆蓋口徑。
  - 不等同完整 browser e2e；真實跨頁點擊與互動時序驗收仍需後續 browser e2e 或人工走查補位。
