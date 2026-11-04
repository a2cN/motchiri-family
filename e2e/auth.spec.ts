import { expect, test } from "@playwright/test";
import { alertBox, credentials, expectAuthState, fillLogin, login, submitLogin, supabaseApi } from "./auth-helpers";

// ログインと世帯の E2E(30_architecture.md Interfaces §8)。ローカルの Supabase が前提(npm run db:start)。
// 画面サイズ(3つ)ごとに動く。API の直接の呼び出しは、どのサイズでも同じ結果になる。

test.describe("未ログインで直接開く", () => {
  for (const url of ["", "stock/", "nai/"]) {
    test(`/${url} はログイン画面が出て、守られた画面の中身は一瞬も出ない`, async ({ page }) => {
      // ページの読み込みの前に MutationObserver を仕掛け、data-auth-state="ready" が一度でも付いたら記録する
      await page.addInitScript(() => {
        const w = window as unknown as { __readySeen: boolean };
        w.__readySeen = false;
        const check = () => {
          if (document.querySelector('[data-auth-state="ready"]')) w.__readySeen = true;
        };
        new MutationObserver(check).observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["data-auth-state"],
        });
      });
      const response = await page.goto(url);
      // 見つからない画面は、今までどおり 404 で返る(画面の出し分けはブラウザの中)
      expect(response?.status()).toBe(url === "nai/" ? 404 : 200);
      await expectAuthState(page, "signed-out");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("ログイン");
      expect(await page.evaluate(() => (window as unknown as { __readySeen: boolean }).__readySeen)).toBe(false);
      // ログイン画面に、新規登録・パスワードの再設定の入口が無い(PT-02)
      await expect(page.getByRole("link")).toHaveCount(0);
      await expect(page.getByText(/新規登録|アカウントを作|パスワードを再設定|パスワードをお忘れ/)).toHaveCount(0);
    });
  }

  test("静的な HTML の段階では、画面の中身が無く、確かめ中", async ({ request }) => {
    const res = await request.get("");
    const html = await res.text();
    expect(html).toContain('data-auth-state="checking"');
    // 画面の中身の木(RSC の payload)は <script> の中に含まれる(ブリーフ A4 で受け入れ済み)。見るのは、描かれた要素のほう
    const rendered = html.replace(/<script[\s\S]*?<\/script>/g, "");
    expect(rendered).not.toContain('data-auth-state="ready"');
    expect(rendered).not.toContain("もっちり倉庫");
  });
});

test("誤ったパスワードではログインできず、誤りが出る", async ({ page }) => {
  await page.goto("");
  await expectAuthState(page, "signed-out");
  await fillLogin(page, credentials("A1").email, "ちがうパスワード");
  await submitLogin(page);
  await expect(alertBox(page)).toHaveText("メールアドレスかパスワードがちがいます。");
  await expectAuthState(page, "signed-out");
});

test("入力の誤り(空、メールの形)は通信せずに欄の下に出る", async ({ page }) => {
  await page.goto("");
  await expectAuthState(page, "signed-out");
  await submitLogin(page);
  await expect(page.getByText("メールアドレスを入れてください")).toBeVisible();
  await page.getByLabel("メールアドレス").fill("abc");
  await page.getByLabel("パスワード", { exact: true }).fill("x");
  await submitLogin(page);
  await expect(page.getByText("メールアドレスの形を確かめてください")).toBeVisible();
});

test("世帯に結びついた利用者: ログイン → 再読み込み → 新しいタブでも続く → ログアウト → 再読み込みしてもログイン画面", async ({
  page,
  context,
}) => {
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));

  await login(page, "A1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("もっちりファミリー");
  await expect(page.getByText(`ログイン中: ${credentials("A1").email}`)).toBeVisible();
  // 時間の見直しの材料がコンソールに出る(OD-auth-household-22)
  expect(logs.some((l) => l.includes("[auth] 世帯の確かめ:"))).toBe(true);

  await page.reload();
  await expectAuthState(page, "ready");

  const other = await context.newPage();
  await other.goto("");
  await expectAuthState(other, "ready");
  await other.close();

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expectAuthState(page, "signed-out");
  await expect(page.getByRole("status")).toHaveText("ログアウトしました。");
  await page.reload();
  await expectAuthState(page, "signed-out");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ログイン");
});

test("ログインしたあと、開いていた URL の画面がそのまま出る", async ({ page }) => {
  await page.goto("stock/");
  await expectAuthState(page, "signed-out");
  const { email, password } = credentials("A1");
  await fillLogin(page, email, password);
  await submitLogin(page);
  await expectAuthState(page, "ready");
  await expect(page).toHaveURL(/\/motchiri-family\/stock\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("もっちり倉庫");
});

test("世帯に結びついていない利用者: その画面が出て、ログアウトできる", async ({ page }) => {
  await login(page, "U0", { expect: "unlinked" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("まだ世帯に入っていません");
  await expect(page.getByText(`ログイン中: ${credentials("U0").email}`)).toBeVisible();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expectAuthState(page, "signed-out");
});

test("世帯を確かめられなかったとき: 画面が出て、「もう一度」で戻れる", async ({ page }) => {
  let fail = true;
  await page.route(/\/rest\/v1\/member/, (route) => (fail ? route.abort("connectionrefused") : route.continue()));
  // 通信の失敗は supabase-js が数秒かけて再試行してから失敗になる(10秒の上限の内側)
  await login(page, "A1", { expect: "member-error", timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("つながりませんでした");
  fail = false;
  await page.getByRole("button", { name: "もう一度" }).click();
  await expectAuthState(page, "ready");
});

test("世帯の確かめが10秒で打ち切られる(OD-auth-household-22)", async ({ page }) => {
  test.setTimeout(45_000);
  // 応答を返さない
  await page.route(/\/rest\/v1\/member/, () => new Promise(() => {}));
  const started = Date.now();
  await login(page, "A1", { expect: "member-checking" });
  await expectAuthState(page, "member-error", 15_000);
  const elapsed = Date.now() - started;
  expect(elapsed).toBeGreaterThanOrEqual(9_500);
  expect(elapsed).toBeLessThan(20_000);
});

test.describe("API を直接呼んでも(PostgREST と Auth)", () => {
  async function accessToken(request: import("@playwright/test").APIRequestContext, who: "A1" | "B1") {
    const { url, key } = supabaseApi();
    const { email, password } = credentials(who);
    const res = await request.post(`${url}/auth/v1/token?grant_type=password`, {
      headers: { apikey: key },
      data: { email, password },
    });
    expect(res.status()).toBe(200);
    return (await res.json()).access_token as string;
  }

  test("公開用キーだけ(未ログイン)では household を読めない", async ({ request }) => {
    const { url, key } = supabaseApi();
    const res = await request.get(`${url}/rest/v1/household?select=id`, { headers: { apikey: key } });
    expect([401, 403]).toContain(res.status());
    expect((await res.json()).code).toBe("42501");
  });

  test("公開用キーだけでは member も読めない・書けない", async ({ request }) => {
    const { url, key } = supabaseApi();
    const read = await request.get(`${url}/rest/v1/member?select=user_id`, { headers: { apikey: key } });
    expect((await read.json()).code).toBe("42501");
    const write = await request.post(`${url}/rest/v1/household`, { headers: { apikey: key }, data: {} });
    expect((await write.json()).code).toBe("42501");
  });

  test("別の世帯(B1)のトークンでは、世帯 A の行が 0 行", async ({ request }) => {
    const { url, key, householdA } = supabaseApi();
    const token = await accessToken(request, "B1");
    const headers = { apikey: key, authorization: `Bearer ${token}` };
    const res = await request.get(`${url}/rest/v1/household?id=eq.${householdA}&select=id`, { headers });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
    const members = await request.get(`${url}/rest/v1/member?household_id=eq.${householdA}&select=user_id`, { headers });
    expect(await members.json()).toEqual([]);
  });

  test("自分の世帯(A1)は読めるが、member に書けない", async ({ request }) => {
    const { url, key, householdA } = supabaseApi();
    const token = await accessToken(request, "A1");
    const headers = { apikey: key, authorization: `Bearer ${token}` };
    const own = await request.get(`${url}/rest/v1/household?select=id`, { headers });
    expect(await own.json()).toEqual([{ id: householdA }]);
    const write = await request.post(`${url}/rest/v1/member`, {
      headers,
      data: { user_id: "00000000-0000-4000-8000-000000000000", household_id: householdA },
    });
    expect([401, 403]).toContain(write.status());
    expect((await write.json()).code).toBe("42501");
  });

  test("新規登録の API は拒否される(signup_disabled)", async ({ request }) => {
    const { url, key } = supabaseApi();
    const res = await request.post(`${url}/auth/v1/signup`, {
      headers: { apikey: key },
      data: { email: "e2e-signup-probe@example.com", password: "probe-password-0123456789" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect((await res.json()).error_code).toBe("signup_disabled");
  });
});
