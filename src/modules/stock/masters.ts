// マスタ(ジャンル・場所・単位)の純粋な関数(30_architecture.md Interfaces §5、Data Model「参照の種類」)。
import type { MasterKind, StockData } from "./types";

export type { MasterKind } from "./types";

export type NameCheck = { ok: true; name: string } | { ok: false; error: "empty" | "taken" };

/**
 * 使用中か。「固い参照」だけを見る(承認済みモックの usedBy と同じ。DB の外部キーが止めるもの)。
 * ジャンル = 食材の品物 / 場所 = 在庫、残量で管理の品物の場所 / 単位 = 数で管理の品物。
 */
export function isMasterInUse(kind: MasterKind, id: string, data: StockData): boolean {
  if (kind === "genre") return data.items.some((i) => i.itemKind === "food" && i.genreId === id);
  if (kind === "location") {
    return data.stocks.some((s) => s.locationId === id) || data.items.some((i) => i.tracking === "level" && i.locationId === id);
  }
  return data.items.some((i) => i.tracking === "count" && i.unitId === id);
}

export type SoftReference =
  | { table: "genre"; id: string; column: "default_location_id" }
  | { table: "item"; id: string; column: "location_id" | "unit_id" };

/** 消すと DB の trigger が空(null)にする行(「元に戻す」で書き戻す)。ジャンルの既定の場所、数で管理の前回の場所、残量で管理に残した単位 */
export function softReferences(kind: MasterKind, id: string, data: StockData): SoftReference[] {
  if (kind === "location") {
    return [
      ...data.genres.filter((g) => g.defaultLocationId === id).map((g): SoftReference => ({ table: "genre", id: g.id, column: "default_location_id" })),
      ...data.items.filter((i) => i.tracking === "count" && i.locationId === id).map((i): SoftReference => ({ table: "item", id: i.id, column: "location_id" })),
    ];
  }
  if (kind === "unit") {
    return data.items.filter((i) => i.tracking === "level" && i.unitId === id).map((i): SoftReference => ({ table: "item", id: i.id, column: "unit_id" }));
  }
  return [];
}

/** 前後の空白を除いて、完全一致で比べる(モックと同じ。OD-stock-uiux-20 A) */
export function checkMasterName(kind: MasterKind, raw: string, data: StockData, exceptId?: string): NameCheck {
  const name = raw.trim();
  if (name === "") return { ok: false, error: "empty" };
  const rows = kind === "genre" ? data.genres : kind === "location" ? data.locations : data.units;
  if (rows.some((r) => r.id !== exceptId && r.name === name)) return { ok: false, error: "taken" };
  return { ok: true, name };
}

/** 最大 + 1(無ければ 1) */
export function nextSortOrder(rows: Array<{ sortOrder: number }>): number {
  return rows.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;
}

/** sort_order → 作った順 → id */
export function sortMasters<T extends { sortOrder: number; createdAt: string; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder
      : a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? -1 : 1)
        : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}
