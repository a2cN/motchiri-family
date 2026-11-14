// 送信待ち行列の純粋な関数(30_architecture.md Interfaces §6 の 2・3・8、L-11・L-12・L-20)。
// 画面の値 = applyOps(写し, 行列)。合流(coalesce)は「同じ宛先の送っていない op をまとめる」だけで、送信中の op には触れない。
import type { EntryPatch, NewOutboxOp, OutboxOp, ShoppingListEntry, ShoppingMemo } from "./types";

/** 写しに行列を順に当てた画面の値。memo が null(まだ写しが無い)でも、行列の set_memo があれば本文だけで作る */
export function applyOps(
  list: readonly ShoppingListEntry[],
  memo: ShoppingMemo | null,
  ops: readonly OutboxOp[],
  householdId: string,
): { list: ShoppingListEntry[]; memo: ShoppingMemo | null } {
  const rows = new Map(list.map((e) => [e.id, e]));
  let outMemo = memo;
  for (const op of ops) {
    if (op.kind === "insert_manual") {
      if (!rows.has(op.id)) {
        rows.set(op.id, {
          id: op.id, householdId, createdAt: op.at, updatedAt: op.at, itemId: null, name: op.name, source: "manual",
          isChecked: false, isDismissed: false, prevStockLevel: null, deletedAt: null,
        });
      }
    } else if (op.kind === "patch_entry") {
      const cur = rows.get(op.id);
      if (cur) rows.set(op.id, applyPatch(cur, op.patch, op.at));
    } else {
      outMemo = { householdId, updatedAt: outMemo?.updatedAt ?? op.at, body: op.body };
    }
  }
  return { list: [...rows.values()], memo: outMemo };
}

export function applyPatch(entry: ShoppingListEntry, patch: EntryPatch, at: string): ShoppingListEntry {
  return {
    ...entry,
    ...(patch.isChecked !== undefined ? { isChecked: patch.isChecked } : {}),
    ...(patch.isDismissed !== undefined ? { isDismissed: patch.isDismissed } : {}),
    ...(patch.deleted !== undefined ? { deletedAt: patch.deleted ? at : null } : {}),
  };
}

export type EnqueuePlan = { add: NewOutboxOp | null; put: OutboxOp[]; remove: number[] };

/**
 * 新しい op を行列に足すときの合流(L-12)。locked は送信中の op の seq(触れない)。
 * - set_memo: 送っていない set_memo は最後の1つだけ残す
 * - patch_entry: 同じ行の送っていない patch_entry とまとめる(後の値が勝つ)。insert_manual にはまとめない(insert を先に送る)
 * - insert_manual: そのまま足す
 */
export function coalesce(ops: readonly OutboxOp[], op: NewOutboxOp, locked: number | null): EnqueuePlan {
  const free = (o: OutboxOp) => o.seq !== locked;
  if (op.kind === "set_memo") {
    return { add: op, put: [], remove: ops.filter((o) => o.kind === "set_memo" && free(o)).map((o) => o.seq) };
  }
  if (op.kind === "patch_entry") {
    const prev = ops.find((o): o is Extract<OutboxOp, { kind: "patch_entry" }> => o.kind === "patch_entry" && o.id === op.id && free(o));
    if (prev) return { add: null, put: [{ ...prev, patch: { ...prev.patch, ...op.patch }, at: op.at }], remove: [] };
  }
  return { add: op, put: [], remove: [] };
}

/** 未同期の件数(L-20): 行列の宛先の数。同じ行への変更は1件、メモは1件 */
export function pendingCount(ops: readonly OutboxOp[]): number {
  return new Set(ops.map((o) => (o.kind === "set_memo" ? "memo" : o.id))).size;
}
