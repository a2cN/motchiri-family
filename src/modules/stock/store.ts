import * as realApi from "@/lib/supabase/stock";
import { subscribeHousehold as realSubscribe, type ChannelStatus, type RowChange } from "@/lib/supabase/realtime";
import type { StockFailure, StockResult, StockTable } from "@/lib/supabase/stock";
import { TimeoutError, withTimeout } from "@/lib/timing";
import { todayInJst } from "./dates";
import { NEXT_LEVEL } from "./levels";
import { stepQuantity } from "./quantity";
import { planRegistration, type RegistrationError, type RegistrationInput } from "./registration";
import {
  type AnyStockRow, type Genre, type Item, type ItemPatch, type ItemStock, type Location, type NewItem,
  type NewItemStock, type StockData, type StockLevel, type StockPatch, type Unit,
} from "./types";

// 倉庫の状態の入れ物(30_architecture.md Interfaces §6)。React の外の小さなクラスで、useSyncExternalStore で画面とつなぐ。
// 規則 1〜9 は 30 のとおり。画面に見せる値(view)と、最後にサーバーから受け取った値(server)を分けて持つ。

/** 読み込み・書き込みの1回ごとの通信の上限(D-15。根拠は OD-auth-household-22 A と同じ。測った値ではない) */
export const STOCK_REQUEST_TIMEOUT_MS = 10_000;
const TODAY_INTERVAL_MS = 60_000;

export type LoadState = "loading" | "ready" | "error";
export type Connection = "online" | "offline" | "reconnecting";
export type StockSnapshot = {
  load: LoadState;
  connection: Connection;
  /** 画面に見せる値(保存を待たない変更を含む) */
  data: StockData;
  /** 送信中・送信待ちの行の id */
  pendingIds: ReadonlySet<string>;
  /** 日本時間の今日。日付が変わったら変わる */
  today: string;
};
export type FailureNotice = { kind: "save_failed" | "gone"; itemName: string };
export type UndoHandle = { label: string; undo: () => void };
export type RegisterResult =
  | { ok: true }
  | { ok: false; reason: StockFailure | RegistrationError; input: RegistrationInput };

export interface StockApi {
  fetchStockData(householdId: string, signal: AbortSignal): Promise<StockResult<StockData>>;
  insertItem(row: NewItem, signal: AbortSignal): Promise<StockResult<Item>>;
  updateItem(id: string, patch: ItemPatch, signal: AbortSignal): Promise<StockResult<Item>>;
  insertStock(row: NewItemStock, signal: AbortSignal): Promise<StockResult<ItemStock>>;
  updateStock(id: string, patch: StockPatch, signal: AbortSignal): Promise<StockResult<ItemStock>>;
  deleteStock(id: string, signal: AbortSignal): Promise<StockResult<null>>;
}
export type SubscribeFn = (
  householdId: string,
  onChange: (change: RowChange) => void,
  onStatus: (status: ChannelStatus) => void,
) => () => void;

export type StoreDeps = {
  api?: StockApi;
  subscribe?: SubscribeFn;
  now?: () => Date;
  newId?: () => string;
  timeoutMs?: number;
  isOnline?: () => boolean;
};

type OpResult = { ok: true } | { ok: false; reason: StockFailure | "dependency" };
type Op = {
  kind: "insert" | "patch" | "delete";
  /** insert: 行の全体 / patch: 変える列だけ */
  payload?: Record<string, unknown>;
  /** 登録の途中の操作。失敗は FailureNotice にせず、register の戻り値で返す */
  silent: boolean;
  /** これが true になってから送る(false なら取りやめる)。品物の作成を待つ在庫の登録 */
  after?: Promise<boolean>;
  waiters: Array<(r: OpResult) => void>;
};
type Entry = { table: "item" | "item_stock"; id: string; inFlight: Op | null; running: boolean; queued: Op | null };



/** "2026-11-09T05:52:49.111983+00:00" のようなサーバーの時刻をマイクロ秒まで比べる(Date はミリ秒までしか持たない) */
function timeKey(ts: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(ts);
  if (m && (m[4] === undefined || m[4] === "Z" || /^[+-]00(:?00)?$/.test(m[4]))) return `${m[1]}T${m[2]}.${(m[3] ?? "").padEnd(6, "0").slice(0, 6)}`;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? ts : `${new Date(ms).toISOString().slice(0, 19)}.${String(ms % 1000).padStart(3, "0")}000`;
}
const cmpTs = (a: string, b: string): number => {
  const x = timeKey(a);
  const y = timeKey(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

export class StockStore {
  private readonly api: StockApi;
  private readonly subscribeChannel: SubscribeFn;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly timeoutMs: number;
  private readonly isOnline: () => boolean;

  private readonly view = this.emptyMaps();
  private readonly server = this.emptyMaps();
  private readonly entries = new Map<string, Entry>();
  private readonly touched = new Map<string, number>();
  private seq = 0;

  private listeners = new Set<() => void>();
  private failureListeners = new Set<(n: FailureNotice) => void>();
  private snapshot: StockSnapshot;
  private load: LoadState = "loading";
  private connection: Connection;
  private today: string;
  private dirty = true;

  private loading = false;
  private refreshAgain = false;
  private started = false;
  private stopped = false;
  private unsubscribeChannel: (() => void) | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private cleanups: Array<() => void> = [];

  constructor(private readonly householdId: string, deps: StoreDeps = {}) {
    this.api = deps.api ?? realApi;
    this.subscribeChannel = deps.subscribe ?? realSubscribe;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.timeoutMs = deps.timeoutMs ?? STOCK_REQUEST_TIMEOUT_MS;
    this.isOnline = deps.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine));
    this.connection = this.isOnline() ? "online" : "offline";
    this.today = todayInJst(this.now());
    this.snapshot = this.build();
  }

  // ---- 画面とのつなぎ ----
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = (): StockSnapshot => {
    if (this.dirty) {
      this.snapshot = this.build();
      this.dirty = false;
    }
    return this.snapshot;
  };
  onFailure(listener: (n: FailureNotice) => void): () => void {
    this.failureListeners.add(listener);
    return () => {
      this.failureListeners.delete(listener);
    };
  }

  private emptyMaps(): Record<StockTable, Map<string, AnyStockRow>> {
    return { genre: new Map(), location: new Map(), unit: new Map(), item: new Map(), item_stock: new Map() };
  }
  private viewData(): StockData {
    const v = this.view;
    return {
      genres: [...v.genre.values()] as Genre[],
      locations: [...v.location.values()] as Location[],
      units: [...v.unit.values()] as Unit[],
      items: [...v.item.values()] as Item[],
      stocks: [...v.item_stock.values()] as ItemStock[],
    };
  }
  private build(): StockSnapshot {
    return {
      load: this.load,
      connection: this.connection,
      data: this.viewData(),
      pendingIds: new Set([...this.entries.values()].map((e) => e.id)),
      today: this.today,
    };
  }
  private emit(): void {
    this.dirty = true;
    for (const l of this.listeners) l();
  }
  private touch(key: string): void {
    this.touched.set(key, ++this.seq);
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
        if (document.visibilityState === "visible") {
          this.refreshToday();
          void this.refresh();
        }
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
    this.interval = setInterval(() => this.refreshToday(), TODAY_INTERVAL_MS);
    void this.refresh();
  }
  stop(): void {
    this.stopped = true;
    this.started = false;
    this.unsubscribeChannel?.();
    this.unsubscribeChannel = null;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    for (const c of this.cleanups) c();
    this.cleanups = [];
  }
  reload(): void {
    if (this.load === "error") {
      this.load = "loading";
      this.emit();
    }
    void this.refresh();
  }

  private refreshToday(): void {
    const t = todayInJst(this.now());
    if (t !== this.today) {
      this.today = t;
      this.emit();
    }
  }

  /** online / offline の出来事(テストからも呼ぶ) */
  setOnline(online: boolean): void {
    if (online) {
      if (this.connection === "offline") {
        this.connection = "online";
        this.emit();
      }
      if (this.load === "error") {
        this.load = "loading";
        this.emit();
      }
      void this.refresh();
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
      void this.refresh();
    } else if ((status === "reconnecting" || status === "denied") && this.connection === "online") {
      this.connection = "reconnecting";
      this.emit();
    }
  }

  // ---- 読み込み(規則 7) ----
  private async refresh(): Promise<void> {
    if (this.stopped) return;
    if (this.loading) {
      this.refreshAgain = true;
      return;
    }
    this.loading = true;
    const seqAtStart = this.seq;
    let result: StockResult<StockData>;
    try {
      result = await withTimeout((signal) => this.api.fetchStockData(this.householdId, signal), this.timeoutMs);
    } catch (e) {
      result = { ok: false, reason: e instanceof TimeoutError ? "timeout" : "unknown" };
    }
    this.loading = false;
    if (this.stopped) return;
    if (result.ok) {
      this.applyFetched(result.value, seqAtStart);
      this.load = "ready";
    } else if (this.load !== "ready") {
      this.load = "error";
    }
    this.emit();
    if (this.refreshAgain) {
      this.refreshAgain = false;
      void this.refresh();
    }
  }

  private applyFetched(fetched: StockData, seqAtStart: number): void {
    const replace = (table: "genre" | "location" | "unit", rows: AnyStockRow[]) => {
      this.server[table] = new Map(rows.map((r) => [r.id, r]));
      this.view[table] = new Map(rows.map((r) => [r.id, r]));
    };
    replace("genre", fetched.genres);
    replace("location", fetched.locations);
    replace("unit", fetched.units);
    for (const [table, rows] of [["item", fetched.items], ["item_stock", fetched.stocks]] as const) {
      const seen = new Set<string>();
      for (const row of rows) {
        seen.add(row.id);
        this.ingestRow(table, row);
      }
      for (const id of [...this.server[table].keys()]) {
        const key = `${table}:${id}`;
        if (!seen.has(id) && !this.entries.has(key) && (this.touched.get(key) ?? 0) <= seqAtStart) {
          this.server[table].delete(id);
          this.view[table].delete(id);
        }
      }
    }
  }

  // ---- サーバーからの値の取り込み(規則 4) ----
  private ingestRow(table: StockTable, row: AnyStockRow): void {
    const key = `${table}:${row.id}`;
    const cur = this.server[table].get(row.id);
    if (cur && cmpTs(row.updatedAt, cur.updatedAt) < 0) return;
    this.server[table].set(row.id, row);
    this.touch(key);
    if (!this.entries.has(key)) this.view[table].set(row.id, row);
  }
  private ingestDelete(table: StockTable, oldRow: AnyStockRow): void {
    const key = `${table}:${oldRow.id}`;
    const entry = this.entries.get(key);
    if (entry && (entry.inFlight?.kind === "insert" || entry.queued?.kind === "insert")) return; // 取り消しで作り直している最中
    const cur = this.server[table].get(oldRow.id);
    if (cur && cmpTs(cur.updatedAt, oldRow.updatedAt) > 0) return; // 作り直された後の行
    this.server[table].delete(oldRow.id);
    this.touch(key);
    if (!entry) this.view[table].delete(oldRow.id);
  }
  private applyChange(change: RowChange): void {
    if (this.stopped) return;
    if (change.operation === "DELETE") this.ingestDelete(change.table, change.oldRow);
    else this.ingestRow(change.table, change.row);
    this.emit();
  }

  // ---- 画面からの操作 ----
  private get offline(): boolean {
    return this.connection === "offline";
  }
  private stockOf(id: string): ItemStock | undefined {
    return this.view.item_stock.get(id) as ItemStock | undefined;
  }
  private itemOf(id: string): Item | undefined {
    return (this.view.item.get(id) as Item | undefined) ?? (this.server.item.get(id) as Item | undefined);
  }

  setQuantity(stockId: string, quantity: number): UndoHandle | null {
    if (this.offline) return null;
    const stock = this.stockOf(stockId);
    if (!stock) return null;
    if (quantity <= 0) return this.useUp(stockId);
    if (quantity === stock.quantity) return null;
    this.patchLocal("item_stock", stockId, { quantity });
    void this.enqueue("item_stock", stockId, { kind: "patch", payload: { quantity }, silent: false, waiters: [] });
    return null;
  }
  step(stockId: string, delta: 1 | -1): UndoHandle | null {
    const stock = this.stockOf(stockId);
    if (!stock) return null;
    return this.setQuantity(stockId, stepQuantity(stock.quantity, delta, "list"));
  }
  patchStock(stockId: string, patch: Omit<StockPatch, "quantity">): void {
    if (this.offline || !this.stockOf(stockId)) return;
    this.patchLocal("item_stock", stockId, patch);
    void this.enqueue("item_stock", stockId, { kind: "patch", payload: { ...patch }, silent: false, waiters: [] });
  }
  useUp(stockId: string): UndoHandle | null {
    if (this.offline) return null;
    const stock = this.stockOf(stockId);
    if (!stock) return null;
    const name = this.itemOf(stock.itemId)?.name ?? "";
    this.view.item_stock.delete(stockId);
    this.touch(`item_stock:${stockId}`);
    void this.enqueue("item_stock", stockId, { kind: "delete", silent: false, waiters: [] });
    let undone = false;
    return {
      label: `${name}を使い切りました`,
      undo: () => {
        if (undone || this.offline) return;
        undone = true;
        this.view.item_stock.set(stockId, stock);
        this.touch(`item_stock:${stockId}`);
        void this.enqueue("item_stock", stockId, {
          kind: "insert",
          payload: { ...stock } as Record<string, unknown>,
          silent: false,
          waiters: [],
        });
        this.emit();
      },
    };
  }
  cycleLevel(itemId: string): void {
    const item = this.itemOf(itemId);
    if (!item || item.tracking !== "level" || !item.stockLevel) return;
    this.setLevel(itemId, NEXT_LEVEL[item.stockLevel]);
  }
  setLevel(itemId: string, level: StockLevel): void {
    this.patchItem(itemId, { stockLevel: level });
  }
  setItemLocation(itemId: string, locationId: string | null): void {
    this.patchItem(itemId, { locationId });
  }
  private patchItem(itemId: string, patch: ItemPatch): void {
    if (this.offline || !this.view.item.has(itemId)) return;
    this.patchLocal("item", itemId, patch);
    void this.enqueue("item", itemId, { kind: "patch", payload: { ...patch }, silent: false, waiters: [] });
  }
  private patchLocal(table: "item" | "item_stock", id: string, patch: object): void {
    const cur = this.view[table].get(id);
    if (!cur) return;
    this.view[table].set(id, { ...cur, ...patch } as AnyStockRow);
    this.touch(`${table}:${id}`);
    this.emit();
  }

  /** 登録。保存を待たずに在庫が一覧に出る。失敗したら入力を返す(規則 1) */
  async register(input: RegistrationInput, retried = false): Promise<RegisterResult> {
    if (this.offline) return { ok: false, reason: "network", input };
    const ids = { householdId: this.householdId, itemId: this.newId(), stockId: this.newId() };
    const plan = planRegistration(input, this.viewData(), ids);
    if ("error" in plan) return { ok: false, reason: plan, input };

    const stamp = this.now().toISOString();
    let itemStep: Promise<OpResult> | null = null;
    if (plan.newItem) {
      const row: Item = { ...plan.newItem, createdAt: stamp, updatedAt: stamp };
      this.view.item.set(row.id, row);
      this.touch(`item:${row.id}`);
      itemStep = this.enqueue("item", row.id, { kind: "insert", payload: { ...plan.newItem }, silent: true, waiters: [] });
    } else if (plan.itemPatch) {
      this.patchLocal("item", plan.itemPatch.id, plan.itemPatch.patch);
      itemStep = this.enqueue("item", plan.itemPatch.id, {
        kind: "patch", payload: { ...plan.itemPatch.patch }, silent: true, waiters: [],
      });
    }
    let stockStep: Promise<OpResult> | null = null;
    if (plan.newStock) {
      const row: ItemStock = { ...plan.newStock, createdAt: plan.newStock.createdAt ?? stamp, updatedAt: stamp };
      this.view.item_stock.set(row.id, row);
      this.touch(`item_stock:${row.id}`);
      stockStep = this.enqueue("item_stock", row.id, {
        kind: "insert",
        payload: { ...plan.newStock },
        silent: true,
        after: itemStep ? itemStep.then((r) => r.ok) : undefined,
        waiters: [],
      });
    }
    this.emit();

    const itemResult = itemStep ? await itemStep : ({ ok: true } as OpResult);
    if (!itemResult.ok) {
      if (stockStep) await stockStep;
      if (itemResult.reason === "name_taken" && !retried) {
        // 先に同じ名前の品物ができた: 読み直して、既存の品物への登録としてやり直す
        await this.refreshNow();
        return this.register(input, true);
      }
      return { ok: false, reason: itemResult.reason === "dependency" ? "unknown" : itemResult.reason, input };
    }
    const stockResult = stockStep ? await stockStep : ({ ok: true } as OpResult);
    if (!stockResult.ok) return { ok: false, reason: stockResult.reason === "dependency" ? "unknown" : stockResult.reason, input };
    return { ok: true };
  }

  private async refreshNow(): Promise<void> {
    while (this.loading) await new Promise((r) => setTimeout(r, 5));
    await this.refresh();
    while (this.loading) await new Promise((r) => setTimeout(r, 5));
  }

  // ---- 行ごとの送信の順番(規則 2) ----
  private enqueue(table: "item" | "item_stock", id: string, op: Op): Promise<OpResult> {
    const key = `${table}:${id}`;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { table, id, inFlight: null, running: false, queued: null };
      this.entries.set(key, entry);
    }
    const promise = new Promise<OpResult>((resolve) => op.waiters.push(resolve));
    this.merge(entry, op);
    this.emit();
    if (!entry.running) void this.drain(entry);
    return promise;
  }

  private merge(entry: Entry, op: Op): void {
    const q = entry.queued;
    const done = (o: Op) => o.waiters.forEach((w) => w({ ok: true }));
    if (!q) {
      entry.queued = op;
    } else if (op.kind === "patch" && q.kind === "patch") {
      q.payload = { ...q.payload, ...op.payload };
      q.silent = q.silent && op.silent;
      q.waiters.push(...op.waiters);
    } else if (op.kind === "patch" && q.kind === "insert") {
      q.payload = { ...q.payload, ...op.payload };
      q.waiters.push(...op.waiters);
    } else if (op.kind === "patch" && q.kind === "delete") {
      done(op);
    } else if (op.kind === "delete" && q.kind === "insert") {
      entry.queued = null; // 作り直しの送信待ちを消すだけ。サーバーはすでに削除済み(送信中)
      done(q);
      done(op);
    } else if (op.kind === "delete") {
      done(q);
      entry.queued = op;
    } else if (op.kind === "insert" && q.kind === "delete") {
      // 削除をまだ送っていない: 取り消して、値を書き戻す
      const p = op.payload ?? {};
      entry.queued = {
        kind: "patch",
        payload: { quantity: p.quantity, locationId: p.locationId, expiresOn: p.expiresOn },
        silent: false,
        waiters: [],
      };
      entry.queued.waiters.push(...q.waiters, ...op.waiters);
    } else {
      done(q);
      entry.queued = op;
    }
  }

  private async drain(entry: Entry): Promise<void> {
    entry.running = true;
    const key = `${entry.table}:${entry.id}`;
    while (entry.queued) {
      const op = entry.queued;
      entry.queued = null;
      entry.inFlight = op;
      if (op.after && !(await op.after)) {
        // 前の送信が失敗した: この送信は取りやめる(見た目は前の失敗が戻している)
        this.settle(entry.table, entry.id, true);
        op.waiters.forEach((w) => w({ ok: false, reason: "dependency" }));
        entry.inFlight = null;
        continue;
      }
      const result = await this.send(entry, op);
      entry.inFlight = null;
      if (result.ok) {
        op.waiters.forEach((w) => w({ ok: true }));
        continue;
      }
      const dropped = entry.queued as Op | null;
      entry.queued = null;
      this.revert(entry, op, result.reason);
      op.waiters.forEach((w) => w({ ok: false, reason: result.reason }));
      dropped?.waiters.forEach((w) => w({ ok: false, reason: result.reason }));
    }
    entry.running = false;
    this.entries.delete(key);
    this.settle(entry.table, entry.id);
    this.emit();
  }

  private async send(entry: Entry, op: Op): Promise<OpResult> {
    const run = async <T>(fn: (signal: AbortSignal) => Promise<StockResult<T>>): Promise<StockResult<T>> => {
      try {
        return await withTimeout(fn, this.timeoutMs);
      } catch (e) {
        return { ok: false, reason: e instanceof TimeoutError ? "timeout" : "unknown" };
      }
    };
    const { table, id } = entry;
    const p = op.payload ?? {};
    if (table === "item") {
      const r =
        op.kind === "insert"
          ? await run((s) => this.api.insertItem(p as unknown as NewItem, s))
          : await run((s) => this.api.updateItem(id, p as ItemPatch, s));
      if (!r.ok) return r;
      this.ingestRow("item", r.value);
      return { ok: true };
    }
    if (op.kind === "delete") {
      const r = await run((s) => this.api.deleteStock(id, s));
      if (!r.ok) return r;
      this.server.item_stock.delete(id);
      this.touch(`item_stock:${id}`);
      return { ok: true };
    }
    const r =
      op.kind === "insert"
        ? await run((s) => this.api.insertStock(p as unknown as NewItemStock, s))
        : await run((s) => this.api.updateStock(id, p as StockPatch, s));
    if (!r.ok) return r;
    this.ingestRow("item_stock", r.value);
    return { ok: true };
  }

  /** 失敗の戻し(規則 3): 最後にサーバーから受け取った値に戻し、知らせる */
  private revert(entry: Entry, op: Op, reason: StockFailure | "dependency"): void {
    const { table, id } = entry;
    const name = this.nameOfRow(table, id);
    if (reason === "not_found" && table === "item_stock") {
      this.server.item_stock.delete(id);
      this.view.item_stock.delete(id);
      this.touch(`item_stock:${id}`);
      if (!op.silent) this.notify({ kind: "gone", itemName: name ?? "" });
      return;
    }
    this.settle(table, id, true);
    if (!op.silent) this.notify({ kind: "save_failed", itemName: name ?? "" });
  }

  private nameOfRow(table: "item" | "item_stock", id: string): string | undefined {
    if (table === "item") return this.itemOf(id)?.name;
    const stock = (this.server.item_stock.get(id) ?? this.view.item_stock.get(id)) as ItemStock | undefined;
    return stock ? this.itemOf(stock.itemId)?.name : undefined;
  }

  /** 送信中・送信待ちが無い行の見た目を、サーバーの値にそろえる */
  private settle(table: "item" | "item_stock", id: string, force = false): void {
    const key = `${table}:${id}`;
    const e = this.entries.get(key);
    if (!force && e && (e.queued || e.running)) return;
    const row = this.server[table].get(id);
    if (row) this.view[table].set(id, row);
    else this.view[table].delete(id);
    this.touch(key);
  }
  private notify(n: FailureNotice): void {
    for (const l of this.failureListeners) l(n);
  }
}
