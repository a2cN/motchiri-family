import type { Candidate, FoodStock, RegularItem, ShoppingEntry, SupplyItem } from "./types";

// 架空のデータ(40_design_brief.md「架空のデータ」)。品物名は一般的なもの。人の名前・家族を思わせる語・
// 実在の店名・実際の在庫を写したものは置かない。期限は「今日から何日後」。
// 決定 12: 「期限間近」の範囲(OD-stock-uiux-08)の答えにかかわらず同じ表示になる値だけ:
// 期限切れ = −1・−2、期限間近 = 0(今日)、印なし = +8 以上、期限なし。

export const initialFoods: FoodStock[] = [
  { id: "f01", name: "豚こま肉", genre: "肉", location: "冷蔵庫", quantity: 200, unit: "g", expiresInDays: -1 },
  { id: "f02", name: "牛乳", genre: "卵・乳製品", location: "冷蔵庫", quantity: 1, unit: "本", expiresInDays: 0 },
  { id: "f03", name: "ヨーグルト", genre: "卵・乳製品", location: "冷蔵庫", quantity: 3, unit: "個", expiresInDays: 9 },
  { id: "f04", name: "卵", genre: "卵・乳製品", location: "冷蔵庫", quantity: 1, unit: "パック", expiresInDays: 12 },
  { id: "f05", name: "冷凍うどん", genre: "冷凍食品", location: "冷凍庫", quantity: 5, unit: "袋", expiresInDays: 60 },
  { id: "f06", name: "鶏もも肉", genre: "肉", location: "冷凍庫", quantity: 300, unit: "g", expiresInDays: 20 },
  { id: "f07", name: "ほうれん草", genre: "野菜・果物", location: "野菜室", quantity: 1, unit: "袋", expiresInDays: -2 },
  { id: "f08", name: "にんじん", genre: "野菜・果物", location: "野菜室", quantity: 2, unit: "本", expiresInDays: 10 },
  { id: "f09", name: "キャベツ", genre: "野菜・果物", location: "野菜室", quantity: 1, unit: "個", expiresInDays: null },
  { id: "f10", name: "パスタ", genre: "主食(米・パン・麺)", location: "棚", quantity: 500, unit: "g", expiresInDays: 200 },
  { id: "f11", name: "ポテトチップス", genre: "お菓子", location: "棚", quantity: 2, unit: "袋", expiresInDays: 40 },
  { id: "f12", name: "しょうゆ", genre: "調味料", location: "棚", quantity: 1, unit: "本", expiresInDays: null },
];

export const regulars: RegularItem[] = [
  { id: "r1", name: "牛乳", unit: "本" },
  { id: "r2", name: "卵", unit: "パック" },
  { id: "r3", name: "食パン", unit: "枚" },
];

export const initialSupplies: SupplyItem[] = [
  { id: "s1", name: "トイレットペーパー", supplyLevel: "full" },
  { id: "s2", name: "食器用洗剤", supplyLevel: "low" },
  { id: "s3", name: "ティッシュペーパー", supplyLevel: "out" },
  { id: "s4", name: "ゴミ袋", supplyLevel: "full" },
];

export const initialList: ShoppingEntry[] = [
  { id: "l1", name: "牛乳", source: "regular", checked: false },
  { id: "l2", name: "卵", source: "regular", checked: false },
  { id: "l3", name: "食パン", source: "regular", checked: false },
  { id: "l4", name: "食器用洗剤", source: "supply_low", checked: false },
  { id: "l5", name: "ティッシュペーパー", source: "supply_out", checked: false },
  { id: "l6", name: "バナナ", source: "manual", checked: true },
  { id: "l7", name: "豆腐", source: "manual", checked: false },
];

export const candidates: Candidate[] = [
  { name: "牛乳", genre: "卵・乳製品", unit: "本", location: "冷蔵庫", suggestDays: 10 },
  { name: "卵", genre: "卵・乳製品", unit: "パック", location: "冷蔵庫", suggestDays: 14 },
  { name: "食パン", genre: "主食(米・パン・麺)", unit: "枚", location: "棚", suggestDays: 4 },
  { name: "ヨーグルト", genre: "卵・乳製品", unit: "個", location: "冷蔵庫", suggestDays: 12 },
  { name: "豚こま肉", genre: "肉", unit: "g", location: "冷蔵庫", suggestDays: 3 },
  { name: "にんじん", genre: "野菜・果物", unit: "本", location: "野菜室", suggestDays: 14 },
  { name: "ほうれん草", genre: "野菜・果物", unit: "袋", location: "野菜室", suggestDays: 4 },
];
