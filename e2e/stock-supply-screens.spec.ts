import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { findBottomOverlap, findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";
import { sql } from "./db";
import { openStock, resetMasters, seedStock, seedSupplies, setRegular, shootScreen, stockHousehold } from "./stock-helpers";

// 倉庫 run 3a(stock-supply)の画面ごとのスクリーンショットと検査(30_architecture.md Interfaces §9)。承認済みのモックの状態(docs/design/stock-supply/)ごとに撮る。
// 出力先は E2E_SCREENSHOT_DIR/<プロジェクト名>/(ファイル名は ss-<状態>.png。全体は ss-<状態>-1.png、-2.png … = スクロールしながら画面の画像を撮る)。
// 時計は 2026-10-23(金)正午に固定。世帯は project ごとの DS-<project>(S-12)。ファイルの中は順に流す。
test.describe.configure({ mode: "serial" });
const SUITE = "sshots" as const;

const chip = (page: Page, group: string, text: string) => page.getByRole("group", { name: group }).getByRole("button", { name: text, exact: true }).first();
async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
}
const itemId = (h: string, name: string) => String(sql(`select id from public.item where household_id = '${h}' and name = '${name}'`)[0].id);

type Shot = {
  name: string;
  /** 開く URL(basePath の下) */
  url: string | ((household: string) => string);
  full?: boolean;
  /** 相手の変更が届かない状態にする(古い画面のまま) */
  noRealtime?: boolean;
  prepare: (page: Page, info: TestInfo, household: string) => Promise<void>;
};
const none = async () => {};

const shots: Shot[] = [
  { name: "stock", url: "stock/", prepare: none },
  { name: "stock-full", url: "stock/", full: true, prepare: none },
  { name: "supply", url: "stock/supply/", prepare: none },
  { name: "supply-full", url: "stock/supply/", full: true, prepare: none },
  {
    name: "supply-search",
    url: "stock/supply/",
    prepare: async (page) => {
      await page.getByPlaceholder("品物名で探す").fill("洗剤");
      await expect(page.getByText("2件 / 9件")).toBeVisible();
    },
  },
  {
    name: "supply-chip",
    url: "stock/supply/",
    prepare: async (page) => {
      await chip(page, "ジャンルで絞る", "お風呂").click();
      await expect(page.getByText("2件 / 9件")).toBeVisible();
    },
  },
  {
    name: "supply-search-empty",
    url: "stock/supply/",
    prepare: async (page) => {
      await page.getByPlaceholder("品物名で探す").fill("ほうき");
      await expect(page.getByText("「ほうき」に合う日用品はありません")).toBeVisible();
    },
  },
  {
    name: "supply-empty",
    url: "stock/supply/",
    prepare: async (page, _i, h) => {
      sql(`delete from public.item where household_id = '${h}'`);
      await page.reload();
      await expect(page.getByText("日用品はまだありません")).toBeVisible();
    },
  },
  {
    name: "supply-used-up",
    url: "stock/supply/",
    prepare: async (page) => {
      await page.getByRole("button", { name: "シャンプーの詰め替えを1つ減らす" }).click();
      await expect(page.getByText("シャンプーの詰め替えを使い切りました")).toBeVisible();
      await expect(page.getByRole("button", { name: "元に戻す" })).toBeVisible();
    },
  },
  {
    name: "supply-error",
    url: "stock/supply/",
    prepare: async (page) => {
      await page.route(/\/rest\/v1\/(item_stock|item|genre|location|unit)/, (route) => route.abort("connectionfailed"));
      await page.reload();
      await expect(page.getByRole("heading", { name: "つながりませんでした" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("通信できなかったため、日用品を読み込めませんでした。")).toBeVisible();
    },
  },
  {
    name: "supply-offline",
    url: "stock/supply/",
    prepare: async (page) => {
      await expect(page.getByRole("button", { name: /^食器用洗剤の残量/ })).toBeVisible();
      await goOffline(page);
      await expect(page.getByRole("status").filter({ hasText: "日用品は見られますが、変えられません" })).toBeVisible();
      await page.getByRole("button", { name: /^食器用洗剤の残量/ }).evaluate((el) => el.scrollIntoView({ block: "center" })); // 小さい画面では下の帯の裏に入る
      await page.getByRole("button", { name: /^食器用洗剤の残量/ }).click({ force: true });
      await expect(page.getByText("電波のある所で操作してください", { exact: true }).last()).toBeVisible();
    },
  },
  {
    name: "supply-save-failed",
    url: "stock/supply/",
    prepare: async (page) => {
      await page.route(/\/rest\/v1\/item/, (route) => (route.request().method() === "PATCH" ? route.abort("connectionfailed") : route.continue()));
      await page.getByRole("button", { name: /^食器用洗剤の残量/ }).evaluate((el) => el.scrollIntoView({ block: "center" })); // 小さい画面では下の帯の裏に入る
      await page.getByRole("button", { name: /^食器用洗剤の残量/ }).click();
      await expect(page.getByText("食器用洗剤を保存できませんでした。電波のよい場所で、もう一度お試しください。")).toBeVisible({ timeout: 15_000 });
    },
  },
  {
    name: "supply-item-gone",
    url: "stock/supply/",
    noRealtime: true,
    prepare: async (page, _i, h) => {
      sql(`delete from public.item where household_id = '${h}' and name = 'ゴミ袋'`);
      await page.getByRole("button", { name: /^ゴミ袋の残量/ }).click();
      await expect(page.getByText("ゴミ袋は、もう削除されていました")).toBeVisible();
    },
  },
  { name: "item-new-supply", url: "stock/item-new/?from=supply", prepare: none },
  { name: "item-new-supply-full", url: "stock/item-new/?from=supply", full: true, prepare: none },
  {
    name: "item-new-supply-count-full",
    url: "stock/item-new/?from=supply",
    full: true,
    prepare: async (page) => {
      await chip(page, "管理のしかた", "数で管理").click();
      await chip(page, "単位", "本").click();
      await chip(page, "ジャンルの候補", "お風呂").click();
      await page.locator("#item-new-name").fill("リンスの詰め替え");
      await page.locator("#item-new-name").blur();
    },
  },
  {
    name: "item-new-supply-kind-error",
    url: "stock/item-new/?from=supply",
    prepare: async (page) => {
      await page.locator("#item-new-name").fill("牛乳");
      await page.locator("#item-new-name").blur(); // 文字を打つ間は下の帯が隠れる
      await page.getByRole("button", { name: "登録する" }).click();
      await expect(page.getByText("「牛乳」は食材にあります。候補から選んでください。")).toBeVisible();
    },
  },
  { name: "items-supply", url: "stock/items/?from=supply&kind=supply", prepare: none },
  { name: "items-supply-full", url: "stock/items/?from=supply&kind=supply", full: true, prepare: none },
  { name: "items-food-full", url: "stock/items/?kind=food", full: true, prepare: none },
  { name: "masters", url: "stock/masters/?from=supply", prepare: none },
  {
    name: "item-edit-shampoo",
    url: (h) => `stock/item-edit/?id=${itemId(h, "シャンプーの詰め替え")}&from=supply`,
    prepare: none,
  },
  {
    name: "item-edit-shampoo-full",
    url: (h) => `stock/item-edit/?id=${itemId(h, "シャンプーの詰め替え")}&from=supply`,
    full: true,
    prepare: none,
  },
  {
    name: "item-edit-toilet-full",
    url: (h) => `stock/item-edit/?id=${itemId(h, "トイレットペーパー")}&from=supply`,
    full: true,
    prepare: none,
  },
  {
    name: "item-edit-shampoo-used-up",
    url: (h) => `stock/item-edit/?id=${itemId(h, "シャンプーの詰め替え")}&from=supply`,
    prepare: async (page) => {
      const qty = page.getByLabel("シャンプーの詰め替えの数", { exact: true });
      await qty.fill("0");
      await qty.blur();
      await expect(page.getByText("シャンプーの詰め替えを使い切りました")).toBeVisible();
    },
  },
  {
    name: "item-edit-toilet-tracking",
    url: (h) => `stock/item-edit/?id=${itemId(h, "トイレットペーパー")}&from=supply`,
    prepare: async (page) => {
      await page.getByRole("button", { name: "数で管理に変える" }).click();
      await expect(page.getByRole("button", { name: "変える" })).toBeVisible();
    },
  },
];

for (const shot of shots) {
  test(`スクリーンショット: ${shot.name}`, async ({ page, context }, info) => {
    test.setTimeout(90_000);
    const household = stockHousehold(info, SUITE);
    resetMasters(household);
    seedStock(household);
    seedSupplies(household);
    // R3-12: 食材・日用品の いつもの を ON にして、正典の画像と見比べられるようにする
    setRegular(household, ["牛乳", "卵", "トイレットペーパー", "食パン", "ボディソープの詰め替え", "キャベツ", "しょうゆ"]);
    if (shot.noRealtime) await context.routeWebSocket(/realtime/, () => {});
    await openStock(page, info, 1, SUITE);
    await expect(page.getByRole("button", { name: "ヨーグルトを1増やす" })).toBeVisible();
    await page.goto(typeof shot.url === "function" ? shot.url(household) : shot.url);
    await expect(page.locator("h1").first()).toBeVisible();
    await shot.prepare(page, info, household);
    await page.waitForTimeout(500); // 通知の出入りと描画が落ち着くまで
    await shootScreen(page, info, `ss-${shot.name}`, !!shot.full);
    expect(await findHorizontalOverflow(page)).toBeNull();
    expect(await findSmallInputs(page)).toEqual([]);
    expect(await findSmallTapTargets(page)).toEqual([]);
    if (!shot.full) expect(await findBottomOverlap(page)).toBeNull();
  });
}
