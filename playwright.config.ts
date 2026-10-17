import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// ブラウザ本体は、プロジェクトの中の .playwright-browsers/(.gitignore 済み)に置く。
// 既定の ~/.cache/ms-playwright は CLAUDE.md §11(このディレクトリより上に書かない)により使わない。
// 入れ方: npm run e2e:install
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(__dirname, ".playwright-browsers");

const PORT = 4173;
const ORIGIN = `http://127.0.0.1:${PORT}`;

// 画面サイズ(30_architecture.md D-09)。家族の機種が分かったら、ここの機種名を変える。
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-artifacts/test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: {
    baseURL: `${ORIGIN}/motchiri-family/`,
    // WebKit は Safari に最も近い(NF-03)
    browserName: "webkit",
  },
  projects: [
    { name: "ipad-portrait", use: { ...devices["iPad (gen 7)"] } },
    { name: "ipad-landscape", use: { ...devices["iPad (gen 7) landscape"] } },
    { name: "iphone-portrait", use: { ...devices["iPhone 15"] } },
  ],
  // 公開するものと同じ out/ を、basePath の下で配る。out/ は npm run e2e が先に作り直す
  webServer: {
    command: "node scripts/serve-static.mjs",
    url: `${ORIGIN}/motchiri-family/`,
    reuseExistingServer: !process.env.CI,
  },
});
