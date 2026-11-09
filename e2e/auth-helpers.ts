import { expect, type Page } from "@playwright/test";

// ログインまわりの E2E の共通部品。テストの利用者は e2e/global-setup.ts が作る(値は環境変数で渡る)。
export type Who = "A1" | "A2" | "B1" | "U0";

export function credentials(who: Who) {
  const email = process.env[`E2E_${who}_EMAIL`];
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error("テストの利用者がありません(e2e/global-setup.ts が作る。npm run e2e で動かす)");
  return { email, password };
}

export function supabaseApi() {
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("ローカルの Supabase の値がありません(e2e/global-setup.ts が渡す)");
  return { url, key, householdA: process.env.E2E_HOUSEHOLD_A_ID ?? "" };
}

/** 画面の状態(data-auth-state)が、その値になるまで待つ。 */
export async function expectAuthState(page: Page, state: string, timeout?: number) {
  await expect(page.locator(`[data-auth-state="${state}"]`)).toBeVisible({ timeout });
}

export async function fillLogin(page: Page, email: string, password: string) {
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(password);
}

export async function submitLogin(page: Page) {
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
}

/** トップを開いてログインする。世帯に結びついていれば、トップが出るまで待つ。 */
export async function login(
  page: Page,
  who: Who,
  { expect: expected = "ready", timeout }: { expect?: string; timeout?: number } = {},
) {
  await loginWith(page, credentials(who), { expect: expected, timeout });
}

/** メールとパスワードを指定してログインする(倉庫の spec の利用者など)。 */
export async function loginWith(
  page: Page,
  { email, password }: { email: string; password: string },
  { expect: expected = "ready", timeout }: { expect?: string; timeout?: number } = {},
) {
  await page.goto("");
  await expectAuthState(page, "signed-out");
  await fillLogin(page, email, password);
  await submitLogin(page);
  await expectAuthState(page, expected, timeout);
}

/** ログインの誤りの枠。Next.js の経路の読み上げ用の role="alert" とは区別する。 */
export function alertBox(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}
