import type { LocalChange, ShoppingLocal } from "@/modules/shopping/types";
import { createDb, type MotchiriDb } from "./db";

// ShoppingLocal の Dexie の実体(30_architecture.md Interfaces §6・§7)。commit は1つのトランザクション。
// 世帯・利用者が違う写しは、使う前に消す(L-19)。

export type LocalOwner = { householdId: string; userId: string | null };

export class DexieShoppingLocal implements ShoppingLocal {
  private readonly db: MotchiriDb;
  private ready: Promise<void> | null = null;

  constructor(private readonly owner: LocalOwner, db?: MotchiriDb) {
    this.db = db ?? createDb();
  }

  /** この写しがログインした人のものか確かめ、違えば消す。同じ人なら何もしない */
  private ensureOwner(): Promise<void> {
    this.ready ??= (async () => {
      const row = await this.db.meta.get("owner");
      const saved = row?.key === "owner" ? row.value : null;
      const same = saved !== null && saved.householdId === this.owner.householdId && (this.owner.userId === null || saved.userId === this.owner.userId);
      if (!same && (saved !== null || (await this.hasAnyRow()))) await this.wipe();
      if (!same && this.owner.userId !== null) await this.db.meta.put({ key: "owner", value: { householdId: this.owner.householdId, userId: this.owner.userId } });
    })();
    return this.ready;
  }
  private async hasAnyRow(): Promise<boolean> {
    return (await this.db.shoppingList.count()) + (await this.db.shoppingMemo.count()) + (await this.db.outbox.count()) > 0;
  }
  private async wipe(): Promise<void> {
    await this.db.transaction("rw", [this.db.shoppingList, this.db.shoppingMemo, this.db.outbox, this.db.meta], async () => {
      await Promise.all([this.db.shoppingList.clear(), this.db.shoppingMemo.clear(), this.db.outbox.clear(), this.db.meta.clear()]);
    });
  }

  async load() {
    await this.ensureOwner();
    const [list, memos, outbox, cursor, candidates] = await Promise.all([
      this.db.shoppingList.toArray(),
      this.db.shoppingMemo.toArray(),
      this.db.outbox.orderBy("seq").toArray(),
      this.db.meta.get("cursor"),
      this.db.meta.get("candidates"),
    ]);
    return {
      list,
      memo: memos.find((m) => m.householdId === this.owner.householdId) ?? null,
      outbox,
      candidates: candidates?.key === "candidates" ? candidates.value : [],
      cursor: cursor?.key === "cursor" ? cursor.value : null,
    };
  }

  async commit(change: LocalChange): Promise<void> {
    await this.ensureOwner();
    const { db } = this;
    await db.transaction("rw", [db.shoppingList, db.shoppingMemo, db.outbox, db.meta], async () => {
      if (change.list?.length) await db.shoppingList.bulkPut(change.list);
      if (change.memo) await db.shoppingMemo.put(change.memo);
      if (change.cursor !== undefined) await db.meta.put({ key: "cursor", value: change.cursor });
      if (change.candidates) await db.meta.put({ key: "candidates", value: change.candidates });
      if (change.outboxRemove?.length) await db.outbox.bulkDelete(change.outboxRemove);
      if (change.outboxPut?.length) await db.outbox.bulkPut(change.outboxPut);
      if (change.outboxAdd?.length) await db.outbox.bulkPut(change.outboxAdd);
    });
  }

  async clear(): Promise<void> {
    await this.wipe();
    this.ready = null;
  }
}

/** ログアウトのとき、store が無くても端末のデータを消す(L-19) */
export async function clearLocalData(): Promise<void> {
  const db = createDb();
  try {
    await db.transaction("rw", [db.shoppingList, db.shoppingMemo, db.outbox, db.meta], async () => {
      await Promise.all([db.shoppingList.clear(), db.shoppingMemo.clear(), db.outbox.clear(), db.meta.clear()]);
    });
  } finally {
    db.close();
  }
}

/** この写しの持ち主を調べる(別の利用者のログインで消す判断に使う) */
export async function readOwner(): Promise<{ householdId: string; userId: string } | null> {
  const db = createDb();
  try {
    const row = await db.meta.get("owner");
    return row?.key === "owner" ? row.value : null;
  } finally {
    db.close();
  }
}
