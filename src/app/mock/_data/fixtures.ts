import type { Item, ItemStock, RestockAt, ShoppingEntry, StockLevel } from "./types";

// 架空のデータ(40_design_brief.md rev3「架空のデータ」)。品物名は一般的なもの。人の名前・家族を思わせる語・
// 実在の店名・実際の在庫を写したものは置かない。期限は「今日から何日後」。
// 固定の日 2026-10-23(金)で、期限間近は 10/23〜10/30(OD-stock-uiux-08 B)。にんじん +7 が金曜だけの境目。

const NONE: RestockAt = { kind: "none" };

type Seed = {
  id: string;
  name: string;
  genre: string;
  unit?: string;
  location?: string;
  /** 数で管理: 数。残量で管理: undefined */
  quantity?: number;
  days?: number | null;
  level?: StockLevel;
  restockAt?: RestockAt;
  regular?: boolean;
  suggestDays?: number;
};

// 食材(15品物)。quantity が無いものは残量で管理
const FOODS: Seed[] = [
  { id: "i01", name: "豚こま肉", genre: "肉", unit: "g", location: "冷蔵庫", quantity: 200, days: -1, suggestDays: 3 },
  { id: "i02", name: "牛乳", genre: "卵・乳製品", unit: "本", location: "冷蔵庫", quantity: 1, days: 0, regular: true, suggestDays: 10 },
  { id: "i03", name: "ヨーグルト", genre: "卵・乳製品", unit: "個", location: "冷蔵庫", quantity: 3, days: 3, suggestDays: 12 },
  { id: "i04", name: "卵", genre: "卵・乳製品", unit: "パック", location: "冷蔵庫", quantity: 1, days: 8, regular: true, suggestDays: 14 },
  { id: "i05", name: "納豆", genre: "その他", unit: "パック", location: "冷蔵庫", quantity: 1, days: 5, restockAt: { kind: "count", n: 1 }, suggestDays: 7 },
  { id: "i06", name: "マヨネーズ", genre: "調味料", location: "冷蔵庫", level: "full", restockAt: { kind: "low" } },
  { id: "i07", name: "冷凍うどん", genre: "冷凍食品", unit: "袋", location: "冷凍庫", quantity: 5, days: 60, restockAt: { kind: "count", n: 2 } },
  { id: "i08", name: "鶏もも肉", genre: "肉", unit: "g", location: "冷凍庫", quantity: 300, days: 20 },
  { id: "i09", name: "ほうれん草", genre: "野菜・果物", unit: "袋", location: "野菜室", quantity: 1, days: -2, suggestDays: 4 },
  { id: "i10", name: "にんじん", genre: "野菜・果物", unit: "本", location: "野菜室", quantity: 2, days: 7, suggestDays: 14 },
  { id: "i11", name: "キャベツ", genre: "野菜・果物", unit: "個", location: "野菜室", quantity: 0.5, days: null },
  { id: "i12", name: "パスタ", genre: "主食(米・パン・麺)", unit: "g", location: "棚", quantity: 500, days: 200 },
  { id: "i13", name: "ポテトチップス", genre: "お菓子", unit: "袋", location: "棚", quantity: 2, days: 40 },
  { id: "i14", name: "しょうゆ", genre: "調味料", location: "棚", level: "low", restockAt: { kind: "low" } },
  // 食パン: いつもの で在庫なし(ST-RG02)
  { id: "i15", name: "食パン", genre: "主食(米・パン・麺)", unit: "枚", location: "棚", regular: true, quantity: 0, days: null, suggestDays: 4 },
];

// 日用品(登録順)
const SUPPLIES: Seed[] = [
  { id: "s1", name: "トイレットペーパー", genre: "紙類", level: "full", restockAt: { kind: "low" } },
  { id: "s2", name: "食器用洗剤", genre: "洗剤", level: "low", restockAt: { kind: "low" } },
  { id: "s3", name: "ティッシュペーパー", genre: "紙類", level: "out", restockAt: { kind: "low" } },
  { id: "s4", name: "ゴミ袋", genre: "キッチン", level: "full", restockAt: { kind: "low" } },
  { id: "s5", name: "シャンプーの詰め替え", genre: "お風呂", unit: "本", quantity: 1, restockAt: { kind: "count", n: 1 } },
  { id: "s6", name: "ボディソープの詰め替え", genre: "お風呂", unit: "本", quantity: 0, restockAt: { kind: "zero" } },
  { id: "s7", name: "洗濯用洗剤", genre: "洗剤", unit: "本", quantity: 2 },
  { id: "s8", name: "歯みがき粉", genre: "洗面所", level: "full", restockAt: { kind: "out" } },
  { id: "s9", name: "ハンドソープ", genre: "", level: "full" },
];

const NOTES: Record<string, string> = { s1: "12ロール", s4: "45L" };

export type MockData = { items: Item[]; stocks: ItemStock[]; list: ShoppingEntry[]; memo: string };

const entry = (id: string, name: string, source: ShoppingEntry["source"], itemId: string | null, checkedSeq = 0): ShoppingEntry => ({
  id,
  name,
  source,
  checked: checkedSeq > 0,
  itemId,
  checkedSeq,
  prevLevel: null,
});

export function initialData(): MockData {
  const items: Item[] = [];
  const stocks: ItemStock[] = [];
  let st = 1;
  const addStock = (itemId: string, location: string, quantity: number, expiresInDays: number | null) => {
    stocks.push({ id: `st${String(st).padStart(2, "0")}`, itemId, location, quantity, expiresInDays });
    st += 1;
  };

  for (const f of FOODS) {
    const count = f.quantity !== undefined;
    items.push({
      id: f.id,
      name: f.name,
      kind: "food",
      tracking: count ? "count" : "level",
      genre: f.genre,
      unit: f.unit ?? "",
      note: "",
      isRegular: !!f.regular,
      stockLevel: f.level ?? "full",
      restockAt: f.restockAt ?? NONE,
      location: f.location ?? "",
      suggestDays: f.suggestDays ?? null,
    });
    // 在庫なしの食パン(quantity 0)は在庫を作らない。食材の数で管理は 0 の在庫を持たない
    if (count && (f.quantity ?? 0) > 0) addStock(f.id, f.location ?? "", f.quantity ?? 0, f.days ?? null);
    // 牛乳(2つ目): 期限違いで複数(OD-req-04)
    if (f.id === "i02") addStock("i02", "冷蔵庫", 1, 9);
  }
  for (const s of SUPPLIES) {
    const count = s.quantity !== undefined;
    items.push({
      id: s.id,
      name: s.name,
      kind: "supply",
      tracking: count ? "count" : "level",
      genre: s.genre,
      unit: s.unit ?? "",
      note: NOTES[s.id] ?? "",
      isRegular: false,
      stockLevel: s.level ?? "full",
      restockAt: s.restockAt ?? NONE,
      location: "",
      suggestDays: null,
    });
    // 数で管理の日用品は在庫が品物に1つ(場所・期限なし)。0 でも残る(OD-stock-uiux-42)
    if (count) addStock(s.id, "", s.quantity ?? 0, null);
  }

  const list: ShoppingEntry[] = [
    entry("l1", "牛乳", "regular", "i02", 1),
    entry("l2", "卵", "regular", "i04"),
    entry("l3", "食パン", "regular", "i15"),
    entry("l4", "納豆", "low", "i05"),
    entry("l5", "しょうゆ", "low", "i14"),
    entry("l6", "食器用洗剤", "low", "s2"),
    entry("l7", "ティッシュペーパー", "out", "s3"),
    entry("l8", "シャンプーの詰め替え", "low", "s5", 2),
    entry("l9", "ボディソープの詰め替え", "out", "s6"),
    entry("l10", "バナナ", "manual", null, 3),
    entry("l11", "豆腐", "manual", null),
  ];
  return { items, stocks, list, memo: "卵は10個入り\nパンは6枚切り" };
}

/** 設定「データ」= 空。品物・在庫・残量・買い物リスト・メモが0件(マスタは別。いつもの の印も無い) */
export function emptyData(): MockData {
  return { items: [], stocks: [], list: [], memo: "" };
}

export function dataFor(kind: "initial" | "empty"): MockData {
  return kind === "empty" ? emptyData() : initialData();
}
