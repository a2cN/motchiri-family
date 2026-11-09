// モックの架空のデータ(40_design_brief.md「架空のデータ」)。モックと一緒に消える。
// 時計は 2026-10-23(金)正午に固定する。Date.now() は使わない。

export const TODAY = "2026-10-23";

export type Tracking = "count" | "level";
export type Level = "full" | "low" | "out";

export type Item = { id: string; name: string; tracking: Tracking; unit: string; genre: string; location: string; level: Level };
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
  tracking,
  unit,
  genre,
  location,
  level,
});

export const ITEMS: Item[] = [
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
];

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
