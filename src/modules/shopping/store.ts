import * as realApi from "@/lib/supabase/shopping";
import type { ShoppingApi } from "@/lib/supabase/shopping";
import { subscribeShopping as realSubscribe, type ChannelStatus, type ShoppingChange } from "@/lib/supabase/realtime";
import type { StockFailure, StockResult } from "@/lib/supabase/stock";
import { cmpTs } from "@/lib/timestamp";
import { TimeoutError, withTimeout } from "@/lib/timing";
import type { RegisterResult, ShoppingHooks, UndoHandle } from "@/modules/stock/store";
import type { RegistrationInput } from "@/modules/stock/registration";
import { MemoryShoppingLocal } from "./memory-local";
import { applyOps, coalesce, pendingCount } from "./outbox";
import { hasVisibleName, listView } from "./list-view";
import type {
  CheckInResult, CheckInSubmission, EntryPatch, ItemName, NewOutboxOp, OutboxOp, ShoppingListEntry, ShoppingLocal, ShoppingMemo, ShoppingSnapshot,
} from "./types";

// 買い物リストと買い物メモの状態の入れ物(30_architecture.md Interfaces §6)。React の外の小さなクラスで、useSyncExternalStore で画面とつなぐ。
// 書き込みの入口は enqueue だけ(決まり 1)。画面の値 = 写し + 行列を順に当てたもの(決まり 2)。送信は「行列を古い順に1件ずつ → 差分の取り込み」(決まり 4〜6)。
// part 1 の端末のデータは記憶の中(MemoryShoppingLocal)。part 2 で Dexie に載せ替える(ShoppingLocal の実体を替えるだけ)。

export const SHOPPING_REQUEST_TIMEOUT_MS = 10_000;
/** 差分の取り込みの重なり(L-13)。トランザクションの始まりの時刻で付く updated_at の取り違えを吸収する */
export const PULL_OVERLAP_MS = 60_000;
const POLL_INTERVAL_MS = 30_000;
/** メモは打つたびに送らない(最後の1つにまとめて送る) */
const MEMO_FLUSH_DELAY_MS = 600;
/** サーバーの行が届けば必ず置き換わる、端末で作った行の更新時刻 */
const EPOCH = "1970-01-01T00:00:00.000000+00:00";

export type ShoppingFailureNotice = { kind: "save_failed" | "undo_failed"; itemName: string };
export type AddResult = { ok: true } | { ok: false; reason: "empty" | "duplicate"; name: string };
export type ShoppingSubscribeFn = (
  householdId: string,
  onChange: (change: ShoppingChange) => void,
  onStatus: (status: ChannelStatus) => void,
) => () => void;
export type ShoppingDeps = {
  api?: ShoppingApi;
  local?: ShoppingLocal;
  subscribe?: ShoppingSubscribeFn;
  now?: () => Date;
  newId?: () => string;
  timeoutMs?: number;
  isOnline?: () => boolean;
};

export class ShoppingStore implements ShoppingHooks {
  private readonly api: ShoppingApi;
  private readonly local: ShoppingLocal;
  private readonly subscribeChannel: ShoppingSubscribeFn;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly timeoutMs: number;

  private copy = new Map<string, ShoppingListEntry>();
  private memoCopy: ShoppingMemo | null = null;
  private outbox: OutboxOp[] = [];
  private cursor: string | null = null;
  private candidates: ItemName[] = [];
  private nextSeq = 1;
  private lockedSeq: number | null = null;

  private load: "loading" | "ready" | "error" = "loading";
  private connection: ShoppingSnapshot["connection"];
  private listeners = new Set<() => void>();
  private failureListeners = new Set<(n: ShoppingFailureNotice) => void>();
  private snapshot: ShoppingSnapshot;
  private dirty = true;

  private started = false;
  private stopped = false;
  private syncPromise: Promise<void> | null = null;
  private syncAgain = false;
  private commitChain: Promise<void> = Promise.resolve();
  private memoTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeChannel: (() => void) | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private cleanups: Array<() => void> = [];

  constructor(private readonly householdId: string, deps: ShoppingDeps = {}) {
    this.api = deps.api ?? realApi;
    this.local = deps.local ?? new MemoryShoppingLocal();
    this.subscribeChannel = deps.subscribe ?? realSubscribe;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.timeoutMs = deps.timeoutMs ?? SHOPPING_REQUEST_TIMEOUT_MS;
    const isOnline = deps.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine));
    this.connection = isOnline() ? "online" : "offline";
    this.snapshot = this.build();
  }

  // ---- 画面とのつなぎ ----
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = (): ShoppingSnapshot => {
    if (this.dirty) {
      this.snapshot = this.build();
      this.dirty = false;
    }
    return this.snapshot;
  };
  onFailure(listener: (n: ShoppingFailureNotice) => void): () => void {
    this.failureListeners.add(listener);
    return () => {
      this.failureListeners.delete(listener);
    };
  }
  private notify(n: ShoppingFailureNotice): void {
    for (const l of this.failureListeners) l(n);
  }
  private emit(): void {
    this.dirty = true;
    for (const l of this.listeners) l();
  }
  private view(): { list: ShoppingListEntry[]; memo: ShoppingMemo | null } {
    return applyOps([...this.copy.values()], this.memoCopy, this.outbox, this.householdId);
  }
  private build(): ShoppingSnapshot {
    const v = this.view();
    return {
      load: this.load,
      connection: this.connection,
      entries: listView(v.list),
      memo: v.memo,
      candidates: this.candidates,
      pendingCount: pendingCount(this.outbox),
      hasLocalCopy: this.cursor !== null,
    };
  }
  /** 写しへの書き込み(順番どおりに1つずつ)。失敗しても画面は止めない(端末のデータは補助。正本はサーバー) */
  private persist(change: Parameters<ShoppingLocal["commit"]>[0]): void {
    this.commitChain = this.commitChain.then(() => this.local.commit(change)).catch(() => undefined);
  }

  // ---- 開始と終了 ----
  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    this.unsubscribeChannel = this.subscribeChannel(
      this.householdId,
      (change) => this.applyChange(change),
      (status) => this.onChannelStatus(status),
    );
    if (typeof window !== "undefined") {
      const onOnline = () => this.setOnline(true);
      const onOffline = () => this.setOnline(false);
      const onVisible = () => {
        if (document.visibilityState === "visible") void this.syncIfOnline();
      };
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      document.addEventListener("visibilitychange", onVisible);
      this.cleanups.push(
        () => window.removeEventListener("online", onOnline),
        () => window.removeEventListener("offline", onOffline),
        () => document.removeEventListener("visibilitychange", onVisible),
      );
    }
    this.interval = setInterval(() => void this.syncIfOnline(), POLL_INTERVAL_MS);
    void this.init();
  }
  stop(): void {
    this.stopped = true;
    this.started = false;
    if (this.memoTimer) clearTimeout(this.memoTimer);
    this.memoTimer = null;
    this.unsubscribeChannel?.();
    this.unsubscribeChannel = null;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    for (const c of this.cleanups) c();
    this.cleanups = [];
  }
  /** 読み込みの失敗からの「もう一度」 */
  reload(): void {
    if (this.load === "error") {
      this.load = "loading";
      this.emit();
    }
    void this.syncIfOnline();
  }
  /** ログアウト(L-19): 端末の写しと行列を消す */
  async clearLocal(): Promise<void> {
    await this.commitChain;
    await this.local.clear();
  }

  private async init(): Promise<void> {
    const saved = await this.local.load();
    if (this.stopped) return;
    for (const e of saved.list) if (!this.copy.has(e.id)) this.copy.set(e.id, e);
    if (!this.memoCopy) this.memoCopy = saved.memo;
    // init の前に enqueue された op があれば、その後ろに並べる
    const added = this.outbox;
    this.outbox = [...saved.outbox, ...added];
    this.nextSeq = Math.max(this.nextSeq, ...this.outbox.map((o) => o.seq + 1));
    if (this.candidates.length === 0) this.candidates = saved.candidates;
    this.cursor = saved.cursor;
    if (this.cursor !== null) this.load = "ready";
    this.emit();
    void this.syncIfOnline();
  }

  setOnline(online: boolean): void {
    if (online) {
      if (this.connection === "offline") {
        this.connection = "online";
        this.emit();
      }
      void this.syncIfOnline();
    } else if (this.connection !== "offline") {
      this.connection = "offline";
      this.emit();
    }
  }
  private onChannelStatus(status: ChannelStatus): void {
    if (this.stopped) return;
    if (status === "subscribed") {
      if (this.connection === "reconnecting") {
        this.connection = "online";
        this.emit();
      }
      void this.syncIfOnline();
    } else if ((status === "reconnecting" || status === "denied") && this.connection === "online") {
      this.connection = "reconnecting";
      this.emit();
    }
  }

  // ---- 同期(決まり 4〜6): いつも「行列を送る → 差分を取り込む」。同時に2つ走らせない ----
  /** いま同期する(送る → 取り込む)。オフラインなら何もしない。テストと「もう一度」から使う */
  syncNow(): Promise<void> {
    return this.syncIfOnline();
  }
  private syncIfOnline(): Promise<void> {
    if (this.stopped || this.connection === "offline") return Promise.resolve();
    return this.sync();
  }
  private sync(): Promise<void> {
    if (this.syncPromise) {
      this.syncAgain = true;
      return this.syncPromise;
    }
    const run = (async () => {
      try {
        do {
          this.syncAgain = false;
          await this.flush();
          await this.pull();
        } while (this.syncAgain && !this.stopped && this.connection !== "offline");
      } finally {
        this.syncPromise = null;
      }
    })();
    this.syncPromise = run;
    return run;
  }

  private async run<T>(fn: (signal: AbortSignal) => Promise<StockResult<T>>): Promise<StockResult<T>> {
    try {
      return await withTimeout(fn, this.timeoutMs);
    } catch (e) {
      return { ok: false, reason: e instanceof TimeoutError ? "timeout" : "unknown" };
    }
  }

  /** 行列を古い順に1件ずつ送る。通信の失敗は止めて残す。拒まれた op は捨てて知らせる(行列が永久に詰まらないため) */
  private async flush(): Promise<void> {
    while (!this.stopped && this.connection !== "offline") {
      const op = this.outbox[0];
      if (!op) return;
      this.lockedSeq = op.seq;
      const result = await this.send(op);
      this.lockedSeq = null;
      if (result.ok) {
        this.dropOp(op.seq, result.rows, result.memo);
        continue;
      }
      if (result.reason === "network" || result.reason === "timeout") return;
      this.dropOp(op.seq, []);
      this.notify({ kind: "save_failed", itemName: this.nameOfOp(op) });
    }
  }
  private dropOp(seq: number, rows: ShoppingListEntry[], memo?: ShoppingMemo): void {
    this.outbox = this.outbox.filter((o) => o.seq !== seq);
    for (const r of rows) this.copy.set(r.id, r);
    if (memo) this.memoCopy = memo;
    this.persist({ list: rows, memo, outboxRemove: [seq] });
    this.emit();
  }
  private nameOfOp(op: OutboxOp): string {
    if (op.kind === "set_memo") return "買い物メモ";
    return this.view().list.find((e) => e.id === op.id)?.name ?? "";
  }
  private async send(op: OutboxOp): Promise<{ ok: true; rows: ShoppingListEntry[]; memo?: ShoppingMemo } | { ok: false; reason: StockFailure }> {
    if (op.kind === "insert_manual") {
      const r = await this.run((s) => this.api.insertManual({ id: op.id, householdId: this.householdId, name: op.name }, s));
      if (!r.ok) return r;
      // サーバーの行は次の取り込みで届く。それまで消えないよう、端末で作った行を写しに入れる(更新時刻が古いので、届けば置き換わる)
      const made = applyOps([], null, [op], this.householdId).list[0];
      return { ok: true, rows: [{ ...made, updatedAt: EPOCH }] };
    }
    if (op.kind === "patch_entry") {
      const r = await this.run((s) => this.api.patchEntry(op.id, op.patch, s));
      return r.ok ? { ok: true, rows: this.newer([r.value]) } : r;
    }
    const r = await this.run((s) => this.api.setMemo(this.householdId, op.body, s));
    return r.ok ? { ok: true, rows: [], memo: r.value } : r;
  }
  /** 写しより新しい行だけ(古い知らせで巻き戻さない) */
  private newer(rows: ShoppingListEntry[]): ShoppingListEntry[] {
    return rows.filter((r) => {
      const cur = this.copy.get(r.id);
      return !cur || cmpTs(r.updatedAt, cur.updatedAt) >= 0;
    });
  }

  /** 差分の取り込み(決まり 5)。cursor が無ければ全部。メモは毎回1行 */
  private async pull(): Promise<void> {
    if (this.stopped || this.connection === "offline") return;
    let since: string | null = null;
    if (this.cursor !== null) {
      const ms = Date.parse(this.cursor);
      since = Number.isNaN(ms) ? null : new Date(ms - PULL_OVERLAP_MS).toISOString();
    }
    const [list, memo] = await Promise.all([
      this.run((s) => this.api.fetchList(this.householdId, since, s)),
      this.run((s) => this.api.fetchMemo(this.householdId, s)),
    ]);
    if (this.stopped) return;
    if (!list.ok || !memo.ok) {
      if (this.load !== "ready") {
        this.load = "error";
        this.emit();
      }
      return;
    }
    const changed = this.newer(list.value);
    for (const r of changed) this.copy.set(r.id, r);
    if (memo.value) this.memoCopy = memo.value;
    let cursor = this.cursor;
    for (const t of [...list.value.map((r) => r.updatedAt), ...(memo.value ? [memo.value.updatedAt] : [])]) {
      if (cursor === null || cmpTs(t, cursor) > 0) cursor = t;
    }
    this.cursor = cursor;
    this.load = "ready";
    this.persist({ list: changed, memo: memo.value ?? undefined, cursor });
    this.emit();
  }

  /** Realtime の知らせ(決まり 7)。メモは、送っていない set_memo がある間は画面の本文が変わらない(view が行列を当てるので自然にそうなる) */
  private applyChange(change: ShoppingChange): void {
    if (this.stopped) return;
    if (change.table === "shopping_list") {
      const rows = this.newer([change.row]);
      for (const r of rows) this.copy.set(r.id, r);
      this.persist({ list: rows });
    } else {
      if (!this.memoCopy || cmpTs(change.row.updatedAt, this.memoCopy.updatedAt) >= 0) {
        this.memoCopy = change.row;
        this.persist({ memo: change.row });
      }
    }
    this.emit();
  }

  // ---- 書き込みの入口(決まり 1) ----
  private enqueue(op: NewOutboxOp): void {
    const plan = coalesce(this.outbox, op, this.lockedSeq);
    const add: OutboxOp[] = plan.add ? [{ ...plan.add, seq: this.nextSeq++ } as OutboxOp] : [];
    const removed = new Set(plan.remove);
    const put = new Map(plan.put.map((o) => [o.seq, o]));
    this.outbox = [...this.outbox.filter((o) => !removed.has(o.seq)).map((o) => put.get(o.seq) ?? o), ...add];
    this.persist({ outboxAdd: add, outboxPut: plan.put, outboxRemove: plan.remove });
    this.emit();
    if (this.connection === "offline") return;
    if (op.kind === "set_memo") {
      if (this.memoTimer) clearTimeout(this.memoTimer);
      this.memoTimer = setTimeout(() => void this.syncIfOnline(), MEMO_FLUSH_DELAY_MS);
    } else {
      void this.syncIfOnline();
    }
  }
  private at(): string {
    return this.now().toISOString();
  }
  private entryOf(id: string): ShoppingListEntry | undefined {
    return this.view().list.find((e) => e.id === id);
  }

  // ---- 画面からの操作。すべて enqueue を通る。オフラインでも動く ----
  toggle(id: string): void {
    const e = this.entryOf(id);
    if (!e) return;
    this.enqueue({ kind: "patch_entry", id, patch: { isChecked: !e.isChecked }, at: this.at() });
  }
  /** 自動の行 → 外した印、手入力の行 → 削除の印。「元に戻す」は印を外すだけ(並びも戻る) */
  dismiss(id: string): UndoHandle | null {
    const e = this.entryOf(id);
    if (!e) return null;
    const manual = e.source === "manual";
    const patch: EntryPatch = manual ? { deleted: true } : { isDismissed: true };
    const inverse: EntryPatch = manual ? { deleted: false } : { isDismissed: false };
    this.enqueue({ kind: "patch_entry", id, patch, at: this.at() });
    let undone = false;
    return {
      label: `${e.name}を外しました`,
      undo: () => {
        if (undone) return;
        undone = true;
        this.enqueue({ kind: "patch_entry", id, patch: inverse, at: this.at() });
      },
    };
  }
  /** 前後の空白を除く。空なら何もしない。画面に出ている行に同じ名前があれば足さない(45 の決定 4 A) */
  addManual(raw: string): AddResult {
    const name = raw.trim();
    if (name === "" || name.length > 100) return { ok: false, reason: "empty", name };
    if (hasVisibleName(this.view().list, name)) return { ok: false, reason: "duplicate", name };
    this.enqueue({ kind: "insert_manual", id: this.newId(), name, at: this.at() });
    return { ok: true };
  }
  setMemo(body: string): void {
    this.enqueue({ kind: "set_memo", body: body.slice(0, 10_000), at: this.at() });
  }
  setCandidates(items: ItemName[]): void {
    const same = items.length === this.candidates.length && items.every((x, i) => x.id === this.candidates[i].id && x.name === this.candidates[i].name);
    if (same) return;
    this.candidates = items;
    this.persist({ candidates: items });
    this.emit();
  }

  // ---- 在庫登録(オンラインだけ。決まり 9・10) ----
  /**
   * (a) 行列を全部送る (b) 取り込む (c) カードごとに register、成功したカードの行はそのつど消す
   * (d) 最後に残量の行と外した行を消す (e) 取り込む。途中で失敗したら止める(登録済みのカードの行は消えているので、もう一度確定しても二重に入らない)。
   */
  async checkIn(args: {
    submissions: CheckInSubmission[];
    levelEntryIds: string[];
    register: (input: RegistrationInput) => Promise<RegisterResult>;
  }): Promise<CheckInResult> {
    let done = 0;
    if (this.connection === "offline") return { ok: false, reason: "offline", failedEntryId: null, done };
    await this.sync();
    if (this.outbox.length > 0) return { ok: false, reason: "network", failedEntryId: null, done };
    for (const sub of args.submissions) {
      const r = await args.register(sub.input);
      if (!r.ok) {
        await this.syncIfOnline();
        return { ok: false, reason: typeof r.reason === "string" ? r.reason : "validation", failedEntryId: sub.entryId, done };
      }
      const fin = await this.run((s) => this.api.finishCheckIn(this.householdId, [sub.entryId], false, s));
      if (!fin.ok) return { ok: false, reason: fin.reason, failedEntryId: sub.entryId, done };
      this.markDeleted([sub.entryId]);
      done++;
    }
    const last = await this.run((s) => this.api.finishCheckIn(this.householdId, args.levelEntryIds, true, s));
    if (!last.ok) return { ok: false, reason: last.reason, failedEntryId: null, done };
    this.markDeleted(args.levelEntryIds);
    await this.syncIfOnline();
    return { ok: true };
  }
  /** 確定した行を、写しの上で消えたことにする(サーバーの行が届くまで。更新時刻は古いまま = 届けば置き換わる) */
  private markDeleted(ids: string[]): void {
    const rows: ShoppingListEntry[] = [];
    for (const id of ids) {
      const cur = this.copy.get(id);
      if (cur) rows.push({ ...cur, deletedAt: this.at() });
    }
    for (const r of rows) this.copy.set(r.id, r);
    this.persist({ list: rows });
    this.emit();
  }

  // ---- 品物の削除の控え(ShoppingHooks。R3-11、ADR 0010) ----
  linkedEntries(itemId: string, itemName: string): ShoppingListEntry[] {
    return this.view().list.filter((e) => e.deletedAt === null && (e.itemId === itemId || (e.itemId === null && e.name === itemName)));
  }
  async restoreEntries(rows: ShoppingListEntry[]): Promise<boolean> {
    if (this.connection === "offline") return false;
    const r = await this.run((s) => this.api.restoreEntries(rows.map((e) => ({ id: e.id, itemId: e.itemId })), s));
    await this.syncIfOnline();
    return r.ok;
  }
}
