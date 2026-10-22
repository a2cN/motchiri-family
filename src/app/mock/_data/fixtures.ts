import type { Item, ShoppingEntry, Stock } from "./types";

// 架空のデータ(40_design_brief.md rev2「架空のデータ」)。品物名は一般的なもの。人の名前・家族を思わせる語・
// 実在の店名・実際の在庫を写したものは置かない。期限は「今日から何日後」。
// 固定の日 2026-10-23(金)で、期限間近は 10/23〜10/30(OD-stock-uiux-08 B)。にんじん +7 が金曜だけの境目。

type FoodSeed = {
  id: string;
  name: string;
  genre: string;
  unit: string;
  location: string;
  quantity: number;
  days: number | null;
  regular?: boolean;
  /** 前回の場所と提案の日数(候補から選んだとき) */
  suggestDays?: number;
};

const FOODS: FoodSeed[] = [
  { id: "i01", name: "豚こま肉", genre: "肉", unit: "g", location: "冷蔵庫", quantity: 200, days: -1, suggestDays: 3 },
  { id: "i02", name: "牛乳", genre: "卵・乳製品", unit: "本", location: "冷蔵庫", quantity: 1, days: 0, regular: true, suggestDays: 10 },
  { id: "i03", name: "ヨーグルト", genre: "卵・乳製品", unit: "個", location: "冷蔵庫", quantity: 3, days: 3, suggestDays: 12 },
  { id: "i04", name: "卵", genre: "卵・乳製品", unit: "パック", location: "冷蔵庫", quantity: 1, days: 8, regular: true, suggestDays: 14 },
  { id: "i05", name: "冷凍うどん", genre: "冷凍食品", unit: "袋", location: "冷凍庫", quantity: 5, days: 60 },
  { id: "i06", name: "鶏もも肉", genre: "肉", unit: "g", location: "冷凍庫", quantity: 300, days: 20 },
  { id: "i07", name: "ほうれん草", genre: "野菜・果物", unit: "袋", location: "野菜室", quantity: 1, days: -2, suggestDays: 4 },
  { id: "i08", name: "にんじん", genre: "野菜・果物", unit: "本", location: "野菜室", quantity: 2, days: 7, suggestDays: 14 },
  { id: "i09", name: "キャベツ", genre: "野菜・果物", unit: "個", location: "野菜室", quantity: 1, days: null },
  { id: "i10", name: "パスタ", genre: "主食(米・パン・麺)", unit: "g", location: "棚", quantity: 500, days: 200 },
  { id: "i11", name: "ポテトチップス", genre: "お菓子", unit: "袋", location: "棚", quantity: 2, days: 40 },
  { id: "i12", name: "しょうゆ", genre: "調味料", unit: "本", location: "棚", quantity: 1, days: null },
];

const base = (): Omit<Item, "id" | "name" | "kind"> => ({
  genre: "",
  unit: "",
  note: "",
  isRegular: false,
  supplyLevel: "full",
  lastLocation: "",
  suggestDays: null,
});

export type MockData = { items: Item[]; stocks: Stock[]; list: ShoppingEntry[]; memo: string };

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
  const foodItems: Item[] = FOODS.map((f) => ({
    ...base(),
    id: f.id,
    name: f.name,
    kind: "food",
    genre: f.genre,
    unit: f.unit,
    isRegular: !!f.regular,
    lastLocation: f.location,
    suggestDays: f.suggestDays ?? null,
  }));
  // 食パン: いつもの で在庫なし(ST-RG02)
  foodItems.push({
    ...base(),
    id: "i13",
    name: "食パン",
    kind: "food",
    genre: "主食(米・パン・麺)",
    unit: "枚",
    isRegular: true,
    lastLocation: "棚",
    suggestDays: 4,
  });
  const supplies: Item[] = [
    { ...base(), id: "s1", name: "トイレットペーパー", kind: "supply", note: "12ロール", supplyLevel: "full" },
    { ...base(), id: "s2", name: "食器用洗剤", kind: "supply", supplyLevel: "low" },
    { ...base(), id: "s3", name: "ティッシュペーパー", kind: "supply", supplyLevel: "out" },
    { ...base(), id: "s4", name: "ゴミ袋", kind: "supply", note: "45L", supplyLevel: "full" },
  ];
  const stocks: Stock[] = FOODS.map((f, i) => ({
    id: `st${String(i + 1).padStart(2, "0")}`,
    itemId: f.id,
    location: f.location,
    quantity: f.quantity,
    expiresInDays: f.days,
  }));
  // 牛乳(2つ目): 期限違いで複数(OD-req-04)
  stocks.splice(2, 0, { id: "st13", itemId: "i02", location: "冷蔵庫", quantity: 1, expiresInDays: 9 });
  const list: ShoppingEntry[] = [
    entry("l1", "牛乳", "regular", "i02", 1),
    entry("l2", "卵", "regular", "i04"),
    entry("l3", "食パン", "regular", "i13"),
    entry("l4", "食器用洗剤", "supply_low", "s2"),
    entry("l5", "ティッシュペーパー", "supply_out", "s3"),
    entry("l6", "バナナ", "manual", null, 2),
    entry("l7", "豆腐", "manual", null),
  ];
  return { items: [...foodItems, ...supplies], stocks, list, memo: "卵は10個入り\nパンは6枚切り" };
}

/** 設定「データ」= 空。品物・在庫・日用品・買い物リスト・メモが0件(マスタは別。いつもの の印も無い) */
export function emptyData(): MockData {
  return { items: [], stocks: [], list: [], memo: "" };
}

export function dataFor(kind: "initial" | "empty"): MockData {
  return kind === "empty" ? emptyData() : initialData();
}
