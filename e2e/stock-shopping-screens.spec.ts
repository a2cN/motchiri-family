import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { findBottomOverlap, findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";
import { sql } from "./db";
import { addManual, checkbox, goOffline, memoBox, rowOf, writeMemo } from "./shopping-helpers";
import { openShoppingList, resetMasters, resetShopping, seedStock, seedSupplies, shotPath, stockHousehold } from "./stock-helpers";

// 倉庫 run 3b(stock-shopping)の実際の画面のスクリーンショットと検査(30_architecture.md Interfaces §12)。
// 出力先は E2E_SCREENSHOT_DIR/<プロジェクト名>/(ファイル名は ls-<状態>.png = 開いた直後の見える範囲、ls-<状態>-scrolled.png = 一番下までスクロールした見える範囲)。
// fullPage(ページ全体)は使わない(下に固定の帯とタブがあり、画面の中ほどに描かれるため)。
// R3-19: 検査(はみ出し・小さい入力欄・小さいタップ先・下の帯との重なり)は、見える範囲と -scrolled の両方で走らせる。
// 世帯は project ごとの LS-<project>(1人)。時計は 2026-10-23(金)正午に固定する。ファイルの中は順に流す。
// 撮らない状態(電波の無い起動で端末に写しが無い・読み込みの失敗・保存の失敗・在庫登録の途中の失敗): 画面に出すには通信の細工が要るので、
// 文と振る舞いは stock-shopping.spec.ts・stock-shopping-offline.spec.ts が確かめ、見た目は承認済みの正典(docs/design/stock-shopping/)で見る(50 に記録)。
test.describe.configure({ mode: "serial" });
const SUITE = "lshots" as const;

async function runChecks(page: Page) {
  expect(await findHorizontalOverflow(page)).toBeNull();
  expect(await findSmallInputs(page)).toEqual([]);
  expect(await findSmallTapTargets(page)).toEqual([]);
  expect(await findBottomOverlap(page)).toBeNull(); // 一番下までスクロールして測る
}

async function shoot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500); // 通知の出入りと描画が落ち着くまで
  await page.screenshot({ path: shotPath(info, `ls-${name}`) });
  await runChecks(page);
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 4);
  if (scrollable) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    await page.screenshot({ path: shotPath(info, `ls-${name}-scrolled`) });
    await runChecks(page); // -scrolled の画面でも同じ検査
  }
}

type Shot = { name: string; url: string; heading: string; prepare?: (page: Page, info: TestInfo, household: string) => Promise<void> };
const itemId = (h: string, name: string) => String(sql(`select id from public.item where household_id = '${h}' and name = '${name}'`)[0].id);

const shots: Shot[] = [
  { name: "stock", url: "stock/", heading: "もっちり倉庫" },
  { name: "supply", url: "stock/supply/", heading: "日用品" },
  {
    name: "shopping-list",
    url: "stock/shopping-list/",
    heading: "買い物リスト",
    prepare: async (page) => {
      await addManual(page, "豆乳");
      await checkbox(page, "牛乳").click();
      await expect(checkbox(page, "牛乳")).toBeChecked();
    },
  },
  {
    name: "shopping-list-offline",
    url: "stock/shopping-list/",
    heading: "買い物リスト",
    prepare: async (page) => {
      await goOffline(page);
      await expect(page.getByText("電波がありません")).toBeVisible();
    },
  },
  {
    name: "shopping-list-pending",
    url: "stock/shopping-list/",
    heading: "買い物リスト",
    prepare: async (page) => {
      await goOffline(page);
      await addManual(page, "豆乳");
      await checkbox(page, "牛乳").click();
      await expect(page.getByText("まだ送っていない変更").first()).toBeVisible();
    },
  },
  {
    name: "shopping-list-duplicate",
    url: "stock/shopping-list/",
    heading: "買い物リスト",
    prepare: async (page) => {
      await addManual(page, "豆乳");
      await expect(rowOf(page, "豆乳")).toBeVisible();
      await addManual(page, "豆乳");
      await expect(page.getByText("「豆乳」は、もうリストにあります")).toBeVisible();
    },
  },
  {
    name: "shopping-list-typing",
    url: "stock/shopping-list/",
    heading: "買い物リスト",
    prepare: async (page) => {
      await page.locator('input[id^="shopping-add-"]:visible').fill("豆");
    },
  },
  {
    name: "shopping-memo",
    url: "stock/shopping-list/",
    heading: "買い物", // iPad はリストの中、スマホはメモの画面(h1 は 買い物メモ)
    prepare: async (page, info) => {
      await writeMemo(page, info, "牛乳は特売のとき多めに。\n電池(単3)");
      if (info.project.name === "iphone-portrait") {
        await page.getByRole("link", { name: /買い物メモ/ }).click();
        await expect(page.locator("h1")).toHaveText("買い物メモ");
      }
    },
  },
  {
    name: "shopping-memo-offline",
    url: "stock/shopping-memo/",
    heading: "買い物メモ",
    prepare: async (page) => {
      await expect(memoBox(page)).toBeVisible(); // 読み込みが済んでから電波を切る
      await goOffline(page);
      await expect(page.getByText(/電波/).first()).toBeVisible();
    },
  },
  {
    name: "check-in",
    url: "stock/shopping-list/",
    heading: "在庫に登録",
    prepare: async (page) => {
      await addManual(page, "豆乳");
      await checkbox(page, "牛乳").click();
      await checkbox(page, "豆乳").click();
      await page.getByRole("link", { name: /^在庫に登録/ }).click();
    },
  },
  {
    name: "check-in-offline",
    url: "stock/shopping-list/",
    heading: "在庫に登録",
    prepare: async (page) => {
      await addManual(page, "豆乳");
      await checkbox(page, "牛乳").click();
      await checkbox(page, "豆乳").click();
      await page.getByRole("link", { name: /^在庫に登録/ }).click();
      await expect(page.locator("h1")).toHaveText("在庫に登録");
      await goOffline(page);
    },
  },
  { name: "item-new-restock", url: "stock/item-new/?from=stock", heading: "品物の登録" },
  { name: "item-new-supply-restock", url: "stock/item-new/?from=supply", heading: "品物の登録" },
  { name: "item-edit", url: "", heading: "品物の編集" },
  {
    name: "item-edit-panel",
    url: "",
    heading: "品物の編集",
    prepare: async (page) => {
      await page.getByRole("button", { name: "残量で管理に変える" }).click();
    },
  },
  { name: "items-food", url: "stock/items/?kind=food", heading: "品物の一覧" },
  { name: "items-supply", url: "stock/items/?kind=supply", heading: "品物の一覧" },
];

for (const shot of shots) {
  test(`スクリーンショット: ${shot.name}`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const household = stockHousehold(info, SUITE);
    resetMasters(household);
    resetShopping(household);
    seedStock(household);
    seedSupplies(household);
    sql(`update public.item set is_regular = true where household_id = '${household}' and name = '牛乳'`);
    await openShoppingList(page, info, 1, SUITE);
    const url = shot.url || `stock/item-edit/?id=${itemId(household, "納豆")}&from=stock`;
    if (shot.url !== "stock/shopping-list/") await page.goto(url);
    await expect(page.locator("h1").first()).toBeVisible();
    if (shot.url === "stock/shopping-list/") await expect(rowOf(page, "牛乳")).toBeVisible();
    await shot.prepare?.(page, info, household);
    await expect(page.locator("h1").first()).toContainText(shot.heading);
    await shoot(page, info, shot.name);
  });
}
