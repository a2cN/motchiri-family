// ShoppingLocal の記憶の中の実体(part 1 の本番と、単体テストの偽物。part 2 で Dexie に載せ替える。30 Interfaces §6)。
import type { ItemName, LocalChange, OutboxOp, ShoppingListEntry, ShoppingLocal, ShoppingMemo } from "./types";

export class MemoryShoppingLocal implements ShoppingLocal {
  private list = new Map<string, ShoppingListEntry>();
  private memo: ShoppingMemo | null = null;
  private outbox: OutboxOp[] = [];
  private candidates: ItemName[] = [];
  private cursor: string | null = null;
  /** テスト用: commit の回数 */
  commits = 0;

  async load() {
    return {
      list: [...this.list.values()],
      memo: this.memo,
      outbox: this.outbox.map((o) => ({ ...o })),
      candidates: [...this.candidates],
      cursor: this.cursor,
    };
  }

  async commit(change: LocalChange): Promise<void> {
    this.commits++;
    for (const e of change.list ?? []) this.list.set(e.id, e);
    if (change.memo) this.memo = change.memo;
    if (change.cursor !== undefined) this.cursor = change.cursor;
    if (change.candidates) this.candidates = change.candidates;
    const removed = new Set(change.outboxRemove ?? []);
    if (removed.size > 0) this.outbox = this.outbox.filter((o) => !removed.has(o.seq));
    for (const o of change.outboxPut ?? []) this.outbox = this.outbox.map((x) => (x.seq === o.seq ? o : x));
    for (const o of change.outboxAdd ?? []) this.outbox.push({ ...o });
  }

  async clear(): Promise<void> {
    this.list = new Map();
    this.memo = null;
    this.outbox = [];
    this.candidates = [];
    this.cursor = null;
  }
}
