import { expect, test } from "@playwright/test";
import { addManual, checkbox, contextOptions, dbEntry, dbMemo, goOffline, goOnline, localCounts, memoBox, rowOf, setDbMemo, wait, waitForServiceWorker, writeMemo } from "./shopping-helpers";
import { openShoppingList, resetMasters, resetShopping, seedStock, stockHousehold } from "./stock-helpers";

// 倉庫 run 3b(stock-shopping)part 2・C6 の E2E: 2つのブラウザの同期。片方が電波の無い所で操作 → 戻ると、行列から送られて相手に出る(ST-L06、ADR 0004 §3)。
// 世帯は Y-<project>(別のファイルと同じ世帯を同時に触らない)。
// service worker は許す: 電波の無い所は service worker がある前提の状態(無いと、電波が切れたあとの Next.js の画面の移動・更新の取得が失敗して
// 画面ごと読み直しになり、画面が作り直され続ける = R3-2 の原因。50 に記録)。
test.describe.configure({ mode: "serial" });
test.use({ serviceWorkers: "allow" });
const SUITE = "sync" as const;

test.beforeEach(async ({}, info) => {
  const household = stockHousehold(info, SUITE);
  resetMasters(household);
  resetShopping(household);
  seedStock(household);
});

async function second(browser: import("@playwright/test").Browser, info: import("@playwright/test").TestInfo) {
  const context = await browser.newContext({ ...contextOptions(info.project.use), serviceWorkers: "allow" });
  const page = await context.newPage();
  await openShoppingList(page, info, 2, SUITE);
  await waitForServiceWorker(page);
  return { context, page };
}

test("片方が電波の無い所で追加・チェック・外す → 戻ると、相手に10秒以内に出る。途中の相手の変更も失われない", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const h = stockHousehold(info, SUITE);
  await openShoppingList(page, info, 1, SUITE);
  await waitForServiceWorker(page);
  const b = await second(browser, info);
  await expect(rowOf(page, "しょうゆ")).toBeVisible();
  await expect(rowOf(b.page, "しょうゆ")).toBeVisible();

  // B が電波の無い所に入り、操作する
  await goOffline(b.page);
  await addManual(b.page, "豆乳");
  await checkbox(b.page, "しょうゆ").click();
  await expect(rowOf(b.page, "豆乳")).toBeVisible();
  // A には届かない(DB にも無い)。B の側で電波を切ったので、B の変更は行列にだけある
  await page.waitForTimeout(1500);
  await expect(rowOf(page, "豆乳")).toHaveCount(0);
  expect(dbEntry(h, "豆乳")).toBeUndefined();
  // その間に A が別の行を足す
  await addManual(page, "のり");
  await expect(rowOf(page, "のり")).toBeVisible();
  await expect.poll(() => dbEntry(h, "のり")?.name, wait).toBe("のり");

  // B が戻る → 行列が送られ、A に出る。B にも A の行が届く(取り込み)
  await goOnline(b.page);
  await expect(rowOf(page, "豆乳")).toBeVisible(wait);
  await expect(checkbox(page, "しょうゆ")).toBeChecked(wait);
  await expect(rowOf(b.page, "のり")).toBeVisible(wait);
  await expect.poll(() => dbEntry(h, "豆乳")?.name, wait).toBe("豆乳");
  await expect.poll(() => dbEntry(h, "しょうゆ")?.is_checked, wait).toBe(true);
  await expect(b.page.getByText("まだ送っていない変更")).toHaveCount(0, wait);
  await expect.poll(async () => (await localCounts(b.page))?.outbox, wait).toBe(0);
  // 重複していない
  await expect(rowOf(page, "豆乳")).toHaveCount(1);
  await expect(rowOf(b.page, "豆乳")).toHaveCount(1);

  // 逆向き: A が外す(削除の印)と、B に出る。B がオフライン中にチェックを外し、A が外していた行は、戻ったあと外れたまま(後勝ちで行が復活しない)
  await page.getByRole("button", { name: "のりを外す" }).click();
  await expect(rowOf(b.page, "のり")).toHaveCount(0, wait);
  await b.context.close();
});

test("同じ行を両方が変える: 後に送った方が勝つ(後勝ち)。メモも全文の後勝ち", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const h = stockHousehold(info, SUITE);
  await openShoppingList(page, info, 1, SUITE);
  await waitForServiceWorker(page);
  const b = await second(browser, info);
  await expect(rowOf(b.page, "しょうゆ")).toBeVisible();

  // B がオフライン中にチェック、A は(電波がある所で)先にチェックして外す。B が戻ると B の値(チェック)になる
  await goOffline(b.page);
  await checkbox(b.page, "しょうゆ").click();
  await writeMemo(b.page, info, "Bのメモ");
  await checkbox(page, "しょうゆ").click();
  await expect.poll(() => dbEntry(h, "しょうゆ")?.is_checked, wait).toBe(true);
  await checkbox(page, "しょうゆ").click();
  await expect.poll(() => dbEntry(h, "しょうゆ")?.is_checked, wait).toBe(false);
  await writeMemo(page, info, "Aのメモ");
  await expect.poll(() => dbMemo(h), wait).toBe("Aのメモ");

  await goOnline(b.page);
  await expect.poll(() => dbEntry(h, "しょうゆ")?.is_checked, wait).toBe(true);
  await expect.poll(() => dbMemo(h), wait).toBe("Bのメモ");
  await expect(checkbox(page, "しょうゆ")).toBeChecked(wait);
  await expect(memoBox(page).or(page.getByRole("link", { name: /買い物メモ/ }))).toBeVisible();
  await b.context.close();
});

test("相手(サーバー)の変更は、電波の無い間の取りこぼしも戻ったときに差分で届く", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const h = stockHousehold(info, SUITE);
  await openShoppingList(page, info, 1, SUITE);
  await waitForServiceWorker(page);
  const b = await second(browser, info);
  await expect(rowOf(b.page, "しょうゆ")).toBeVisible();
  await goOffline(b.page);
  // B が見ていない間に、サーバーの側で行を足し・メモを変える(ほかの端末の操作の代わり)
  await addManual(page, "のり");
  await expect.poll(() => dbEntry(h, "のり")?.name, wait).toBe("のり");
  setDbMemo(h, "サーバーのメモ");
  await goOnline(b.page);
  await expect(rowOf(b.page, "のり")).toBeVisible(wait);
  await b.context.close();
});
