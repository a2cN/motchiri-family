// 在庫登録の計画(30_architecture.md Interfaces §8、L-06・L-10)。純粋な関数。
// チェックした行を、品物(itemId、無ければ同じ名前)で分ける: 残量で管理の既存の品物 = 残量はチェックのとき ○ になっているので確定でリストから消すだけ /
// 数で管理の既存の品物 = カード(個数・食材は期限と場所)/ 品物がまだ無い名前 = 新しい品物のカード。
import { parseQuantity, type QuantityParse } from "@/modules/stock/quantity";
import { prefillFromItem, type RegistrationInput } from "@/modules/stock/registration";
import { restockColumnsDefault } from "@/modules/stock/restock";
import type { Item, ItemKind, StockData, StockLevel, Tracking } from "@/modules/stock/types";
import { checkedEntries, listView } from "./list-view";
import type { CheckInCard, CheckInPlan, ShoppingListEntry } from "./types";

/** チェックした行(画面に出ているもの)の、品物。itemId の品物、無ければ同じ名前の品物(OD-stock-uiux-50 (9)) */
export function itemOfEntry(entry: ShoppingListEntry, data: StockData): Item | undefined {
  return (entry.itemId ? data.items.find((i) => i.id === entry.itemId) : undefined) ?? data.items.find((i) => i.name === entry.name);
}

export function planCheckIn(entries: readonly ShoppingListEntry[], data: StockData): CheckInPlan {
  const cards: CheckInCard[] = [];
  const levelEntries: ShoppingListEntry[] = [];
  for (const entry of checkedEntries(listView(entries))) {
    const item = itemOfEntry(entry, data);
    if (!item) cards.push({ kind: "new", entry });
    else if (item.tracking === "level") levelEntries.push(entry);
    else cards.push({ kind: "count", entry, itemId: item.id });
  }
  return { cards, levelEntries };
}

/** 「N件を在庫に登録する」のN = 在庫登録の確定で消える行の数(カード + 残量の行) */
export const checkInTotal = (plan: CheckInPlan): number => plan.cards.length + plan.levelEntries.length;

/** カードの入力(画面の値)。文字の欄は文字のまま持つ */
export type CardEdits = {
  kind: ItemKind;
  tracking: Tracking;
  genreId: string | null;
  supplyGenre: string;
  unitId: string | null;
  qty: string;
  stockLevel: StockLevel;
  expiresOn: string;
  locationId: string | null;
};

export function initialEdits(card: CheckInCard, data: StockData, today: string): CardEdits {
  const blank: CardEdits = {
    kind: "food", tracking: "count", genreId: null, supplyGenre: "", unitId: null, qty: "1", stockLevel: "full", expiresOn: "", locationId: null,
  };
  if (card.kind === "new") return blank;
  const item = data.items.find((i) => i.id === card.itemId);
  if (!item) return blank;
  const pre = prefillFromItem(item, data, today);
  return {
    ...blank,
    kind: item.itemKind,
    tracking: item.tracking,
    genreId: item.genreId,
    unitId: item.unitId,
    expiresOn: item.itemKind === "food" ? (pre.expiresOn ?? "") : "",
    locationId: item.itemKind === "food" ? pre.locationId : null,
  };
}

export type CardErrors = { genre?: true; unit?: true; qty?: Extract<QuantityParse, { ok: false }>["error"] };

/** 誤りの順はジャンル → 単位 → 個数(モックと同じ) */
export function toRegistrationInput(
  card: CheckInCard,
  edits: CardEdits,
  data: StockData,
  today: string,
): RegistrationInput | { errors: CardErrors } {
  const name = card.entry.name;
  const item = card.kind === "count" ? data.items.find((i) => i.id === card.itemId) : undefined;
  const kind = item ? item.itemKind : edits.kind;
  const tracking = item ? item.tracking : edits.tracking;
  const genreId = item ? item.genreId : kind === "food" ? edits.genreId : null;
  const unitId = item ? item.unitId : tracking === "count" ? edits.unitId : null;
  const errors: CardErrors = {};
  if (kind === "food" && genreId === null) errors.genre = true;
  if (tracking === "count" && unitId === null) errors.unit = true;
  let quantity: number | null = null;
  if (tracking === "count") {
    const q = parseQuantity(edits.qty, "positive");
    if (q.ok) quantity = q.value;
    else errors.qty = q.error;
  }
  if (Object.keys(errors).length > 0) return { errors };
  const restock = item
    ? { restockAtCount: item.restockAtCount, restockAtLevel: item.restockAtLevel }
    : restockColumnsDefault(tracking);
  const supplyGenre = kind === "supply" ? (item ? item.supplyGenre : edits.supplyGenre.trim() === "" ? null : edits.supplyGenre.trim()) : null;
  return {
    kind,
    name,
    tracking,
    genreId,
    supplyGenre,
    note: item ? item.note : null,
    unitId,
    quantity,
    stockLevel: item?.stockLevel ?? edits.stockLevel,
    locationId: kind === "food" ? edits.locationId : null,
    purchasedOn: today,
    expiresOn: kind === "food" && tracking === "count" && edits.expiresOn !== "" ? edits.expiresOn : null,
    restockAtCount: restock.restockAtCount,
    restockAtLevel: restock.restockAtLevel,
  };
}
