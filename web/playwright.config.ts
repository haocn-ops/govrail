import { existsSync } from "node:fs";

import { defineConfig } from "@playwright/test";

const systemChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.PLAYWRIGHT_CHROME_PATH ?? systemChromePath;
const host = process.env.PLAYWRIGHT_HOST ?? "127.0.0.1";
const port = Number(process.env.PLAYWRIGHT_PORT ?? "3005");
const defaultBaseURL = `http://${host}:${port}`;
const defaultWebServerCommand = `npm run build && npm run start -- --hostname ${host} --port ${port}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? defaultBaseURL;
const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ??
  defaultWebServerCommand;
const webServerTimeout = Number(process.env.PLAYWRIGHT_WEB_SERVER_TIMEOUT_MS ?? "240000");
const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER == null
    ? true
    : process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1";
const manageWebServer =
  process.env.PLAYWRIGHT_MANAGE_WEB_SERVER == null
    ? process.env.PLAYWRIGHT_BASE_URL == null
    : process.env.PLAYWRIGHT_MANAGE_WEB_SERVER === "1";

export default defineConfig({
  testDir: "./tests/browser",
  // Keep artifacts out of the app tree and run against a production-backed server
  // so long suites are not interrupted by dev-server watcher churn.
  outputDir: "/tmp/govrail-playwright-test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    launchOptions: {
      executablePath: existsSync(executablePath) ? executablePath : undefined,
    },
  },
  webServer: manageWebServer
    ? {
        command: webServerCommand,
        url: baseURL,
        timeout: webServerTimeout,
        reuseExistingServer,
      }
    : undefined,
});
