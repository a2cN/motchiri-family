// 画面に出す行の並べ方と、手入力の候補・重複(30_architecture.md Interfaces §6、45 の決定 4)。
import { normalizeForSearch } from "@/modules/stock/supply";
import { cmpTs } from "@/lib/timestamp";
import type { ItemName, ShoppingListEntry } from "./types";

/**
 * 画面に出す行: 削除の印・外した印を除き、作った順(チェックしても動かない。OD-stock-uiux-17 A)。
 * 端末だけにある行(まだサーバーの写しに届いていない手入力。localIds)は、端末の時計とサーバーの時計を比べず、常に最後に置く。
 * 端末の createdAt と DB の createdAt を混ぜて比べると、同期で写しが届いた瞬間に行が飛ぶことがある。
 * DB の時計は単調に進むので、届いた後も最後(または再読み込みと同じ並び)になり、飛ばない。
 */
export function listView(entries: readonly ShoppingListEntry[], localIds: ReadonlySet<string> = new Set()): ShoppingListEntry[] {
  return entries
    .filter((e) => e.deletedAt === null && !e.isDismissed)
    .sort((a, b) => {
      const la = localIds.has(a.id) ? 1 : 0;
      const lb = localIds.has(b.id) ? 1 : 0;
      if (la !== lb) return la - lb;
      const c = cmpTs(a.createdAt, b.createdAt);
      return c !== 0 ? c : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

export const checkedEntries = (entries: readonly ShoppingListEntry[]): ShoppingListEntry[] => entries.filter((e) => e.isChecked);

/** 手入力の候補(品物の名前の部分一致。全角半角・大文字小文字をそろえる)。多くて max 件 */
export function candidatesFor(query: string, items: readonly ItemName[], max = 4): ItemName[] {
  const q = normalizeForSearch(query.trim());
  if (q === "") return [];
  return items.filter((i) => normalizeForSearch(i.name).includes(q)).slice(0, max);
}

/** 手入力の重複(45 の決定 4 A): 画面に出ている行に同じ名前があれば足さない */
export function hasVisibleName(entries: readonly ShoppingListEntry[], name: string): boolean {
  return listView(entries).some((e) => e.name === name);
}
