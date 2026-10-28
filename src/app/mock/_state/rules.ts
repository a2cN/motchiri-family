import type { Item, ItemStock, ShoppingEntry, ShoppingSource } from "../_data/types";

// 買い物リストに自動で載る規則(ST-L01、OD-stock-uiux-39・48 A)。状態の外に置いた、画面を持たない関数。
// モックと一緒に消える。

/** 数で管理の品物の在庫の合計(小数第一位までの足し算の誤差を丸める) */
export function totalOf(stocks: ItemStock[], itemId: string): number {
  const sum = stocks.filter((s) => s.itemId === itemId).reduce((acc, s) => acc + s.quantity, 0);
  return Math.round(sum * 10) / 10;
}

/**
 * 品物が、いま自動で載る発生元。載らなければ null。
 * 優先は 切れた(out)> 減った(low)> いつもの(regular)(OD-stock-uiux-48 A)。
 */
export function autoSource(item: Item, stocks: ItemStock[]): ShoppingSource | null {
  const r = item.restockAt;
  if (item.tracking === "count") {
    if (r.kind === "zero" || r.kind === "count") {
      const total = totalOf(stocks, item.id);
      if (total === 0) return "out";
      if (r.kind === "count" && total <= r.n) return "low";
    }
  } else {
    if (r.kind === "low" && item.stockLevel === "low") return "low";
    if ((r.kind === "low" || r.kind === "out") && item.stockLevel === "out") return "out";
  }
  return item.isRegular ? "regular" : null;
}

/**
 * 自動の項目を、いまの在庫・残量・いつもの に合わせる。
 * - 条件を満たす品物の行が無ければ、未チェックで足す(外した行は dismissed の間は足さない。同じ名前の手入力の行があれば足さない)
 * - 条件を外れた行は、チェックしていなければ消す(チェックしている行は残す)
 * - 条件を満たしている未チェックの行は、発生元を直す
 */
export function syncList(
  items: Item[],
  stocks: ItemStock[],
  list: ShoppingEntry[],
  dismissed: string[],
  nextId: () => string,
): ShoppingEntry[] {
  let result = list;
  for (const item of items) {
    const auto = autoSource(item, stocks);
    const existing = result.find((e) => e.itemId === item.id && e.source !== "manual");
    if (auto === null) {
      if (existing && !existing.checked) result = result.filter((e) => e.id !== existing.id);
      continue;
    }
    if (existing) {
      if (!existing.checked && existing.source !== auto) {
        result = result.map((e) => (e.id === existing.id ? { ...e, source: auto } : e));
      }
      continue;
    }
    if (dismissed.includes(item.id)) continue;
    if (result.some((e) => e.source === "manual" && e.name === item.name)) continue;
    result = [...result, { id: nextId(), name: item.name, source: auto, checked: false, itemId: item.id, checkedSeq: 0, prevLevel: null }];
  }
  return result;
}
