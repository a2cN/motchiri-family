import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { findBottomOverlap, findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";
import { sql } from "./db";
import { openStock, resetMasters, seedStock, setRegular, shotPath, stockHousehold } from "./stock-helpers";

// 倉庫 run 2(stock-master)の画面ごとのスクリーンショットと検査(30_architecture.md Interfaces §10)。承認済みのモックの状態(docs/design/stock-master/)ごとに撮る。
// 出力先は E2E_SCREENSHOT_DIR/<プロジェクト名>/。時計は 2026-10-23(金)正午に固定。世帯は project ごとの MS-<project>(M-13)。
test.describe.configure({ mode: "serial" });
const SUITE = "mshots" as const;

const chip = (page: Page, group: string, text: string) => page.getByRole("group", { name: group }).getByRole("button", { name: text, exact: true }).first();
async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
}

type Shot = {
  name: string;
  /** どの画面から始めるか */
  start: "stock" | "masters" | "items" | "edit:牛乳" | "edit:しょうゆ" | "edit:豚こま肉";
  full?: boolean;
  /** 品物と在庫を入れない */
  seed?: boolean;
  /** 相手の変更が届かない状態にする(古い画面のまま) */
  noRealtime?: boolean;
  /** 撮る前の準備。返したあとに撮る。返り値が "skip-overlap" なら、下の帯の重なりの検査をしない */
  prepare: (page: Page, info: TestInfo, household: string) => Promise<void>;
};

const regulars = (h: string) => setRegular(h, ["牛乳", "食パン", "マヨネーズ", "パスタ"]);
const noStocks = (h: string) => {
  sql(`delete from public.item_stock where household_id = '${h}'`);
  sql(`delete from public.item where household_id = '${h}' and tracking = 'level' and not is_regular`);
};

const shots: Shot[] = [
  { name: "stock", start: "stock", prepare: async (_p, _i, h) => regulars(h) },
  { name: "stock-full", start: "stock", full: true, prepare: async (_p, _i, h) => regulars(h) },
  {
    name: "stock-regular-only",
    start: "stock",
    prepare: async (page, _i, h) => {
      setRegular(h, ["牛乳", "食パン", "パスタ"]);
      noStocks(h);
      sql(`delete from public.item where household_id = '${h}' and tracking = 'level'`);
      await page.reload();
      await expect(page.getByText("食材の在庫はありません")).toBeVisible();
    },
  },
  {
    name: "stock-gone",
    start: "stock",
    noRealtime: true,
    prepare: async (page, _i, h) => {
      sql(`delete from public.item_stock where household_id = '${h}' and item_id = (select id from public.item where household_id = '${h}' and name = '納豆')`);
      await page.getByRole("button", { name: "納豆を1増やす" }).click();
      await expect(page.getByText("納豆の在庫は、もうありませんでした")).toBeVisible();
    },
  },
  { name: "items", start: "items", prepare: async () => {} },
  { name: "items-full", start: "items", full: true, prepare: async () => {} },
  {
    name: "items-empty",
    start: "items",
    prepare: async (page, _i, h) => {
      sql(`delete from public.item where household_id = '${h}'`);
      await page.reload();
      await expect(page.getByText("品物はありません")).toBeVisible();
    },
  },
  {
    name: "items-undo",
    start: "items",
    prepare: async (page) => {
      await page.getByRole("button", { name: "牛乳を削除" }).click();
      await expect(page.getByText("牛乳を削除しました")).toBeVisible();
      await expect(page.getByRole("button", { name: "元に戻す" })).toBeVisible();
    },
  },
  {
    name: "items-undo-failed",
    start: "items",
    prepare: async (page, _i, h) => {
      await page.getByRole("button", { name: "牛乳を削除" }).click();
      await expect(page.getByText("牛乳を削除しました")).toBeVisible();
      // その間に相手が同じ名前の品物を登録した
      sql(`insert into public.item (household_id, name, item_kind, tracking, genre_id, unit_id) values ('${h}', '牛乳', 'food', 'count',
        (select id from public.genre where household_id = '${h}' and name = '卵・乳製品'), (select id from public.unit where household_id = '${h}' and name = '本'))`);
      await page.getByRole("button", { name: "元に戻す" }).click();
      await expect(page.getByText("牛乳を元に戻せませんでした")).toBeVisible();
    },
  },
  { name: "masters", start: "masters", prepare: async () => {} },
  { name: "masters-full", start: "masters", full: true, prepare: async () => {} },
  {
    name: "masters-error",
    start: "stock",
    prepare: async (page) => {
      await page.route(/\/rest\/v1\/(item_stock|item|genre|location|unit)/, (route) => route.abort("connectionfailed"));
      await page.goto("stock/masters/");
      await expect(page.getByRole("heading", { name: "つながりませんでした" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("通信できなかったため、マスタを読み込めませんでした。")).toBeVisible();
    },
  },
  {
    name: "masters-offline",
    start: "masters",
    prepare: async (page) => {
      await goOffline(page);
      await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toBeVisible();
    },
  },
  {
    name: "masters-offline-tap",
    start: "masters",
    prepare: async (page) => {
      await goOffline(page);
      await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toBeVisible();
      await page.getByRole("button", { name: "魚を削除" }).click();
      await expect(page.getByText("電波のある所で操作してください", { exact: true }).last()).toBeVisible();
    },
  },
  {
    name: "masters-in-use",
    start: "masters",
    noRealtime: true,
    prepare: async (page, _i, h) => {
      // 相手が先に、魚を使う品物を登録した(この画面は知らない)
      sql(`insert into public.item (household_id, name, item_kind, tracking, genre_id, unit_id) values ('${h}', 'さけ', 'food', 'count',
        (select id from public.genre where household_id = '${h}' and name = '魚'), (select id from public.unit where household_id = '${h}' and name = '個'))`);
      await page.getByRole("button", { name: "魚を削除" }).click();
      await expect(page.getByText("魚は使用中になったため、削除できませんでした")).toBeVisible();
    },
  },
  {
    name: "masters-name-taken",
    start: "masters",
    noRealtime: true,
    prepare: async (page, _i, h) => {
      sql(`insert into public.genre (household_id, name, sort_order) values ('${h}', '乾物', 99)`);
      await page.getByLabel("新しいジャンル").fill("乾物");
      await page.getByRole("button", { name: "追加" }).first().click();
      await expect(page.getByText("同じ名前のジャンルがあるため、「乾物」を追加できませんでした")).toBeVisible();
    },
  },
  {
    // 既定の場所に使われていた場所を消した直後。ジャンルの行に「既定の場所: 未選択」が見える(通知の下に隠れない)
    name: "masters-default-cleared",
    start: "masters",
    prepare: async (page, _i, h) => {
      await page.getByLabel("新しい場所").fill("パントリー");
      await page.getByRole("button", { name: "追加" }).nth(1).click();
      await expect(page.locator("li", { hasText: "パントリー" })).toBeVisible();
      await page.getByRole("button", { name: "飲み物を変更" }).click();
      await page.getByRole("group", { name: "飲み物の既定の場所" }).getByRole("button", { name: "パントリー" }).click();
      await page.getByRole("button", { name: "保存" }).click();
      await expect(page.locator("li", { hasText: "飲み物" })).toContainText("既定の場所: パントリー");
      await page.getByRole("button", { name: "パントリーを削除" }).click();
      await expect(page.getByText("パントリーを削除しました")).toBeVisible();
      const drinks = page.locator("li", { hasText: "飲み物" });
      await expect(drinks).toContainText("既定の場所: 未選択");
      await drinks.scrollIntoViewIfNeeded();
      await drinks.evaluate((el) => el.scrollIntoView({ block: "center" }));
      // 通知と重ならない(行の下端が通知の上端より上)
      const rowBox = await drinks.boundingBox();
      const toastBox = await page.locator("[data-sonner-toast]").first().boundingBox();
      expect(rowBox && toastBox ? rowBox.y + rowBox.height <= toastBox.y : true).toBe(true);
      void h;
    },
  },
  {
    name: "masters-default-cleared-full",
    start: "masters",
    full: true,
    prepare: async (page) => {
      await page.getByLabel("新しい場所").fill("パントリー");
      await page.getByRole("button", { name: "追加" }).nth(1).click();
      await page.getByRole("button", { name: "飲み物を変更" }).click();
      await page.getByRole("group", { name: "飲み物の既定の場所" }).getByRole("button", { name: "パントリー" }).click();
      await page.getByRole("button", { name: "保存" }).click();
      await page.getByRole("button", { name: "パントリーを削除" }).click();
      await expect(page.locator("li", { hasText: "飲み物" })).toContainText("既定の場所: 未選択");
      await page.waitForTimeout(7000); // 通知が消えてから全体を撮る
      await expect(page.getByText("パントリーを削除しました")).toHaveCount(0);
    },
  },
  { name: "item-edit-milk", start: "edit:牛乳", prepare: async () => {} },
  { name: "item-edit-milk-full", start: "edit:牛乳", full: true, prepare: async () => {} },
  {
    name: "item-edit-milk-name-error",
    start: "edit:牛乳",
    prepare: async (page) => {
      await page.locator("#edit-name").fill("卵");
      await page.locator("#edit-name").blur();
      await expect(page.getByText("同じ名前の品物があります")).toBeVisible();
    },
  },
  {
    name: "item-edit-milk-tracking",
    start: "edit:牛乳",
    prepare: async (page) => {
      await page.getByRole("button", { name: "残量で管理に変える" }).click();
      await expect(page.getByText("在庫 2件(合計 2 本)は消えて、残量になります。")).toBeVisible();
    },
  },
  {
    name: "item-edit-milk-tracking-undo",
    start: "edit:牛乳",
    prepare: async (page) => {
      await page.getByRole("button", { name: "残量で管理に変える" }).click();
      await page.getByRole("button", { name: "変える" }).click();
      await expect(page.getByText("牛乳を残量で管理に変えました")).toBeVisible();
      await expect(page.getByRole("button", { name: "元に戻す" })).toBeVisible();
    },
  },
  {
    name: "item-edit-soy-tracking",
    start: "edit:しょうゆ",
    prepare: async (page) => {
      await page.getByRole("button", { name: "数で管理に変える" }).click();
      await expect(page.getByRole("button", { name: "変える" })).toBeVisible();
    },
  },
  {
    name: "item-edit-pork-unit",
    start: "edit:豚こま肉",
    prepare: async (page) => {
      await chip(page, "単位", "個").click();
      await expect(page.getByLabel("豚こま肉の数", { exact: true })).toHaveValue("200");
      await expect(page.locator("#edit-name")).toHaveValue("豚こま肉");
    },
  },
  {
    name: "item-edit-milk-item-gone",
    start: "edit:牛乳",
    prepare: async (page, _i, h) => {
      sql(`delete from public.item where household_id = '${h}' and name = '牛乳'`);
      await expect(page.getByRole("heading", { name: "品物がありません" })).toBeVisible({ timeout: 10_000 });
    },
  },
  {
    name: "item-edit-milk-offline",
    start: "edit:牛乳",
    prepare: async (page) => {
      await goOffline(page);
      await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toBeVisible();
    },
  },
];

for (const shot of shots) {
  test(`スクリーンショット: ${shot.name}`, async ({ page, context }, info) => {
    test.setTimeout(90_000);
    const household = stockHousehold(info, SUITE);
    resetMasters(household);
    if (shot.seed !== false) seedStock(household);
    if (shot.noRealtime) await context.routeWebSocket(/realtime/, () => {});
    await openStock(page, info, 1, SUITE);
    await expect(page.getByRole("button", { name: "ヨーグルトを1増やす" })).toBeVisible();
    if (shot.start === "masters") {
      await page.getByRole("link", { name: "マスタ", exact: true }).click();
      await expect(page.locator("h1")).toHaveText("マスタ");
    } else if (shot.start === "items") {
      await page.getByRole("link", { name: "品物", exact: true }).click();
      await expect(page.locator("h1")).toHaveText("品物の一覧");
    } else if (shot.start.startsWith("edit:")) {
      const name = shot.start.slice(5);
      await page.getByRole("link", { name: `${name}を編集` }).first().click();
      await expect(page.locator("h1")).toHaveText("品物の編集");
      await expect(page.locator("#edit-name")).toHaveValue(name);
    }
    await shot.prepare(page, info, household);
    await page.waitForTimeout(500); // 通知の出入りと描画が落ち着くまで
    await page.screenshot({ path: shotPath(info, shot.name), fullPage: !!shot.full });
    expect(await findHorizontalOverflow(page)).toBeNull();
    expect(await findSmallInputs(page)).toEqual([]);
    expect(await findSmallTapTargets(page)).toEqual([]);
    if (!shot.full) expect(await findBottomOverlap(page)).toBeNull();
  });
}
