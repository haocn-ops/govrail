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
const systemChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const candidateRouteChain = [
  "/",
  "/session",
  "/onboarding",
  "/usage",
  "/settings",
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
  const playwrightDirectDependency = Boolean(
    packageJson.devDependencies?.["@playwright/test"] || packageJson.dependencies?.["@playwright/test"],
  );
  const playwrightResolvedPath = resolveOptional("@playwright/test");
  const playwrightConfigPath =
    resolveOptional(path.resolve(webDir, "playwright.config.ts")) ||
    resolveOptional(path.resolve(webDir, "playwright.config.mjs")) ||
    resolveOptional(path.resolve(webDir, "playwright.config.js"));
  const systemBrowserPresent = await pathExists(systemChromePath);
  const browserSmokeSpecPresent = await pathExists(browserSmokeSpecPath);
  const browserSmokeScriptPresent = packageJson.scripts?.["test:browser:smoke"] === "playwright test --config playwright.config.ts";
  const browserSmokeReady =
    playwrightDirectDependency &&
    playwrightResolvedPath &&
    playwrightConfigPath &&
    systemBrowserPresent &&
    browserSmokeSpecPresent &&
    browserSmokeScriptPresent;

  const report = {
    status: browserSmokeReady ? "ready" : "pending",
    boundary:
      "Current repo coverage is still centered on unit + contract + page + non-browser smoke, with one minimal true browser smoke added for launchpad -> session -> onboarding -> usage -> settings -> verification -> go-live -> admin. This report does not claim full browser e2e is complete.",
    candidateRouteChain,
    playwright: {
      directDependency: playwrightDirectDependency,
      resolvable: Boolean(playwrightResolvedPath),
      configPresent: Boolean(playwrightConfigPath),
      systemBrowserPresent,
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
        ? "Run `npm run test:browser:smoke` and keep the browser scope limited to launchpad -> session -> onboarding -> usage -> settings -> verification -> go-live -> admin until the next continuity slice is stable."
        : "Install a direct browser test dependency/config and wire one minimal launchpad -> session -> onboarding -> usage -> settings -> verification -> go-live -> admin smoke without overstating coverage.",
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHumanReport(report);
}

await main();
