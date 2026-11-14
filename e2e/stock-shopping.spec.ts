import { expect, test, type BrowserContextOptions, type Locator, type Page } from "@playwright/test";
import { findBottomOverlap, findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";
import { sql } from "./db";
import { openShoppingList, openSupply, resetMasters, resetShopping, seedStock, seedSupplies, stockHousehold } from "./stock-helpers";

// 倉庫 run 3b(stock-shopping)の E2E(30_architecture.md Interfaces §12): 買い物リスト・買い物メモ・在庫登録・補充の目安・タブとサイドバー・R3-16。
// part 1 の範囲(オンライン + 記憶の中の行列)。端末への保存・service worker・電波の無い起動は part 2、R3-11 の 6 秒の控えは part 3。
// 世帯は project ごとの L-<project>(run 1〜3a の世帯とは別)。ファイルの中は順に流し、各テストの始めに品物・買い物リスト・メモを初期の状態にする。
// どの変更も、画面で見えるだけでなく DB に保存されている(poll)ことを確かめる。
test.describe.configure({ mode: "serial" });
const SUITE = "shopping" as const;
const wait = { timeout: 10_000 };

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const rowOf = (page: Page, name: string) => page.locator("li", { has: page.getByRole("button", { name: `${name}を外す` }) });
const qty = (page: Page, name: string) => page.getByRole("textbox", { name: `${name}の個数` });
const checkbox = (page: Page, name: string) => rowOf(page, name).getByRole("checkbox");
/** 画面に見えている方の入力欄(スマホ・iPad 縦は下の帯、iPad 以上はリストの上) */
const addInput = (page: Page) => page.locator('input[id^="shopping-add-"]:visible');
const addButton = (page: Page) => page.locator('form:has(input[id^="shopping-add-"]:visible)').getByRole("button", { name: "追加" });
async function addManual(page: Page, name: string) {
  await addInput(page).fill(name);
  await addButton(page).click();
}
/** 入力して欄を外す(文字を打つ間は下の帯が隠れる = 「登録する」が見えなくなるため) */
async function typeIn(locator: Locator, value: string) {
  await locator.fill(value);
  await locator.blur();
}
async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
}
async function goOnline(page: Page) {
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}
function contextOptions(use: Record<string, unknown>): BrowserContextOptions {
  const keys = ["viewport", "userAgent", "deviceScaleFactor", "isMobile", "hasTouch", "baseURL"];
  return Object.fromEntries(keys.filter((k) => k in use).map((k) => [k, use[k]])) as BrowserContextOptions;
}

type DbEntry = { id: string; name: string; source: string; is_checked: boolean; is_dismissed: boolean; prev_stock_level: string | null; deleted_at: string | null; item_id: string | null };
/** 生きている行(削除の印の無いもの) */
const dbEntries = (h: string) =>
  sql(`select id, name, source, is_checked, is_dismissed, prev_stock_level, deleted_at, item_id from public.shopping_list where household_id = '${h}' and deleted_at is null order by created_at, id`) as DbEntry[];
const dbEntry = (h: string, name: string) => dbEntries(h).find((e) => e.name === name);
const dbItem = (h: string, name: string) =>
  sql(`select id, stock_level, purchased_on::text as purchased_on, restock_at_count::float8 as restock_at_count, restock_at_level, tracking, item_kind from public.item where household_id = '${h}' and name = ${q(name)}`)[0] as
    | { id: string; stock_level: string | null; purchased_on: string | null; restock_at_count: number | null; restock_at_level: string | null; tracking: string; item_kind: string }
    | undefined;
const dbStocks = (h: string, name: string) =>
  sql(
    `select s.quantity::float8 as quantity, s.purchased_on::text as purchased_on, s.expires_on::text as expires_on from public.item_stock s
     join public.item i on i.id = s.item_id where s.household_id = '${h}' and i.name = ${q(name)} order by s.created_at, s.id`,
  ) as { quantity: number; purchased_on: string; expires_on: string | null }[];
const dbMemo = (h: string) => String(sql(`select body from public.shopping_memo where household_id = '${h}'`)[0]?.body ?? "");

test.beforeEach(async ({}, info) => {
  const household = stockHousehold(info, SUITE);
  resetMasters(household);
  resetShopping(household);
  // 品物の入れ方は 3a までと同じ(残量の品物の目安は △で、数の品物は なし)。しょうゆ(残量 △)は自動で「減った」として載る
  seedStock(household);
});

// ---- タブとサイドバー(R3-5) ----
test("タブ3つ(スマホ・iPad 縦)・サイドバー5項目(iPad 横)。買い物リストで選ばれた見た目になり、メモ・在庫登録でも買い物リストが選ばれる", async ({ page }, info) => {
  const landscape = info.project.name === "ipad-landscape";
  await openShoppingList(page, info);
  const nav = page.getByRole("navigation", { name: "倉庫の画面" });
  await expect(nav.getByRole("link", { name: "買い物リスト" })).toHaveAttribute("aria-current", "page");
  const labels = await nav.getByRole("link").allInnerTexts();
  expect(labels.map((t) => t.trim())).toEqual(landscape ? ["食材", "日用品", "買い物リスト", "品物", "マスタ"] : ["食材", "日用品", "買い物リスト"]);
  // 買い物リスト → 食材 → 買い物リスト
  await nav.getByRole("link", { name: "食材" }).click();
  await expect(page.locator("h1")).toHaveText("もっちり倉庫");
  await nav.getByRole("link", { name: "買い物リスト" }).click();
  await expect(page.locator("h1")).toHaveText("買い物リスト");
  // 在庫登録(サブ画面)。iPad 横ではサイドバーの買い物リストが選ばれたまま、ほかはタブが無い
  await addManual(page, "豆乳");
  await expect(rowOf(page, "豆乳")).toBeVisible();
  await checkbox(page, "豆乳").click();
  await page.getByRole("link", { name: /^在庫に登録/ }).click();
  await expect(page.locator("h1")).toHaveText("在庫に登録");
  if (landscape) await expect(nav.getByRole("link", { name: "買い物リスト" })).toHaveAttribute("aria-current", "page");
  else await expect(nav).toHaveCount(0);
  await page.getByRole("link", { name: "もどる" }).click();
  await expect(page.locator("h1")).toHaveText("買い物リスト");
});

// ---- 自動で載る・外す・戻す ----
test("自動で載る: いつもの・残量の目安 △(しょうゆ)が載り、発生元の印が出る。外す →「元に戻す」で並びごと戻り、保存される。外した行は条件を満たしても作り直されない", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  sql(`update public.item set is_regular = true where household_id = '${h}' and name = '牛乳'`);
  await openShoppingList(page, info);
  await expect(rowOf(page, "牛乳")).toContainText("いつもの");
  await expect(rowOf(page, "しょうゆ")).toContainText("減った");
  await expect(rowOf(page, "マヨネーズ")).toHaveCount(0);
  const before = await page.locator("main ul li").allInnerTexts();

  // 外す → すぐ「元に戻す」(通知は 6 秒で消える。DB の確かめを挟まない)
  await page.getByRole("button", { name: "牛乳を外す" }).click();
  await expect(rowOf(page, "牛乳")).toHaveCount(0);
  await expect(page.getByText("牛乳を外しました")).toBeVisible();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(rowOf(page, "牛乳")).toBeVisible();
  await expect.poll(() => dbEntry(h, "牛乳")?.is_dismissed).toBe(false);
  expect(await page.locator("main ul li").allInnerTexts()).toEqual(before); // 並びも戻る
  // もう一度外す。外した行は、在庫・いつもの が変わっても作り直されない(行は1つのまま、画面には出ない)
  await page.getByRole("button", { name: "牛乳を外す" }).click();
  await expect(rowOf(page, "牛乳")).toHaveCount(0);
  await expect.poll(() => dbEntry(h, "牛乳")?.is_dismissed).toBe(true);
  sql(`update public.item set is_regular = false where household_id = '${h}' and name = '牛乳'`);
  sql(`update public.item set is_regular = true where household_id = '${h}' and name = '牛乳'`);
  expect(dbEntries(h).filter((e) => e.name === "牛乳")).toHaveLength(1);
  await page.reload();
  await expect(rowOf(page, "牛乳")).toHaveCount(0);
  await expect(rowOf(page, "しょうゆ")).toBeVisible();
});

test("手入力: 追加・前後の空白を除く・同じ名前は足さず入力欄に残して知らせる・候補から選べる・外すと消える(元に戻せる)", async ({ page }, info) => {
  test.setTimeout(90_000); // DB の確かめ(CLI)が多く、並列の実行では 30 秒を超えることがある
  const h = stockHousehold(info, SUITE);
  await openShoppingList(page, info);
  await addManual(page, "  豆乳 ");
  await expect(rowOf(page, "豆乳")).toContainText("手入力");
  await expect(addInput(page)).toHaveValue("");
  await expect.poll(() => dbEntry(h, "豆乳")?.source).toBe("manual");
  // 重複: 足さず、入力欄に残し、通知
  await addManual(page, "豆乳");
  await expect(page.getByText("「豆乳」は、もうリストにあります")).toBeVisible();
  await expect(addInput(page)).toHaveValue("豆乳");
  await page.waitForTimeout(300);
  expect(dbEntries(h).filter((e) => e.name === "豆乳")).toHaveLength(1);
  // 空白だけは何もしない
  await addInput(page).fill("   ");
  await addButton(page).click();
  await expect(page.getByText("「」は、もうリストにあります")).toHaveCount(0);
  // 候補(品物の名前の部分一致)
  await addInput(page).fill("ヨーグ");
  await expect(page.getByRole("group", { name: "品物名の候補" }).getByRole("button", { name: "ヨーグルト" })).toBeVisible();
  await page.getByRole("group", { name: "品物名の候補" }).getByRole("button", { name: "ヨーグルト" }).click();
  await expect(rowOf(page, "ヨーグルト")).toContainText("手入力");
  await expect.poll(() => dbEntry(h, "ヨーグルト")?.item_id).toBeNull();
  // 外す(手入力は削除の印)→ すぐ「元に戻す」(通知は 6 秒で消える)
  await page.getByRole("button", { name: "豆乳を外す" }).click();
  await expect(rowOf(page, "豆乳")).toHaveCount(0);
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(rowOf(page, "豆乳")).toBeVisible();
  await expect.poll(() => dbEntry(h, "豆乳")?.name).toBe("豆乳");
  await page.reload();
  await expect(rowOf(page, "豆乳")).toBeVisible();
  await expect(rowOf(page, "ヨーグルト")).toBeVisible();
  // もう一度外すと、削除の印が保存され、再読み込みしても出ない
  await page.getByRole("button", { name: "豆乳を外す" }).click();
  await expect.poll(() => dbEntry(h, "豆乳")).toBeUndefined();
  await page.reload();
  await expect(rowOf(page, "ヨーグルト")).toBeVisible();
  await expect(rowOf(page, "豆乳")).toHaveCount(0);
});

// ---- チェックで残量 ○(ST-D03) ----
test("チェック: 行は動かず、残量の品物(しょうゆ)は ○ になり購入日が入る。外すと前の残量(△)に戻る。保存される", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openShoppingList(page, info);
  await addManual(page, "豆乳");
  await expect(rowOf(page, "豆乳")).toBeVisible();
  const order = await page.locator("main ul li").allInnerTexts();
  await checkbox(page, "しょうゆ").click();
  await expect(checkbox(page, "しょうゆ")).toBeChecked();
  expect(await page.locator("main ul li").allInnerTexts()).toEqual(order); // チェックしても動かない
  await expect.poll(() => dbItem(h, "しょうゆ")?.stock_level).toBe("full");
  const item = dbItem(h, "しょうゆ");
  expect(item?.purchased_on).toBe("2026-10-23".replace("2026-10-23", String(sql("select (now() at time zone 'Asia/Tokyo')::date::text as d")[0].d)));
  expect(dbEntry(h, "しょうゆ")).toMatchObject({ is_checked: true, prev_stock_level: "low" });
  await page.reload();
  await expect(checkbox(page, "しょうゆ")).toBeChecked();
  await checkbox(page, "しょうゆ").click();
  await expect.poll(() => dbItem(h, "しょうゆ")?.stock_level).toBe("low");
  await expect.poll(() => dbEntry(h, "しょうゆ")?.is_checked).toBe(false);
  // 手入力の行でも、同じ名前の残量の品物は ○ になる(L-06。承認済みモックと違う一点)
  await addManual(page, "マヨネーズ");
  sql(`update public.item set stock_level = 'low' where household_id = '${h}' and name = 'マヨネーズ'`);
  await checkbox(page, "マヨネーズ").click();
  await expect.poll(() => dbItem(h, "マヨネーズ")?.stock_level).toBe("full");
});

// ---- 在庫登録 ----
test("在庫登録: 数の食材(牛乳)に足す・残量の品物(しょうゆ)は名前だけ・新しい品物(豆乳)。確定で行が消え、在庫が増え、しょうゆは ○ のまま", async ({ page }, info) => {
  test.setTimeout(90_000); // DB の確かめ(CLI)が多く、並列の実行では 30 秒を超えることがある(part 2 の全体の実行で1度、時間切れ)
  const h = stockHousehold(info, SUITE);
  await openShoppingList(page, info);
  await addManual(page, "牛乳");
  await addManual(page, "豆乳");
  await checkbox(page, "牛乳").click();
  await checkbox(page, "豆乳").click();
  await checkbox(page, "しょうゆ").click();
  await expect(page.getByRole("link", { name: "在庫に登録(3件)" })).toBeVisible();
  await page.getByRole("link", { name: "在庫に登録(3件)" }).click();
  await expect(page.locator("h1")).toHaveText("在庫に登録");
  // 残量の品物の欄
  await expect(page.getByRole("heading", { name: "残量で管理する品物" })).toBeVisible();
  await expect(page.getByText("在庫には数えません。残量はチェックしたときに ○ になっています。")).toBeVisible();
  // 牛乳: 前回の値(個数 1、期限 = 今日 + 前回の日数 7)
  await expect(qty(page, "牛乳")).toHaveValue("1");
  await expect(page.locator("#ci-exp-" + String(dbEntry(h, "牛乳")?.id))).toHaveValue("2026-10-30");
  await typeIn(qty(page, "牛乳"), "2");
  // 新しい品物: 必須が空だと誤り(ジャンル → 単位)で、何も登録しない
  const confirm = page.getByRole("button", { name: /在庫に登録する$/ });
  await expect(confirm).toHaveText("2件を在庫に登録する");
  await confirm.click();
  await expect(page.getByText("ジャンルを選んでください")).toBeVisible();
  await expect(page.getByText("単位を選んでください")).toBeVisible();
  expect(dbItem(h, "豆乳")).toBeUndefined();
  expect(dbStocks(h, "牛乳")).toHaveLength(2);
  await page.getByLabel("ジャンル", { exact: true }).selectOption({ label: "飲み物" }); // 新しい品物のカードだけにある
  await page.getByRole("group", { name: "豆乳の単位" }).getByRole("button", { name: "本", exact: true }).click();
  await confirm.click();
  await expect(page.locator("h1")).toHaveText("買い物リスト");
  await expect(page.getByText("2件を在庫に登録しました")).toBeVisible();
  // 保存されている
  await expect.poll(() => dbStocks(h, "牛乳").length).toBe(3);
  const stocks = dbStocks(h, "牛乳");
  expect(stocks.at(-1)).toMatchObject({ quantity: 2, expires_on: "2026-10-30" });
  expect(dbItem(h, "豆乳")).toMatchObject({ tracking: "count", item_kind: "food", restock_at_count: null });
  expect(dbStocks(h, "豆乳")).toMatchObject([{ quantity: 1 }]);
  expect(dbItem(h, "しょうゆ")?.stock_level).toBe("full");
  // チェック済みの行が消え、しょうゆ(○ になったので条件を外れた)も載らない
  await expect(rowOf(page, "牛乳")).toHaveCount(0);
  await expect(rowOf(page, "豆乳")).toHaveCount(0);
  await expect(rowOf(page, "しょうゆ")).toHaveCount(0);
  expect(dbEntries(h)).toEqual([]);
});

test("在庫登録: 数の日用品は今の数に足す(R3-18。最初の行に足し、行は増えない)。いつものを確定すると未チェックで戻る", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  seedSupplies(h);
  sql(`update public.item set is_regular = true where household_id = '${h}' and name = '牛乳'`);
  await openShoppingList(page, info);
  await addManual(page, "洗濯用洗剤");
  await checkbox(page, "洗濯用洗剤").click();
  await checkbox(page, "牛乳").click();
  await page.getByRole("link", { name: /^在庫に登録/ }).click();
  await typeIn(qty(page, "洗濯用洗剤"), "3");
  await page.getByRole("button", { name: /在庫に登録する$/ }).click();
  await expect(page.locator("h1")).toHaveText("買い物リスト");
  await expect.poll(() => dbStocks(h, "洗濯用洗剤").map((s) => s.quantity)).toEqual([5]); // 2 + 3 を1行に
  // いつもの の牛乳は、確定で消えて、未チェックの新しい行で戻る
  await expect(rowOf(page, "牛乳")).toBeVisible();
  await expect(checkbox(page, "牛乳")).not.toBeChecked();
  expect(dbEntries(h).filter((e) => e.name === "牛乳")).toMatchObject([{ is_checked: false, source: "regular" }]);
});

// ---- 買い物メモ ----
test("買い物メモ: 打った本文は保存され、再読み込みしても残る(全文を1つの値として上書き)。10000 字まで", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openShoppingList(page, info);
  if (info.project.name === "iphone-portrait" || info.project.name === "ipad-portrait") {
    if (info.project.name === "iphone-portrait") {
      await page.getByRole("link", { name: /買い物メモ/ }).click();
      await expect(page.locator("h1")).toHaveText("買い物メモ");
    }
  }
  const memo = page.getByRole("textbox", { name: "買い物メモ" }).filter({ visible: true });
  await memo.fill("牛乳は低脂肪\n卵は10個入り");
  await expect.poll(() => dbMemo(h)).toBe("牛乳は低脂肪\n卵は10個入り");
  await memo.fill("牛乳は低脂肪");
  await expect.poll(() => dbMemo(h)).toBe("牛乳は低脂肪");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "買い物メモ" }).filter({ visible: true })).toHaveValue("牛乳は低脂肪");
  await expect(page.getByRole("textbox", { name: "買い物メモ" }).filter({ visible: true })).toHaveAttribute("maxlength", "10000");
});

// ---- 補充の目安(R3-9) ----
test("補充の目安: 品物の編集で 切れたら・数で決める・なし を変えると保存され、載る項目が変わる。品物の一覧に補足が出る", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openShoppingList(page, info);
  await expect(rowOf(page, "納豆")).toHaveCount(0);
  const id = dbItem(h, "納豆")?.id;
  await page.goto(`stock/item-edit/?id=${id}&from=stock`);
  const group = page.locator("fieldset[data-restock]").first();
  await expect(group).toBeVisible();
  await group.getByRole("button", { name: "数で決める" }).click();
  await expect(page.getByLabel("補充の目安の数")).toHaveValue("1");
  await expect.poll(() => dbItem(h, "納豆")?.restock_at_count).toBe(1);
  // 納豆の在庫は 1 パック(目安 1 以下)なので、買い物リストに「減った」で載る
  await expect.poll(() => dbEntry(h, "納豆")?.source).toBe("low");
  await group.getByRole("button", { name: "切れたら" }).click();
  await expect.poll(() => dbItem(h, "納豆")?.restock_at_count).toBe(0);
  await expect.poll(() => dbEntry(h, "納豆")).toBeUndefined(); // 在庫が 1 あるので載らない
  await group.getByRole("button", { name: "なし" }).click();
  await expect.poll(() => dbItem(h, "納豆")?.restock_at_count).toBeNull();
  // 数で決める → 数を直して欄を離れると保存される
  await group.getByRole("button", { name: "数で決める" }).click();
  await page.getByLabel("補充の目安の数").fill("2");
  await page.getByLabel("補充の目安の数").blur();
  await expect.poll(() => dbItem(h, "納豆")?.restock_at_count).toBe(2);
  await page.reload();
  await expect(page.getByLabel("補充の目安の数")).toHaveValue("2");
  // 品物の一覧の補足
  await page.goto("stock/items/");
  await expect(page.locator("li", { hasText: "納豆" }).first()).toContainText("目安 2 パック以下");
  await expect(page.locator("li", { hasText: "しょうゆ" }).first()).toContainText("目安 △");
});

test("補充の目安: 品物の登録の欄(既定: 数 = なし、残量 = △で)。登録した値が保存される", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openShoppingList(page, info);
  await page.goto("stock/item-new/?from=stock");
  await expect(page.getByRole("button", { name: "なし", exact: true })).toHaveAttribute("aria-pressed", "true");
  await typeIn(page.locator("#item-new-name"), "バター");
  await page.locator("#item-new-genre").selectOption({ label: "卵・乳製品" });
  await page.getByRole("group", { name: "単位" }).getByRole("button", { name: "個", exact: true }).click();
  await page.getByRole("group", { name: "補充の目安" }).first().getByRole("button", { name: "切れたら" }).click();
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("バターを登録しました")).toBeVisible();
  await expect.poll(() => dbItem(h, "バター")?.restock_at_count).toBe(0);
  // 残量で管理にすると、既定は △で
  await page.getByRole("button", { name: "残量で管理" }).click();
  await expect(page.getByRole("button", { name: "△で" })).toHaveAttribute("aria-pressed", "true");
});

// ---- R3-16 ----
test("R3-16: 相手が品物ごと削除していたら「<名前>は、もう削除されていました」(日用品・食材とも)。在庫だけなら「在庫は、もうありませんでした」", async ({ page, context }, info) => {
  const h = stockHousehold(info, SUITE);
  seedSupplies(h);
  await context.routeWebSocket(/realtime/, () => {});
  await openSupply(page, info, 1, SUITE);
  sql(`delete from public.item where household_id = '${h}' and name = '洗濯用洗剤'`);
  await page.getByRole("button", { name: "洗濯用洗剤を1つ増やす" }).click();
  await expect(page.getByText("洗濯用洗剤は、もう削除されていました")).toBeVisible();
  await expect(page.getByRole("link", { name: "洗濯用洗剤を編集" })).toHaveCount(0);
  // 食材
  await page.goto("stock/");
  await expect(page.getByRole("button", { name: "ヨーグルトを1増やす" })).toBeVisible();
  sql(`delete from public.item where household_id = '${h}' and name = 'ヨーグルト'`);
  await page.getByRole("button", { name: "ヨーグルトを1増やす" }).click();
  await expect(page.getByText("ヨーグルトは、もう削除されていました")).toBeVisible();
  // 在庫だけ消えていた(品物は残る)
  sql(`delete from public.item_stock where household_id = '${h}' and item_id = (select id from public.item where household_id = '${h}' and name = '納豆')`);
  await page.getByRole("button", { name: "納豆を1増やす" }).click();
  await expect(page.getByText("納豆の在庫は、もうありませんでした")).toBeVisible();
});

// ---- 画面の中の行列(part 1 は記憶。端末への保存は part 2) ----
test("電波が無くなっても(画面を開いたまま)チェック・追加・メモができ、まだ送っていない件数が出る。戻ると送られる", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openShoppingList(page, info);
  await expect(rowOf(page, "しょうゆ")).toBeVisible();
  await goOffline(page);
  await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toBeVisible();
  await checkbox(page, "しょうゆ").click();
  await addManual(page, "豆乳");
  await expect(rowOf(page, "豆乳")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "まだ送っていない変更 2件" })).toBeVisible();
  expect(dbEntry(h, "豆乳")).toBeUndefined();
  await goOnline(page);
  await expect.poll(() => dbEntry(h, "豆乳")?.name, wait).toBe("豆乳");
  await expect.poll(() => dbEntry(h, "しょうゆ")?.is_checked, wait).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toHaveCount(0);
  await expect(page.getByText("まだ送っていない変更")).toHaveCount(0);
});

// ---- 2人の反映(ST-L06。Realtime) ----
test("2人: 片方の追加・チェック・外すが、もう片方に10秒以内に出る", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const h = stockHousehold(info, SUITE);
  await openShoppingList(page, info, 1);
  const contextB = await browser.newContext(contextOptions(info.project.use));
  const pageB = await contextB.newPage();
  await openShoppingList(pageB, info, 2);
  await addManual(page, "豆乳");
  await expect(rowOf(pageB, "豆乳")).toBeVisible(wait);
  await checkbox(pageB, "豆乳").click();
  await expect(checkbox(page, "豆乳")).toBeChecked(wait);
  await pageB.getByRole("button", { name: "しょうゆを外す" }).click();
  await expect(rowOf(page, "しょうゆ")).toHaveCount(0, wait);
  await expect.poll(() => dbEntry(h, "しょうゆ")?.is_dismissed).toBe(true);
  await contextB.close();
});

// ---- 検査(3つの画面サイズ。自己テストは checks.spec.ts) ----
test("検査: 買い物リスト・メモ・在庫登録で、横スクロールなし・入力欄 16px 以上・押せる範囲 44px 以上・下の帯と重ならない", async ({ page }, info) => {
  const h = stockHousehold(info, SUITE);
  await openShoppingList(page, info);
  await addManual(page, "豆乳");
  await checkbox(page, "豆乳").click();
  const check = async (label: string) => {
    expect(await findHorizontalOverflow(page), `${label}: 横スクロール`).toBeNull();
    expect(await findSmallInputs(page), `${label}: 小さい入力欄`).toEqual([]);
    expect(await findSmallTapTargets(page), `${label}: 小さい押せる範囲`).toEqual([]);
    expect(await findBottomOverlap(page), `${label}: 下の帯との重なり`).toBeNull();
  };
  await check("買い物リスト");
  await page.goto("stock/shopping-memo/");
  await expect(page.locator("h1")).toHaveText("買い物メモ");
  await check("買い物メモ");
  await page.goto("stock/check-in/");
  await expect(page.locator("h1")).toHaveText("在庫に登録");
  await expect(qty(page, "豆乳")).toBeVisible();
  await check("在庫登録");
  void h;
});
