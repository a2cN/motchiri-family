import type { Location, Unit } from "./master";

// モックの中だけの型。倉庫のタスクのデータモデルの決定ではない(30_architecture.md Data Model)。
// 名前は docs/02_要件定義.md §1 の識別子に合わせる。モックと一緒に消える。

/** 食材の在庫(food_stock)。期限(expires_on)は「今日から何日後」で持つ(30 D-11)。 */
export type FoodStock = {
  id: string;
  name: string;
  genre: string;
  location: Location;
  quantity: number;
  unit: Unit;
  /** 期限(expires_on)。今日から何日後か。無ければ null */
  expiresInDays: number | null;
};

/** いつもの(is_regular)の品物。在庫は FoodStock の同じ名前の合計 */
export type RegularItem = { id: string; name: string; unit: Unit };

export type SupplyLevel = "full" | "low" | "out";

/** 日用品の品物と残量(supply_level) */
export type SupplyItem = { id: string; name: string; supplyLevel: SupplyLevel };

export type ShoppingSource = "regular" | "supply_low" | "supply_out" | "manual";

/** 買い物リスト(shopping_list)の項目。source は発生元 */
export type ShoppingEntry = { id: string; name: string; source: ShoppingSource; checked: boolean };

/** 品物の登録の候補(既存の品物の前回の値) */
export type Candidate = {
  name: string;
  genre: string;
  unit: Unit;
  location: Location;
  /** 前回の「期限 − 購入日」の日数 */
  suggestDays: number;
};
