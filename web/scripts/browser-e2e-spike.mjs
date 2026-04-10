import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { access, readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, "..");
const packageJsonPath = path.resolve(webDir, "package.json");
const executionPlanPath = path.resolve(webDir, "../docs/saas_v1_execution_plan_zh.md");
const browserSmokeSpecPath = path.resolve(webDir, "tests/browser/launchpad-session-onboarding.smoke.spec.ts");
const playwrightConfigPath = path.resolve(webDir, "playwright.config.ts");
const systemChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const candidateRouteChain = [
  "/",
  "/session",
  "/onboarding",
  "/usage",
  "/settings?intent=manage-plan",
  "/verification?surface=verification",
  "/go-live?surface=go_live",
  "/admin?readiness_returned=1",
];

function resolveOptional(specifier) {
  try {
    return require.resolve(specifier);
  } catch {
    return null;
  }
}

function hasProductionBackedPlaywrightServer(playwrightConfig) {
  const basePatterns = [
    /const host = process\.env\.PLAYWRIGHT_HOST \?\? "127\.0\.0\.1";/,
    /const port = Number\(process\.env\.PLAYWRIGHT_PORT \?\? "3005"\);/,
    /const defaultBaseURL = `http:\/\/\$\{host\}:\$\{port\}`;/,
    /const baseURL = process\.env\.PLAYWRIGHT_BASE_URL \?\? defaultBaseURL;/,
    /const defaultWebServerCommand = `npm run build && npm run start -- --hostname \$\{host\} --port \$\{port\}`;/,
    /const webServerCommand =[\s\S]*process\.env\.PLAYWRIGHT_WEB_SERVER_COMMAND \?\?[\s\S]*defaultWebServerCommand;/,
    /const webServerTimeout = Number\(process\.env\.PLAYWRIGHT_WEB_SERVER_TIMEOUT_MS \?\? "240000"\)/,
    /const reuseExistingServer =[\s\S]*process\.env\.PLAYWRIGHT_REUSE_EXISTING_SERVER == null[\s\S]*\? true[\s\S]*process\.env\.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1";/,
    /const manageWebServer =[\s\S]*process\.env\.PLAYWRIGHT_MANAGE_WEB_SERVER == null[\s\S]*process\.env\.PLAYWRIGHT_BASE_URL == null[\s\S]*process\.env\.PLAYWRIGHT_MANAGE_WEB_SERVER === "1";/,
  ];

  const webServerPatterns = [
    /webServer:\s*manageWebServer/,
    /command:\s*webServerCommand/,
    /url:\s*baseURL/,
    /timeout:\s*webServerTimeout/,
    /reuseExistingServer,/,
  ];

  const baseMatches = basePatterns.every((pattern) => pattern.test(playwrightConfig));
  const serverMatches = webServerPatterns.every((pattern) => pattern.test(playwrightConfig));
  const explicitBaseURLProvided = Boolean(process.env.PLAYWRIGHT_BASE_URL);

  return baseMatches && (explicitBaseURLProvided || serverMatches);
}

function printHumanReport(report) {
  console.log("Browser E2E Spike Report");
  console.log(`status: ${report.status}`);
  console.log(`playwright_direct_dependency: ${report.playwright.directDependency}`);
  console.log(`playwright_resolvable: ${report.playwright.resolvable}`);
  console.log(`playwright_config_present: ${report.playwright.configPresent}`);
  console.log(`system_browser_present: ${report.playwright.systemBrowserPresent}`);
  console.log(`browser_smoke_spec_present: ${report.browserSmoke.specPresent}`);
  console.log(`browser_smoke_script_present: ${report.browserSmoke.scriptPresent}`);
  console.log(`candidate_route_chain: ${report.candidateRouteChain.join(" -> ")}`);
  console.log(`recommended_next_step: ${report.recommendedNextStep}`);
  console.log(`boundary: ${report.boundary}`);
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const executionPlan = await readFile(executionPlanPath, "utf8");
  const playwrightConfig = await readFile(playwrightConfigPath, "utf8");
  const playwrightDirectDependency = Boolean(
    packageJson.devDependencies?.["@playwright/test"] || packageJson.dependencies?.["@playwright/test"],
  );
  const playwrightResolvedPath = resolveOptional("@playwright/test");
  const resolvedPlaywrightConfigPath =
    resolveOptional(path.resolve(webDir, "playwright.config.ts")) ||
    resolveOptional(path.resolve(webDir, "playwright.config.mjs")) ||
    resolveOptional(path.resolve(webDir, "playwright.config.js"));
  const systemBrowserPresent = await pathExists(systemChromePath);
  const browserSmokeSpecPresent = await pathExists(browserSmokeSpecPath);
  const browserSmokeScriptPresent = packageJson.scripts?.["test:browser:smoke"] === "playwright test --config playwright.config.ts";
  const productionServerBacked = hasProductionBackedPlaywrightServer(playwrightConfig);
  const browserSmokeReady =
    playwrightDirectDependency &&
    playwrightResolvedPath &&
    resolvedPlaywrightConfigPath &&
    systemBrowserPresent &&
    browserSmokeSpecPresent &&
    browserSmokeScriptPresent &&
    productionServerBacked;

  const report = {
    status: browserSmokeReady ? "ready" : "pending",
    boundary:
      "Current repo coverage is still centered on unit + contract + page + non-browser smoke, with one minimal true browser smoke added for launchpad -> session -> onboarding -> usage -> /settings?intent=manage-plan -> verification -> go-live -> admin. This report does not claim full browser e2e is complete.",
    candidateRouteChain,
    playwright: {
      directDependency: playwrightDirectDependency,
      resolvable: Boolean(playwrightResolvedPath),
      configPresent: Boolean(resolvedPlaywrightConfigPath),
      systemBrowserPresent,
      productionServerBacked,
    },
    browserSmoke: {
      specPresent: browserSmokeSpecPresent,
      scriptPresent: browserSmokeScriptPresent,
    },
    docs: {
      browserSpikePlanned: executionPlan.includes("browser-e2e spike"),
      browserE2eStillPostponed:
        executionPlan.includes("完整 browser e2e 尚未落地") || executionPlan.includes("完整瀏覽器 e2e 仍後置"),
    },
    recommendedNextStep:
      browserSmokeReady
        ? "Run `npm run test:browser:smoke` against the production-backed local server and keep the browser scope limited to launchpad -> session -> onboarding -> usage -> /settings?intent=manage-plan -> verification -> go-live -> admin until the next continuity slice is stable."
        : "Install a direct browser test dependency/config and wire one minimal launchpad -> session -> onboarding -> usage -> /settings?intent=manage-plan -> verification -> go-live -> admin smoke on a production-backed local server without overstating coverage.",
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHumanReport(report);
}

await main();
