// 単体テスト用のデータ(テストだけが import する)。
import type { Genre, Item, ItemStock, Location, StockData, Unit } from "./types";

const H = "h1";
const t = (n: number) => `2026-10-01T00:00:${String(n).padStart(2, "0")}Z`;
const base = (id: string, n = 0) => ({ id, householdId: H, createdAt: t(n), updatedAt: t(n) });

export const locations: Location[] = [
  { ...base("loc-fridge"), name: "冷蔵庫", sortOrder: 1 },
  { ...base("loc-freezer"), name: "冷凍庫", sortOrder: 2 },
  { ...base("loc-veg"), name: "野菜室", sortOrder: 3 },
  { ...base("loc-shelf"), name: "棚", sortOrder: 4 },
];
export const genres: Genre[] = [
  { ...base("g-veg"), name: "野菜・果物", defaultLocationId: "loc-fridge", sortOrder: 1 },
  { ...base("g-meat"), name: "肉", defaultLocationId: "loc-fridge", sortOrder: 2 },
  { ...base("g-dairy"), name: "卵・乳製品", defaultLocationId: "loc-fridge", sortOrder: 4 },
  { ...base("g-season"), name: "調味料", defaultLocationId: "loc-shelf", sortOrder: 7 },
];
export const units: Unit[] = [
  { ...base("u-ko"), name: "個", isCountable: true, sortOrder: 1 },
  { ...base("u-pack"), name: "パック", isCountable: true, sortOrder: 3 },
  { ...base("u-g"), name: "g", isCountable: false, sortOrder: 6 },
];

export function item(id: string, name: string, over: Partial<Item> = {}, n = 0): Item {
  return {
    ...base(id, n),
    name,
    itemKind: "food",
    tracking: "count",
    genreId: "g-dairy",
    unitId: "u-pack",
    locationId: "loc-fridge",
    stockLevel: null,
    restockAtCount: null,
    restockAtLevel: null,
    isRegular: false,
    lastExpiryDays: null,
    supplyGenre: null,
    note: null,
    ...over,
  };
}

export function stock(id: string, itemId: string, quantity: number, over: Partial<ItemStock> = {}, n = 0): ItemStock {
  return { ...base(id, n), itemId, quantity, locationId: "loc-fridge", purchasedOn: "2026-10-20", expiresOn: null, ...over };
}

export function data(items: Item[] = [], stocks: ItemStock[] = []): StockData {
  return { genres, locations, units, items, stocks };
}
