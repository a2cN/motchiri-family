import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { portalModules } from "../src/modules/registry";
import { startupImages } from "../src/pwa/startup-images";
import { alertBox, credentials, expectAuthState, fillLogin, login, submitLogin } from "./auth-helpers";
import { findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";

// 画面ごと・画面サイズごとの検査と、承認と完了の証拠になるスクリーンショット(30_architecture.md §7)。
// 画像の出力先は E2E_SCREENSHOT_DIR で変えられる(既定: e2e-artifacts/screenshots)。
// 見た目の比較(toHaveScreenshot)はしない(D-10)。

const screenshotDir = path.resolve(process.env.E2E_SCREENSHOT_DIR ?? "e2e-artifacts/screenshots");

// 画面ごとの検査。「login」系はログイン前、それ以外はログインした状態(世帯 A の A1)で撮る(30_architecture.md Interfaces §8)。
// ローカルの Supabase が前提(npm run db:start)。
type Screen = {
  name: string;
  /** 撮る前の準備。ページは開いた状態で返す */
  prepare: (page: Page) => Promise<void>;
  status: number;
  h1: string;
};

const loggedIn = (url: string, status: number) => async (page: Page) => {
  await login(page, "A1");
  const response = await page.goto(url);
  expect(response?.status()).toBe(status);
  await expectAuthState(page, "ready");
};

const screens: Screen[] = [
  {
    name: "login",
    status: 200,
    h1: "ログイン",
    prepare: async (page) => {
      await page.goto("");
      await expectAuthState(page, "signed-out");
    },
  },
  {
    name: "login-error",
    status: 200,
    h1: "ログイン",
    prepare: async (page) => {
      await page.goto("");
      await expectAuthState(page, "signed-out");
      await fillLogin(page, credentials("A1").email, "ちがうパスワード");
      await submitLogin(page);
      await expect(alertBox(page)).toBeVisible();
    },
  },
  {
    name: "login-logged-out",
    status: 200,
    h1: "ログイン",
    prepare: async (page) => {
      await login(page, "A1");
      await page.getByRole("button", { name: "ログアウト" }).click();
      await expectAuthState(page, "signed-out");
      await expect(page.getByRole("status")).toHaveText("ログアウトしました。");
    },
  },
  {
    name: "unlinked",
    status: 200,
    h1: "まだ世帯に入っていません",
    prepare: async (page) => {
      await login(page, "U0", { expect: "unlinked" });
    },
  },
  {
    name: "member-error",
    status: 200,
    h1: "つながりませんでした",
    prepare: async (page) => {
      // 世帯の確かめの応答を失敗にする(通信の失敗は再試行で数秒かかるので、ここでは拒否の応答を返して速くする)
      await page.route(/\/rest\/v1\/member/, (route) => route.fulfill({ status: 403, json: { message: "denied" } }));
      await login(page, "A1", { expect: "member-error", timeout: 15_000 });
    },
  },
  { name: "top", status: 200, h1: "もっちりファミリー", prepare: loggedIn("", 200) },
  {
    name: "stock",
    status: 200,
    h1: "もっちり倉庫",
    prepare: async (page) => {
      await loggedIn("stock/", 200)(page);
      // 世帯 A には品物が無い: 読み込みが終わって、空の状態が出る
      await expect(page.getByText("食材の在庫はありません")).toBeVisible();
    },
  },
  // 存在しないパス。Pages と同じく 404.html が 404 で返る
  { name: "notfound", status: 404, h1: "ページが見つかりません", prepare: loggedIn("nai/", 404) },
];

for (const screen of screens) {
  test.describe(`画面: ${screen.name}`, () => {
    test("表示・横スクロール無し・入力欄 16px 以上・押せる範囲 44px 以上・スクリーンショット", async ({ page }, testInfo) => {
      await screen.prepare(page);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(screen.h1);
      await expect(page.locator("html")).toHaveAttribute("lang", "ja");

      expect(await findHorizontalOverflow(page), "横スクロールが出ている").toBeNull();
      expect(await findSmallInputs(page), "16px 未満の入力欄がある").toEqual([]);
      expect(await findSmallTapTargets(page), "44px 未満の押せる範囲がある").toEqual([]);

      if (screen.name === "top") {
        // ヘッダーの右にログアウトが入っても、タイトルが折り返さない(OD-auth-household-16 B。iPhone 縦で窮屈になる所)
        const box = await page.locator("h1").boundingBox();
        expect(box?.height ?? 999, "タイトルが折り返している").toBeLessThan(40);
        const logout = await page.getByRole("button", { name: "ログアウト" }).boundingBox();
        expect(logout, "ログアウトが見えない").not.toBeNull();
        expect(logout!.x + logout!.width, "ログアウトが画面の外に出ている").toBeLessThanOrEqual(page.viewportSize()!.width);
      }

      const dir = path.join(screenshotDir, testInfo.project.name);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${screen.name}.png`), fullPage: true });
    });
  });
}

test("トップに登録の数だけ入口があり、倉庫へ移って、トップへ戻れる", async ({ page }) => {
  await login(page, "A1");
  const tiles = page.locator("main a");
  await expect(tiles).toHaveCount(portalModules.length);
  await page.getByRole("link", { name: "もっちり倉庫" }).click();
  await expect(page).toHaveURL(/\/motchiri-family\/stock\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("もっちり倉庫");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("食材の在庫はありません");
  await page.getByRole("link", { name: "トップ" }).click();
  await expect(page).toHaveURL(/\/motchiri-family\/$/);
});

test("見つからない画面から、トップへもどれる", async ({ page }) => {
  await login(page, "A1");
  await page.goto("nai/");
  await expectAuthState(page, "ready");
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

test("PWA: 状態バーは default、起動時の画面の画像が一覧の数だけあり、すべて取得できる", async ({ page }) => {
  await page.goto("");
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "default");
  const links = page.locator('link[rel="apple-touch-startup-image"]');
  await expect(links).toHaveCount(startupImages.length);
  const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  for (const href of hrefs) {
    const r = await page.request.get(new URL(href!, page.url()).toString());
    expect(r.status(), href!).toBe(200);
  }
});
