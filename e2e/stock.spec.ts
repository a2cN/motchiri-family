import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContextOptions, type Page } from "@playwright/test";
import { credentials, loginWith, supabaseApi } from "./auth-helpers";
import { sql } from "./db";
import {
  FIXED_NOW, openStock, resetStock, row, rowQuantityText, seedStock, stockHousehold,
} from "./stock-helpers";

// 倉庫の E2E(30_architecture.md Interfaces §10): 1人の操作、2人の反映、世帯の分離、オフライン、日付。
// 世帯は project ごと(D-21)。ファイルの中は順に流し、各テストの始めに自分の世帯の品物と在庫を消す。
test.describe.configure({ mode: "serial" });

const chip = (page: Page, group: string, text: string) => page.getByRole("group", { name: group }).getByRole("button", { name: text, exact: true });

async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
}
async function goOnline(page: Page) {
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

function dbStock(household: string, name: string): { quantity: number; expires_on: string | null; location: string | null }[] {
  return sql(
    `select s.quantity::float8 as quantity, s.expires_on::text as expires_on, l.name as location
     from public.item_stock s join public.item i on i.id = s.item_id left join public.location l on l.id = s.location_id
     where s.household_id = '${household}' and i.name = '${name}' order by s.created_at`,
  ) as { quantity: number; expires_on: string | null; location: string | null }[];
}
function dbItem(household: string, name: string) {
  return sql(
    `select stock_level, last_expiry_days, tracking, l.name as location from public.item i left join public.location l on l.id = i.location_id
     where i.household_id = '${household}' and i.name = '${name}'`,
  )[0] as { stock_level: string | null; last_expiry_days: number | null; tracking: string; location: string | null } | undefined;
}

test.beforeEach(async ({}, info) => {
  const household = stockHousehold(info);
  resetStock(household);
  seedStock(household);
});

test("一覧: 場所別とジャンル別、期限の印(期限切れ・期限間近)、今日が金曜なら8日間", async ({ page }, info) => {
  await openStock(page, info);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["冷蔵庫", "冷凍庫", "野菜室", "棚"]);
  // 冷蔵庫の中: 期限の近い順 → 期限なし → 残量の行
  const fridge = page.locator("section", { has: page.getByRole("heading", { name: "冷蔵庫" }) });
  const names = await fridge.getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(names).toEqual(["豚こま肉を編集", "牛乳を編集", "ヨーグルトを編集", "納豆を編集", "卵を編集", "牛乳を編集", "マヨネーズを編集"]);
  // 豚こま肉(期限 10/22)は期限切れ、牛乳(10/23 = 今日)と にんじん(10/30 = 金曜 + 7 日)は期限間近、牛乳(11/01)・パスタは印なし
  await expect(row(page, "豚こま肉").getByText("期限切れ")).toBeVisible();
  await expect(row(page, "ほうれん草").getByText("期限切れ")).toBeVisible();
  await expect(row(page, "牛乳").first().getByText("期限間近")).toBeVisible();
  await expect(row(page, "にんじん").getByText("期限間近")).toBeVisible();
  await expect(row(page, "卵").getByText(/期限切れ|期限間近/)).toHaveCount(0); // 10/31 は 8 日後
  await expect(row(page, "パスタ").getByText(/期限切れ|期限間近/)).toHaveCount(0);
  await expect(row(page, "豚こま肉").getByText("期限 10/22(木)")).toBeVisible();
  await expect(row(page, "パスタ").getByText("期限 2027/5/11(火)")).toBeVisible();

  await page.getByRole("button", { name: "ジャンル別" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["野菜・果物", "肉", "卵・乳製品", "冷凍食品", "主食(米・パン・麺)", "調味料", "お菓子", "その他"]);
});

test("期限の印は端末の設定によらず日本時間で数える(米国西海岸の端末でも同じ)", async ({ browser }, info) => {
  const context = await browser.newContext({ ...(contextOptions(info.project.use)), timezoneId: "America/Los_Angeles" });
  const page = await context.newPage();
  await openStock(page, info);
  // 端末の現地は 10/22 の 20:00。現地の日付なら 10/22 の期限は「今日」で期限間近になってしまう
  expect(await page.evaluate(() => new Date().getDate())).toBe(22);
  await expect(row(page, "豚こま肉").getByText("期限切れ")).toBeVisible();
  await expect(row(page, "牛乳").first().getByText("期限間近")).toBeVisible();
  await context.close();
});

test("± で変わって保存され、0 で行が消え、「元に戻す」で戻る(再読み込みしても残る)", async ({ page }, info) => {
  const household = stockHousehold(info);
  await openStock(page, info);
  await expect(await rowQuantityText(page, "ヨーグルト")).toBe("3個");
  await page.getByRole("button", { name: "ヨーグルトを1増やす" }).click();
  await expect(row(page, "ヨーグルト").locator("span.tabular-nums")).toHaveText("4個");
  await expect.poll(() => dbStock(household, "ヨーグルト")[0]?.quantity).toBe(4);
  await page.reload();
  await expect(row(page, "ヨーグルト").locator("span.tabular-nums")).toHaveText("4個");

  // 0.5 のキャベツは − で 0 になって消える
  await page.getByRole("button", { name: "キャベツを1減らす" }).click();
  await expect(row(page, "キャベツ")).toHaveCount(0);
  await expect(page.getByText("キャベツを使い切りました")).toBeVisible();
  await expect.poll(() => dbStock(household, "キャベツ").length).toBe(0);
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(row(page, "キャベツ")).toHaveCount(1);
  await expect(row(page, "キャベツ").locator("span.tabular-nums")).toHaveText("0.5個");
  await expect.poll(() => dbStock(household, "キャベツ")[0]?.quantity).toBe(0.5);
  await page.reload();
  await expect(row(page, "キャベツ")).toHaveCount(1);
});

test("残量の ○→△→×→○ が保存される", async ({ page }, info) => {
  const household = stockHousehold(info);
  await openStock(page, info);
  const button = page.getByRole("button", { name: /^マヨネーズの残量/ });
  await expect(button).toHaveText("○");
  await button.click();
  await expect(button).toHaveText("△");
  await expect.poll(() => dbItem(household, "マヨネーズ")?.stock_level).toBe("low");
  await button.click();
  await expect(button).toHaveText("×");
  await button.click();
  await expect(button).toHaveText("○");
  await expect.poll(() => dbItem(household, "マヨネーズ")?.stock_level).toBe("full");
  await page.reload();
  await expect(page.getByRole("button", { name: /^マヨネーズの残量/ })).toHaveText("○");
});

test("登録: 新しい品物(手数は ①名前 ②ジャンルと単位 ③登録する)、保存され、前回の値が次の登録の初期値になる", async ({ page }, info) => {
  const household = stockHousehold(info);
  await openStock(page, info);
  await page.getByRole("link", { name: "品物の登録" }).first().click();
  await expect(page.locator("h1")).toHaveText("品物の登録");
  await page.getByLabel("品物名").fill("トマト");
  await page.getByLabel("ジャンル").selectOption({ label: "野菜・果物" });
  await expect(chip(page, "場所", "冷蔵庫")).toHaveAttribute("aria-pressed", "true"); // ジャンルの既定の場所
  await chip(page, "単位", "個").click();
  await page.getByLabel("期限").fill("2026-10-30");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("トマトを登録しました")).toBeVisible();
  await expect(page.getByLabel("品物名")).toHaveValue(""); // 欄は初期値に戻り、画面にとどまる
  await expect.poll(() => dbStock(household, "トマト").length).toBe(1);
  expect(dbStock(household, "トマト")[0]).toMatchObject({ quantity: 1, expires_on: "2026-10-30", location: "冷蔵庫" });
  expect(dbItem(household, "トマト")).toMatchObject({ last_expiry_days: 7, tracking: "count", location: "冷蔵庫" });

  // 候補から選ぶと、前回の値(ジャンル・単位・場所)と、購入日 + 前回の日数の期限が入る
  await page.getByLabel("品物名").fill("トマ");
  await page.getByRole("button", { name: "トマト", exact: true }).click();
  await expect(chip(page, "単位", "個")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("ジャンル")).toHaveValue(/.+/);
  await expect(page.getByLabel("期限")).toHaveValue("2026-10-30"); // 購入日 10/23 + 前回の 7 日
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("トマトを登録しました").last()).toBeVisible(); // 前の通知が消える間は2つ見える
  await expect.poll(() => dbStock(household, "トマト").length).toBe(2);

  await page.getByRole("link", { name: "もどる" }).click();
  await expect(row(page, "トマト")).toHaveCount(2);
  await page.reload();
  await expect(row(page, "トマト")).toHaveCount(2);
});

test("登録: 残量で管理の品物は在庫を作らず、残量が一覧に出る", async ({ page }, info) => {
  const household = stockHousehold(info);
  await openStock(page, info);
  await page.goto("stock/item-new/");
  await page.getByLabel("品物名").fill("ケチャップ");
  await chip(page, "管理のしかた", "残量で管理").click();
  await chip(page, "残量", "残量 △").click();
  await page.getByLabel("ジャンル").selectOption({ label: "調味料" });
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("ケチャップを登録しました")).toBeVisible();
  await expect.poll(() => dbItem(household, "ケチャップ")?.stock_level).toBe("low");
  expect(dbStock(household, "ケチャップ")).toEqual([]);
});

test("登録の誤り: 空のまま登録、個数、既存の品物の単位・管理のしかた", async ({ page }, info) => {
  await openStock(page, info);
  await page.goto("stock/item-new/");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("品物名を入れてください")).toBeVisible();
  await expect(page.getByLabel("品物名")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("品物名").fill("みかん");
  await page.getByLabel("ジャンル").selectOption({ label: "野菜・果物" });
  await chip(page, "単位", "個").click();
  for (const [text, message] of [["", "個数を入れてください"], ["abc", "数を入れてください"], ["1.25", "小数は第一位までです"], ["0", "0 より大きい数を入れてください"]] as const) {
    await page.locator("#item-new-qty").fill(text);
    await page.locator("#item-new-qty").blur(); // 文字を打つ間は下の帯が隠れる
    await page.getByRole("button", { name: "登録する" }).click();
    await expect(page.getByText(message)).toBeVisible();
  }
  await page.locator("#item-new-qty").fill("１．５"); // 全角
  await page.locator("#item-new-qty").blur();
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("みかんを登録しました")).toBeVisible();

  // 品物名の欄の return では送信しない
  await page.locator("#item-new-name").fill("ほうれ");
  await page.locator("#item-new-name").press("Enter");
  await expect(page.getByText(/を登録(しました|できませんでした)/).filter({ hasText: "ほうれ" })).toHaveCount(0);
  await expect(page.locator("h1")).toHaveText("品物の登録");
});

test("編集: 数の入力・場所・期限・使い切りと元に戻す。保存される", async ({ page }, info) => {
  const household = stockHousehold(info);
  await openStock(page, info);
  await page.getByRole("link", { name: "ヨーグルトを編集" }).click();
  await expect(page.locator("h1")).toHaveText("品物の編集");
  const qty = page.getByLabel("ヨーグルトの数", { exact: true });
  await qty.fill("7");
  await qty.blur();
  await expect.poll(() => dbStock(household, "ヨーグルト")[0]?.quantity).toBe(7);
  await qty.fill("1.25");
  await qty.blur();
  await expect(page.getByText("小数は第一位までです")).toBeVisible();
  await qty.fill("7");
  await qty.blur();
  await chip(page, "ヨーグルトの場所", "野菜室").click();
  await expect.poll(() => dbStock(household, "ヨーグルト")[0]?.location).toBe("野菜室");
  await page.getByLabel(/^期限$/).fill("2026-11-20");
  await expect.poll(() => dbStock(household, "ヨーグルト")[0]?.expires_on).toBe("2026-11-20");
  await page.getByRole("button", { name: /の期限をクリア/ }).click();
  await expect.poll(() => dbStock(household, "ヨーグルト")[0]?.expires_on).toBeNull();

  await page.getByRole("button", { name: /を使い切り$/ }).click();
  await expect(page.getByText("在庫はありません")).toBeVisible();
  await expect.poll(() => dbStock(household, "ヨーグルト").length).toBe(0);
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.getByLabel("ヨーグルトの数", { exact: true })).toHaveValue("7");
  await expect.poll(() => dbStock(household, "ヨーグルト").length).toBe(1);

  // 数の入力で 0 にしても使い切り
  await page.getByLabel("ヨーグルトの数", { exact: true }).fill("0");
  await page.getByLabel("ヨーグルトの数", { exact: true }).blur();
  await expect(page.getByText("ヨーグルトを使い切りました").last()).toBeVisible();
});

test("編集: 残量の ○ / △ / × と場所", async ({ page }, info) => {
  const household = stockHousehold(info);
  await openStock(page, info);
  await page.getByRole("link", { name: "しょうゆを編集" }).click();
  await chip(page, "残量", "残量 ×").click();
  await expect.poll(() => dbItem(household, "しょうゆ")?.stock_level).toBe("out");
  await chip(page, "しょうゆの場所", "冷蔵庫").click();
  await expect.poll(() => dbItem(household, "しょうゆ")?.location).toBe("冷蔵庫");
});

// ---- 2人の反映(PT-03) ----
function contextOptions(use: Record<string, unknown>): BrowserContextOptions {
  const keys = ["viewport", "userAgent", "deviceScaleFactor", "isMobile", "hasTouch", "baseURL"];
  return Object.fromEntries(keys.filter((k) => k in use).map((k) => [k, use[k]])) as BrowserContextOptions;
}

test("2人の反映: 片方の ±・使い切り・元に戻す・登録・残量が、もう片方に再読み込みなしで出る", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const household = stockHousehold(info);
  await openStock(page, info, 1);
  const contextB = await browser.newContext(contextOptions(info.project.use));
  const pageB = await contextB.newPage();
  await openStock(pageB, info, 2);
  const wait = { timeout: 10_000 };

  await page.getByRole("button", { name: "ヨーグルトを1増やす" }).click();
  await expect(row(pageB, "ヨーグルト").locator("span.tabular-nums")).toHaveText("4個", wait);

  await pageB.getByRole("button", { name: "ヨーグルトを1減らす" }).click();
  await expect(row(page, "ヨーグルト").locator("span.tabular-nums")).toHaveText("3個", wait);

  await page.getByRole("button", { name: "キャベツを1減らす" }).click();
  await expect(row(page, "キャベツ")).toHaveCount(0);
  await expect(row(pageB, "キャベツ")).toHaveCount(0, wait);
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(row(pageB, "キャベツ")).toHaveCount(1, wait);

  await page.getByRole("button", { name: /^マヨネーズの残量/ }).click();
  await expect(pageB.getByRole("button", { name: /^マヨネーズの残量/ })).toHaveText("△", wait);

  await page.getByRole("link", { name: "品物の登録" }).first().click();
  await page.getByLabel("品物名").fill("バナナ");
  await page.getByLabel("ジャンル").selectOption({ label: "野菜・果物" });
  await chip(page, "単位", "本").click();
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("バナナを登録しました")).toBeVisible();
  await expect(row(pageB, "バナナ")).toHaveCount(1, wait);
  expect(dbStock(household, "バナナ")).toHaveLength(1);

  // B が編集の画面を開いているとき、A がその在庫を使い切ると、B の画面は黙って「在庫はありません」になる
  await pageB.getByRole("link", { name: "バナナを編集" }).click();
  await expect(pageB.getByLabel("バナナの数", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "もどる" }).click();
  await page.getByRole("link", { name: "バナナを編集" }).click();
  await page.getByRole("button", { name: /を使い切り$/ }).click();
  await expect(pageB.getByText("在庫はありません")).toBeVisible(wait);
  await contextB.close();
});

test("2人が同時に同じ在庫を ±: 後に保存された値が残り、2人の画面がそろう", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const household = stockHousehold(info);
  await openStock(page, info, 1);
  const contextB = await browser.newContext(contextOptions(info.project.use));
  const pageB = await contextB.newPage();
  await openStock(pageB, info, 2);
  await Promise.all([
    page.getByRole("button", { name: "卵を1増やす" }).click(),
    pageB.getByRole("button", { name: "卵を1増やす" }).click(),
  ]);
  await expect.poll(async () => `${await rowQuantityText(page, "卵")}/${await rowQuantityText(pageB, "卵")}`, { timeout: 10_000 }).toMatch(/^([23]パック)\/\1$/);
  const quantity = dbStock(household, "卵")[0].quantity;
  expect(quantity === 2 || quantity === 3).toBe(true); // 足し合わせない(後勝ち)
  await expect(row(page, "卵").locator("span.tabular-nums")).toHaveText(`${quantity}パック`);
  await contextB.close();
});

test("相手が先に使い切っていたら、行が消えて知らせが出る(Realtime が届かないとき)", async ({ page, context }, info) => {
  const household = stockHousehold(info);
  await context.routeWebSocket(/realtime/, () => {});
  await openStock(page, info);
  sql(`delete from public.item_stock where household_id = '${household}' and item_id = (select id from public.item where household_id = '${household}' and name = '納豆')`);
  await page.getByRole("button", { name: "納豆を1増やす" }).click();
  await expect(page.getByText("納豆の在庫は、もうありませんでした")).toBeVisible();
  await expect(row(page, "納豆")).toHaveCount(0);
});

test("保存の途中で通信が切れたら、値が戻って知らせが出る", async ({ page }, info) => {
  await openStock(page, info);
  await page.route(/\/rest\/v1\/item_stock/, (route) => (route.request().method() === "PATCH" ? route.abort("connectionfailed") : route.continue()));
  await page.getByRole("button", { name: "ヨーグルトを1増やす" }).click();
  await expect(page.getByText("ヨーグルトを保存できませんでした。電波のよい場所で、もう一度お試しください。")).toBeVisible({ timeout: 15_000 });
  await expect(row(page, "ヨーグルト").locator("span.tabular-nums")).toHaveText("3個");
});

test("保存が10秒で打ち切られる", async ({ page }, info) => {
  test.setTimeout(60_000);
  await openStock(page, info);
  await page.route(/\/rest\/v1\/item_stock/, (route) => (route.request().method() === "PATCH" ? new Promise(() => {}) : route.continue()));
  await page.getByRole("button", { name: "ヨーグルトを1増やす" }).click();
  await expect(row(page, "ヨーグルト").locator("span.tabular-nums")).toHaveText("4個");
  await expect(page.getByText("ヨーグルトを保存できませんでした。電波のよい場所で、もう一度お試しください。")).toBeVisible({ timeout: 15_000 });
  await expect(row(page, "ヨーグルト").locator("span.tabular-nums")).toHaveText("3個");
});

// ---- オフライン ----
test("オフライン: カードが出て操作が止まり、電波が戻ると読み直される", async ({ page }, info) => {
  const household = stockHousehold(info);
  await openStock(page, info);
  await expect(page.getByRole("button", { name: "ヨーグルトを1増やす" })).toBeVisible();
  await goOffline(page);
  const card = page.getByRole("status").filter({ hasText: "電波がありません" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("在庫は見られますが、変えられません。電波のある所で操作してください。");
  await page.getByRole("button", { name: "ヨーグルトを1増やす" }).click();
  await expect(page.getByText("電波のある所で操作してください", { exact: true })).toBeVisible();
  await expect(row(page, "ヨーグルト").locator("span.tabular-nums")).toHaveText("3個");
  // 押せる見た目のまま(薄くしない)
  expect(await page.getByRole("button", { name: "ヨーグルトを1増やす" }).evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  expect(dbStock(household, "ヨーグルト")[0].quantity).toBe(3);
  // 切れている間に相手が値を変えた: 戻ったとき、黙って読み直される(カードは消える)
  sql(`update public.item_stock set quantity = 9 where household_id = '${household}' and item_id = (select id from public.item where household_id = '${household}' and name = 'ヨーグルト')`);
  await goOnline(page);
  await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toHaveCount(0);
  await expect(row(page, "ヨーグルト").locator("span.tabular-nums")).toHaveText("9個", { timeout: 10_000 });

  // 登録: 欄は打てて、「登録する」だけが止まる
  await page.goto("stock/item-new/");
  await expect(page.getByRole("button", { name: "登録する" })).toBeVisible();
  await goOffline(page);
  await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toBeVisible();
  await page.locator("#item-new-name").fill("オフライン品");
  await expect(page.locator("#item-new-name")).toHaveValue("オフライン品");
  await page.locator("#item-new-name").blur();
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("電波のある所で操作してください", { exact: true })).toBeVisible();
  expect(dbItem(household, "オフライン品")).toBeUndefined();

  await goOnline(page);
  await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toHaveCount(0);
});

// ---- 世帯の分離(NF-02) ----
test("世帯の分離: 別の世帯の人の画面に品物が出ない", async ({ page }, info) => {
  await page.clock.setFixedTime(FIXED_NOW);
  await loginWith(page, credentials("B1"));
  await page.goto("stock/");
  await expect(page.getByText("食材の在庫はありません")).toBeVisible();
  await expect(page.getByText("ヨーグルト")).toHaveCount(0);
  void info;
});

test("世帯の分離: B1 の token で直接呼んでも、A の行は読めず、書けず、知らせも購読できない", async ({}, info) => {
  const household = stockHousehold(info);
  const stockId = String(sql(`select id from public.item_stock where household_id = '${household}' limit 1`)[0].id);
  const itemId = String(sql(`select id from public.item where household_id = '${household}' limit 1`)[0].id);
  const { url, key } = supabaseApi();
  const b1 = createClient(url, key, { auth: { persistSession: false } });
  const { email, password } = credentials("B1");
  const signedIn = await b1.auth.signInWithPassword({ email, password });
  expect(signedIn.error).toBeNull();

  // 読み取り: 0 行
  for (const table of ["item", "item_stock"] as const) {
    const r = await b1.from(table).select("id").eq("household_id", household);
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
  }
  // 書き込み: A の household_id では 42501、A の在庫の update・delete は 0 行
  const ins = await b1.from("item_stock").insert({ household_id: household, item_id: itemId, quantity: 1 });
  expect(ins.error?.code).toBe("42501");
  const upd = await b1.from("item_stock").update({ quantity: 99 }).eq("id", stockId).select();
  expect(upd.error).toBeNull();
  expect(upd.data).toEqual([]);
  const del = await b1.from("item_stock").delete().eq("id", stockId).select();
  expect(del.data).toEqual([]);
  expect(sql(`select count(*)::int as n from public.item_stock where id = '${stockId}'`)[0].n).toBe(1);
  expect(Number(sql(`select quantity::float8 as q from public.item_stock where id = '${stockId}'`)[0].q)).not.toBe(99);

  // 知らせ: A の世帯のチャンネルは断られ、自分の世帯のチャンネルは購読できる(対照)
  const own = await b1.from("member").select("household_id").single();
  const status = (topic: string) =>
    new Promise<string>((resolve) => {
      const ch = b1.channel(topic, { config: { private: true } });
      const timer = setTimeout(() => resolve("TIMEOUT"), 10_000);
      ch.subscribe((s) => {
        if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          clearTimeout(timer);
          void b1.removeChannel(ch);
          resolve(s);
        }
      });
    });
  expect(await status(`household:${own.data!.household_id}`)).toBe("SUBSCRIBED");
  expect(await status(`household:${household}`)).toBe("CHANNEL_ERROR");
  await b1.removeAllChannels();
});

test("未ログイン(anon)では、倉庫のテーブルを読めない", async ({}, info) => {
  const { url, key } = supabaseApi();
  const anon = createClient(url, key, { auth: { persistSession: false } });
  const r = await anon.from("item").select("id");
  expect(r.error?.code).toBe("42501");
  void info;
});
