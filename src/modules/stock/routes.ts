// 倉庫の URL の組み立てと読み取り(30_architecture.md Interfaces §7、S-10)。画面が文字列で URL を作らない。
// 知らない値は既定に倒す(任意の URL へ移る道を作らない)。末尾スラッシュ(静的書き出し)。
import type { ItemKind } from "./types";

/** 上の階層の画面(タブがある)。戻り先・「来た元」になる */
export type StockOrigin = "stock" | "supply";
export type EditOrigin = StockOrigin | "items";

type Params = { get(name: string): string | null };

const ORIGIN_PATH: Record<StockOrigin, string> = { stock: "/stock/", supply: "/stock/supply/" };

export const stockHref = (section: StockOrigin): string => ORIGIN_PATH[section];

/** kind の既定は from から(supply → 日用品、ほか → 食材) */
export const kindOfOrigin = (from: StockOrigin): ItemKind => (from === "supply" ? "supply" : "food");

const readOrigin = (v: string | null): StockOrigin => (v === "supply" ? "supply" : "stock");
const readKind = (v: string | null, fallback: ItemKind): ItemKind => (v === "supply" ? "supply" : v === "food" ? "food" : fallback);

function query(entries: Array<[string, string | undefined]>): string {
  const q = entries.filter((e): e is [string, string] => e[1] !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return q.length > 0 ? `?${q.join("&")}` : "";
}

export function itemsHref(o: { from?: StockOrigin; kind?: ItemKind } = {}): string {
  return `/stock/items/${query([["from", o.from], ["kind", o.kind]])}`;
}
export const mastersHref = (o: { from?: StockOrigin } = {}): string => `/stock/masters/${query([["from", o.from]])}`;
export const itemNewHref = (o: { from?: StockOrigin } = {}): string => `/stock/item-new/${query([["from", o.from]])}`;
export function itemEditHref(o: { id: string; from: EditOrigin; items?: { from: StockOrigin; kind: ItemKind } }): string {
  return `/stock/item-edit/${query([
    ["id", o.id],
    ["from", o.from],
    ["kind", o.from === "items" ? o.items?.kind : undefined],
    ["itemsFrom", o.from === "items" ? o.items?.from : undefined],
  ])}`;
}

export function parseItemsQuery(params: Params): { from: StockOrigin; kind: ItemKind } {
  const from = readOrigin(params.get("from"));
  return { from, kind: readKind(params.get("kind"), kindOfOrigin(from)) };
}
export const parseOriginQuery = (params: Params): { from: StockOrigin } => ({ from: readOrigin(params.get("from")) });

export type EditQuery = { id: string | null; from: EditOrigin; items: { from: StockOrigin; kind: ItemKind } };
export function parseItemEditQuery(params: Params): EditQuery {
  const raw = params.get("from");
  const from: EditOrigin = raw === "items" ? "items" : readOrigin(raw);
  const itemsFrom = readOrigin(params.get("itemsFrom"));
  return {
    id: params.get("id"),
    from,
    items: { from: itemsFrom, kind: readKind(params.get("kind"), kindOfOrigin(itemsFrom)) },
  };
}

/** 「‹」の行き先 */
export function backHrefForEdit(q: EditQuery): string {
  return q.from === "items" ? itemsHref({ from: q.items.from, kind: q.items.kind }) : stockHref(q.from);
}
