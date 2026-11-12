// モックの架空のデータ(40_design_brief.md「架空のデータ」)。モックと一緒に消える。
// 時計は 2026-10-23(金)正午に固定する。Date.now() は使わない。

export const TODAY = "2026-10-23";

export type Tracking = "count" | "level";
export type Level = "full" | "low" | "out";

export type Kind = "food" | "supply";
export type Item = { id: string; name: string; kind: Kind; tracking: Tracking; unit: string; genre: string; location: string; level: Level; note: string };
export type Stock = { id: string; itemId: string; qty: number; location: string; expires: string | null };

export const GENRES = ["野菜・果物", "肉", "魚", "卵・乳製品", "冷凍食品", "主食(米・パン・麺)", "調味料", "飲み物", "お菓子", "その他"];
export const GENRE_DEFAULT_LOCATION: Record<string, string> = {
  "野菜・果物": "冷蔵庫",
  肉: "冷蔵庫",
  魚: "冷蔵庫",
  "卵・乳製品": "冷蔵庫",
  冷凍食品: "冷凍庫",
};
export const LOCATIONS = ["冷蔵庫", "冷凍庫", "野菜室", "棚"];
export const UNITS = ["個", "本", "パック", "袋", "枚", "g", "ml"];
export const NO_LOCATION = "場所なし";
export const isCountable = (unit: string) => unit === "" || !["g", "ml"].includes(unit);

const item = (id: string, name: string, tracking: Tracking, unit: string, genre: string, location: string, level: Level = "full"): Item => ({
  id,
  name,
  kind: "food",
  note: "",
  tracking,
  unit,
  genre,
  location,
  level,
});

export const FOODS: Item[] = [
  item("pork", "豚こま肉", "count", "g", "肉", "冷蔵庫"),
  item("milk", "牛乳", "count", "本", "卵・乳製品", "冷蔵庫"),
  item("yogurt", "ヨーグルト", "count", "個", "卵・乳製品", "冷蔵庫"),
  item("egg", "卵", "count", "パック", "卵・乳製品", "冷蔵庫"),
  item("natto", "納豆", "count", "パック", "その他", "冷蔵庫"),
  item("mayo", "マヨネーズ", "level", "", "調味料", "冷蔵庫", "full"),
  item("udon", "冷凍うどん", "count", "袋", "冷凍食品", "冷凍庫"),
  item("chicken", "鶏もも肉", "count", "g", "肉", "冷凍庫"),
  item("spinach", "ほうれん草", "count", "袋", "野菜・果物", "野菜室"),
  item("carrot", "にんじん", "count", "本", "野菜・果物", "野菜室"),
  item("cabbage", "キャベツ", "count", "個", "野菜・果物", "野菜室"),
  item("pasta", "パスタ", "count", "g", "主食(米・パン・麺)", "棚"),
  item("chips", "ポテトチップス", "count", "袋", "お菓子", "棚"),
  item("soy", "しょうゆ", "level", "", "調味料", "棚", "low"),
  item("bread", "食パン", "count", "枚", "主食(米・パン・麺)", ""),
];

// ---- 日用品(stock-supply の差分。`ab250aa` の SUPPLIES・NOTES の9件。並びは登録順 = ST-D02) ----
const supply = (id: string, name: string, tracking: Tracking, unit: string, genre: string, level: Level, note = ""): Item => ({
  id, name, kind: "supply", tracking, unit, genre, location: "", level, note,
});
export const SUPPLIES: Item[] = [
  supply("toilet", "トイレットペーパー", "level", "", "紙類", "full", "12ロール"),
  supply("dish", "食器用洗剤", "level", "", "洗剤", "low"),
  supply("tissue", "ティッシュペーパー", "level", "", "紙類", "out"),
  supply("garbage", "ゴミ袋", "level", "", "キッチン", "full", "45L"),
  supply("shampoo", "シャンプーの詰め替え", "count", "本", "お風呂", "full"),
  supply("bodysoap", "ボディソープの詰め替え", "count", "本", "お風呂", "full"),
  supply("laundry", "洗濯用洗剤", "count", "本", "洗剤", "full"),
  supply("toothpaste", "歯みがき粉", "level", "", "洗面所", "full"),
  supply("handsoap", "ハンドソープ", "level", "", "", "full"),
];
export const ITEMS: Item[] = [...FOODS, ...SUPPLIES];
/** 日用品のジャンルの候補 = 使われた語の順(最も古い品物の順。30 S-?)。ジャンルなしは含めない */
export const supplyGenresOf = (items: Item[]): string[] => {
  const out: string[] = [];
  for (const i of items) if (i.kind === "supply" && i.genre !== "" && !out.includes(i.genre)) out.push(i.genre);
  return out;
};

const stock = (id: string, itemId: string, qty: number, location: string, expires: string | null): Stock => ({ id, itemId, qty, location, expires });

export const STOCKS: Stock[] = [
  stock("s-pork", "pork", 200, "冷蔵庫", "2026-10-22"),
  stock("s-milk1", "milk", 1, "冷蔵庫", "2026-10-23"),
  stock("s-milk2", "milk", 1, "冷蔵庫", "2026-11-01"),
  stock("s-yogurt", "yogurt", 3, "冷蔵庫", "2026-10-26"),
  stock("s-egg", "egg", 1, "冷蔵庫", "2026-10-31"),
  stock("s-natto", "natto", 1, "冷蔵庫", "2026-10-28"),
  stock("s-udon", "udon", 5, "冷凍庫", "2026-12-22"),
  stock("s-chicken", "chicken", 300, "冷凍庫", "2026-11-12"),
  stock("s-spinach", "spinach", 1, "野菜室", "2026-10-21"),
  stock("s-carrot", "carrot", 2, "野菜室", "2026-10-30"),
  stock("s-cabbage", "cabbage", 0.5, "野菜室", null),
  stock("s-pasta", "pasta", 500, "棚", "2027-05-11"),
  stock("s-chips", "chips", 2, "棚", "2026-12-02"),
  // 数で管理の日用品の在庫は品物に1つ(場所・期限なし)。0 でも残る(OD-stock-uiux-42)
  stock("s-shampoo", "shampoo", 1, "", null),
  stock("s-bodysoap", "bodysoap", 0, "", null),
  stock("s-laundry", "laundry", 2, "", null),
];
/** 食材の在庫だけ(食材の画面・食材の品物の編集が使う) */
export const FOOD_STOCKS: Stock[] = STOCKS.filter((s) => FOODS.some((f) => f.id === s.itemId));

// ---- 日付(固定の「今日」に対する計算) ----
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const daysFromToday = (iso: string) => Math.round((utc(iso) - utc(TODAY)) / 86_400_000);
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const w = WEEKDAYS[new Date(utc(iso)).getUTCDay()];
  return y === 2026 ? `${m}/${d}(${w})` : `${y}/${m}/${d}(${w})`;
}
/** 期限切れ = 今日より前、期限間近 = 今日〜次の金曜(今日が金曜なら 7 日後まで) */
export function expiryStatus(iso: string | null): "expired" | "soon" | "none" {
  if (iso === null) return "none";
  const n = daysFromToday(iso);
  if (n < 0) return "expired";
  const dow = new Date(utc(TODAY)).getUTCDay();
  const untilFriday = (5 - dow + 7) % 7 || 7;
  return n <= untilFriday ? "soon" : "none";
}

// ---- 数 ----
export function formatQty(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
export const withUnit = (v: number, unit: string) => `${formatQty(v)}${unit}`;
export const LEVEL_SYMBOL: Record<Level, string> = { full: "○", low: "△", out: "×" };
export const NEXT_LEVEL: Record<Level, Level> = { full: "low", low: "out", out: "full" };

export function parseQty(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const s = raw.normalize("NFKC").trim();
  if (s === "") return { ok: false, error: "個数を入れてください" };
  const m = /^(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return { ok: false, error: "数を入れてください" };
  if ((m[2] ?? "").length > 1) return { ok: false, error: "小数は第一位までです" };
  return { ok: true, value: Number(`${m[1]}.${m[2] || "0"}`) };
}

export const byExpiry = (a: Stock, b: Stock) =>
  (a.expires ? utc(a.expires) : Number.POSITIVE_INFINITY) - (b.expires ? utc(b.expires) : Number.POSITIVE_INFINITY);

// ---- run 2 の差分(40_design_brief.md「架空のデータ」) ----
/** いつもの の品物(牛乳・卵・食パン + キャベツ・しょうゆ + 日用品2件(トイレットペーパー・ボディソープの詰め替え)。並びは食材と日用品を混ぜた「作った順」の見本) */
export const REGULAR_IDS = ["milk", "egg", "toilet", "bread", "bodysoap", "cabbage", "soy"];

export type MasterKind = "genres" | "locations" | "units";
export type MasterEntry = { name: string; defaultLocation: string; countable: boolean };
const m = (name: string, defaultLocation = "", countable = true): MasterEntry => ({ name, defaultLocation, countable });
/** マスタの初期値(要件定義 §7。`ab250aa` の master.ts と同じ) */
export const MASTERS: Record<MasterKind, MasterEntry[]> = {
  genres: [
    m("野菜・果物", "冷蔵庫"), m("肉", "冷蔵庫"), m("魚", "冷蔵庫"), m("卵・乳製品", "冷蔵庫"), m("冷凍食品", "冷凍庫"),
    m("主食(米・パン・麺)", "棚"), m("調味料", "棚"), m("飲み物", "棚"), m("お菓子", "棚"), m("その他", "棚"),
  ],
  locations: ["冷蔵庫", "冷凍庫", "野菜室", "棚"].map((n) => m(n)),
  units: [m("個"), m("本"), m("パック"), m("袋"), m("枚"), m("g", "", false), m("ml", "", false)],
};
export const GENRE_NAMES = MASTERS.genres.map((g) => g.name);
export const itemOf = (id: string): Item => ITEMS.find((i) => i.id === id)!;
