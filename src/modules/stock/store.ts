import * as realApi from "@/lib/supabase/stock";
import { subscribeHousehold as realSubscribe, type ChannelStatus, type RowChange } from "@/lib/supabase/realtime";
import type { StockFailure, StockResult, StockTable } from "@/lib/supabase/stock";
import { TimeoutError, withTimeout } from "@/lib/timing";
import { todayInJst } from "./dates";
import { checkItemName, planTrackingChange, type TrackingChangeInput } from "./items";
import { NEXT_LEVEL } from "./levels";
import { checkMasterName, isMasterInUse, nextSortOrder, softReferences, type SoftReference } from "./masters";
import { stepQuantity } from "./quantity";
import { planRegistration, type RegistrationError, type RegistrationInput } from "./registration";
import {
  type AnyStockRow, type Genre, type Item, type ItemPatch, type ItemStock, type Location, type MasterKind, type MasterPatch,
  type NewItem, type NewItemStock, type NewMasterRow, type StockData, type StockLevel, type StockPatch, type Unit,
} from "./types";

// 倉庫の状態の入れ物(30_architecture.md Interfaces §6)。React の外の小さなクラスで、useSyncExternalStore で画面とつなぐ。
// 規則 1〜9 は 30 のとおり。画面に見せる値(view)と、最後にサーバーから受け取った値(server)を分けて持つ。

/** 読み込み・書き込みの1回ごとの通信の上限(D-15。根拠は OD-auth-household-22 A と同じ。測った値ではない) */
export const STOCK_REQUEST_TIMEOUT_MS = 10_000;
const TODAY_INTERVAL_MS = 60_000;
/** 「元に戻す」が生きている間(Sonner の通知と同じ秒数。OD-stock-uiux-21) */
export const UNDO_WINDOW_MS = 6_000;

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
export type FailureNotice = {
  kind:
    | "save_failed" // 保存できなかった(値は戻った)
    | "gone" // 在庫が先に消えていた(相手の使い切り・品物の削除・数 → 残量のどれか。store は区別しない)
    | "item_gone" // 品物が先に消えていた(相手の削除)
    | "master_gone" // マスタの値が先に消えていた
    | "in_use" // マスタの値を消そうとしたら、その間に使われていた(23503)
    | "name_taken" // 名前を保存しようとしたら、その間に相手が同じ名前を付けていた
    | "undo_failed"; // 「元に戻す」ができなかった
  /** 品物名、またはマスタの名前(name_taken は付けようとした名前) */
  itemName: string;
  /** name_taken: 「同じ名前の<種類>」の種類 */
  subject?: "品物" | "ジャンル" | "場所" | "単位";
  /** name_taken: 追加のとき true(「を追加できませんでした」) */
  adding?: boolean;
};
export type EditResult = { ok: true } | { ok: false; error: "empty" | "taken" | "offline" };
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
  deleteItem(id: string, signal: AbortSignal): Promise<StockResult<null>>;
  insertMaster(table: MasterKind, row: NewMasterRow, signal: AbortSignal): Promise<StockResult<Genre | Location | Unit>>;
  updateMaster(table: MasterKind, id: string, patch: MasterPatch, signal: AbortSignal): Promise<StockResult<Genre | Location | Unit>>;
  deleteMaster(table: MasterKind, id: string, signal: AbortSignal): Promise<StockResult<null>>;
  restoreReference(
    ref: { table: "genre"; column: "default_location_id" } | { table: "item"; column: "location_id" | "unit_id" },
    id: string,
    value: string,
    signal: AbortSignal,
  ): Promise<StockResult<null>>;
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
  /** 「元に戻す」の送信。失敗は undo_failed で知らせる */
  undo?: boolean;
  /** マスタの削除: 消すと DB の trigger が空にする行(失敗の戻しで一緒にサーバーの値へ戻す) */
  refs?: SoftReference[];
  /** 管理のしかたの変更: 品物の update が失敗したとき、一緒にサーバーの値へ戻す在庫 */
  stockIds?: string[];
  /** 送信が成功したあとに画面とサーバーの控えを整える */
  onOk?: () => void;
  /** insert: 行の全体 / patch: 変える列だけ */
  payload?: Record<string, unknown>;
  /** 登録の途中の操作。失敗は FailureNotice にせず、register の戻り値で返す */
  silent: boolean;
  /** これが true になってから送る(false なら取りやめる)。品物の作成を待つ在庫の登録 */
  after?: Promise<boolean>;
  waiters: Array<(r: OpResult) => void>;
};
type Entry = { table: StockTable; id: string; inFlight: Op | null; running: boolean; queued: Op | null };

const isMasterTable = (t: StockTable): t is MasterKind => t === "genre" || t === "location" || t === "unit";
const SUBJECT = { item: "品物", genre: "ジャンル", location: "場所", unit: "単位" } as const;

/** 行の、後から変えられる列だけ(「元に戻す」の書き戻し・送信待ちの削除の取り消しで使う) */
function mutableOf(table: StockTable, row: AnyStockRow): Record<string, unknown> {
  const pick = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, (row as unknown as Record<string, unknown>)[k]]));
  switch (table) {
    case "item":
      return pick(["name", "genreId", "unitId", "locationId", "stockLevel", "lastExpiryDays", "isRegular", "tracking", "restockAtCount", "restockAtLevel"]);
    case "item_stock":
      return pick(["quantity", "locationId", "expiresOn"]);
    case "genre":
      return pick(["name", "defaultLocationId"]);
    case "location":
      return pick(["name"]);
    case "unit":
      return pick(["name", "isCountable"]);
  }
}
const sameMutable = (table: StockTable, a: AnyStockRow, b: AnyStockRow) => JSON.stringify(mutableOf(table, a)) === JSON.stringify(mutableOf(table, b));

/** 6秒の間の、この端末の操作で変えた品物・在庫の行の、変える前の値(OD-stock-uiux-50 (7)、30 M-05)。null は、その前には無かった行 */
type Scope = { rows: Map<string, { table: "item" | "item_stock"; id: string; before: AnyStockRow | null }>; active: boolean; timer: ReturnType<typeof setTimeout> | null };


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
  /** 記録中の「元に戻す」の控え(新しい UndoHandle が出たら前のものは捨てる) */
  private scope: Scope | null = null;

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
    this.closeScope();
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
    const tables: Array<[StockTable, AnyStockRow[]]> = [
      ["genre", fetched.genres],
      ["location", fetched.locations],
      ["unit", fetched.units],
      ["item", fetched.items],
      ["item_stock", fetched.stocks],
    ];
    // 5つのテーブルとも、送信中・送信待ちの行は画面の値を変えない(規則 4・10)
    for (const [table, rows] of tables) {
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
    this.remember("item_stock", stockId);
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
  private patchLocal(table: StockTable, id: string, patch: object): void {
    const cur = this.view[table].get(id);
    if (!cur) return;
    this.remember(table, id);
    this.view[table].set(id, { ...cur, ...patch } as AnyStockRow);
    this.touch(`${table}:${id}`);
    this.emit();
  }

  // ---- 品物の値(30_architecture.md Interfaces §6。オンライン時のみ) ----
  renameItem(itemId: string, name: string): EditResult {
    if (this.offline) return { ok: false, error: "offline" };
    const item = this.view.item.get(itemId) as Item | undefined;
    if (!item) return { ok: true };
    const check = checkItemName(name, this.viewData(), itemId);
    if (!check.ok) return check;
    if (check.name !== item.name) this.patchItem(itemId, { name: check.name });
    return { ok: true };
  }
  setItemGenre(itemId: string, genreId: string): void {
    this.patchItem(itemId, { genreId });
  }
  /** 在庫の数はそのまま、新しい単位で表示される(M-03) */
  setItemUnit(itemId: string, unitId: string): void {
    this.patchItem(itemId, { unitId });
  }
  setRegular(itemId: string, value: boolean): void {
    this.patchItem(itemId, { isRegular: value });
  }

  // ---- マスタ(オンライン時のみ。ADR 0004 §1) ----
  private mastersOf(kind: MasterKind): Array<Genre | Location | Unit> {
    return [...this.view[kind].values()] as Array<Genre | Location | Unit>;
  }
  addMaster(kind: MasterKind, name: string): EditResult {
    if (this.offline) return { ok: false, error: "offline" };
    const check = checkMasterName(kind, name, this.viewData());
    if (!check.ok) return check;
    const stamp = this.now().toISOString();
    const base = { id: this.newId(), householdId: this.householdId, name: check.name, sortOrder: nextSortOrder(this.mastersOf(kind)) };
    const row: Genre | Location | Unit =
      kind === "genre" ? { ...base, defaultLocationId: null, createdAt: stamp, updatedAt: stamp }
        : kind === "unit" ? { ...base, isCountable: true, createdAt: stamp, updatedAt: stamp }
          : { ...base, createdAt: stamp, updatedAt: stamp };
    this.view[kind].set(row.id, row);
    this.touch(`${kind}:${row.id}`);
    const { createdAt: _c, updatedAt: _u, ...payload } = row;
    void _c;
    void _u;
    void this.enqueue(kind, row.id, { kind: "insert", payload: { ...payload }, silent: false, waiters: [] });
    return { ok: true };
  }
  renameMaster(kind: MasterKind, id: string, name: string): EditResult {
    if (this.offline) return { ok: false, error: "offline" };
    const cur = this.view[kind].get(id) as { name: string } | undefined;
    if (!cur) return { ok: true };
    const check = checkMasterName(kind, name, this.viewData(), id);
    if (!check.ok) return check;
    if (check.name !== cur.name) this.patchMaster(kind, id, { name: check.name });
    return { ok: true };
  }
  setGenreDefaultLocation(genreId: string, locationId: string | null): void {
    this.patchMaster("genre", genreId, { defaultLocationId: locationId });
  }
  setUnitCountable(unitId: string, value: boolean): void {
    this.patchMaster("unit", unitId, { isCountable: value });
  }
  private patchMaster(kind: MasterKind, id: string, patch: MasterPatch): void {
    if (this.offline || !this.view[kind].has(id)) return;
    this.patchLocal(kind, id, patch);
    void this.enqueue(kind, id, { kind: "patch", payload: { ...patch }, silent: false, waiters: [] });
  }

  /** 使用中なら消さない(画面は削除を出さないので、手元の値が古いときだけ起きる)。規則 11 */
  deleteMaster(kind: MasterKind, id: string): UndoHandle | { error: "in_use" } | null {
    if (this.offline) return null;
    const row = this.view[kind].get(id);
    if (!row) return null;
    const data = this.viewData();
    if (isMasterInUse(kind, id, data)) return { error: "in_use" };
    const refs = softReferences(kind, id, data);
    this.view[kind].delete(id);
    this.touch(`${kind}:${id}`);
    // 使用中でない参照は、画面の上だけ空にする(送らない。DB の trigger が同じことをする)
    for (const ref of refs) this.setReferenceLocal(ref, null);
    void this.enqueue(kind, id, { kind: "delete", refs, silent: false, waiters: [] });
    this.emit();
    let undone = false;
    return {
      label: `${(row as { name: string }).name}を削除しました`,
      undo: () => {
        if (undone || this.offline) return;
        undone = true;
        this.view[kind].set(id, row);
        this.touch(`${kind}:${id}`);
        for (const ref of refs) this.setReferenceLocal(ref, id);
        const { createdAt, updatedAt: _u, ...rest } = row;
        void _u;
        const step = this.enqueue(kind, id, {
          kind: "insert", payload: { ...rest, createdAt }, undo: true, silent: false, waiters: [],
        });
        // 作り直しが成功したあとに、空のままのやわらかい参照だけ書き戻す
        void step.then((r) => {
          if (r.ok) for (const ref of refs) void this.sendReference(ref, id);
        });
        this.emit();
      },
    };
  }
  private setReferenceLocal(ref: SoftReference, value: string | null): void {
    const cur = this.view[ref.table].get(ref.id) as unknown as Record<string, unknown> | undefined;
    if (!cur) return;
    const key = ref.column === "default_location_id" ? "defaultLocationId" : ref.column === "location_id" ? "locationId" : "unitId";
    if (value !== null && cur[key] !== null) return; // 空のときだけ戻す
    this.view[ref.table].set(ref.id, { ...cur, [key]: value } as unknown as AnyStockRow);
    this.touch(`${ref.table}:${ref.id}`);
  }
  private async sendReference(ref: SoftReference, value: string): Promise<void> {
    try {
      await withTimeout((signal) => this.api.restoreReference(ref, ref.id, value, signal), this.timeoutMs);
    } catch {
      // 戻らなかったときは「未選択」のまま(読み直しで画面もそろう)
    }
  }

  // ---- 品物の削除・管理のしかた(「元に戻す」は6秒の間のこの端末の操作ごと戻す。規則 12〜14) ----
  private openScope(): Scope {
    this.closeScope();
    const scope: Scope = { rows: new Map(), active: true, timer: null };
    scope.timer = setTimeout(() => {
      scope.active = false;
    }, UNDO_WINDOW_MS);
    this.scope = scope;
    return scope;
  }
  private closeScope(): void {
    if (this.scope?.timer) clearTimeout(this.scope.timer);
    if (this.scope) this.scope.active = false;
    this.scope = null;
  }
  /** この端末の操作で品物・在庫の行を変える直前に呼ぶ。記録中の控えに、その行の元の値を(最初の1回だけ)足す */
  private remember(table: StockTable, id: string): void {
    const scope = this.scope;
    if (!scope || !scope.active || (table !== "item" && table !== "item_stock")) return;
    const key = `${table}:${id}`;
    if (!scope.rows.has(key)) scope.rows.set(key, { table, id, before: this.view[table].get(id) ?? null });
  }

  deleteItem(itemId: string): UndoHandle | null {
    if (this.offline) return null;
    const item = this.view.item.get(itemId) as Item | undefined;
    if (!item) return null;
    const scope = this.openScope();
    this.remember("item", itemId);
    const stocks = [...this.view.item_stock.values()].filter((s) => (s as ItemStock).itemId === itemId);
    for (const st of stocks) {
      this.remember("item_stock", st.id);
      this.view.item_stock.delete(st.id);
      this.touch(`item_stock:${st.id}`);
    }
    this.view.item.delete(itemId);
    this.touch(`item:${itemId}`);
    void this.enqueue("item", itemId, { kind: "delete", silent: false, waiters: [] });
    this.emit();
    return this.undoHandle(scope, `${item.name}を削除しました`);
  }

  changeTracking(itemId: string, input: TrackingChangeInput): UndoHandle | null {
    if (this.offline) return null;
    const item = this.view.item.get(itemId) as Item | undefined;
    if (!item || item.tracking === input.to) return null;
    const plan = planTrackingChange(item, input, this.viewData(), { stockId: this.newId(), householdId: this.householdId }, this.today);
    const scope = this.openScope();
    this.remember("item", itemId);
    for (const st of plan.removedStocks) this.remember("item_stock", st.id);
    this.patchLocal("item", itemId, plan.itemPatch);
    for (const st of plan.removedStocks) {
      this.view.item_stock.delete(st.id);
      this.touch(`item_stock:${st.id}`);
    }
    const stamp = this.now().toISOString();
    if (plan.newStock) {
      this.remember("item_stock", plan.newStock.id);
      this.view.item_stock.set(plan.newStock.id, { ...plan.newStock, createdAt: stamp, updatedAt: stamp });
      this.touch(`item_stock:${plan.newStock.id}`);
    }
    // 品物の update は1回(関係する列を全部まとめる)。数 → 残量の在庫は DB の trigger が同じ文で消す
    const removed = plan.removedStocks.map((st) => st.id);
    const itemStep = this.enqueue("item", itemId, {
      kind: "patch", payload: { ...plan.itemPatch }, silent: false, stockIds: removed,
      onOk: () => {
        for (const sid of removed) {
          this.server.item_stock.delete(sid);
          this.touch(`item_stock:${sid}`);
        }
      },
      waiters: [],
    });
    if (plan.newStock) {
      void this.enqueue("item_stock", plan.newStock.id, {
        kind: "insert", payload: { ...plan.newStock }, silent: false, after: itemStep.then((r) => r.ok), waiters: [],
      });
    }
    this.emit();
    return this.undoHandle(scope, `${item.name}を${input.to === "level" ? "残量" : "数"}で管理に変えました`);
  }

  private undoHandle(scope: Scope, label: string): UndoHandle {
    let undone = false;
    return {
      label,
      undo: () => {
        if (undone || this.offline || this.scope !== scope) return;
        undone = true;
        this.restoreScope(scope);
      },
    };
  }

  /** 控えの全部の行を、控えの値に戻す。順番は「品物の作り直し・update → 在庫(after)→ 品物の削除」(規則 14) */
  private restoreScope(scope: Scope): void {
    this.closeScope();
    const entries = [...scope.rows.values()];
    const send = (table: StockTable, id: string, op: Omit<Op, "waiters" | "silent" | "undo">) =>
      this.enqueue(table, id, { ...op, silent: false, undo: true, waiters: [] });
    const itemSteps: Array<Promise<OpResult>> = [];
    for (const e of entries.filter((x) => x.table === "item" && x.before)) {
      const before = e.before as Item;
      const cur = this.view.item.get(e.id);
      if (!cur) {
        this.view.item.set(e.id, before);
        this.touch(`item:${e.id}`);
        itemSteps.push(send("item", e.id, { kind: "insert", payload: { ...before } }));
      } else if (!sameMutable("item", cur, before)) {
        this.view.item.set(e.id, { ...cur, ...mutableOf("item", before) } as Item);
        this.touch(`item:${e.id}`);
        itemSteps.push(send("item", e.id, { kind: "patch", payload: mutableOf("item", before) }));
      }
    }
    const itemsOk = Promise.all(itemSteps).then((rs) => rs.every((r) => r.ok));
    const stockSteps: Array<Promise<OpResult>> = [];
    for (const e of entries.filter((x) => x.table === "item_stock")) {
      const cur = this.view.item_stock.get(e.id);
      if (e.before && !cur) {
        this.view.item_stock.set(e.id, e.before);
        this.touch(`item_stock:${e.id}`);
        stockSteps.push(send("item_stock", e.id, { kind: "insert", payload: { ...e.before }, after: itemsOk }));
      } else if (e.before && cur && !sameMutable("item_stock", cur, e.before)) {
        this.view.item_stock.set(e.id, { ...cur, ...mutableOf("item_stock", e.before) } as ItemStock);
        this.touch(`item_stock:${e.id}`);
        stockSteps.push(send("item_stock", e.id, { kind: "patch", payload: mutableOf("item_stock", e.before), after: itemsOk }));
      } else if (!e.before && cur) {
        this.view.item_stock.delete(e.id);
        this.touch(`item_stock:${e.id}`);
        stockSteps.push(send("item_stock", e.id, { kind: "delete", after: itemsOk }));
      }
    }
    const stocksDone = Promise.all(stockSteps).then(() => true);
    for (const e of entries.filter((x) => x.table === "item" && !x.before)) {
      if (!this.view.item.has(e.id)) continue;
      for (const [sid, st] of [...this.view.item_stock]) {
        if ((st as ItemStock).itemId === e.id) {
          this.view.item_stock.delete(sid);
          this.touch(`item_stock:${sid}`);
        }
      }
      this.view.item.delete(e.id);
      this.touch(`item:${e.id}`);
      send("item", e.id, { kind: "delete", after: stocksDone });
    }
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
      this.remember("item", row.id);
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
      this.remember("item_stock", row.id);
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
  private enqueue(table: StockTable, id: string, op: Op): Promise<OpResult> {
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
      // 削除をまだ送っていない: 取り消して、値を書き戻す(規則 15。行はサーバーに残っている)
      entry.queued = {
        kind: "patch",
        payload: mutableOf(entry.table, (op.payload ?? {}) as unknown as AnyStockRow),
        silent: false,
        undo: op.undo,
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
    let result: StockResult<AnyStockRow | null>;
    if (table === "item") {
      if (op.kind === "delete") {
        result = await run((s) => this.api.deleteItem(id, s));
        if (result.ok) {
          // 在庫は外部キーの cascade で消える
          for (const [sid, st] of [...this.server.item_stock]) {
            if ((st as ItemStock).itemId === id) {
              this.server.item_stock.delete(sid);
              this.touch(`item_stock:${sid}`);
            }
          }
        }
      } else {
        result = await run((s) => (op.kind === "insert" ? this.api.insertItem(p as unknown as NewItem, s) : this.api.updateItem(id, p as ItemPatch, s)));
      }
    } else if (table === "item_stock") {
      if (op.kind === "delete") result = await run((s) => this.api.deleteStock(id, s));
      else result = await run((s) => (op.kind === "insert" ? this.api.insertStock(p as unknown as NewItemStock, s) : this.api.updateStock(id, p as StockPatch, s)));
    } else if (op.kind === "delete") {
      result = await run((s) => this.api.deleteMaster(table, id, s));
    } else {
      result = await run((s) => (op.kind === "insert" ? this.api.insertMaster(table, p as unknown as NewMasterRow, s) : this.api.updateMaster(table, id, p as MasterPatch, s)));
    }
    if (!result.ok) return result;
    if (op.kind === "delete") {
      this.server[table].delete(id);
      this.touch(`${table}:${id}`);
    } else if (result.value) {
      this.ingestRow(table, result.value);
    }
    op.onOk?.();
    return { ok: true };
  }

  /** 失敗の戻し(規則 3): 最後にサーバーから受け取った値に戻し、知らせる */
  private revert(entry: Entry, op: Op, reason: StockFailure | "dependency"): void {
    const { table, id } = entry;
    const attempted = typeof op.payload?.name === "string" ? op.payload.name : undefined;
    const name = this.nameOfRow(table, id) ?? attempted ?? "";
    const settleAll = () => {
      this.settle(table, id, true);
      for (const sid of op.stockIds ?? []) this.settle("item_stock", sid, true);
      for (const ref of op.refs ?? []) this.settle(ref.table, ref.id, true);
    };
    if (op.undo) {
      settleAll();
      if (!op.silent) this.notify({ kind: "undo_failed", itemName: name });
      return;
    }
    if (reason === "not_found") {
      if (table === "item_stock") {
        this.server.item_stock.delete(id);
        this.view.item_stock.delete(id);
        this.touch(`item_stock:${id}`);
        if (!op.silent) this.notify({ kind: "gone", itemName: name });
        return;
      }
      if (table === "item") {
        for (const m of [this.server, this.view]) {
          for (const [sid, st] of [...m.item_stock]) if ((st as ItemStock).itemId === id) m.item_stock.delete(sid);
          m.item.delete(id);
        }
        this.touch(`item:${id}`);
        if (!op.silent) this.notify({ kind: "item_gone", itemName: name });
        return;
      }
      this.server[table].delete(id);
      this.view[table].delete(id);
      this.touch(`${table}:${id}`);
      if (!op.silent) this.notify({ kind: "master_gone", itemName: name });
      return;
    }
    settleAll();
    if (op.silent) return;
    if (reason === "name_taken") {
      this.notify({ kind: "name_taken", itemName: attempted ?? name, subject: SUBJECT[table as keyof typeof SUBJECT], adding: op.kind === "insert" });
    } else if (reason === "conflict" && op.kind === "delete" && isMasterTable(table)) {
      this.notify({ kind: "in_use", itemName: name });
    } else {
      this.notify({ kind: "save_failed", itemName: name });
    }
  }

  private nameOfRow(table: StockTable, id: string): string | undefined {
    if (table === "item_stock") {
      const stock = (this.server.item_stock.get(id) ?? this.view.item_stock.get(id)) as ItemStock | undefined;
      return stock ? this.itemOf(stock.itemId)?.name : undefined;
    }
    return ((this.view[table].get(id) ?? this.server[table].get(id)) as { name: string } | undefined)?.name;
  }

  /** 送信中・送信待ちが無い行の見た目を、サーバーの値にそろえる */
  private settle(table: StockTable, id: string, force = false): void {
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
