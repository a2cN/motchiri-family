// モックの中だけの型。倉庫のタスクのデータモデルの決定ではない(30_architecture.md Data Model)。
// 名前は docs/02_要件定義.md §1 の識別子に合わせる。モックと一緒に消える。

export type SupplyLevel = "full" | "low" | "out";
export type ItemKind = "food" | "supply";

/** 品物(item)。食材は genre・unit・is_regular、日用品は supply_level・note・is_regular */
export type Item = {
  id: string;
  name: string;
  kind: ItemKind;
  genre: string;
  unit: string;
  note: string;
  isRegular: boolean;
  supplyLevel: SupplyLevel;
  /** 前回の場所(候補から選んだときに入る)。無ければ "" */
  lastLocation: string;
  /** 前回の「期限 − 購入日」の日数。無ければ null */
  suggestDays: number | null;
};

/** 食材の在庫(food_stock)。期限(expires_on)は「今日から何日後」で持つ(30 D-11)。location が "" は場所なし */
export type Stock = {
  id: string;
  itemId: string;
  location: string;
  quantity: number;
  expiresInDays: number | null;
};

export type ShoppingSource = "regular" | "supply_low" | "supply_out" | "manual";

/** 買い物リスト(shopping_list)の項目。source は発生元 */
export type ShoppingEntry = {
  id: string;
  name: string;
  source: ShoppingSource;
  checked: boolean;
  /** 品物に結びついている項目(いつもの、日用品)。手入力は null */
  itemId: string | null;
  /** チェックした順(「下へ移す」の並びに使う) */
  checkedSeq: number;
  /** 日用品をチェックしたときの、チェックする前の残量(外すと戻す) */
  prevLevel: SupplyLevel | null;
};

export type Settings = {
  data: "initial" | "empty";
  undoSeconds: 4 | 6 | 10;
  checkedOrder: "stay" | "bottom";
};

export type NavFrom = "stock" | "supply";
export type EditFrom = "stock" | "supply" | "masters";

/** 画面の間で覚えておくこと(「‹ もどる」の行き先、開く品物) */
export type Nav = {
  editItemId: string | null;
  editFrom: EditFrom;
  newFrom: NavFrom;
  mastersFrom: NavFrom;
};
