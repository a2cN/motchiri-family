import Dexie, { type EntityTable } from "dexie";
import type { ItemName, OutboxOp, ShoppingListEntry, ShoppingMemo } from "@/modules/shopping/types";

// 端末のデータ(IndexedDB。30_architecture.md Interfaces §7)。dexie を import してよいのは src/lib/local/ だけ(ESLint。ADR 0004 の決まり)。
// 写しは1つの世帯・1人の利用者のもの。meta の householdId・userId がログインした人と違えば、使う前に消す(L-19)。

export type MetaRow =
  | { key: "owner"; value: { householdId: string; userId: string } }
  | { key: "cursor"; value: string | null }
  | { key: "candidates"; value: ItemName[] };

export type MotchiriDb = Dexie & {
  shoppingList: EntityTable<ShoppingListEntry, "id">;
  shoppingMemo: EntityTable<ShoppingMemo, "householdId">;
  outbox: EntityTable<OutboxOp, "seq">;
  meta: EntityTable<MetaRow, "key">;
};

export const DB_NAME = "motchiri-family";

export function createDb(name: string = DB_NAME): MotchiriDb {
  const db = new Dexie(name) as MotchiriDb;
  db.version(1).stores({
    shoppingList: "id",
    shoppingMemo: "householdId",
    // seq は store が付ける(写しの最大 + 1)ので、自動採番ではなく渡された値を主キーにする
    outbox: "seq",
    meta: "key",
  });
  return db;
}
