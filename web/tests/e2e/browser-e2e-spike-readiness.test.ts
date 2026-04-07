import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(testDir, "../..");
const packageJsonPath = path.resolve(webDir, "package.json");
const rootPackageJsonPath = path.resolve(webDir, "..", "package.json");
const probeScriptPath = path.resolve(webDir, "scripts/browser-e2e-spike.mjs");
const existingServerRunnerPath = path.resolve(webDir, "scripts/run-playwright-existing-server-smoke.mjs");
const existingServerSupportPath = path.resolve(webDir, "scripts/playwright-existing-server-support.mjs");
const prebuiltRunnerPath = path.resolve(webDir, "scripts/run-playwright-prebuilt-smoke.mjs");
const playwrightConfigPath = path.resolve(webDir, "playwright.config.ts");
const executionPlanPath = path.resolve(webDir, "../docs/saas_v1_execution_plan_zh.md");
const browserSmokeSpecPath = path.resolve(webDir, "tests/browser/launchpad-session-onboarding.smoke.spec.ts");
const docsReadmePath = path.resolve(webDir, "../docs/README.md");

test("browser-e2e spike probe keeps executable readiness report aligned with current repo boundary", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const playwrightConfig = await readFile(playwrightConfigPath, "utf8");
  const executionPlan = await readFile(executionPlanPath, "utf8");
  const browserSmokeSpec = await readFile(browserSmokeSpecPath, "utf8");
  const docsReadme = await readFile(docsReadmePath, "utf8");
  const existingServerRunner = await readFile(existingServerRunnerPath, "utf8");
  const existingServerSupport = await readFile(existingServerSupportPath, "utf8");
  const prebuiltRunner = await readFile(prebuiltRunnerPath, "utf8");
  const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.["test:browser:spike"], "node scripts/browser-e2e-spike.mjs");
  assert.equal(packageJson.scripts?.["test:browser:smoke"], "playwright test --config playwright.config.ts");
  assert.equal(
    packageJson.scripts?.["test:browser:smoke:existing-server"],
    "node scripts/run-playwright-existing-server-smoke.mjs",
  );
  assert.equal(
    packageJson.scripts?.["test:browser:session-checkpoint:existing-server"],
    "node scripts/run-playwright-existing-server-smoke.mjs tests/browser/session-members-verification-admin-return.smoke.spec.ts tests/browser/session-members-verification-go-live-admin-return.smoke.spec.ts",
  );
  assert.equal(
    packageJson.scripts?.["test:browser:billing-shortchain:existing-server"],
    "node scripts/run-playwright-existing-server-smoke.mjs tests/browser/admin-readiness-billing-warning-settings-go-live-return.smoke.spec.ts tests/browser/admin-readiness-billing-warning-settings-verification-go-live-return.smoke.spec.ts tests/browser/admin-readiness-billing-warning-settings-verification-go-live-artifacts-return.smoke.spec.ts",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:smoke:revalidate"],
    "npm --prefix web run test:browser:smoke:revalidate --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:smoke:prebuilt"],
    "npm --prefix web run test:browser:smoke:prebuilt --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:smoke:existing-server"],
    "npm --prefix web run test:browser:smoke:existing-server --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:session-checkpoint"],
    "npm --prefix web run test:browser:session-checkpoint --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:session-checkpoint:existing-server"],
    "npm --prefix web run test:browser:session-checkpoint:existing-server --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:billing-shortchain"],
    "npm --prefix web run test:browser:billing-shortchain --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:billing-shortchain:existing-server"],
    "npm --prefix web run test:browser:billing-shortchain:existing-server --",
  );
  assert.equal(
    rootPackageJson.scripts?.["web:test:browser:spike"],
    "npm --prefix web run test:browser:spike --",
  );
  assert.match(playwrightConfig, /const host = process\.env\.PLAYWRIGHT_HOST \?\? "127\.0\.0\.1";/);
  assert.match(playwrightConfig, /const port = Number\(process\.env\.PLAYWRIGHT_PORT \?\? "3005"\);/);
  assert.match(playwrightConfig, /const defaultBaseURL = `http:\/\/\$\{host\}:\$\{port\}`;/);
  assert.match(
    playwrightConfig,
    /const baseURL = process\.env\.PLAYWRIGHT_BASE_URL \?\? defaultBaseURL;/,
  );
  assert.match(playwrightConfig, /const webServerCommand =/);
  assert.match(playwrightConfig, /process\.env\.PLAYWRIGHT_WEB_SERVER_COMMAND \?\?/);
  assert.match(
    playwrightConfig,
    /const defaultWebServerCommand = `npm run build && npm run start -- --hostname \$\{host\} --port \$\{port\}`;/,
  );
  assert.match(playwrightConfig, /const webServerTimeout = Number\(process\.env\.PLAYWRIGHT_WEB_SERVER_TIMEOUT_MS \?\? "240000"\)/);
  assert.match(playwrightConfig, /const reuseExistingServer =/);
  assert.match(playwrightConfig, /process\.env\.PLAYWRIGHT_REUSE_EXISTING_SERVER == null/);
  assert.match(playwrightConfig, /\?\s*true/);
  assert.match(playwrightConfig, /process\.env\.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1"/);
  assert.match(playwrightConfig, /const manageWebServer =/);
  assert.match(playwrightConfig, /process\.env\.PLAYWRIGHT_MANAGE_WEB_SERVER == null/);
  assert.match(playwrightConfig, /process\.env\.PLAYWRIGHT_BASE_URL == null/);
  assert.match(playwrightConfig, /process\.env\.PLAYWRIGHT_MANAGE_WEB_SERVER === "1"/);
  assert.match(playwrightConfig, /webServer:\s*manageWebServer/);
  assert.match(playwrightConfig, /command:\s*webServerCommand/);
  assert.match(playwrightConfig, /url:\s*baseURL/);
  assert.match(playwrightConfig, /timeout:\s*webServerTimeout/);
  assert.match(playwrightConfig, /reuseExistingServer,/);
  assert.match(prebuiltRunner, /const explicitBaseURL = process\.env\.PLAYWRIGHT_BASE_URL \?\? null;/);
  assert.match(prebuiltRunner, /if \(explicitBaseURL\) \{/);
  assert.match(prebuiltRunner, /function resolveExplicitBaseURLPort\(\)/);
  assert.match(prebuiltRunner, /const url = new URL\(explicitBaseURL\);/);
  assert.match(prebuiltRunner, /throw new Error\(`\[playwright-prebuilt-smoke\] Invalid PLAYWRIGHT_BASE_URL: \$\{explicitBaseURL\}`\);/);
  assert.match(
    prebuiltRunner,
    /PLAYWRIGHT_MANAGE_WEB_SERVER:\s*process\.env\.PLAYWRIGHT_MANAGE_WEB_SERVER \?\? \(process\.env\.PLAYWRIGHT_BASE_URL \? "0" : "1"\),/,
  );
  assert.match(
    prebuiltRunner,
    /PLAYWRIGHT_REUSE_EXISTING_SERVER:\s*process\.env\.PLAYWRIGHT_REUSE_EXISTING_SERVER \?\? \(process\.env\.PLAYWRIGHT_BASE_URL \? "1" : "0"\),/,
  );
  assert.match(existingServerRunner, /parseExistingServerSettings/);
  assert.match(existingServerRunner, /buildExistingServerProbeURL/);
  assert.match(existingServerRunner, /probeExistingServerReadiness/);
  assert.match(existingServerRunner, /PLAYWRIGHT_SERVER_READY_PATH/);
  assert.match(existingServerRunner, /PLAYWRIGHT_SKIP_SERVER_PROBE=1/);
  assert.match(existingServerSupport, /PLAYWRIGHT_BASE_URL is required when reusing an existing server/);
  assert.match(existingServerSupport, /PLAYWRIGHT_SERVER_READY_PATH/);
  assert.match(existingServerSupport, /PLAYWRIGHT_SERVER_READY_TIMEOUT_MS/);
  assert.match(existingServerSupport, /PLAYWRIGHT_SERVER_READY_RETRIES/);
  assert.match(existingServerSupport, /PLAYWRIGHT_SERVER_READY_RETRY_DELAY_MS/);
  assert.match(existingServerSupport, /PLAYWRIGHT_SKIP_SERVER_PROBE === "1"/);
  assert.match(existingServerSupport, /const defaultReadyPath = "\/api\/control-plane\/health"/);
  assert.match(packageJson.devDependencies?.["@playwright/test"] ?? "", /^\^?1\./);
  assert.match(executionPlan, /browser-e2e spike（後置但可先做最小基座）/);
  assert.match(executionPlan, /完整(?:\s*browser|瀏覽器)?\s*e2e[\s\S]{0,24}(?:尚未落地|仍後置)/);
  assert.match(executionPlan, /web:test:browser:smoke:revalidate|test:browser:smoke:revalidate/);
  assert.match(executionPlan, /web:test:browser:session-checkpoint/);
  assert.match(executionPlan, /web:test:browser:billing-shortchain/);
  assert.match(executionPlan, /existing-server|PLAYWRIGHT_BASE_URL/);
  assert.match(executionPlan, /PLAYWRIGHT_BASE_URL/);
  assert.match(executionPlan, /PLAYWRIGHT_BASE_URL[\s\S]{0,120}PLAYWRIGHT_REUSE_EXISTING_SERVER|重用既有 server/);
  assert.match(executionPlan, /PLAYWRIGHT_REUSE_EXISTING_SERVER/);
  assert.match(executionPlan, /PLAYWRIGHT_SERVER_READY_PATH|PLAYWRIGHT_SKIP_SERVER_PROBE/);
  assert.match(executionPlan, /PLAYWRIGHT_SERVER_READY_RETRIES|PLAYWRIGHT_SERVER_READY_RETRY_DELAY_MS/);
  assert.match(docsReadme, /web:test:browser:smoke:revalidate/);
  assert.match(docsReadme, /web:test:browser:session-checkpoint/);
  assert.match(docsReadme, /web:test:browser:billing-shortchain/);
  assert.match(docsReadme, /web:test:browser:smoke:prebuilt/);
  assert.match(docsReadme, /web:test:browser:smoke:existing-server|web:test:browser:session-checkpoint:existing-server/);
  assert.match(docsReadme, /PLAYWRIGHT_BASE_URL/);
  assert.match(docsReadme, /不再啟動本地 `webServer`|重用這個 production-backed host/);
  assert.match(docsReadme, /PLAYWRIGHT_REUSE_EXISTING_SERVER/);
  assert.match(docsReadme, /PLAYWRIGHT_SERVER_READY_PATH|PLAYWRIGHT_SKIP_SERVER_PROBE/);
  assert.match(docsReadme, /PLAYWRIGHT_SERVER_READY_RETRIES|PLAYWRIGHT_SERVER_READY_RETRY_DELAY_MS/);
  assert.match(
    browserSmokeSpec,
    /launchpad -> session -> onboarding -> usage -> settings -> verification -> go-live -> admin keeps minimal browser continuity/,
  );
  assert.match(browserSmokeSpec, /source=admin-readiness/);
  assert.match(browserSmokeSpec, /Step 5: Confirm usage window/);
  assert.match(browserSmokeSpec, /Review plan limits in Settings/);
  assert.match(browserSmokeSpec, /Capture verification evidence/);
  assert.match(browserSmokeSpec, /Week 8 launch checklist/);
  assert.match(browserSmokeSpec, /Continue to go-live drill/);
  assert.match(browserSmokeSpec, /surface=go_live/);
  assert.match(browserSmokeSpec, /Mock go-live drill/);
  assert.match(browserSmokeSpec, /Session-aware drill lane/);
  assert.match(browserSmokeSpec, /Return to admin readiness view/);
  assert.match(browserSmokeSpec, /readiness_returned=1/);
  assert.match(browserSmokeSpec, /Returned from Week 8 readiness/);

  const { stdout } = await execFileAsync("node", [probeScriptPath, "--json"], {
    cwd: webDir,
  });
  const report = JSON.parse(stdout) as {
    status: string;
    boundary: string;
    candidateRouteChain: string[];
    playwright: {
      directDependency: boolean;
      resolvable: boolean;
      configPresent: boolean;
      systemBrowserPresent: boolean;
      productionServerBacked: boolean;
    };
    browserSmoke: {
      specPresent: boolean;
      scriptPresent: boolean;
    };
    docs: {
      browserSpikePlanned: boolean;
      browserE2eStillPostponed: boolean;
    };
  };

  assert.equal(report.status, "ready");
  assert.equal(report.playwright.directDependency, true);
  assert.equal(report.playwright.resolvable, true);
  assert.equal(report.playwright.configPresent, true);
  assert.equal(report.playwright.systemBrowserPresent, true);
  assert.equal(report.playwright.productionServerBacked, true);
  assert.equal(report.browserSmoke.specPresent, true);
  assert.equal(report.browserSmoke.scriptPresent, true);
  assert.equal(report.docs.browserSpikePlanned, true);
  assert.equal(report.docs.browserE2eStillPostponed, true);
  assert.deepEqual(report.candidateRouteChain, [
    "/",
    "/session",
    "/onboarding",
    "/usage",
    "/settings?intent=manage-plan",
    "/verification?surface=verification",
    "/go-live?surface=go_live",
    "/admin?readiness_returned=1",
  ]);
  assert.match(report.boundary, /one minimal true browser smoke added/i);
  assert.match(
    report.boundary,
    /launchpad -> session -> onboarding -> usage -> settings\?intent=manage-plan -> verification -> go-live -> admin/i,
  );
  assert.match(report.boundary, /does not claim full browser e2e is complete/i);
});
