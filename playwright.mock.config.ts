import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// stock-supply のモックのスクリーンショット専用(Supabase 不要。globalSetup なし)。モックと一緒に消える。
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(__dirname, ".playwright-browsers");
const PORT = 4173;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "mock-stock-supply.spec.ts",
  outputDir: "./e2e-artifacts/test-results-mock",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `${ORIGIN}/motchiri-family/`, browserName: "webkit" },
  projects: [
    { name: "ipad-portrait", use: { ...devices["iPad (gen 7)"] } },
    { name: "ipad-landscape", use: { ...devices["iPad (gen 7) landscape"] } },
    { name: "iphone-portrait", use: { ...devices["iPhone 15"] } },
  ],
  webServer: { command: "node scripts/serve-static.mjs", url: `${ORIGIN}/motchiri-family/`, reuseExistingServer: !process.env.CI },
});
