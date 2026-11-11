import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContextOptions, type Page } from "@playwright/test";
import { credentials, supabaseApi } from "./auth-helpers";
import { sql } from "./db";
import { openStock, resetMasters, row, seedStock, setRegular, stockHousehold } from "./stock-helpers";

// 倉庫 run 2(stock-master)の E2E(30_architecture.md Interfaces §10): マスタ、品物の一覧、品物の編集、いつもの、2人の反映、世帯の分離、オフライン。
// 世帯は project ごとの M-<project>(マスタを変えるので run 1 の世帯とは別。M-13)。ファイルの中は順に流し、各テストの始めにマスタも初期値に戻す。
// どの変更も、画面で見えるだけでなく DB に保存されている(poll)ことを確かめる。
test.describe.configure({ mode: "serial" });
const SUITE = "master" as const;

const chip = (page: Page, group: string, text: string) => page.getByRole("group", { name: group }).getByRole("button", { name: text, exact: true }).first();
const wait = { timeout: 10_000 };

async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
}
function contextOptions(use: Record<string, unknown>): BrowserContextOptions {
  const keys = ["viewport", "userAgent", "deviceScaleFactor", "isMobile", "hasTouch", "baseURL"];
  return Object.fromEntries(keys.filter((k) => k in use).map((k) => [k, use[k]])) as BrowserContextOptions;
}

const names = (h: string, table: "genre" | "location" | "unit") =>
  (sql(`select name from public.${table} where household_id = '${h}' order by sort_order, created_at`) as { name: string }[]).map((r) => r.name);
const genreDefault = (h: string, genre: string) =>
  (sql(`select l.name from public.genre g left join public.location l on l.id = g.default_location_id where g.household_id = '${h}' and g.name = '${genre}'`)[0] as { name: string | null } | undefined)?.name;
const unitCountable = (h: string, unit: string) =>
  (sql(`select is_countable from public.unit where household_id = '${h}' and name = '${unit}'`)[0] as { is_countable: boolean } | undefined)?.is_countable;
type DbItem = { tracking: string; stock_level: string | null; is_regular: boolean; unit: string | null; genre: string | null; location: string | null; restock_at_count: number | null; restock_at_level: string | null };
const dbItem = (h: string, name: string) =>
  sql(
    `select i.tracking, i.stock_level, i.is_regular, u.name as unit, g.name as genre, l.name as location, i.restock_at_count::float8 as restock_at_count, i.restock_at_level
     from public.item i left join public.unit u on u.id = i.unit_id left join public.genre g on g.id = i.genre_id left join public.location l on l.id = i.location_id
     where i.household_id = '${h}' and i.name = '${name}'`,
  )[0] as DbItem | undefined;
const dbStocks = (h: string, name: string) =>
  sql(
    `select s.id, s.quantity::float8 as quantity, l.name as location, s.expires_on::text as expires_on from public.item_stock s join public.item i on i.id = s.item_id
     left join public.location l on l.id = s.location_id where s.household_id = '${h}' and i.name = '${name}' order by s.created_at, s.id`,
  ) as { id: string; quantity: number; location: string | null; expires_on: string | null }[];

test.beforeEach(async ({}, info) => {
  const household = stockHousehold(info, SUITE);
  resetMasters(household);
  seedStock(household);
});

async function openMasters(page: Page, info: Parameters<typeof openStock>[1], who: 1 | 2 = 1) {
  await openStock(page, info, who, SUITE);
  await page.getByRole("link", { name: "マスタ", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("マスタ");
}
async function openItems(page: Page, info: Parameters<typeof openStock>[1], who: 1 | 2 = 1) {
  await openStock(page, info, who, SUITE);
  await page.getByRole("link", { name: "品物", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("品物の一覧");
}
const card = (page: Page, title: string) => page.locator("section", { has: page.getByRole("heading", { level: 2, name: title, exact: true }) });
const mrow = (page: Page, title: string, name: string) => card(page, title).locator("li", { has: page.getByText(name, { exact: true }) });

test("ヘッダーの「品物」「マスタ」と「‹ もどる」", async ({ page }, info) => {
  await openStock(page, info, 1, SUITE);
  await page.getByRole("link", { name: "品物", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("品物の一覧");
  await page.getByRole("link", { name: "もどる" }).click();
  await expect(page.locator("h1")).toHaveText("もっちり倉庫");
  await page.getByRole("link", { name: "マスタ", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("マスタ");
  await page.getByRole("link", { name: "もどる" }).click();
  await expect(page.locator("h1")).toHaveText("もっちり倉庫");
  // 品物の編集は来た元へ戻る
  await page.getByRole("link", { name: "ヨーグルトを編集" }).click();
  await expect(page.locator("h1")).toHaveText("品物の編集");
  await page.getByRole("link", { name: "もどる" }).click();
  await expect(page.locator("h1")).toHaveText("もっちり倉庫");
});

test("マスタ: 追加・名前の変更・同じ名前の誤り・空は何も起きない。保存される", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openMasters(page, info);
  const genres = card(page, "ジャンル");

  await genres.getByLabel("新しいジャンル").fill("  乾物 ");
  await genres.getByRole("button", { name: "追加" }).click();
  await expect(mrow(page, "ジャンル", "乾物")).toContainText("既定の場所: 未選択"); // 新しいジャンルの既定は未選択
  await expect.poll(() => names(h, "genre").at(-1)).toBe("乾物");
  expect(genreDefault(h, "乾物")).toBeNull();

  // 同じ名前は誤り、空は何も起きない
  await genres.getByLabel("新しいジャンル").fill("乾物");
  await genres.getByRole("button", { name: "追加" }).click();
  await expect(genres.getByText("同じ名前があります")).toBeVisible();
  await genres.getByLabel("新しいジャンル").fill("   ");
  await genres.getByRole("button", { name: "追加" }).click();
  expect(names(h, "genre").filter((n) => n === "乾物")).toHaveLength(1);
  await expect(genres.getByText("同じ名前があります")).toBeHidden();

  // 名前の変更
  await page.getByRole("button", { name: "乾物を変更" }).click();
  await page.getByLabel("乾物の名前").fill("肉");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(genres.getByText("同じ名前があります")).toBeVisible();
  await page.getByLabel("乾物の名前").fill("乾物類");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(mrow(page, "ジャンル", "乾物類")).toBeVisible();
  await expect.poll(() => names(h, "genre").at(-1)).toBe("乾物類");

  // 場所と単位(単位の追加は「±で数える」)
  await card(page, "場所").getByLabel("新しい場所").fill("パントリー");
  await card(page, "場所").getByRole("button", { name: "追加" }).click();
  await expect(mrow(page, "場所", "パントリー")).toBeVisible();
  await card(page, "単位").getByLabel("新しい単位").fill("箱");
  await card(page, "単位").getByRole("button", { name: "追加" }).click();
  await expect(mrow(page, "単位", "箱")).toContainText("±で数える");
  await expect.poll(() => unitCountable(h, "箱")).toBe(true);

  await page.reload();
  await expect(mrow(page, "ジャンル", "乾物類")).toBeVisible();
  await expect(mrow(page, "場所", "パントリー")).toBeVisible();
  await expect(mrow(page, "単位", "箱")).toBeVisible();
});

test("マスタ: 使用中は削除が出ない。使っていない値は削除でき、元に戻せる", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openMasters(page, info);
  // 使用中(肉は食材の品物が使う)には削除が無く、使っていない魚には削除がある
  await expect(mrow(page, "ジャンル", "肉")).toContainText("使用中");
  await expect(page.getByRole("button", { name: "肉を削除" })).toHaveCount(0);
  await expect(mrow(page, "場所", "棚")).toContainText("使用中"); // 在庫と残量で管理の品物が使う
  await expect(mrow(page, "単位", "パック")).toContainText("使用中");
  await expect(mrow(page, "ジャンル", "魚")).not.toContainText("使用中");

  await page.getByRole("button", { name: "魚を削除" }).click();
  await expect(page.getByText("魚を削除しました")).toBeVisible();
  await expect(mrow(page, "ジャンル", "魚")).toHaveCount(0);
  await expect.poll(() => names(h, "genre").includes("魚")).toBe(false);
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(mrow(page, "ジャンル", "魚")).toBeVisible();
  await expect.poll(() => names(h, "genre").includes("魚")).toBe(true);
  expect(genreDefault(h, "魚")).toBe("冷蔵庫");

  // 元に戻さなければ、再読み込みのあとも消えている
  await page.getByRole("button", { name: "魚を削除" }).click();
  await expect.poll(() => names(h, "genre").includes("魚")).toBe(false);
  await page.reload();
  await expect(mrow(page, "ジャンル", "飲み物")).toBeVisible();
  await expect(mrow(page, "ジャンル", "魚")).toHaveCount(0);
});

test("マスタ: 既定の場所に使われていた場所を消すと「既定の場所: 未選択」になり、元に戻すと戻る", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openMasters(page, info);
  await card(page, "場所").getByLabel("新しい場所").fill("パントリー");
  await card(page, "場所").getByRole("button", { name: "追加" }).click();
  await expect(mrow(page, "場所", "パントリー")).toBeVisible();
  // 飲み物の既定の場所をパントリーにする
  await page.getByRole("button", { name: "飲み物を変更" }).click();
  await page.getByRole("group", { name: "飲み物の既定の場所" }).getByRole("button", { name: "パントリー" }).click();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(mrow(page, "ジャンル", "飲み物")).toContainText("既定の場所: パントリー");
  await expect.poll(() => genreDefault(h, "飲み物")).toBe("パントリー");
  // パントリーは使用中ではない(既定の場所だけ)ので削除でき、消すと未選択
  await expect(mrow(page, "場所", "パントリー")).not.toContainText("使用中");
  await page.getByRole("button", { name: "パントリーを削除" }).click();
  await expect(page.getByText("パントリーを削除しました")).toBeVisible();
  await expect(mrow(page, "ジャンル", "飲み物")).toContainText("既定の場所: 未選択");
  await expect.poll(() => genreDefault(h, "飲み物")).toBeNull();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(mrow(page, "ジャンル", "飲み物")).toContainText("既定の場所: パントリー");
  await expect.poll(() => genreDefault(h, "飲み物")).toBe("パントリー");
  await page.reload();
  await expect(mrow(page, "ジャンル", "飲み物")).toContainText("既定の場所: パントリー");
});

test("マスタ: 「±で数える」を切り替えると、食材の在庫に ± が出る・消える", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openMasters(page, info);
  await expect(mrow(page, "単位", "g")).toContainText("打ち込む");
  await page.getByRole("button", { name: "gを変更" }).click();
  await page.getByRole("button", { name: "gを±で数える" }).click();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(mrow(page, "単位", "g")).toContainText("±で数える");
  await expect.poll(() => unitCountable(h, "g")).toBe(true);
  await page.getByRole("link", { name: "もどる" }).click();
  await expect(page.getByRole("button", { name: "豚こま肉を1増やす" })).toBeVisible();
  await page.getByRole("link", { name: "マスタ", exact: true }).click();
  await page.getByRole("button", { name: "gを変更" }).click();
  await page.getByRole("button", { name: "gを±で数える" }).click();
  await page.getByRole("button", { name: "保存" }).click();
  await expect.poll(() => unitCountable(h, "g")).toBe(false);
  await page.getByRole("link", { name: "もどる" }).click();
  await expect(page.getByRole("button", { name: "豚こま肉を1増やす" })).toHaveCount(0);
  await expect(row(page, "豚こま肉")).toBeVisible();
});

test("品物の一覧: ジャンルのまとまり、いつもの の付け外し、削除と元に戻す。保存される", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openItems(page, info);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["野菜・果物", "肉", "卵・乳製品", "冷凍食品", "主食(米・パン・麺)", "調味料", "お菓子", "その他"]);
  await expect(card(page, "卵・乳製品")).toContainText("3件");
  await expect(page.getByRole("link", { name: "牛乳を編集" })).toContainText("数で管理");
  await expect(page.getByRole("link", { name: "マヨネーズを編集" })).toContainText("残量で管理");

  const toggle = page.getByRole("button", { name: "ヨーグルトをいつものにする" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => dbItem(h, "ヨーグルト")?.is_regular).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "ヨーグルトをいつものにする" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "ヨーグルトをいつものにする" }).click();
  await expect.poll(() => dbItem(h, "ヨーグルト")?.is_regular).toBe(false);

  const before = dbStocks(h, "納豆");
  await page.getByRole("button", { name: "納豆を削除" }).click();
  await expect(page.getByText("納豆を削除しました")).toBeVisible();
  await expect(page.getByRole("link", { name: "納豆を編集" })).toHaveCount(0);
  await expect.poll(() => dbItem(h, "納豆")).toBeUndefined();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.getByRole("link", { name: "納豆を編集" })).toBeVisible();
  await expect.poll(() => dbStocks(h, "納豆")).toEqual(before); // 在庫も同じ id・同じ値で戻る
  await page.reload();
  await expect(page.getByRole("link", { name: "納豆を編集" })).toBeVisible();

  // 品物が1つも無いとき
  sql(`delete from public.item where household_id = '${h}'`);
  await page.reload();
  await expect(page.getByText("品物はありません")).toBeVisible();
});

test("品物の編集: 名前・ジャンル・単位・いつもの。保存される。単位を変えても在庫の数は変わらない", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openStock(page, info, 1, SUITE);
  await page.getByRole("link", { name: "豚こま肉を編集" }).click();
  await expect(page.locator("#edit-name")).toHaveValue("豚こま肉");
  // 名前: 空・重複は誤り(保存されない)、新しい名前は保存される
  await page.locator("#edit-name").fill("");
  await page.locator("#edit-name").blur();
  await expect(page.getByText("品物名を入れてください")).toBeVisible();
  await page.locator("#edit-name").fill("卵");
  await page.locator("#edit-name").blur();
  await expect(page.getByText("同じ名前の品物があります")).toBeVisible();
  expect(dbItem(h, "豚こま肉")).toBeDefined();
  await page.locator("#edit-name").fill(" 豚こま切れ肉 ");
  await page.locator("#edit-name").blur();
  await expect.poll(() => dbItem(h, "豚こま切れ肉")?.genre).toBe("肉");
  // ジャンル
  await page.locator("#edit-genre").selectOption({ label: "冷凍食品" });
  await expect.poll(() => dbItem(h, "豚こま切れ肉")?.genre).toBe("冷凍食品");
  // 単位: 在庫の数は 200 のまま、単位の表示だけ変わる
  expect(dbStocks(h, "豚こま切れ肉")[0].quantity).toBe(200);
  await expect(page.getByLabel("豚こま切れ肉の数", { exact: true })).toHaveValue("200");
  await chip(page, "単位", "個").click();
  await expect.poll(() => dbItem(h, "豚こま切れ肉")?.unit).toBe("個");
  expect(dbStocks(h, "豚こま切れ肉")[0].quantity).toBe(200);
  // いつもの
  await page.getByRole("checkbox").click();
  await expect.poll(() => dbItem(h, "豚こま切れ肉")?.is_regular).toBe(true);
  await page.reload();
  await expect(page.locator("#edit-name")).toHaveValue("豚こま切れ肉");
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByRole("link", { name: "もどる" }).click();
  await expect(card(page, "冷蔵庫").locator("li", { hasText: "豚こま切れ肉" }).locator("span.tabular-nums")).toHaveText("200個");
});

test("品物の編集: 管理のしかたを数 → 残量 → 数に変え、元に戻すと在庫の id と値まで戻る", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openStock(page, info, 1, SUITE);
  await page.getByRole("link", { name: "牛乳を編集" }).first().click();
  const before = dbStocks(h, "牛乳");
  expect(before).toHaveLength(2);
  await page.getByRole("button", { name: "残量で管理に変える" }).click();
  await expect(page.getByText("在庫 2件(合計 2 本)は消えて、残量になります。")).toBeVisible();
  await page.getByRole("group", { name: "変えたあとの残量" }).getByRole("button", { name: "残量 △" }).click();
  await page.getByRole("button", { name: "変える" }).click();
  await expect(page.getByText("牛乳を残量で管理に変えました")).toBeVisible();
  await expect(page.getByText("いまは 残量で管理")).toBeVisible();
  await expect.poll(() => dbItem(h, "牛乳")).toMatchObject({ tracking: "level", stock_level: "low", restock_at_count: null, restock_at_level: "low", unit: "本" });
  expect(dbStocks(h, "牛乳")).toHaveLength(0);
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.getByText("いまは 数で管理")).toBeVisible();
  await expect.poll(() => dbStocks(h, "牛乳")).toEqual(before);
  expect(dbItem(h, "牛乳")).toMatchObject({ tracking: "count", stock_level: null, restock_at_level: null });

  // 残量 → 数: 単位が未選択なら誤り。選んで、個数 1 の在庫ができる
  await page.goto("stock/");
  await page.getByRole("link", { name: "しょうゆを編集" }).click();
  await page.getByRole("button", { name: "数で管理に変える" }).click();
  await page.getByRole("button", { name: "変える" }).click();
  await expect(page.getByText("単位を選んでください")).toBeVisible();
  await page.getByRole("group", { name: "パネルの単位" }).getByRole("button", { name: "本", exact: true }).click();
  await page.locator("#edit-panel-qty").fill("2.5");
  await page.getByRole("button", { name: "変える" }).click();
  await expect(page.getByText("しょうゆを数で管理に変えました")).toBeVisible();
  await expect.poll(() => dbItem(h, "しょうゆ")).toMatchObject({ tracking: "count", stock_level: null, unit: "本", restock_at_level: null });
  await expect.poll(() => dbStocks(h, "しょうゆ").map((s) => [s.quantity, s.location])).toEqual([[2.5, "棚"]]);
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect.poll(() => dbItem(h, "しょうゆ")).toMatchObject({ tracking: "level", stock_level: "low" });
  expect(dbStocks(h, "しょうゆ")).toHaveLength(0);
  await page.reload();
  await expect(page.getByText("いまは 残量で管理")).toBeVisible();
});

test("品物の編集: 品物を削除すると来た元の画面へ戻り、元に戻せる(一覧からも品物の一覧からも)", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openStock(page, info, 1, SUITE);
  await page.getByRole("link", { name: "納豆を編集" }).click();
  const before = dbStocks(h, "納豆");
  await page.getByRole("button", { name: "品物を削除" }).click();
  await expect(page.locator("h1")).toHaveText("もっちり倉庫");
  await expect(page.getByText("納豆を削除しました")).toBeVisible();
  await expect.poll(() => dbItem(h, "納豆")).toBeUndefined();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(row(page, "納豆")).toBeVisible();
  await expect.poll(() => dbStocks(h, "納豆")).toEqual(before);

  await page.getByRole("link", { name: "品物", exact: true }).click();
  await page.getByRole("link", { name: "納豆を編集" }).click();
  await page.getByRole("button", { name: "品物を削除" }).click();
  await expect(page.locator("h1")).toHaveText("品物の一覧");
  await expect(page.getByRole("link", { name: "納豆を編集" })).toHaveCount(0);
  await expect.poll(() => dbItem(h, "納豆")).toBeUndefined();
});

test("いつもの のまとまり: 在庫 0・小数・残量。在庫が無くても残り、空の状態のカードがその下に出る", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  setRegular(h, ["食パン", "キャベツ", "マヨネーズ", "ヨーグルト"]);
  await openStock(page, info, 1, SUITE);
  const regular = card(page, "いつもの");
  await expect(regular).toContainText("4件");
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("いつもの");
  await expect(regular.locator("li", { hasText: "食パン" })).toContainText("在庫なし");
  await expect(regular.locator("li", { hasText: "キャベツ" })).toContainText("在庫 0.5個");
  await expect(regular.locator("li", { hasText: "ヨーグルト" })).toContainText("在庫 3個");
  await expect(regular.locator("li", { hasText: "マヨネーズ" })).toContainText("残量 ○");
  // 場所のまとまりは別にある
  await expect(card(page, "野菜室")).toBeVisible();
  // 在庫を全部なくす(数で管理の在庫と、残量で管理の品物)
  sql(`delete from public.item_stock where household_id = '${h}'`);
  sql(`delete from public.item where household_id = '${h}' and tracking = 'level' and not is_regular`);
  sql(`update public.item set tracking = 'count', stock_level = null, restock_at_level = null, unit_id = (select id from public.unit where household_id = '${h}' and name = '個') where household_id = '${h}' and name = 'マヨネーズ'`);
  await page.reload();
  await expect(regular).toBeVisible();
  await expect(card(page, "いつもの").locator("li", { hasText: "マヨネーズ" })).toContainText("在庫なし");
  await expect(page.getByText("食材の在庫はありません")).toBeVisible();
  const order = await page.locator("main h2").allInnerTexts();
  expect(order).toEqual(["いつもの", "食材の在庫はありません"]);
  // いつもの をタップすると品物の編集へ
  await card(page, "いつもの").getByRole("link", { name: "食パンを編集" }).click();
  await expect(page.locator("#edit-name")).toHaveValue("食パン");
});

test("オフライン: マスタ・品物の一覧・品物の編集の操作が止まる", async ({ page }, info) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(10_000);
  const h = stockHousehold(info, SUITE);
  await openMasters(page, info);
  await goOffline(page);
  await expect(page.getByRole("status").filter({ hasText: "マスタは見られますが、変えられません" })).toBeVisible();
  await page.getByRole("button", { name: "魚を削除" }).click();
  await expect(page.getByText("電波のある所で操作してください", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "魚を変更" }).click();
  await expect(page.getByLabel("魚の名前")).toHaveCount(0);
  expect(names(h, "genre")).toContain("魚");
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  // 画面を開くのは電波のあるうち(電波の無い所でアプリを開くことは run 3)。開き直してから切る
  await page.goto("stock/items/");
  await expect(page.getByRole("link", { name: "納豆を編集" })).toBeVisible();
  await goOffline(page);
  await expect(page.getByRole("status").filter({ hasText: "品物は見られますが、変えられません" })).toBeVisible();
  // aria-disabled のボタンは見た目も押せる状態のまま(薄くしない)。Playwright は押せないとみなすので force で押す
  await page.getByRole("button", { name: "納豆を削除" }).click({ force: true });
  await expect(page.getByText("電波のある所で操作してください", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "納豆をいつものにする" }).click({ force: true });
  expect(dbItem(h, "納豆")?.is_regular).toBe(false);
  // 画面を開くのは電波のあるうち(電波の無い所でアプリを開くことは run 3)。開いてから切る
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const natto = String(sql(`select id from public.item where household_id = '${h}' and name = '納豆'`)[0].id);
  await page.goto(`stock/item-edit/?id=${natto}&from=items`);
  await expect(page.locator("#edit-name")).toHaveValue("納豆");
  await goOffline(page);
  await expect(page.getByRole("status").filter({ hasText: "品物と在庫は見られますが、変えられません" })).toBeVisible();
  await page.getByRole("button", { name: "品物を削除" }).click({ force: true });
  await expect(page.getByText("電波のある所で操作してください", { exact: true }).last()).toBeVisible();
  await expect(page.locator("#edit-name")).toHaveAttribute("readonly", "");
  expect(dbItem(h, "納豆")).toBeDefined();
});

// ---- 2人の反映(PT-03)。待つ上限は 10 秒 ----
test("2人の反映: マスタの追加・名前・削除が、もう一方に再読み込みなしで出る", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  await openMasters(page, info, 1);
  const contextB = await browser.newContext(contextOptions(info.project.use));
  const pageB = await contextB.newPage();
  await openMasters(pageB, info, 2);

  await card(page, "ジャンル").getByLabel("新しいジャンル").fill("乾物");
  await card(page, "ジャンル").getByRole("button", { name: "追加" }).click();
  await expect(mrow(pageB, "ジャンル", "乾物")).toBeVisible(wait);
  await page.getByRole("button", { name: "乾物を変更" }).click();
  await page.getByLabel("乾物の名前").fill("乾物類");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(mrow(pageB, "ジャンル", "乾物類")).toBeVisible(wait);
  await page.getByRole("button", { name: "乾物類を削除" }).click();
  await expect(mrow(pageB, "ジャンル", "乾物類")).toHaveCount(0, wait);
  await pageB.getByRole("button", { name: "魚を削除" }).click();
  await expect(mrow(page, "ジャンル", "魚")).toHaveCount(0, wait);
  await contextB.close();
});

test("2人の反映: 品物の名前・いつもの・管理のしかた・削除が、もう一方に再読み込みなしで出る。編集中に削除されると「品物がありません」", async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  await openStock(page, info, 1, SUITE);
  const contextB = await browser.newContext(contextOptions(info.project.use));
  const pageB = await contextB.newPage();
  await openItems(pageB, info, 2);

  // A が品物の編集で名前といつものを変える → B の品物の一覧に出る
  await page.getByRole("link", { name: "ヨーグルトを編集" }).click();
  await page.locator("#edit-name").fill("ギリシャヨーグルト");
  await page.locator("#edit-name").blur();
  await expect(pageB.getByRole("link", { name: "ギリシャヨーグルトを編集" })).toBeVisible(wait);
  await page.getByRole("checkbox").click();
  await expect(pageB.getByRole("button", { name: "ギリシャヨーグルトをいつものにする" })).toHaveAttribute("aria-pressed", "true", wait);

  // B が品物の編集を開いている間に、A が管理のしかたを数 → 残量に変える(在庫のブロックが残量に入れ替わる)
  await pageB.getByRole("link", { name: "牛乳を編集" }).click();
  await expect(pageB.getByRole("button", { name: "牛乳(冷蔵庫)を使い切り" }).first()).toBeVisible();
  await page.goto("stock/");
  await page.getByRole("link", { name: "牛乳を編集" }).first().click();
  await page.getByRole("button", { name: "残量で管理に変える" }).click();
  await page.getByRole("button", { name: "変える" }).click();
  await expect(pageB.getByText("いまは 残量で管理")).toBeVisible(wait);
  await expect(pageB.getByRole("button", { name: /を使い切り$/ })).toHaveCount(0);

  // A が品物を削除する → B の編集の画面は「品物がありません」になる(黙って)
  await page.getByRole("button", { name: "品物を削除" }).click();
  await expect(pageB.getByRole("heading", { name: "品物がありません" })).toBeVisible(wait);
  await contextB.close();
});

test("2人が同時に変えたとき: 品物の削除の直後に、相手の古い画面で ± すると、行が消えて知らせが出る", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const h = stockHousehold(info, SUITE);
  await openStock(page, info, 1, SUITE);
  const contextB = await browser.newContext(contextOptions(info.project.use));
  await contextB.routeWebSocket(/realtime/, () => {}); // B には知らせが届かない(古い画面のまま)
  const pageB = await contextB.newPage();
  await openStock(pageB, info, 2, SUITE);
  sql(`delete from public.item where household_id = '${h}' and name = '納豆'`);
  await pageB.getByRole("button", { name: "納豆を1増やす" }).click();
  await expect(pageB.getByText("納豆の在庫は、もうありませんでした")).toBeVisible(wait);
  await expect(row(pageB, "納豆")).toHaveCount(0);
  await contextB.close();
  void page;
});

// ---- 世帯の分離(NF-02) ----
test("世帯の分離: B1 の token で直接呼んでも、A のマスタ・品物は書き換えられない", async ({}, info) => {
  const h = stockHousehold(info, SUITE);
  const genreId = String(sql(`select id from public.genre where household_id = '${h}' and name = '魚'`)[0].id);
  const itemId = String(sql(`select id from public.item where household_id = '${h}' limit 1`)[0].id);
  const { url, key } = supabaseApi();
  const b1 = createClient(url, key, { auth: { persistSession: false } });
  const { email, password } = credentials("B1");
  expect((await b1.auth.signInWithPassword({ email, password })).error).toBeNull();

  for (const table of ["genre", "location", "unit"] as const) {
    const ins = await b1.from(table).insert({ household_id: h, name: "もぐりこみ", sort_order: 99 });
    expect(ins.error?.code).toBe("42501");
  }
  const upd = await b1.from("genre").update({ name: "のっとり" }).eq("id", genreId).select();
  expect(upd.error).toBeNull();
  expect(upd.data).toEqual([]);
  const delGenre = await b1.from("genre").delete().eq("id", genreId).select();
  expect(delGenre.data).toEqual([]);
  const delItem = await b1.from("item").delete().eq("id", itemId).select();
  expect(delItem.data).toEqual([]);
  const updItem = await b1.from("item").update({ name: "のっとり" }).eq("id", itemId).select();
  expect(updItem.data).toEqual([]);
  expect(names(h, "genre")).toContain("魚");
  expect(sql(`select count(*)::int as n from public.item where id = '${itemId}'`)[0].n).toBe(1);
  await b1.removeAllChannels();
});
