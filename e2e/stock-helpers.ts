import fs from "node:fs";
import path from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { loginWith } from "./auth-helpers";
import { sql } from "./db";

// 倉庫の E2E の共通部品(30_architecture.md Interfaces §10)。世帯と利用者は project ごと(e2e/global-setup.ts)。

export const FIXED_NOW = new Date("2026-10-23T12:00:00+09:00"); // 金曜。期限間近の範囲が8日間になる日(40_design_brief.md)

/** suite: "main"(stock.spec.ts。S1・S2)、"shots"(stock-screens.spec.ts。別の世帯。同じ世帯を2つのワーカーが同時に触らないため) */
export type Suite = "main" | "shots";

export function stockWho(info: TestInfo, n: 1 | 2, suite: Suite = "main") {
  const p = info.project.name;
  const email = process.env[suite === "shots" ? `E2E_STOCK_${p}_SH_EMAIL` : `E2E_STOCK_${p}_S${n}_EMAIL`];
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error("倉庫のテストの利用者がありません(e2e/global-setup.ts が作る)");
  return { email, password };
}

export function stockHousehold(info: TestInfo, suite: Suite = "main"): string {
  const id = process.env[suite === "shots" ? `E2E_STOCK_${info.project.name}_SHOTS_HOUSEHOLD_ID` : `E2E_STOCK_${info.project.name}_HOUSEHOLD_ID`];
  if (!id) throw new Error("倉庫のテストの世帯がありません(e2e/global-setup.ts が作る)");
  return id;
}

/** 世帯の品物と在庫を全部消す(マスタは残る。在庫は品物の削除で cascade) */
export function resetStock(household: string) {
  sql(`delete from public.item where household_id = '${household}'`);
}

type Seed = { name: string; tracking: "count" | "level"; unit: string; genre: string; location: string; level?: string; lastExpiryDays?: number };
type SeedStock = { item: string; quantity: number; location: string; expires: string | null };

// 承認済みモックの架空のデータ(docs/design/stock-food/ の画像と同じ)
export const SEED_ITEMS: Seed[] = [
  { name: "豚こま肉", tracking: "count", unit: "g", genre: "肉", location: "冷蔵庫" },
  { name: "牛乳", tracking: "count", unit: "本", genre: "卵・乳製品", location: "冷蔵庫", lastExpiryDays: 7 },
  { name: "ヨーグルト", tracking: "count", unit: "個", genre: "卵・乳製品", location: "冷蔵庫" },
  { name: "卵", tracking: "count", unit: "パック", genre: "卵・乳製品", location: "冷蔵庫" },
  { name: "納豆", tracking: "count", unit: "パック", genre: "その他", location: "冷蔵庫" },
  { name: "マヨネーズ", tracking: "level", unit: "", genre: "調味料", location: "冷蔵庫", level: "full" },
  { name: "冷凍うどん", tracking: "count", unit: "袋", genre: "冷凍食品", location: "冷凍庫" },
  { name: "鶏もも肉", tracking: "count", unit: "g", genre: "肉", location: "冷凍庫" },
  { name: "ほうれん草", tracking: "count", unit: "袋", genre: "野菜・果物", location: "野菜室" },
  { name: "にんじん", tracking: "count", unit: "本", genre: "野菜・果物", location: "野菜室" },
  { name: "キャベツ", tracking: "count", unit: "個", genre: "野菜・果物", location: "野菜室" },
  { name: "パスタ", tracking: "count", unit: "g", genre: "主食(米・パン・麺)", location: "棚" },
  { name: "ポテトチップス", tracking: "count", unit: "袋", genre: "お菓子", location: "棚" },
  { name: "しょうゆ", tracking: "level", unit: "", genre: "調味料", location: "棚", level: "low" },
  { name: "食パン", tracking: "count", unit: "枚", genre: "主食(米・パン・麺)", location: "" },
];
export const SEED_STOCKS: SeedStock[] = [
  { item: "豚こま肉", quantity: 200, location: "冷蔵庫", expires: "2026-10-22" },
  { item: "牛乳", quantity: 1, location: "冷蔵庫", expires: "2026-10-23" },
  { item: "牛乳", quantity: 1, location: "冷蔵庫", expires: "2026-11-01" },
  { item: "ヨーグルト", quantity: 3, location: "冷蔵庫", expires: "2026-10-26" },
  { item: "卵", quantity: 1, location: "冷蔵庫", expires: "2026-10-31" },
  { item: "納豆", quantity: 1, location: "冷蔵庫", expires: "2026-10-28" },
  { item: "冷凍うどん", quantity: 5, location: "冷凍庫", expires: "2026-12-22" },
  { item: "鶏もも肉", quantity: 300, location: "冷凍庫", expires: "2026-11-12" },
  { item: "ほうれん草", quantity: 1, location: "野菜室", expires: "2026-10-21" },
  { item: "にんじん", quantity: 2, location: "野菜室", expires: "2026-10-30" },
  { item: "キャベツ", quantity: 0.5, location: "野菜室", expires: null },
  { item: "パスタ", quantity: 500, location: "棚", expires: "2027-05-11" },
  { item: "ポテトチップス", quantity: 2, location: "棚", expires: "2026-12-02" },
];

const q = (s: string | null | undefined) => (s === null || s === undefined || s === "" ? "null::text" : `'${s.replace(/'/g, "''")}'`);

/** 品物と在庫を入れる(1文。作った順は並びの順) */
export function seedStock(household: string, items: Seed[] = SEED_ITEMS, stocks: SeedStock[] = SEED_STOCKS) {
  const itemValues = items
    .map((i, n) => `(${q(i.name)}, ${q(i.tracking)}, ${q(i.unit)}, ${q(i.genre)}, ${q(i.location)}, ${q(i.level)}, ${i.lastExpiryDays ?? "null::int"}, ${n})`)
    .join(",\n");
  const stockValues = stocks
    .map((s, n) => `(${q(s.item)}, ${s.quantity}::numeric, ${q(s.location)}, ${q(s.expires)}, ${n})`)
    .join(",\n");
  sql(`
    with src (name, tracking, unit, genre, loc, lvl, days, n) as (values ${itemValues}),
    ins as (
      insert into public.item (household_id, name, item_kind, tracking, genre_id, unit_id, location_id, stock_level, restock_at_level, last_expiry_days, created_at)
      select '${household}', s.name, 'food', s.tracking, g.id, u.id, l.id, s.lvl, case when s.tracking = 'level' then 'low' end, s.days,
             timestamptz '2026-10-01 00:00:00+09' + s.n * interval '1 second'
      from src as s
      join public.genre as g on g.household_id = '${household}' and g.name = s.genre
      left join public.unit as u on u.household_id = '${household}' and u.name = s.unit
      left join public.location as l on l.household_id = '${household}' and l.name = s.loc
      returning id, name
    ),
    st (item, qty, loc, expires, n) as (values ${stockValues})
    insert into public.item_stock (household_id, item_id, quantity, location_id, purchased_on, expires_on, created_at)
    select '${household}', ins.id, st.qty, l.id, date '2026-10-20', st.expires::date, timestamptz '2026-10-01 00:00:00+09' + st.n * interval '1 second'
    from st join ins on ins.name = st.item
    left join public.location as l on l.household_id = '${household}' and l.name = st.loc
  `);
}

/** 固定した時刻で、S1 としてログインし、倉庫の一覧を開く */
export async function openStock(page: Page, info: TestInfo, who: 1 | 2 = 1, suite: Suite = "main") {
  await page.clock.setFixedTime(FIXED_NOW);
  await loginWith(page, stockWho(info, who, suite));
  await page.goto("stock/");
  await expect(page.locator("h1")).toHaveText("もっちり倉庫");
}

export function shotPath(info: TestInfo, name: string): string {
  const dir = path.join(path.resolve(process.env.E2E_SCREENSHOT_DIR ?? "e2e-artifacts/screenshots"), info.project.name);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${name}.png`);
}

/** 行(品物名のリンクを含む li)を探す */
export function row(page: Page, name: string) {
  return page.locator("li", { has: page.getByRole("link", { name: `${name}を編集` }) });
}

/** 一覧の行から数量の表示(「3パック」など)を読む */
export async function rowQuantityText(page: Page, name: string): Promise<string> {
  return (await row(page, name).first().locator("span.tabular-nums").first().innerText()).trim();
}
