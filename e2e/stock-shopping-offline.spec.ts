import { expect, test } from "@playwright/test";
import { sql } from "./db";
import { addManual, checkbox, dbEntry, dbMemo, goOffline, goOnline, localCounts, memoBox, rowOf, wait, waitForServiceWorker, writeMemo } from "./shopping-helpers";
import { openShoppingList, resetMasters, resetShopping, seedStock, stockHousehold } from "./stock-helpers";

// 倉庫 run 3b(stock-shopping)part 2 の E2E: 電波の無い起動(R3-14)・オフラインの操作・端末への保存・R3-2・ログアウトで消す(30_architecture.md Interfaces §12、L-18・L-19)。
// service worker を許す(既定は止めている。L-22)。世帯は O-<project>(別のファイルと同じ世帯を同時に触らない)。ファイルの中は順に流す。
// WebKit(Playwright)で service worker の電波の無い起動を試せた(Chromium への切り替えは要らなかった)。実機(iPhone の機内モード)は事後確認。
test.describe.configure({ mode: "serial" });
test.use({ serviceWorkers: "allow" });
const SUITE = "offline" as const;

test.beforeEach(async ({}, info) => {
  const household = stockHousehold(info, SUITE);
  resetMasters(household);
  resetShopping(household);
  seedStock(household); // しょうゆ(残量 △)は自動で「減った」として載る
});

/** 電波があるうちに開き、service worker と端末の写しができるまで待つ */
async function prepare(page: import("@playwright/test").Page, info: import("@playwright/test").TestInfo) {
  await openShoppingList(page, info, 1, SUITE);
  await expect(rowOf(page, "しょうゆ")).toBeVisible();
  await waitForServiceWorker(page);
  await expect.poll(async () => (await localCounts(page))?.cursor, wait).toBe(true);
}

test("電波の無い所で開く(R3-14): 覚えた世帯で、10 秒を待たずに買い物リストが出る。電波が戻ると確かめ直す", async ({ page, context }, info) => {
  await prepare(page, info);
  expect(await page.evaluate(() => localStorage.getItem("motchiri.membership"))).toMatch(/"householdId"/);
  expect(await page.evaluate(() => localStorage.getItem("motchiri.membership"))).not.toMatch(/@/); // メールは入れない
  await context.setOffline(true);
  await page.close();
  const started = Date.now();
  const p2 = await context.newPage();
  await p2.goto("stock/shopping-list/");
  await expect(p2.locator('[data-auth-state="ready"]')).toBeVisible({ timeout: 8_000 });
  expect(Date.now() - started).toBeLessThan(8_000);
  await expect(p2.locator("h1")).toHaveText("買い物リスト");
  await expect(rowOf(p2, "しょうゆ")).toBeVisible();
  await expect(p2.getByRole("status").filter({ hasText: "電波がありません" })).toBeVisible();
  await expect(p2.locator('[data-auth-state="member-error"]')).toHaveCount(0);
  // 電波が戻る → 確かめ直しても画面は変わらず、世帯が確かめられる(別の人のデータにならない)
  await context.setOffline(false);
  await p2.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(p2.getByRole("status").filter({ hasText: "電波がありません" })).toHaveCount(0, wait);
  await expect(rowOf(p2, "しょうゆ")).toBeVisible();
});

test("電波の無い所で: チェック・追加・外す・メモ。未同期の件数が出て、再読み込み・再起動のあとも残り、戻ると送られる(保存されている)", async ({ page, context }, info) => {
  const h = stockHousehold(info, SUITE);
  await prepare(page, info);
  await goOffline(page);
  await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toBeVisible();
  await checkbox(page, "しょうゆ").click();
  await addManual(page, "豆乳");
  await addManual(page, "のり");
  await expect(rowOf(page, "豆乳")).toBeVisible();
  await page.getByRole("button", { name: "のりを外す" }).click();
  await writeMemo(page, info, "豆乳は無調整");
  await expect(page.getByRole("status").filter({ hasText: /まだ送っていない変更 \d+件/ })).toBeVisible();
  // 保存された: 端末の行列にある。サーバーにはまだ無い
  await expect.poll(async () => (await localCounts(page))?.outbox ?? 0, wait).toBeGreaterThan(0);
  expect(dbEntry(h, "豆乳")).toBeUndefined();
  // 再読み込み(電波は無いまま。service worker が画面を出す): 変更も未同期の件数も残っている
  await page.reload();
  await expect(page.locator("h1")).toHaveText("買い物リスト");
  await expect(rowOf(page, "豆乳")).toBeVisible();
  await expect(checkbox(page, "しょうゆ")).toBeChecked();
  await expect(page.getByRole("button", { name: "のりを外す" })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /まだ送っていない変更 \d+件/ })).toBeVisible();
  // 画面を閉じて開き直す(再起動)も同じ
  await page.close();
  const p2 = await context.newPage();
  await p2.goto("stock/shopping-list/");
  await expect(rowOf(p2, "豆乳")).toBeVisible({ timeout: 8_000 });
  await expect(checkbox(p2, "しょうゆ")).toBeChecked();
  // 戻る → 送られる
  await goOnline(p2);
  await expect.poll(() => dbEntry(h, "豆乳")?.name, wait).toBe("豆乳");
  await expect.poll(() => dbEntry(h, "しょうゆ")?.is_checked, wait).toBe(true);
  await expect.poll(() => dbEntry(h, "のり"), wait).toBeUndefined(); // 追加してすぐ外した行は、外した状態(削除)で届く
  await expect.poll(() => dbMemo(h), wait).toBe("豆乳は無調整");
  await expect(p2.getByText("まだ送っていない変更")).toHaveCount(0, wait);
  await expect(p2.getByRole("status").filter({ hasText: "電波がありません" })).toHaveCount(0);
  await expect.poll(async () => (await localCounts(p2))?.outbox, wait).toBe(0);
  // 再読み込みしても、サーバーの値のまま(重複・復活が無い)
  await p2.reload();
  await expect(rowOf(p2, "豆乳")).toHaveCount(1);
  await expect(p2.getByRole("button", { name: "のりを外す" })).toHaveCount(0);
  await expect(checkbox(p2, "しょうゆ")).toBeChecked();
  void memoBox;
});

test("電波の無い所で: 在庫登録は押せない(開いたまま電波が切れたとき)、開こうとしても入れない(電波の無い起動)", async ({ page, context }, info) => {
  await prepare(page, info);
  await checkbox(page, "しょうゆ").click();
  await page.getByRole("link", { name: /在庫に登録/ }).click();
  await expect(page.locator("h1")).toHaveText("在庫に登録");
  await expect(page.getByRole("button", { name: /リストから消す|在庫に登録する/ })).toBeVisible();
  await goOffline(page);
  await expect(page.getByText("在庫登録には電波が要ります")).toBeVisible();
  await page.getByRole("button", { name: /リストから消す|在庫に登録する/ }).click();
  await expect(page.getByText(/電波/).first()).toBeVisible();
  await expect.poll(() => sql(`select count(*)::int as n from public.item_stock where household_id = '${stockHousehold(info, SUITE)}'`)[0].n).toBe(13);
  // 電波の無い起動で在庫登録を開く
  await page.close();
  const p2 = await context.newPage();
  await p2.goto("stock/check-in/");
  await expect(p2.getByText("在庫登録を開くには電波が要ります")).toBeVisible({ timeout: 15_000 });
});

test("R3-2: 電波が切れた直後、タブ・戻る・メモを行き来しても「This page couldn't load」にならない(service worker が画面を持っている)", async ({ page }, info) => {
  await prepare(page, info);
  await goOffline(page);
  const nav = page.getByRole("navigation", { name: "倉庫の画面" });
  const couldNotLoad = page.getByText(/couldn.t load|読み込めません/i);
  if (info.project.name !== "ipad-landscape") {
    await nav.getByRole("link", { name: "食材" }).click();
    await expect(page.locator("h1")).toHaveText("もっちり倉庫");
    // 1度も開いていない画面(問い合わせの値つきの URL)へ。service worker が無いと、ここで移れない
    await page.getByRole("link", { name: "品物" }).first().click();
    await expect(page.locator("h1")).toHaveText("品物の一覧");
    await page.getByRole("link", { name: /もどる/ }).click();
    await expect(page.locator("h1")).toHaveText("もっちり倉庫");
    await nav.getByRole("link", { name: "日用品" }).click();
    await expect(page.locator("h1")).toHaveText("日用品");
    await nav.getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.locator("h1")).toHaveText("買い物リスト");
  } else {
    await nav.getByRole("link", { name: "品物" }).click();
    await expect(page.locator("h1")).toHaveText("品物の一覧");
    await nav.getByRole("link", { name: "マスタ" }).click();
    await expect(page.locator("h1")).toHaveText("マスタ");
    await nav.getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.locator("h1")).toHaveText("買い物リスト");
  }
  if (info.project.name === "iphone-portrait") {
    await page.getByRole("link", { name: /買い物メモ/ }).click();
    await expect(page.locator("h1")).toHaveText("買い物メモ");
    await page.getByRole("link", { name: /もどる/ }).click();
    await expect(page.locator("h1")).toHaveText("買い物リスト");
  }
  await expect(rowOf(page, "しょうゆ")).toBeVisible();
  await expect(couldNotLoad).toHaveCount(0);
  // 画面の移動ではなく URL を直接開いても(問い合わせの値つき)、同じ
  await page.goto("stock/masters/?from=stock");
  await expect(page.locator("h1")).toHaveText("マスタ");
});

test("ログアウト(自分で押した)で、覚えた世帯と端末の写し・行列が消える(L-19)", async ({ page, browser }, info) => {
  await prepare(page, info);
  await goOffline(page);
  await checkbox(page, "しょうゆ").click();
  await expect.poll(async () => (await localCounts(page))?.outbox ?? 0, wait).toBeGreaterThan(0);
  await goOnline(page);
  await expect.poll(async () => (await localCounts(page))?.outbox, wait).toBe(0);
  await page.goto("");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.locator('[data-auth-state="signed-out"]')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("motchiri.membership"))).toBeNull();
  await expect.poll(async () => (await localCounts(page))?.list ?? 0, wait).toBe(0);
  // 再読み込みしても写しは復活しない
  await page.reload();
  await expect(page.locator('[data-auth-state="signed-out"]')).toBeVisible();
  expect((await localCounts(page))?.list ?? 0).toBe(0);
  void browser;
});
