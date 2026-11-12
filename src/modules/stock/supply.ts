// 日用品の純粋な関数(30_architecture.md Interfaces §3)。行・ジャンルの候補・検索・品物の一覧のまとまり・「その品物の在庫」。
import type { Item, ItemStock, StockData, StockLevel } from "./types";

const byCreated = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export type SupplyRow = { item: Item } & (
  | { kind: "level"; level: StockLevel }
  /** total は合計(小数第一位)、stockId は「その品物の在庫」(無ければ null) */
  | { kind: "count"; total: number; stockId: string | null }
);

/** 作った順で最初の在庫 = 「その品物の在庫」(S-04。数で管理の日用品は品物に1つ。2つ以上あっても最初の行) */
export function supplyStockOf(itemId: string, data: StockData): ItemStock | undefined {
  return data.stocks.filter((s) => s.itemId === itemId).sort(byCreated)[0];
}

function totalOf(itemId: string, data: StockData): number {
  const sum = data.stocks.filter((s) => s.itemId === itemId).reduce((a, s) => a + s.quantity, 0);
  return Math.round(sum * 10) / 10;
}

/** 日用品だけ、登録順(createdAt → id。ST-D02) */
export function supplyRows(data: StockData): SupplyRow[] {
  return data.items
    .filter((i) => i.itemKind === "supply")
    .sort(byCreated)
    .map((item): SupplyRow =>
      item.tracking === "level"
        ? { kind: "level", item, level: item.stockLevel ?? "full" }
        : { kind: "count", item, total: totalOf(item.id, data), stockId: supplyStockOf(item.id, data)?.id ?? null },
    );
}

/**
 * OD-stock-uiux-45 A: いま日用品の品物が使っている語。並びは「その語を使う品物のうち最も古い createdAt」の順(同じなら語の順)。
 * null は入れない。
 */
export function supplyGenres(data: StockData): string[] {
  const oldest = new Map<string, string>();
  for (const i of data.items) {
    if (i.itemKind !== "supply" || i.supplyGenre === null) continue;
    const cur = oldest.get(i.supplyGenre);
    if (cur === undefined || i.createdAt < cur) oldest.set(i.supplyGenre, i.createdAt);
  }
  return [...oldest.entries()]
    .sort(([wa, ta], [wb, tb]) => (ta < tb ? -1 : ta > tb ? 1 : wa < wb ? -1 : wa > wb ? 1 : 0))
    .map(([w]) => w);
}

/** NFKC + 小文字(承認済みモックの norm と同じ。S-08) */
export function normalizeForSearch(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

/** query は前後の空白を除き、空なら絞らない。genre が null なら「すべて」 */
export function filterSupplyRows(rows: SupplyRow[], query: string, genre: string | null): SupplyRow[] {
  const q = normalizeForSearch(query.trim());
  return rows.filter(
    (r) => (genre === null || r.item.supplyGenre === genre) && (q === "" || normalizeForSearch(r.item.name).includes(q)),
  );
}

export type SupplyItemGroup = { genre: string | null; items: Item[] };

/** 品物の一覧の日用品側: supplyGenres の順 → 末尾に null(ジャンルなし)。中は作った順。空のまとまりは出さない */
export function groupSupplyItemsByGenre(data: StockData): SupplyItemGroup[] {
  const supplies = data.items.filter((i) => i.itemKind === "supply").sort(byCreated);
  const groups: SupplyItemGroup[] = supplyGenres(data).map((genre) => ({ genre, items: supplies.filter((i) => i.supplyGenre === genre) }));
  const none = supplies.filter((i) => i.supplyGenre === null);
  if (none.length > 0) groups.push({ genre: null, items: none });
  return groups.filter((g) => g.items.length > 0);
}

/** 日用品のジャンル・備考を送る形。前後の空白を除き、空なら null */
export function normalizeFreeText(raw: string): string | null {
  const t = raw.trim();
  return t === "" ? null : t;
}
