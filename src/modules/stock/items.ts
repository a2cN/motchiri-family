// 品物の一覧・いつもの・管理のしかたの変更の純粋な関数(30_architecture.md Interfaces §5)。
import { sortMasters, type NameCheck } from "./masters";
import type { Item, ItemPatch, ItemStock, NewItemStock, StockData, StockLevel } from "./types";

const byCreated = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** 品物名は、種別をまたいで世帯で1つ(OD-stock-uiux-49 A)。前後の空白を除いて完全一致で比べる */
export function checkItemName(raw: string, data: StockData, exceptId?: string): NameCheck {
  const name = raw.trim();
  if (name === "") return { ok: false, error: "empty" };
  if (data.items.some((i) => i.id !== exceptId && i.name === name)) return { ok: false, error: "taken" };
  return { ok: true, name };
}

export type ItemGroup = { genreId: string; label: string; items: Item[] };

/** 食材だけ(run 2)。ジャンルの並び = sortMasters、カードの中 = 作った順。空のカードは出さない */
export function groupItemsByGenre(data: StockData): ItemGroup[] {
  const foods = data.items.filter((i) => i.itemKind === "food");
  return sortMasters(data.genres)
    .map((g) => ({ genreId: g.id, label: g.name, items: foods.filter((i) => i.genreId === g.id).sort(byCreated) }))
    .filter((g) => g.items.length > 0);
}

export type RegularRow = { item: Item } & ({ kind: "count"; total: number } | { kind: "level"; level: StockLevel });

/** 小数第一位に丸めた、場所を問わない在庫の合計 */
export function totalQuantity(itemId: string, data: StockData): number {
  const sum = data.stocks.filter((s) => s.itemId === itemId).reduce((a, s) => a + s.quantity, 0);
  return Math.round(sum * 10) / 10;
}

/** いつもの(食材と日用品を混ぜて作った順。R3-8)。数の日用品の total は在庫の合計(0 もある) */
export function regularRows(data: StockData): RegularRow[] {
  return data.items
    .filter((i) => i.isRegular)
    .sort(byCreated)
    .map((item): RegularRow =>
      item.tracking === "level"
        ? { kind: "level", item, level: item.stockLevel ?? "full" }
        : { kind: "count", item, total: totalQuantity(item.id, data) },
    );
}

export type TrackingDefaults = { level: StockLevel; unitId: string | null; quantityText: string };

/**
 * 管理のしかたを変えるパネルの初期値(承認済みモックの TrackingPanel と同じ)。
 * 数 → 残量の残量 = 合計 0 なら out、restockAtCount があり合計 ≤ それなら low、ほか full。
 * 残量 → 数の単位 = 品物に残っている unitId(無ければ null = 未選択)、個数 = 残量が out なら "0"、ほか "1"。
 */
export function trackingDefaults(item: Item, data: StockData): TrackingDefaults {
  const total = totalQuantity(item.id, data);
  const level: StockLevel = total === 0 ? "out" : item.restockAtCount !== null && total <= item.restockAtCount ? "low" : "full";
  return { level, unitId: item.unitId, quantityText: item.stockLevel === "out" ? "0" : "1" };
}

export type TrackingChangeInput = { to: "level"; level: StockLevel } | { to: "count"; unitId: string; quantity: number };
export type TrackingPlan = { itemPatch: ItemPatch; removedStocks: ItemStock[]; newStock: NewItemStock | null };

/**
 * 管理のしかたの変更の計画(OD-stock-uiux-43 A・50 (6)、ブリーフ A1)。
 * 数 → 残量: 場所 = 在庫のうち作った時刻が最も新しいものの場所(無ければ品物のまま)、補充の目安は既定値(数: なし、残量: △で)、単位は残す、在庫は全部消える(DB の trigger)。
 * 残量 → 数: 在庫は個数が 0 より大きいときだけ作る。ただし日用品は 0 個でも作る(在庫は品物に1つ、0 でも残る。OD-stock-uiux-50 (6) A)。
 * 日用品の在庫は場所も期限も持たない(locationId = null)。
 */
export function planTrackingChange(
  item: Item,
  input: TrackingChangeInput,
  data: StockData,
  ids: { stockId: string; householdId: string },
  today: string,
): TrackingPlan {
  if (input.to === "level") {
    const stocks = data.stocks.filter((s) => s.itemId === item.id);
    const newest = [...stocks].sort((a, b) => -byCreated(a, b))[0];
    return {
      itemPatch: {
        tracking: "level",
        stockLevel: input.level,
        restockAtCount: null,
        restockAtLevel: "low",
        locationId: newest ? newest.locationId : item.locationId,
      },
      removedStocks: stocks,
      newStock: null,
    };
  }
  return {
    itemPatch: { tracking: "count", stockLevel: null, unitId: input.unitId, restockAtLevel: null, restockAtCount: null },
    removedStocks: [],
    newStock:
      input.quantity > 0 || item.itemKind === "supply"
        ? {
            id: ids.stockId, householdId: ids.householdId, itemId: item.id, quantity: input.quantity,
            locationId: item.itemKind === "supply" ? null : item.locationId, purchasedOn: today, expiresOn: null,
          }
        : null,
  };
}
