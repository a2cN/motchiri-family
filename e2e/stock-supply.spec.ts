import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContextOptions, type Locator, type Page } from "@playwright/test";
import { credentials, supabaseApi } from "./auth-helpers";
import { sql } from "./db";
import { openStock, openSupply, resetMasters, seedStock, seedSupplies, setRegular, stockHousehold } from "./stock-helpers";

// 倉庫 run 3a(stock-supply)の E2E(30_architecture.md Interfaces §9): 日用品の画面、登録の種別、品物の一覧の切り替え、品物の編集、
// いつもの、タブ・サイドバー・ヘッダーの入口、2人の反映、世帯の分離、オフライン。
// 世帯は project ごとの D-<project>(run 1・2 の世帯とは別。S-12)。ファイルの中は順に流し、各テストの始めに品物を消して日用品の種データを入れ直す。
// どの変更も、画面で見えるだけでなく DB に保存されている(poll)ことを確かめる。
test.describe.configure({ mode: "serial" });
const SUITE = "supply" as const;
const wait = { timeout: 10_000 };

const chip = (page: Page, group: string, text: string) => page.getByRole("group", { name: group }).getByRole("button", { name: text, exact: true }).first();
/** 入力して欄を外す(文字を打つ間は下の帯が隠れる = 「登録する」が見えなくなるため) */
async function typeIn(locator: Locator, value: string) {
  await locator.fill(value);
  await locator.blur();
}
const srow = (page: Page, name: string) => page.locator("li", { has: page.getByRole("link", { name: `${name}を編集` }) });
const qtyText = (page: Page, name: string) => srow(page, name).locator("span.tabular-nums");
const levelButton = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}の残量`) });
async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
}
function contextOptions(use: Record<string, unknown>): BrowserContextOptions {
  const keys = ["viewport", "userAgent", "deviceScaleFactor", "isMobile", "hasTouch", "baseURL"];
  return Object.fromEntries(keys.filter((k) => k in use).map((k) => [k, use[k]])) as BrowserContextOptions;
}

type DbItem = { id: string; item_kind: string; tracking: string; stock_level: string | null; supply_genre: string | null; note: string | null; unit: string | null; genre_id: string | null; location_id: string | null; is_regular: boolean };
const dbItem = (h: string, name: string) =>
  sql(
    `select i.id, i.item_kind, i.tracking, i.stock_level, i.supply_genre, i.note, u.name as unit, i.genre_id, i.location_id, i.is_regular
     from public.item i left join public.unit u on u.id = i.unit_id where i.household_id = '${h}' and i.name = '${name}'`,
  )[0] as DbItem | undefined;
const dbStocks = (h: string, name: string) =>
  sql(
    `select s.quantity::float8 as quantity, s.location_id, s.expires_on::text as expires_on, s.purchased_on::text as purchased_on from public.item_stock s
     join public.item i on i.id = s.item_id where s.household_id = '${h}' and i.name = '${name}' order by s.created_at, s.id`,
  ) as { quantity: number; location_id: string | null; expires_on: string | null; purchased_on: string }[];

test.beforeEach(async ({}, info) => {
  const household = stockHousehold(info, SUITE);
  resetMasters(household);
  seedSupplies(household);
});

// ---- 入口: タブ・サイドバー・ヘッダーの右 ----
test("入口: 食材 / 日用品 / 品物 / マスタに 1 タップで行け、サブ画面にはタブが無い。「‹」は来た元へ戻る", async ({ page }, info) => {
  const landscape = info.project.name === "ipad-landscape";
  await openStock(page, info, 1, SUITE);
  const nav = page.getByRole("navigation", { name: "倉庫の画面" });
  await expect(nav.getByRole("link", { name: "食材" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "日用品" }).click();
  await expect(page.locator("h1")).toHaveText("日用品");
  await expect(nav.getByRole("link", { name: "日用品" })).toHaveAttribute("aria-current", "page");
  // 日用品から品物の一覧へ(来た元 = 日用品 → 種別の初期値は日用品、戻り先は日用品)
  await page.getByRole("link", { name: "品物", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("品物の一覧");
  if (landscape) await expect(nav.getByRole("link", { name: "品物" })).toHaveAttribute("aria-current", "page");
  else await expect(nav).toHaveCount(0); // サブ画面にタブは無い
  // サイドバーの「品物」「マスタ」は来た元を付けない(既定 = 食材)ので、iPad 横では食材へ戻る
  const home = landscape ? "もっちり倉庫" : "日用品";
  await page.getByRole("link", { name: "もどる" }).click();
  await expect(page.locator("h1")).toHaveText(home);
  await page.getByRole("link", { name: "マスタ", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("マスタ");
  if (landscape) await expect(nav.getByRole("link", { name: "マスタ" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "もどる" }).click();
  await expect(page.locator("h1")).toHaveText(home);
  if (landscape) {
    await nav.getByRole("link", { name: "日用品" }).click();
    await expect(page.locator("h1")).toHaveText("日用品");
  }
  // ヘッダーの右は iPad 横では出ない(サイドバーが代わり)
  await expect(page.getByRole("navigation", { name: "倉庫のほかの画面" })).toHaveCount(landscape ? 0 : 1);
  await nav.getByRole("link", { name: "食材" }).click();
  await expect(page.locator("h1")).toHaveText("もっちり倉庫");
});

// ---- 日用品の画面 ----
test("日用品: 登録順の行・補足(ジャンル · 備考)・件数。残量の 1 タップで ○→△→×→○ が保存される", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openSupply(page, info);
  await expect(page.getByText("9件", { exact: true })).toBeVisible();
  const names = await page.locator("main li a").evaluateAll((els) => els.map((e) => e.querySelector("div")?.textContent));
  expect(names).toEqual(["トイレットペーパー", "食器用洗剤", "ティッシュペーパー", "ゴミ袋", "シャンプーの詰め替え", "ボディソープの詰め替え", "洗濯用洗剤", "歯みがき粉", "ハンドソープ"]);
  await expect(srow(page, "トイレットペーパー")).toContainText("紙類 · 12ロール");
  await expect(srow(page, "ハンドソープ")).not.toContainText("·");
  // 1 タップで ○ → △ → × → ○
  const toilet = levelButton(page, "トイレットペーパー");
  await expect(toilet).toHaveText("○");
  await toilet.click();
  await expect(toilet).toHaveText("△");
  await expect.poll(() => dbItem(h, "トイレットペーパー")?.stock_level).toBe("low");
  await toilet.click();
  await expect(toilet).toHaveText("×");
  await toilet.click();
  await expect(toilet).toHaveText("○");
  await expect.poll(() => dbItem(h, "トイレットペーパー")?.stock_level).toBe("full");
  await page.reload();
  await expect(levelButton(page, "トイレットペーパー")).toHaveText("○");
  await expect(levelButton(page, "食器用洗剤")).toHaveText("△");
  // 「元に戻す」は出さない
  await expect(page.getByRole("button", { name: "元に戻す" })).toHaveCount(0);
});

test("日用品: 数の行の ±(保存される)。0 で行が残り「元に戻す」で戻る。0 の − は押せない。g の単位は ± が出ない", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openSupply(page, info);
  await expect(qtyText(page, "洗濯用洗剤")).toHaveText("2 本");
  await page.getByRole("button", { name: "洗濯用洗剤を1つ増やす" }).click();
  await expect(qtyText(page, "洗濯用洗剤")).toHaveText("3 本");
  await expect.poll(() => dbStocks(h, "洗濯用洗剤")[0].quantity).toBe(3);
  await page.getByRole("button", { name: "洗濯用洗剤を1つ減らす" }).click();
  await expect.poll(() => dbStocks(h, "洗濯用洗剤")[0].quantity).toBe(2);

  // 1 → 0: 行は残り、使い切りました + 元に戻す。在庫の行は消えず quantity 0
  await page.getByRole("button", { name: "シャンプーの詰め替えを1つ減らす" }).click();
  await expect(qtyText(page, "シャンプーの詰め替え")).toHaveText("0 本");
  await expect(page.getByText("シャンプーの詰め替えを使い切りました")).toBeVisible();
  await expect.poll(() => dbStocks(h, "シャンプーの詰め替え").map((s) => s.quantity)).toEqual([0]);
  await expect(page.getByRole("button", { name: "シャンプーの詰め替えを1つ減らす" })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(qtyText(page, "シャンプーの詰め替え")).toHaveText("1 本");
  await expect.poll(() => dbStocks(h, "シャンプーの詰め替え").map((s) => s.quantity)).toEqual([1]);

  // 最初から 0 の行の + で 1 に。− は何も起きない
  await expect(qtyText(page, "ボディソープの詰め替え")).toHaveText("0 本");
  await page.getByRole("button", { name: "ボディソープの詰め替えを1つ減らす" }).click({ force: true });
  await expect.poll(() => dbStocks(h, "ボディソープの詰め替え").map((s) => s.quantity)).toEqual([0]);
  await page.getByRole("button", { name: "ボディソープの詰め替えを1つ増やす" }).click();
  await expect(qtyText(page, "ボディソープの詰め替え")).toHaveText("1 本");
  await expect.poll(() => dbStocks(h, "ボディソープの詰め替え").map((s) => s.quantity)).toEqual([1]);

  // g は「打ち込む」単位: ± が出ず、数と単位だけ
  sql(`insert into public.item (household_id, name, item_kind, tracking, unit_id, created_at) values ('${h}', '重曹', 'supply', 'count', (select id from public.unit where household_id = '${h}' and name = 'g'), now())`);
  sql(`insert into public.item_stock (household_id, item_id, quantity) values ('${h}', (select id from public.item where household_id = '${h}' and name = '重曹'), 500)`);
  await page.reload();
  await expect(qtyText(page, "重曹")).toHaveText("500 g");
  await expect(page.getByRole("button", { name: "重曹を1つ増やす" })).toHaveCount(0);
});

test("日用品: 在庫の行が無い数の日用品は 0 で、+ で新しい在庫(1・場所なし)ができる", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  sql(`insert into public.item (household_id, name, item_kind, tracking, unit_id, created_at) values ('${h}', '在庫なしラップ', 'supply', 'count', (select id from public.unit where household_id = '${h}' and name = '個'), now())`);
  await openSupply(page, info);
  await expect(qtyText(page, "在庫なしラップ")).toHaveText("0 個");
  await page.getByRole("button", { name: "在庫なしラップを1つ増やす" }).click();
  await expect(qtyText(page, "在庫なしラップ")).toHaveText("1 個");
  await expect.poll(() => dbStocks(h, "在庫なしラップ")).toMatchObject([{ quantity: 1, location_id: null, expires_on: null }]);
});

test("日用品: 検索(部分一致・全角半角・大文字小文字を区別しない)、ジャンルのチップ、0 件と「条件をクリア」", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  sql(`insert into public.item (household_id, name, item_kind, tracking, stock_level, restock_at_level, supply_genre, created_at) values ('${h}', 'SHAMPOO', 'supply', 'level', 'full', 'low', 'お風呂', now())`);
  await openSupply(page, info);
  const search = page.getByPlaceholder("品物名で探す");
  await expect(search).toBeVisible();
  await search.fill("洗剤");
  await expect(page.getByText("2件 / 10件")).toBeVisible();
  await expect(srow(page, "食器用洗剤")).toBeVisible();
  await expect(srow(page, "トイレットペーパー")).toHaveCount(0);
  await search.fill("ｓｈａｍ"); // 全角の小文字
  await expect(srow(page, "SHAMPOO")).toBeVisible();
  await search.fill("shampoo");
  await expect(page.getByText("1件 / 10件")).toBeVisible();
  // ジャンルのチップ(いま使っている語。最初に使われた順。「すべて」が先頭)
  await search.fill("");
  const chips = (await page.getByRole("group", { name: "ジャンルで絞る" }).getByRole("button").allTextContents()).map((t) => t.replace("✓", ""));
  expect(chips).toEqual(["すべて", "紙類", "洗剤", "キッチン", "お風呂", "洗面所"]);
  await chip(page, "ジャンルで絞る", "洗剤").click();
  await expect(page.getByText("2件 / 10件")).toBeVisible();
  await search.fill("ゴミ");
  await expect(page.getByText("「洗剤」で「ゴミ」に合う日用品はありません")).toBeVisible();
  await page.getByRole("button", { name: "条件をクリア" }).click();
  await expect(search).toBeFocused();
  await expect(page.getByText("10件", { exact: true })).toBeVisible();
  await expect(search).toHaveValue("");
});

// ---- 品物の登録 ----
test("登録: 種別「日用品」(日用品の画面から開くと初期値は日用品・残量)。補充の目安・場所・期限は出ない。保存される", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openSupply(page, info);
  await page.getByRole("link", { name: "品物の登録" }).first().click();
  await expect(page.locator("h1")).toHaveText("品物の登録");
  await expect(page.getByRole("group", { name: "品物の種類" }).getByRole("button", { name: "日用品" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "管理のしかた" }).getByRole("button", { name: "残量で管理" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("補充の目安")).toHaveCount(0);
  await expect(page.getByText("場所", { exact: true })).toHaveCount(0);
  await expect(page.getByText("期限", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("備考")).toBeVisible();

  // ジャンルは必須でない。ジャンルなし・備考なしで残量の日用品を登録
  await typeIn(page.locator("#item-new-name"), "サランラップ");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("サランラップを登録しました")).toBeVisible();
  await expect.poll(() => dbItem(h, "サランラップ")).toMatchObject({ item_kind: "supply", tracking: "level", stock_level: "full", supply_genre: null, note: null, genre_id: null, location_id: null });
  expect(dbStocks(h, "サランラップ")).toEqual([]);

  // 数の日用品(ジャンルは候補のチップ、備考あり)。在庫は場所なし・期限なし
  await typeIn(page.locator("#item-new-name"), "重ね洗いスポンジ");
  await chip(page, "管理のしかた", "数で管理").click();
  await chip(page, "単位", "個").click();
  await typeIn(page.locator("#item-new-qty"), "3");
  await chip(page, "ジャンルの候補", "キッチン").click();
  await typeIn(page.locator("#item-new-note"), "3個入り\n緑");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("重ね洗いスポンジを登録しました")).toBeVisible();
  await expect.poll(() => dbItem(h, "重ね洗いスポンジ")).toMatchObject({ item_kind: "supply", tracking: "count", supply_genre: "キッチン", note: "3個入り\n緑", unit: "個", genre_id: null, location_id: null });
  expect(dbStocks(h, "重ね洗いスポンジ")).toMatchObject([{ quantity: 3, location_id: null, expires_on: null }]);
  // 種別は登録のあとも日用品のまま
  await expect(page.getByRole("group", { name: "品物の種類" }).getByRole("button", { name: "日用品" })).toHaveAttribute("aria-pressed", "true");

  // 日用品の画面に出る(登録順の最後)
  await page.getByRole("link", { name: "もどる" }).click();
  await expect(page.locator("h1")).toHaveText("日用品");
  await expect(srow(page, "重ね洗いスポンジ")).toContainText("キッチン · 3個入り 緑");
  await page.reload();
  await expect(srow(page, "サランラップ")).toBeVisible();
});

test("登録: 候補を選ぶと前回の値(種別・ジャンル・備考)。今の数に足す。別の種別の同じ名前は誤り。単位の誤りと、合計 0 なら単位を変えて登録", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  seedStock(h);
  await openStock(page, info, 1, SUITE);
  await page.goto("stock/item-new/?from=supply");
  // 別の種別の同じ名前(牛乳は食材): 誤り。候補には食材の印
  await typeIn(page.locator("#item-new-name"), "牛乳");
  await expect(page.getByRole("region", { name: "品物名の候補" })).toContainText("食材");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("「牛乳」は食材にあります。候補から選んでください。")).toBeVisible();
  // 候補から選ぶと食材に切り替わり、その品物の値が入る
  await page.getByRole("region", { name: "品物名の候補" }).getByRole("button", { name: /牛乳/ }).click();
  await expect(page.getByRole("group", { name: "品物の種類" }).getByRole("button", { name: "食材" })).toHaveAttribute("aria-pressed", "true");

  // 日用品の候補を選ぶと前回のジャンル・備考が入る
  await typeIn(page.locator("#item-new-name"), "洗濯用");
  await page.getByRole("region", { name: "品物名の候補" }).getByRole("button", { name: /洗濯用洗剤/ }).click();
  await expect(page.getByRole("group", { name: "品物の種類" }).getByRole("button", { name: "日用品" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#item-new-genre")).toHaveValue("洗剤");
  await expect(page.getByRole("group", { name: "単位" }).getByRole("button", { name: "本" })).toHaveAttribute("aria-pressed", "true");
  // 今の数(2)に 3 を足す → 5。購入日は書き換わる
  await typeIn(page.locator("#item-new-qty"), "3");
  await typeIn(page.locator("#item-new-purchased"), "2026-10-25");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("洗濯用洗剤を登録しました")).toBeVisible();
  await expect.poll(() => dbStocks(h, "洗濯用洗剤").map((s) => s.quantity)).toEqual([5]);
  expect(dbStocks(h, "洗濯用洗剤")[0].purchased_on).toBe("2026-10-25");
  expect(dbStocks(h, "洗濯用洗剤")).toHaveLength(1);

  // 今の数が 0 より大きいのに単位が違う: 誤り
  await typeIn(page.locator("#item-new-name"), "洗濯用洗剤");
  await page.getByRole("region", { name: "品物名の候補" }).getByRole("button", { name: /洗濯用洗剤/ }).click();
  await chip(page, "単位", "個").click();
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("洗濯用洗剤の在庫は「本」で数えています。")).toBeVisible();
  // 管理のしかたが違う誤り
  await chip(page, "管理のしかた", "残量で管理").click();
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("洗濯用洗剤は「数で管理」の品物です。")).toBeVisible();

  // 今の数が 0 なら、単位を変えて登録できる(ボディソープの詰め替えは 0 本)
  await typeIn(page.locator("#item-new-name"), "ボディソープ");
  await page.getByRole("region", { name: "品物名の候補" }).getByRole("button", { name: /ボディソープの詰め替え/ }).click();
  await chip(page, "単位", "個").click();
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("ボディソープの詰め替えを登録しました")).toBeVisible();
  await expect.poll(() => dbItem(h, "ボディソープの詰め替え")?.unit).toBe("個");
  await expect.poll(() => dbStocks(h, "ボディソープの詰め替え").map((s) => s.quantity)).toEqual([1]);
});

test("登録の誤り: 空のまま登録・個数・単位(日用品)", async ({ page }, info) => {
  await openStock(page, info, 1, SUITE);
  await page.goto("stock/item-new/?from=supply");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("品物名を入れてください")).toBeVisible();
  await typeIn(page.locator("#item-new-name"), "ためし");
  await chip(page, "管理のしかた", "数で管理").click();
  await typeIn(page.locator("#item-new-qty"), "0");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("0 より大きい数を入れてください")).toBeVisible();
  await expect(page.getByText("単位を選んでください")).toBeVisible();
});

// ---- 品物の一覧 ----
test("品物の一覧: 食材 / 日用品の切り替えと件数、ジャンルなしのまとまり。編集から戻っても選んだ種別が続く", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  seedStock(h);
  await openSupply(page, info);
  await page.getByRole("link", { name: "品物", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("品物の一覧");
  const kind = page.getByRole("group", { name: "品物の種別" });
  // iPad 横のサイドバーの「品物」は来た元を付けない(既定 = 食材)。それ以外は日用品の画面から来たので日用品
  if (info.project.name === "ipad-landscape") {
    await expect(kind.getByRole("button", { name: "食材" })).toHaveAttribute("aria-pressed", "true");
    await kind.getByRole("button", { name: "日用品" }).click();
  }
  await expect(kind.getByRole("button", { name: "日用品" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("9件", { exact: true })).toBeVisible();
  const heads = await page.getByRole("heading", { level: 2 }).allTextContents();
  expect(heads).toEqual(["紙類", "洗剤", "キッチン", "お風呂", "洗面所", "ジャンルなし"]);
  await expect(page.getByText("補充の目安")).toHaveCount(0);
  // 食材に切り替え(履歴を増やさない)
  await kind.getByRole("button", { name: "食材" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "卵・乳製品" })).toBeVisible();
  await expect(page.getByText("15件", { exact: true })).toBeVisible();
  await kind.getByRole("button", { name: "日用品" }).click();
  // 編集に行って戻る: 選んだ種別(日用品)が続く
  await page.getByRole("link", { name: "食器用洗剤を編集" }).click();
  await expect(page.locator("h1")).toHaveText("品物の編集");
  await page.getByRole("link", { name: "もどる" }).click();
  await expect(page.locator("h1")).toHaveText("品物の一覧");
  await expect(kind.getByRole("button", { name: "日用品" })).toHaveAttribute("aria-pressed", "true");
  // いつもの の付け外し(日用品)が保存される
  await page.getByRole("button", { name: "食器用洗剤をいつものにする" }).click();
  await expect.poll(() => dbItem(h, "食器用洗剤")?.is_regular).toBe(true);
  // 削除と元に戻す(日用品)
  await page.getByRole("button", { name: "ゴミ袋を削除" }).click();
  await expect(page.getByText("ゴミ袋を削除しました")).toBeVisible();
  await expect.poll(() => dbItem(h, "ゴミ袋")).toBeUndefined();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.getByRole("link", { name: "ゴミ袋を編集" })).toBeVisible();
  await expect.poll(() => dbItem(h, "ゴミ袋")).toMatchObject({ item_kind: "supply", supply_genre: "キッチン", note: "45L" });
});

// ---- 品物の編集(日用品) ----
test("編集(日用品): ジャンル・備考・数を直す。ジャンルを直すと、使われなくなった語は候補とチップから消える。保存される", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openSupply(page, info);
  await page.getByRole("link", { name: "歯みがき粉を編集" }).click();
  await expect(page.locator("h1")).toHaveText("品物の編集");
  await expect(page.locator("main").getByText("日用品", { exact: true })).toBeVisible();
  await expect(page.getByText("補充の目安")).toHaveCount(0);
  await expect(page.getByText("場所", { exact: true })).toHaveCount(0); // 日用品は場所を持たない
  await expect(page.locator("#edit-genre")).toHaveValue("洗面所");
  // ジャンルを新しい語に: 「洗面所」はこの品物だけが使っていたので候補から消える
  await page.locator("#edit-genre").fill("お口");
  await page.locator("#edit-genre").blur();
  await expect.poll(() => dbItem(h, "歯みがき粉")?.supply_genre).toBe("お口");
  await expect(chip(page, "ジャンルの候補", "洗面所")).toHaveCount(0);
  await expect(chip(page, "ジャンルの候補", "お口")).toBeVisible();
  // 欄に打った語で候補は絞られる。欄を空にすると全部の候補が出て、チップを押すとその語になる
  await page.locator("#edit-genre").fill("");
  await page.locator("#edit-genre").blur();
  await expect.poll(() => dbItem(h, "歯みがき粉")?.supply_genre).toBeNull();
  await chip(page, "ジャンルの候補", "洗剤").click();
  await expect.poll(() => dbItem(h, "歯みがき粉")?.supply_genre).toBe("洗剤");
  // ジャンルを空にしても誤りは出ない → ジャンルなし
  await page.locator("#edit-genre").fill("");
  await page.locator("#edit-genre").blur();
  await expect.poll(() => dbItem(h, "歯みがき粉")?.supply_genre).toBeNull();
  await expect(page.getByText("ジャンルを選んでください")).toHaveCount(0);
  // 備考
  await page.locator("#edit-note").fill("  ミント味 ");
  await page.locator("#edit-note").blur();
  await expect.poll(() => dbItem(h, "歯みがき粉")?.note).toBe("ミント味");
  await page.reload();
  await expect(page.locator("#edit-note")).toHaveValue("ミント味");
  // 残量(○ / △ / ×)だけ。場所は無い
  await page.getByRole("group", { name: "残量" }).getByRole("button", { name: "残量 ×" }).click();
  await expect.poll(() => dbItem(h, "歯みがき粉")?.stock_level).toBe("out");

  // 数の日用品: 在庫は 1 ブロック(数と単位だけ)。0 にすると使い切りました + 元に戻す、ブロックは「0」で残る
  await page.goto("stock/supply/");
  await page.getByRole("link", { name: "洗濯用洗剤を編集" }).click();
  await expect(page.getByRole("button", { name: /を使い切り$/ })).toHaveCount(0);
  const qty = page.getByLabel("洗濯用洗剤の数", { exact: true });
  await expect(qty).toHaveValue("2");
  await qty.fill("0");
  await qty.blur();
  await expect(page.getByText("洗濯用洗剤を使い切りました")).toBeVisible();
  await expect.poll(() => dbStocks(h, "洗濯用洗剤").map((s) => s.quantity)).toEqual([0]);
  await expect(qty).toHaveValue("0");
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(qty).toHaveValue("2");
  await expect.poll(() => dbStocks(h, "洗濯用洗剤").map((s) => s.quantity)).toEqual([2]);
  await page.getByRole("button", { name: "洗濯用洗剤の数を1増やす" }).click();
  await expect.poll(() => dbStocks(h, "洗濯用洗剤").map((s) => s.quantity)).toEqual([3]);
});

test("編集(日用品): 管理のしかた(残量 → 数で 0 個の在庫ができて行が残る)、削除と元に戻す、来た元へ戻る", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openSupply(page, info);
  await page.getByRole("link", { name: "ゴミ袋を編集" }).click();
  await page.getByRole("button", { name: "数で管理に変える" }).click();
  await chip(page, "パネルの単位", "枚").click();
  await typeIn(page.locator("#edit-panel-qty"), "0");
  await page.getByRole("button", { name: "変える" }).click();
  await expect(page.getByText("ゴミ袋を数で管理に変えました")).toBeVisible();
  await expect.poll(() => dbItem(h, "ゴミ袋")).toMatchObject({ tracking: "count", unit: "枚", stock_level: null });
  await expect.poll(() => dbStocks(h, "ゴミ袋")).toMatchObject([{ quantity: 0, location_id: null, expires_on: null }]);
  await expect(page.getByLabel("ゴミ袋の数", { exact: true })).toHaveValue("0");
  // 元に戻す: 残量 ○ に戻り、在庫は無くなる
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect.poll(() => dbItem(h, "ゴミ袋")).toMatchObject({ tracking: "level", stock_level: "full" });
  await expect.poll(() => dbStocks(h, "ゴミ袋")).toEqual([]);
  // もう一度、数に変えて、日用品の画面に戻ると 0 の行が残っている
  await page.getByRole("button", { name: "数で管理に変える" }).click();
  await chip(page, "パネルの単位", "枚").click();
  await typeIn(page.locator("#edit-panel-qty"), "0");
  await page.getByRole("button", { name: "変える" }).click();
  await expect.poll(() => dbStocks(h, "ゴミ袋").length).toBe(1);
  await page.getByRole("link", { name: "もどる" }).click();
  await expect(page.locator("h1")).toHaveText("日用品");
  await expect(qtyText(page, "ゴミ袋")).toHaveText("0 枚");

  // 削除 → 来た元(日用品)へ戻り、元に戻せる
  await page.getByRole("link", { name: "ハンドソープを編集" }).click();
  await page.getByRole("button", { name: "品物を削除" }).click();
  await expect(page.locator("h1")).toHaveText("日用品");
  await expect(page.getByText("ハンドソープを削除しました")).toBeVisible();
  await expect.poll(() => dbItem(h, "ハンドソープ")).toBeUndefined();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.getByRole("link", { name: "ハンドソープを編集" })).toBeVisible();
  await expect.poll(() => dbItem(h, "ハンドソープ")).toBeDefined();
});

// ---- いつもの ----
test("いつもの のカード: 日用品の行(数の日用品が 0 のとき「在庫なし」、残量、在庫 N 単位)。食材と混ぜた作った順。品物名は編集へ", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  seedStock(h);
  setRegular(h, ["牛乳", "トイレットペーパー", "ボディソープの詰め替え", "洗濯用洗剤", "食器用洗剤"]);
  await openStock(page, info, 1, SUITE);
  const regular = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "いつもの", exact: true }) });
  await expect(regular).toContainText("5件");
  const rows = await regular.locator("li").allInnerTexts();
  const names = rows.map((t) => t.split("\n")[0]);
  expect(names).toEqual(["牛乳", "トイレットペーパー", "食器用洗剤", "ボディソープの詰め替え", "洗濯用洗剤"]);
  await expect(regular.locator("li", { hasText: "トイレットペーパー" })).toContainText("残量 ○");
  await expect(regular.locator("li", { hasText: "ボディソープの詰め替え" })).toContainText("在庫なし");
  await expect(regular.locator("li", { hasText: "洗濯用洗剤" })).toContainText("在庫 2本");
  await regular.getByRole("link", { name: "洗濯用洗剤を編集" }).click();
  await expect(page.locator("#edit-name")).toHaveValue("洗濯用洗剤");
  await page.getByRole("link", { name: "もどる" }).click();
  await expect(page.locator("h1")).toHaveText("もっちり倉庫");
  // 日用品は食材の一覧(場所別・ジャンル別)には出ない
  await expect(page.getByRole("link", { name: "歯みがき粉を編集" })).toHaveCount(0);
});

// ---- オフライン ----
test("オフライン: 日用品の操作が止まり(押すと通知)、検索とリンクは使える。電波が戻ると読み直される", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openSupply(page, info);
  await expect(levelButton(page, "トイレットペーパー")).toBeVisible();
  await goOffline(page);
  const card = page.getByRole("status").filter({ hasText: "電波がありません" });
  await expect(card).toContainText("日用品は見られますが、変えられません。電波のある所で操作してください。");
  // aria-disabled のボタンは見た目も押せる状態のまま(薄くしない)。Playwright は押せないとみなすので force で押す
  await levelButton(page, "トイレットペーパー").click({ force: true });
  await expect(page.getByText("電波のある所で操作してください", { exact: true }).last()).toBeVisible();
  await expect(levelButton(page, "トイレットペーパー")).toHaveText("○");
  await page.getByRole("button", { name: "洗濯用洗剤を1つ増やす" }).click({ force: true });
  await expect(qtyText(page, "洗濯用洗剤")).toHaveText("2 本");
  expect(dbItem(h, "トイレットペーパー")?.stock_level).toBe("full");
  expect(dbStocks(h, "洗濯用洗剤")[0].quantity).toBe(2);
  // 押せる見た目のまま
  expect(await levelButton(page, "トイレットペーパー").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  // 検索は使える
  await page.getByPlaceholder("品物名で探す").fill("ゴミ");
  await expect(page.getByText("1件 / 9件")).toBeVisible();
  // 切れている間に相手が変えた: 戻ったとき、黙って読み直される
  sql(`update public.item set stock_level = 'out' where household_id = '${h}' and name = 'トイレットペーパー'`);
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toHaveCount(0);
  await page.getByRole("button", { name: "検索をクリア" }).click();
  await expect(levelButton(page, "トイレットペーパー")).toHaveText("×", wait);
});

// ---- 2人の反映(PT-03、ST-D02)。待つ上限は 10 秒 ----
test("2人の反映: 日用品の残量の 1 タップ・数の ±・ジャンルの変更・登録・削除が、もう一方に再読み込みなしで出る", async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const h = stockHousehold(info, SUITE);
  await openSupply(page, info, 1);
  const contextB = await browser.newContext(contextOptions(info.project.use));
  const pageB = await contextB.newPage();
  await openSupply(pageB, info, 2);

  await levelButton(page, "ゴミ袋").click();
  await expect(levelButton(pageB, "ゴミ袋")).toHaveText("△", wait);
  await pageB.getByRole("button", { name: "洗濯用洗剤を1つ増やす" }).click();
  await expect(qtyText(page, "洗濯用洗剤")).toHaveText("3 本", wait);
  await page.getByRole("button", { name: "洗濯用洗剤を1つ減らす" }).click();
  await expect(qtyText(pageB, "洗濯用洗剤")).toHaveText("2 本", wait);

  // 0 にしても行は相手にも残る
  await page.getByRole("button", { name: "シャンプーの詰め替えを1つ減らす" }).click();
  await expect(qtyText(pageB, "シャンプーの詰め替え")).toHaveText("0 本", wait);

  // ジャンルの変更: A が編集で変えると、B のチップと補足が黙って変わる。B が選んでいたチップの語が消えたら「すべて」に戻る
  await chip(pageB, "ジャンルで絞る", "洗面所").click();
  await expect(pageB.getByText("1件 / 9件")).toBeVisible();
  await page.getByRole("link", { name: "歯みがき粉を編集" }).click();
  await page.locator("#edit-genre").fill("お口");
  await page.locator("#edit-genre").blur();
  await expect(chip(pageB, "ジャンルで絞る", "お口")).toBeVisible(wait);
  await expect(chip(pageB, "ジャンルで絞る", "洗面所")).toHaveCount(0);
  await expect(pageB.getByText("9件", { exact: true })).toBeVisible(); // 「すべて」に戻った
  await expect(chip(pageB, "ジャンルで絞る", "すべて")).toHaveAttribute("aria-pressed", "true");

  // 登録 → もう一方に出る
  await page.getByRole("link", { name: "もどる" }).click();
  await page.getByRole("link", { name: "品物の登録" }).first().click();
  await typeIn(page.locator("#item-new-name"), "固形石けん");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("固形石けんを登録しました")).toBeVisible();
  await expect(srow(pageB, "固形石けん")).toBeVisible(wait);
  expect(dbItem(h, "固形石けん")).toBeDefined();

  // 削除 → もう一方から消える
  await page.getByRole("link", { name: "もどる" }).click();
  await page.getByRole("link", { name: "ゴミ袋を編集" }).click();
  await page.getByRole("button", { name: "品物を削除" }).click();
  await expect(srow(pageB, "ゴミ袋")).toHaveCount(0, wait);
  await contextB.close();
});

test("2人が同時に同じ数の日用品を ±: 後に保存された値が残り、2人の画面がそろう。行が消えた品物への操作は知らせが出る", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const h = stockHousehold(info, SUITE);
  await openSupply(page, info, 1);
  const contextB = await browser.newContext(contextOptions(info.project.use));
  const pageB = await contextB.newPage();
  await openSupply(pageB, info, 2);
  await Promise.all([
    page.getByRole("button", { name: "洗濯用洗剤を1つ増やす" }).click(),
    pageB.getByRole("button", { name: "洗濯用洗剤を1つ増やす" }).click(),
  ]);
  await expect.poll(async () => `${await qtyText(page, "洗濯用洗剤").innerText()}/${await qtyText(pageB, "洗濯用洗剤").innerText()}`, wait).toMatch(/^([34] 本)\/\1$/);
  const quantity = dbStocks(h, "洗濯用洗剤")[0].quantity;
  expect(quantity === 3 || quantity === 4).toBe(true); // 足し合わせない(後勝ち)
  await contextB.close();
});

test("相手が先に品物を削除していたら(Realtime が届かないとき)、行が消えて知らせが出る", async ({ page, context }, info) => {
  const h = stockHousehold(info, SUITE);
  await context.routeWebSocket(/realtime/, () => {});
  await openSupply(page, info);
  sql(`delete from public.item where household_id = '${h}' and name = 'ゴミ袋'`);
  await levelButton(page, "ゴミ袋").click();
  await expect(page.getByText("ゴミ袋は、もう削除されていました")).toBeVisible();
  await expect(srow(page, "ゴミ袋")).toHaveCount(0);
});

// ---- 世帯の分離(NF-02) ----
test("世帯の分離: B1 の token で直接呼んでも、A の日用品(ジャンル・備考・残量・在庫)は読めず、書けない", async ({}, info) => {
  const h = stockHousehold(info, SUITE);
  const itemId = dbItem(h, "トイレットペーパー")!.id;
  const countId = dbItem(h, "洗濯用洗剤")!.id;
  const { url, key } = supabaseApi();
  const b1 = createClient(url, key, { auth: { persistSession: false } });
  const { email, password } = credentials("B1");
  expect((await b1.auth.signInWithPassword({ email, password })).error).toBeNull();

  const read = await b1.from("item").select("id, supply_genre, note").eq("household_id", h);
  expect(read.error).toBeNull();
  expect(read.data).toEqual([]);
  const upd = await b1.from("item").update({ supply_genre: "のっとり", note: "x", stock_level: "out" }).eq("id", itemId).select();
  expect(upd.error).toBeNull();
  expect(upd.data).toEqual([]);
  const ins = await b1.from("item").insert({ household_id: h, name: "もぐりこみ", item_kind: "supply", tracking: "level", stock_level: "full", supply_genre: "x" });
  expect(ins.error?.code).toBe("42501");
  const st = await b1.from("item_stock").update({ quantity: 99 }).eq("item_id", countId).select();
  expect(st.error).toBeNull();
  expect(st.data).toEqual([]);
  const del = await b1.from("item").delete().eq("id", itemId).select();
  expect(del.data).toEqual([]);
  expect(dbItem(h, "トイレットペーパー")).toMatchObject({ supply_genre: "紙類", note: "12ロール", stock_level: "full" });
  expect(dbStocks(h, "洗濯用洗剤")[0].quantity).toBe(2);
  await b1.removeAllChannels();
});
