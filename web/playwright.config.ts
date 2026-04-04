import { defineConfig } from "@playwright/test";

const systemChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3005",
    browserName: "chromium",
    headless: true,
    launchOptions: {
      executablePath: systemChromePath,
    },
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3005",
    url: "http://127.0.0.1:3005",
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
