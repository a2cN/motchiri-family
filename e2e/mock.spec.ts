import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";

// 「ログインと世帯」のモック(src/app/mock/)の検査とスクリーンショット。
// 画像は E2E_SCREENSHOT_DIR/<project>/mock-<name>.png(見える範囲)。モックは通信も保存もしない。
const screenshotDir = path.resolve(process.env.E2E_SCREENSHOT_DIR ?? "e2e-artifacts/screenshots");

const EMAIL = "taro@example.com";
const PASSWORD = "mochi-mochi-2026";

type Settings = Record<string, string>;

/** 目次で設定を押してから、ページへリンクで移る(設定は画面を移っても続くが、URL を直接開くと初期値)。 */
async function openIndex(page: Page, settings: Settings = {}) {
  await page.goto("mock/");
  for (const [key, value] of Object.entries(settings)) {
    await page.locator(`[data-setting="${key}"] [data-opt="${value}"]`).click();
    await expect(page.locator(`[data-setting="${key}"] [data-opt="${value}"]`)).toHaveAttribute("aria-pressed", "true");
  }
}

async function goTo(page: Page, href: string) {
  await page.locator(`main a[href$="${href}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${href.replace(/\//g, "\\/")}$`));
}

async function open(page: Page, href: string, settings: Settings = {}) {
  await openIndex(page, settings);
  await goTo(page, href);
}

async function checks(page: Page) {
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await findHorizontalOverflow(page), "横スクロールが出ている").toBeNull();
  expect(await findSmallInputs(page), "16px 未満の入力欄がある").toEqual([]);
  expect(await findSmallTapTargets(page), "44px 未満の押せる範囲がある").toEqual([]);
}

async function shot(page: Page, testInfo: TestInfo, name: string) {
  await checks(page);
  const dir = path.join(screenshotDir, testInfo.project.name);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `mock-${name}.png`) });
}

async function fillLogin(page: Page) {
  await page.getByLabel("メールアドレス").fill(EMAIL);
  await page.getByLabel("パスワード", { exact: true }).fill(PASSWORD);
}

const submit = (page: Page) => page.getByRole("button", { name: /^ログイン/ });

test("目次", async ({ page }, testInfo) => {
  await page.goto("mock/");
  await expect(page).toHaveTitle("モックの目次 | モック");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await shot(page, testInfo, "index");
});

const DIRECT_PAGES: [string, string, string][] = [
  ["mock/launch/", "起動のながれ | モック", "もっちりファミリー"],
  ["mock/checking/", "確かめ中 | モック", "もっちりファミリー"],
  ["mock/login/", "ログイン | モック", "ログイン"],
  ["mock/login-expired/", "ログイン(ログインが切れたあと) | モック", "ログイン"],
  ["mock/member-error/", "つながりませんでした | モック", "つながりませんでした"],
  ["mock/unlinked/", "世帯に入っていません | モック", "まだ世帯に入っていません"],
  ["mock/top/", "トップ | モック", "もっちりファミリー"],
  ["mock/stock/", "もっちり倉庫 | モック", "もっちり倉庫"],
];

for (const [url, title, h1] of DIRECT_PAGES) {
  test(`直接開く: ${url}(title・h1・noindex・検査・注記・新規登録の語が無い)`, async ({ page }) => {
    await page.goto(url);
    await expect(page).toHaveTitle(title);
    await expect(page.locator("h1")).toHaveText(h1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByText("これはモックです。入力した内容はどこにも送りません。")).toBeVisible();
    await checks(page);
    const text = await page.locator("body").innerText();
    for (const w of ["新規登録", "サインイン", "アカウントを作る", "再設定"]) expect(text).not.toContain(w);
  });
}

test("確かめ中: A は1秒より前は文字が無く、後に「確かめています…」。B・C", async ({ page }, testInfo) => {
  await page.goto("mock/checking/");
  await expect(page.getByText("確かめています…")).toHaveCount(0);
  await shot(page, testInfo, "checking");
  await expect(page.getByText("確かめています…")).toBeVisible({ timeout: 3000 });
  await shot(page, testInfo, "checking-slow");
  await open(page, "/mock/checking/", { checking: "b" });
  await shot(page, testInfo, "checking-b");
  await expect(page.locator("h1")).toHaveText("もっちりファミリー");
  await open(page, "/mock/checking/", { checking: "c" });
  await expect(page.getByText("確かめています…")).toBeVisible();
  await shot(page, testInfo, "checking-c");
});

test("起動のながれ: 確かめ中のあと、ログイン画面へ移る", async ({ page }) => {
  await page.goto("mock/launch/");
  await expect(page).toHaveURL(/\/mock\/login\/$/, { timeout: 6000 });
  await expect(page.locator("h1")).toHaveText("ログイン");
});

test("ログイン: 空・入力済み・表示を押した・送信中", async ({ page }, testInfo) => {
  await page.goto("mock/login/");
  await expect(page.getByLabel("メールアドレス")).not.toBeFocused(); // 初めはフォーカスを当てない
  await expect(page.getByText("パスワードを忘れたときは、管理者に聞いてください。")).toBeVisible();
  await shot(page, testInfo, "login");
  await fillLogin(page);
  await shot(page, testInfo, "login-filled");
  const eye = page.getByRole("button", { name: "パスワードを表示" });
  const pw = page.getByLabel("パスワード", { exact: true });
  await expect(pw).toHaveAttribute("type", "password");
  await eye.click();
  await expect(pw).toHaveAttribute("type", "text");
  await expect(eye).toHaveAttribute("aria-pressed", "true");
  await shot(page, testInfo, "login-password-shown");
  await open(page, "/mock/login/", { wait: "forever" });
  await fillLogin(page);
  await submit(page).click();
  await expect(submit(page)).toHaveText("ログインしています…");
  await expect(submit(page)).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByLabel("メールアドレス")).toHaveAttribute("readonly", "");
  await submit(page).click({ force: true }); // もう一度押しても何も起きない
  await expect(submit(page)).toHaveText("ログインしています…");
  await shot(page, testInfo, "login-sending");
});

test("ログイン: 欄の誤り(空・「@」なし)と、return で送れること", async ({ page }, testInfo) => {
  await page.goto("mock/login/");
  await submit(page).click();
  await expect(page.getByText("メールアドレスを入れてください")).toBeVisible();
  await expect(page.getByText("パスワードを入れてください")).toBeVisible();
  await expect(page.getByLabel("メールアドレス")).toBeFocused();
  await expect(page.getByLabel("メールアドレス")).toHaveAttribute("aria-invalid", "true");
  await shot(page, testInfo, "login-field-errors");
  await page.getByLabel("メールアドレス").fill("taro");
  await page.getByLabel("パスワード", { exact: true }).fill(PASSWORD);
  await submit(page).click();
  await expect(page.getByText("メールアドレスの形を確かめてください")).toBeVisible();
  await shot(page, testInfo, "login-email-format");
  // 直した欄の誤りは消える。return で送れる(設定: 成功 → 確かめ中 → トップ)
  await page.getByLabel("メールアドレス").fill(EMAIL);
  await expect(page.getByText("メールアドレスの形を確かめてください")).toHaveCount(0);
  await page.getByLabel("パスワード", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/mock\/top\/$/, { timeout: 6000 });
});

const ERRORS: [string, string, string][] = [
  ["credentials", "credentials", "メールアドレスかパスワードがちがいます。"],
  ["network", "network", "通信できませんでした。電波のよい場所で、もう一度ログインしてください。"],
  ["rate", "rate", "何度も試したため、いまはログインできません。しばらく待ってから、もう一度ログインしてください。"],
  ["unknown", "unknown", "ログインできませんでした。しばらく待ってから、もう一度ログインしてください。続くときは、管理者に知らせてください。"],
];

for (const [name, value, text] of ERRORS) {
  test(`ログイン: 送った結果の誤り(${name})`, async ({ page }, testInfo) => {
    await open(page, "/mock/login/", { loginResult: value });
    await fillLogin(page);
    await submit(page).click();
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toHaveText(text);
    await expect(page.getByLabel("メールアドレス")).toHaveValue(EMAIL); // 入れた値は残す
    if (name === "credentials") {
      await expect(page.getByLabel("パスワード", { exact: true })).toBeFocused();
      await expect(page.getByLabel("メールアドレス")).toHaveAttribute("aria-invalid", "true");
    } else {
      await expect(page.getByLabel("メールアドレス")).not.toHaveAttribute("aria-invalid", "true");
    }
    await shot(page, testInfo, `login-error-${name}`);
  });
}

test("ログイン: OD-09 の B・C、OD-11 の B・C・文字だけ(見比べ用)", async ({ page }, testInfo) => {
  await open(page, "/mock/login/", { loginLayout: "b" });
  await expect(page.getByText("パスワードを忘れたときは")).toHaveCount(0);
  await shot(page, testInfo, "login-layout-b");
  await open(page, "/mock/login/", { loginLayout: "c" });
  await shot(page, testInfo, "login-layout-c");
  await open(page, "/mock/login/", { loginResult: "network", errorStyle: "b" });
  await fillLogin(page);
  await submit(page).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("ログインできませんでした。");
  await shot(page, testInfo, "login-error-style-b");
  await open(page, "/mock/login/", { loginResult: "network", errorStyle: "c" });
  await fillLogin(page);
  await submit(page).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("ログインできませんでした。");
  await shot(page, testInfo, "login-error-style-c");
  await open(page, "/mock/login/", { loginResult: "network", errorStyle: "text" });
  await fillLogin(page);
  await submit(page).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("通信できませんでした。");
  await shot(page, testInfo, "login-error-style-text");
});

test("ログイン: パスワードの切り替えを「なし」にすると目のボタンが無い", async ({ page }) => {
  await open(page, "/mock/login/", { passwordToggle: "off" });
  await expect(page.getByRole("button", { name: "パスワードを表示" })).toHaveCount(0);
});

test("ログイン: ログインが切れたあとの知らせ", async ({ page }, testInfo) => {
  await open(page, "/mock/login-expired/");
  await expect(page.getByRole("status")).toHaveText("ログインが切れました。もう一度ログインしてください。");
  await shot(page, testInfo, "login-expired");
});

test("ログアウト: トップ(A)から。ログアウトしました。の知らせ。送ると消える", async ({ page }, testInfo) => {
  await open(page, "/mock/top/");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/mock\/login\/$/);
  await expect(page.getByRole("status")).toHaveText("ログアウトしました。");
  await expect(page.getByLabel("メールアドレス")).toHaveValue("");
  await shot(page, testInfo, "login-logged-out");
  await submit(page).click();
  await expect(page.getByText("ログアウトしました。")).toHaveCount(0);
});

test("ながれ: 世帯の確かめの3通り(トップ・結びついていない・確かめられなかった → もう一度)", async ({ page }) => {
  await open(page, "/mock/login/");
  await fillLogin(page);
  await submit(page).click();
  await expect(page).toHaveURL(/\/mock\/top\/$/, { timeout: 6000 });

  await open(page, "/mock/login/", { household: "unlinked" });
  await fillLogin(page);
  await submit(page).click();
  await expect(page).toHaveURL(/\/mock\/unlinked\/$/, { timeout: 6000 });

  await open(page, "/mock/login/", { household: "error" });
  await fillLogin(page);
  await submit(page).click();
  await expect(page).toHaveURL(/\/mock\/member-error\/$/, { timeout: 6000 });
  await page.getByRole("button", { name: "もう一度" }).click();
  await expect(page).toHaveURL(/\/mock\/top\/$/, { timeout: 6000 });
});

test("確かめられなかった画面: A・B・C", async ({ page }, testInfo) => {
  await open(page, "/mock/member-error/");
  await shot(page, testInfo, "member-error");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/mock\/login\/$/);
  await expect(page.getByText("ログアウトしました。")).toBeVisible();
  await open(page, "/mock/member-error/", { memberError: "b" });
  await expect(page.getByRole("button", { name: "ログアウト" })).toHaveCount(0);
  await shot(page, testInfo, "member-error-b");
  await open(page, "/mock/member-error/", { memberError: "c" });
  await expect(page.getByRole("button")).toHaveCount(0);
  await shot(page, testInfo, "member-error-c");
});

test("結びついていない画面: A・B・C と「もう一度確かめる」と長いメール", async ({ page }, testInfo) => {
  await open(page, "/mock/unlinked/");
  await expect(page.getByText(`ログイン中: ${EMAIL}`)).toBeVisible();
  await shot(page, testInfo, "unlinked-a");
  await open(page, "/mock/unlinked/", { unlinkedCopy: "b" });
  await expect(page.locator("h1")).toHaveText("このアカウントでは使えません");
  await shot(page, testInfo, "unlinked-b");
  await open(page, "/mock/unlinked/", { unlinkedCopy: "c" });
  await expect(page.locator("h1")).toHaveText("準備がまだ終わっていません");
  await shot(page, testInfo, "unlinked-c");
  await open(page, "/mock/unlinked/", { unlinkedRetry: "on" });
  await shot(page, testInfo, "unlinked-retry");
  await page.getByRole("button", { name: "もう一度確かめる" }).click();
  await expect(page.locator("h1")).toHaveText("もっちりファミリー"); // 確かめ中を1秒
  await expect(page.locator("h1")).toHaveText("まだ世帯に入っていません", { timeout: 4000 }); // 同じ画面に戻る
  await expect(page).toHaveURL(/\/mock\/unlinked\/$/);
  await open(page, "/mock/unlinked/", { emailLength: "long", who: "b" });
  await expect(page.getByText(/ログイン中: sakuramochi/)).toBeVisible();
  await shot(page, testInfo, "unlinked-long-email");
  await open(page, "/mock/unlinked/", { who: "c" });
  await expect(page.getByText("ログイン中:")).toHaveCount(0);
});

test("トップ: ログアウトの位置 A・B・C、確認、ログイン中の人、長いメール", async ({ page }, testInfo) => {
  await open(page, "/mock/top/");
  await expect(page.getByRole("region", { name: "アカウント" })).toContainText(`ログイン中: ${EMAIL}`);
  await shot(page, testInfo, "top-a");

  await open(page, "/mock/top/", { logoutConfirm: "on" });
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByText("ログアウトしますか?")).toBeFocused();
  await shot(page, testInfo, "top-a-confirm");
  await page.getByRole("button", { name: "やめる" }).click();
  await expect(page.getByText("ログアウトしますか?")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ログアウト", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await page.getByRole("button", { name: "ログアウトする" }).click();
  await expect(page).toHaveURL(/\/mock\/login\/$/);

  await open(page, "/mock/top/", { emailLength: "long" });
  await expect(page.getByText(/ログイン中: sakuramochi/)).toBeVisible();
  await shot(page, testInfo, "top-a-long-email");

  await open(page, "/mock/top/", { logoutPos: "b" });
  await expect(page.locator("header").getByRole("button", { name: "ログアウト" })).toBeVisible();
  await shot(page, testInfo, "top-b");

  await open(page, "/mock/top/", { who: "c" });
  await expect(page.getByText("ログイン中:")).toHaveCount(0);
  await shot(page, testInfo, "top-who-none");

  await open(page, "/mock/stock/", { logoutPos: "c" });
  await expect(page.locator("header").getByRole("button", { name: "ログアウト" })).toBeVisible();
  await shot(page, testInfo, "stock-c");
  await page.getByRole("link", { name: "トップ" }).click();
  await expect(page).toHaveURL(/\/mock\/top\/$/);
  await expect(page.locator("header").getByRole("button", { name: "ログアウト" })).toBeVisible();

  // A・B では倉庫の画面にログアウトを足さない
  await open(page, "/mock/stock/");
  await expect(page.getByRole("button", { name: "ログアウト" })).toHaveCount(0);
});

test("フォーカスの輪: ログイン画面の「パスワードを表示」に Tab で", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "ipad-portrait", "iPad 縦だけ撮る");
  await page.goto("mock/login/");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "パスワードを表示" })).toBeFocused();
  await shot(page, testInfo, "focus");
});

test("モックは外へ通信せず、何も保存しない", async ({ page }) => {
  const hosts = new Set<string>();
  page.on("request", (r) => hosts.add(new URL(r.url()).hostname));
  await open(page, "/mock/login/");
  await fillLogin(page);
  await submit(page).click();
  await expect(page).toHaveURL(/\/mock\/top\/$/, { timeout: 6000 });
  expect([...hosts].filter((h) => h !== "127.0.0.1")).toEqual([]);
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie }));
  expect(stored).toEqual({ local: 0, session: 0, cookie: "" });
});
