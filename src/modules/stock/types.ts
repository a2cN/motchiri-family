// 倉庫の画面の型(camelCase。中身は要件定義 §1 の語)。DB の列との対応は lib/supabase/stock.ts。
// 日付は YYYY-MM-DD の文字列、時刻は ISO の文字列、numeric は number。

export type ItemKind = "food" | "supply";
export type Tracking = "count" | "level";
export type StockLevel = "full" | "low" | "out";

type Base = { id: string; householdId: string; createdAt: string; updatedAt: string };

export type Location = Base & { name: string; sortOrder: number };
export type Genre = Base & { name: string; defaultLocationId: string | null; sortOrder: number };
export type Unit = Base & { name: string; isCountable: boolean; sortOrder: number };

export type Item = Base & {
  name: string;
  itemKind: ItemKind;
  tracking: Tracking;
  genreId: string | null;
  unitId: string | null;
  /** 残量で管理: いまの場所 / 数で管理: 前回の登録の場所。null は場所なし */
  locationId: string | null;
  stockLevel: StockLevel | null;
  restockAtCount: number | null;
  restockAtLevel: "low" | "out" | null;
  isRegular: boolean;
  /** 前回の「期限 − 購入日」の日数。null は前回が無い */
  lastExpiryDays: number | null;
  /** 日用品のジャンル(自由入力。マスタではない)。null = ジャンルなし。食材は null(OD-stock-supply-01 A) */
  supplyGenre: string | null;
  /** 日用品の備考。null = なし。食材は null */
  note: string | null;
};

export type ItemStock = Base & {
  itemId: string;
  quantity: number;
  locationId: string | null;
  purchasedOn: string;
  expiresOn: string | null;
};

/** createdAt は「元に戻す」の作り直しで、元の作った時刻(品物の一覧の登録順)を入れるときだけ */
export type NewItem = Omit<Item, "createdAt" | "updatedAt"> & { createdAt?: string };
export type NewItemStock = Omit<ItemStock, "createdAt" | "updatedAt"> & { createdAt?: string };

/** 種別(itemKind)は変えられない(OD-stock-uiux-19 A)ので入れない */
export type ItemPatch = Partial<
  Pick<
    Item,
    | "name" | "genreId" | "unitId" | "locationId" | "stockLevel" | "lastExpiryDays" | "isRegular"
    | "tracking" | "restockAtCount" | "restockAtLevel" | "supplyGenre" | "note"
  >
>;
/** マスタの値の変更。defaultLocationId はジャンルだけ、isCountable は単位だけ */
export type MasterPatch = Partial<{ name: string; defaultLocationId: string | null; isCountable: boolean }>;
export type MasterKind = "genre" | "location" | "unit";
/** マスタの新しい行(updatedAt はサーバーが付ける。createdAt は作り直しで元の時刻を入れるときだけ) */
export type NewGenre = Omit<Genre, "createdAt" | "updatedAt"> & { createdAt?: string };
export type NewLocation = Omit<Location, "createdAt" | "updatedAt"> & { createdAt?: string };
export type NewUnit = Omit<Unit, "createdAt" | "updatedAt"> & { createdAt?: string };
export type NewMasterRow = NewGenre | NewLocation | NewUnit;
export type StockPatch = Partial<Pick<ItemStock, "quantity" | "locationId" | "expiresOn" | "purchasedOn">>;

export type StockData = { genres: Genre[]; locations: Location[]; units: Unit[]; items: Item[]; stocks: ItemStock[] };

export const EMPTY_STOCK_DATA: StockData = { genres: [], locations: [], units: [], items: [], stocks: [] };

export type AnyStockRow = Genre | Location | Unit | Item | ItemStock;
