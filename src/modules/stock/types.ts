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
};

export type ItemStock = Base & {
  itemId: string;
  quantity: number;
  locationId: string | null;
  purchasedOn: string;
  expiresOn: string | null;
};

export type NewItem = Omit<Item, "createdAt" | "updatedAt">;
export type NewItemStock = Omit<ItemStock, "createdAt" | "updatedAt"> & { createdAt?: string };

export type ItemPatch = Partial<Pick<Item, "genreId" | "unitId" | "locationId" | "stockLevel" | "lastExpiryDays">>;
export type StockPatch = Partial<Pick<ItemStock, "quantity" | "locationId" | "expiresOn">>;

export type StockData = { genres: Genre[]; locations: Location[]; units: Unit[]; items: Item[]; stocks: ItemStock[] };

export const EMPTY_STOCK_DATA: StockData = { genres: [], locations: [], units: [], items: [], stocks: [] };

export type AnyStockRow = Genre | Location | Unit | Item | ItemStock;
