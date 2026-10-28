// モックの中だけの型。倉庫のタスクのデータモデルの決定ではない(30_architecture.md Data Model)。
// 名前は docs/02_要件定義.md §1 の識別子に合わせる(tracking、item_stock、stock_level、restock_at、source)。モックと一緒に消える。

/** 残量(stock_level)。管理のしかたが level の品物が持つ */
export type StockLevel = "full" | "low" | "out";
export type ItemKind = "food" | "supply";
/** 管理のしかた(tracking)。count = 数で管理、level = 残量で管理。種別(item_kind)は「どの画面に出るか」だけを決める */
export type Tracking = "count" | "level";

/**
 * 補充の目安(restock_at)。
 * count の品物: none / zero(切れたら)/ count(数で決める。n 以下で載る)。
 * level の品物: none / low(△で載る)/ out(×で載る)。
 */
export type RestockAt =
  | { kind: "none" }
  | { kind: "zero" }
  | { kind: "count"; n: number }
  | { kind: "low" }
  | { kind: "out" };

/** 品物(item) */
export type Item = {
  id: string;
  name: string;
  kind: ItemKind;
  tracking: Tracking;
  /** 食材はマスタの値(必須)、日用品は自由入力(空でよい) */
  genre: string;
  /** 数で管理の品物は単位。残量で管理の品物でも、前に使っていた単位を覚えておく(残量 → 数のパネルの初期値) */
  unit: string;
  /** 日用品の備考 */
  note: string;
  isRegular: boolean;
  /** 残量(tracking = level のとき意味を持つ) */
  stockLevel: StockLevel;
  restockAt: RestockAt;
  /** 食材の場所。level の品物は品物の場所、count の品物は前回の場所(候補から選んだとき・登録の初期値)。無ければ "" */
  location: string;
  /** 前回の「期限 − 購入日」の日数。無ければ null */
  suggestDays: number | null;
};

/**
 * 在庫(item_stock)。期限(expires_on)は「今日から何日後」で持つ(30 D-11)。location が "" は場所なし。
 * 数で管理の食材は在庫ごとに1件(0 になると消える)。数で管理の日用品は品物に1件だけで、場所・期限は持たず、0 でも残る(OD-stock-uiux-42)。
 */
export type ItemStock = {
  id: string;
  itemId: string;
  location: string;
  quantity: number;
  expiresInDays: number | null;
};

/** 発生元(source)。recipe は将来のもの(このモックには無い) */
export type ShoppingSource = "regular" | "low" | "out" | "manual";

/** 買い物リスト(shopping_list)の項目 */
export type ShoppingEntry = {
  id: string;
  name: string;
  source: ShoppingSource;
  checked: boolean;
  /** 品物に結びついている項目(自動で載ったもの)。手入力は null */
  itemId: string | null;
  /** チェックした順 */
  checkedSeq: number;
  /** 残量で管理の品物をチェックしたときの、チェックする前の残量(外すと戻す) */
  prevLevel: StockLevel | null;
};

/** モックの設定は「データ」だけ(40 rev3) */
export type Settings = {
  data: "initial" | "empty";
};

export type NavFrom = "stock" | "supply";
export type EditFrom = "stock" | "supply" | "items";

/** 画面の間で覚えておくこと(「‹ もどる」の行き先、開く品物) */
export type Nav = {
  editItemId: string | null;
  editFrom: EditFrom;
  newFrom: NavFrom;
  mastersFrom: NavFrom;
  itemsFrom: NavFrom;
  /** 品物の一覧で選んでいる種別 */
  itemsKind: ItemKind;
};

/** 「元に戻す」で戻すためのデータの控え */
export type DataSnapshot = {
  items: Item[];
  stocks: ItemStock[];
  list: ShoppingEntry[];
  dismissed: string[];
};
