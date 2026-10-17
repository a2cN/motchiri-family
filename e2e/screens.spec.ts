import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { portalModules } from "../src/modules/registry";
import { findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";

// 画面ごと・画面サイズごとの検査と、承認と完了の証拠になるスクリーンショット(30_architecture.md §7)。
// 画像の出力先は E2E_SCREENSHOT_DIR で変えられる(既定: e2e-artifacts/screenshots)。
// 見た目の比較(toHaveScreenshot)はしない(D-10)。

const screenshotDir = path.resolve(process.env.E2E_SCREENSHOT_DIR ?? "e2e-artifacts/screenshots");

const screens = [
  { name: "top", url: "", status: 200, h1: "もっちりファミリー" },
  { name: "stock", url: "stock/", status: 200, h1: "もっちり倉庫" },
  // 存在しないパス。Pages と同じく 404.html が 404 で返る
  { name: "notfound", url: "nai/", status: 404, h1: "ページが見つかりません" },
] as const;

for (const screen of screens) {
  test.describe(`画面: ${screen.name}`, () => {
    test("表示・横スクロール無し・入力欄 16px 以上・押せる範囲 44px 以上・スクリーンショット", async ({ page }, testInfo) => {
      const response = await page.goto(screen.url);
      expect(response?.status()).toBe(screen.status);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(screen.h1);
      await expect(page.locator("html")).toHaveAttribute("lang", "ja");

      expect(await findHorizontalOverflow(page), "横スクロールが出ている").toBeNull();
      expect(await findSmallInputs(page), "16px 未満の入力欄がある").toEqual([]);
      expect(await findSmallTapTargets(page), "44px 未満の押せる範囲がある").toEqual([]);

      const dir = path.join(screenshotDir, testInfo.project.name);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${screen.name}.png`), fullPage: true });
    });
  });
}

test("トップに登録の数だけ入口があり、倉庫へ移って、トップへ戻れる", async ({ page }) => {
  await page.goto("");
  const tiles = page.locator("main a");
  await expect(tiles).toHaveCount(portalModules.length);
  await page.getByRole("link", { name: "もっちり倉庫" }).click();
  await expect(page).toHaveURL(/\/motchiri-family\/stock\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("もっちり倉庫");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("まだ在庫はありません");
  await page.getByRole("link", { name: "トップ" }).click();
  await expect(page).toHaveURL(/\/motchiri-family\/$/);
});

test("見つからない画面から、トップへもどれる", async ({ page }) => {
  await page.goto("nai/");
  await page.getByRole("link", { name: "トップへもどる" }).click();
  await expect(page).toHaveURL(/\/motchiri-family\/$/);
});

test("PWA: manifest と apple-touch-icon が取得できる(basePath の付け忘れを観察で止める)", async ({ page }) => {
  await page.goto("");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();
  const res = await page.request.get(new URL(manifestHref!, page.url()).toString());
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/motchiri-family/");
  expect(manifest.scope).toBe("/motchiri-family/");
  expect(manifest.theme_color).toBeUndefined();
  expect(manifest.background_color).toBeUndefined();
  for (const icon of manifest.icons) {
    const r = await page.request.get(new URL(icon.src, page.url()).toString());
    expect(r.status(), icon.src).toBe(200);
  }

  const appleHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect(appleHref).toBeTruthy();
  const apple = await page.request.get(new URL(appleHref!, page.url()).toString());
  expect(apple.status()).toBe(200);

  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "もっちりファミリー");
});
