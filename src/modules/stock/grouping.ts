// 食材の在庫のまとまりと並び(ST-F07、正典「食材の在庫」)。
import type { Item, ItemStock, StockData } from "./types";

export type StockRow = { kind: "count"; stock: ItemStock; item: Item } | { kind: "level"; item: Item };
/** key は location / genre の id。場所なし(ジャンルなし)は "none" */
export type StockGroup = { key: string; label: string; rows: StockRow[] };

export const NO_LOCATION_KEY = "none";
export const NO_LOCATION_LABEL = "場所なし";

const byCreated = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * まとまりの順: マスタの sort_order、場所なしは末尾。空のまとまりは出さない。
 * まとまりの中: 数で管理の行を期限の近い順 → 期限なしの数で管理の行 → 残量で管理の行(作った順)。
 * 同じ期限(または期限なし)の行は登録した順(古い順。OD-stock-food-06 (5) A)。
 */
export function groupFoodStock(data: StockData, by: "location" | "genre"): StockGroup[] {
  const foods = new Map(data.items.filter((i) => i.itemKind === "food").map((i) => [i.id, i]));
  const rows: StockRow[] = [];
  for (const stock of data.stocks) {
    const item = foods.get(stock.itemId);
    if (item && item.tracking === "count") rows.push({ kind: "count", stock, item });
  }
  for (const item of foods.values()) if (item.tracking === "level") rows.push({ kind: "level", item });

  const keyOf = (r: StockRow): string | null => {
    if (by === "genre") return r.item.genreId;
    return r.kind === "count" ? r.stock.locationId : r.item.locationId;
  };
  const masters = by === "location" ? data.locations : data.genres;
  const known = new Set(masters.map((m) => m.id));
  const ordered = [...masters].sort((a, b) => a.sortOrder - b.sortOrder);

  const rank = (r: StockRow): number => {
    if (r.kind === "level") return 2;
    return r.stock.expiresOn === null ? 1 : 0;
  };
  const sortRows = (list: StockRow[]): StockRow[] =>
    [...list].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (a.kind === "count" && b.kind === "count" && ra === 0) {
        const ea = a.stock.expiresOn as string;
        const eb = b.stock.expiresOn as string;
        if (ea !== eb) return ea < eb ? -1 : 1;
      }
      return byCreated(a.kind === "count" ? a.stock : a.item, b.kind === "count" ? b.stock : b.item);
    });

  const groups: StockGroup[] = [];
  for (const m of ordered) {
    const own = rows.filter((r) => keyOf(r) === m.id);
    if (own.length > 0) groups.push({ key: m.id, label: m.name, rows: sortRows(own) });
  }
  const none = rows.filter((r) => {
    const k = keyOf(r);
    return k === null || !known.has(k);
  });
  if (none.length > 0) {
    groups.push({ key: NO_LOCATION_KEY, label: by === "location" ? NO_LOCATION_LABEL : "ジャンルなし", rows: sortRows(none) });
  }
  return groups;
}
