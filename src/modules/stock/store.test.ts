import { afterEach, describe, expect, it } from "vitest";
import type { RowChange } from "@/lib/supabase/realtime";
import type { StockFailure, StockResult } from "@/lib/supabase/stock";
import { genres, item, locations, stock, units } from "./fixtures";
import { StockStore, type FailureNotice, type StockApi } from "./store";
import type { Genre, Item, ItemPatch, ItemStock, Location, MasterKind, MasterPatch, NewItem, NewItemStock, NewMasterRow, StockData, StockPatch, Unit } from "./types";

// Supabase を偽物に差し替えた store の単体テスト。偽のサーバーは行を持ち、サーバーの時刻(updatedAt)を単調に進める。

const flush = async () => {
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
};

class FakeServer implements StockApi {
  items = new Map<string, Item>();
  stocks = new Map<string, ItemStock>();
  masters: Record<MasterKind, Map<string, Genre | Location | Unit>> = {
    genre: new Map(genres.map((g) => [g.id, g])),
    location: new Map(locations.map((l) => [l.id, l])),
    unit: new Map(units.map((u) => [u.id, u])),
  };
  clock = 100;
  held = false;
  waiting: Array<() => void> = [];
  failures: StockFailure[] = [];
  fetchFailures: StockFailure[] = [];
  calls: string[] = [];

  stamp() {
    return `2026-11-09T00:00:00.${String(++this.clock).padStart(6, "0")}+00:00`;
  }
  async gate() {
    if (this.held) await new Promise<void>((r) => this.waiting.push(r));
  }
  release() {
    this.held = false;
    this.waiting.splice(0).forEach((r) => r());
  }
  private fail<T>(): StockResult<T> | null {
    const reason = this.failures.shift();
    return reason ? { ok: false, reason } : null;
  }
  async fetchStockData(): Promise<StockResult<StockData>> {
    this.calls.push("fetch");
    await this.gate();
    const reason = this.fetchFailures.shift();
    if (reason) return { ok: false, reason };
    return {
      ok: true,
      value: {
        genres: [...this.masters.genre.values()] as Genre[],
        locations: [...this.masters.location.values()] as Location[],
        units: [...this.masters.unit.values()] as Unit[],
        items: [...this.items.values()],
        stocks: [...this.stocks.values()],
      },
    };
  }
  async insertItem(row: NewItem): Promise<StockResult<Item>> {
    this.calls.push(`insertItem:${row.name}`);
    await this.gate();
    const f = this.fail<Item>();
    if (f) return f;
    if ([...this.items.values()].some((i) => i.name === row.name)) return { ok: false, reason: "name_taken" };
    const r: Item = { ...row, createdAt: row.createdAt ?? this.stamp(), updatedAt: this.stamp() };
    this.items.set(r.id, r);
    return { ok: true, value: r };
  }
  async updateItem(id: string, patch: ItemPatch): Promise<StockResult<Item>> {
    this.calls.push(`updateItem:${id}:${JSON.stringify(patch)}`);
    await this.gate();
    const f = this.fail<Item>();
    if (f) return f;
    const cur = this.items.get(id);
    if (!cur) return { ok: false, reason: "not_found" };
    if (patch.name !== undefined && [...this.items.values()].some((i) => i.id !== id && i.name === patch.name)) return { ok: false, reason: "name_taken" };
    const r = { ...cur, ...patch, updatedAt: this.stamp() };
    this.items.set(id, r);
    // DB の trigger: 数 → 残量で在庫を消す
    if (cur.tracking === "count" && r.tracking === "level") for (const [sid, st] of [...this.stocks]) if (st.itemId === id) this.stocks.delete(sid);
    return { ok: true, value: r };
  }
  async deleteItem(id: string): Promise<StockResult<null>> {
    this.calls.push(`deleteItem:${id}`);
    await this.gate();
    const f = this.fail<null>();
    if (f) return f;
    this.items.delete(id);
    for (const [sid, st] of [...this.stocks]) if (st.itemId === id) this.stocks.delete(sid);
    return { ok: true, value: null };
  }
  async insertMaster(table: MasterKind, row: NewMasterRow): Promise<StockResult<Genre | Location | Unit>> {
    this.calls.push(`insertMaster:${table}:${row.name}`);
    await this.gate();
    const f = this.fail<Genre | Location | Unit>();
    if (f) return f;
    if (this.masters[table].has(row.id)) return { ok: true, value: this.masters[table].get(row.id) as Genre };
    if ([...this.masters[table].values()].some((m) => m.name === row.name)) return { ok: false, reason: "name_taken" };
    const r = { ...row, createdAt: row.createdAt ?? this.stamp(), updatedAt: this.stamp() } as Genre | Location | Unit;
    this.masters[table].set(r.id, r);
    return { ok: true, value: r };
  }
  async updateMaster(table: MasterKind, id: string, patch: MasterPatch): Promise<StockResult<Genre | Location | Unit>> {
    this.calls.push(`updateMaster:${table}:${id}:${JSON.stringify(patch)}`);
    await this.gate();
    const f = this.fail<Genre | Location | Unit>();
    if (f) return f;
    const cur = this.masters[table].get(id);
    if (!cur) return { ok: false, reason: "not_found" };
    if (patch.name !== undefined && [...this.masters[table].values()].some((m) => m.id !== id && m.name === patch.name)) return { ok: false, reason: "name_taken" };
    const r = { ...cur, ...patch, updatedAt: this.stamp() } as Genre | Location | Unit;
    this.masters[table].set(id, r);
    return { ok: true, value: r };
  }
  async deleteMaster(table: MasterKind, id: string): Promise<StockResult<null>> {
    this.calls.push(`deleteMaster:${table}:${id}`);
    await this.gate();
    const f = this.fail<null>();
    if (f) return f;
    const items = [...this.items.values()];
    const hard =
      table === "genre" ? items.some((i) => i.genreId === id)
        : table === "location" ? [...this.stocks.values()].some((s) => s.locationId === id) || items.some((i) => i.tracking === "level" && i.locationId === id)
          : items.some((i) => i.tracking === "count" && i.unitId === id);
    if (hard) return { ok: false, reason: "conflict" };
    // DB の trigger: やわらかい参照を空にする
    if (table === "location") {
      for (const g of this.masters.genre.values()) if ((g as Genre).defaultLocationId === id) this.masters.genre.set(g.id, { ...g, defaultLocationId: null, updatedAt: this.stamp() } as Genre);
      for (const i of items) if (i.tracking === "count" && i.locationId === id) this.items.set(i.id, { ...i, locationId: null, updatedAt: this.stamp() });
    }
    if (table === "unit") for (const i of items) if (i.tracking === "level" && i.unitId === id) this.items.set(i.id, { ...i, unitId: null, updatedAt: this.stamp() });
    this.masters[table].delete(id);
    return { ok: true, value: null };
  }
  async restoreReference(
    ref: { table: "genre"; column: "default_location_id" } | { table: "item"; column: "location_id" | "unit_id" },
    id: string,
    value: string,
  ): Promise<StockResult<null>> {
    this.calls.push(`restoreReference:${ref.table}:${ref.column}:${id}:${value}`);
    await this.gate();
    if (ref.table === "genre") {
      const g = this.masters.genre.get(id) as Genre | undefined;
      if (g && g.defaultLocationId === null) this.masters.genre.set(id, { ...g, defaultLocationId: value, updatedAt: this.stamp() });
    } else {
      const i = this.items.get(id);
      const key = ref.column === "location_id" ? "locationId" : "unitId";
      if (i && i[key] === null) this.items.set(id, { ...i, [key]: value, updatedAt: this.stamp() });
    }
    return { ok: true, value: null };
  }
  async insertStock(row: NewItemStock): Promise<StockResult<ItemStock>> {
    this.calls.push(`insertStock:${row.id}`);
    await this.gate();
    const f = this.fail<ItemStock>();
    if (f) return f;
    if (this.stocks.has(row.id)) return { ok: true, value: this.stocks.get(row.id) as ItemStock };
    if (this.items.get(row.itemId)?.tracking !== "count") return { ok: false, reason: "conflict" };
    const r: ItemStock = { ...row, createdAt: row.createdAt ?? this.stamp(), updatedAt: this.stamp() };
    this.stocks.set(r.id, r);
    return { ok: true, value: r };
  }
  async updateStock(id: string, patch: StockPatch): Promise<StockResult<ItemStock>> {
    this.calls.push(`updateStock:${id}:${JSON.stringify(patch)}`);
    await this.gate();
    const f = this.fail<ItemStock>();
    if (f) return f;
    const cur = this.stocks.get(id);
    if (!cur) return { ok: false, reason: "not_found" };
    const r = { ...cur, ...patch, updatedAt: this.stamp() };
    this.stocks.set(id, r);
    return { ok: true, value: r };
  }
  async deleteStock(id: string): Promise<StockResult<null>> {
    this.calls.push(`deleteStock:${id}`);
    await this.gate();
    const f = this.fail<null>();
    if (f) return f;
    this.stocks.delete(id);
    return { ok: true, value: null };
  }
}

type Harness = {
  server: FakeServer;
  store: StockStore;
  notices: FailureNotice[];
  send: (c: RowChange) => void;
  status: (s: "subscribed" | "reconnecting" | "denied") => void;
  q: (id: string) => ItemStock | undefined;
  it: (id: string) => Item | undefined;
};
const live: StockStore[] = [];
afterEach(() => live.splice(0).forEach((s) => s.stop()));

async function setup(opts: { items?: Item[]; stocks?: ItemStock[]; online?: boolean; timeoutMs?: number } = {}): Promise<Harness> {
  const server = new FakeServer();
  for (const i of opts.items ?? []) server.items.set(i.id, { ...i, updatedAt: server.stamp() });
  for (const s of opts.stocks ?? []) server.stocks.set(s.id, { ...s, updatedAt: server.stamp() });
  let onChange: (c: RowChange) => void = () => {};
  let onStatus: (s: "subscribed" | "reconnecting" | "denied" | "connecting") => void = () => {};
  let n = 0;
  const store = new StockStore("h1", {
    api: server,
    subscribe: (_h, change, status) => {
      onChange = change;
      onStatus = status;
      return () => {};
    },
    now: () => new Date("2026-10-23T03:00:00Z"),
    newId: () => `id-${++n}`,
    timeoutMs: opts.timeoutMs ?? 5000,
    isOnline: () => opts.online ?? true,
  });
  live.push(store);
  const notices: FailureNotice[] = [];
  store.onFailure((x) => notices.push(x));
  store.start();
  await flush();
  return {
    server, store, notices,
    send: (c) => onChange(c),
    status: (s) => onStatus(s),
    q: (id) => store.getSnapshot().data.stocks.find((x) => x.id === id),
    it: (id) => store.getSnapshot().data.items.find((x) => x.id === id),
  };
}

const milk = item("milk", "牛乳");
const natto = item("natto", "納豆");
const mayo = item("mayo", "マヨネーズ", { tracking: "level", unitId: null, stockLevel: "full", genreId: "g-season" });

describe("読み込み", () => {
  it("読み込んで ready になり、今日は日本時間", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 2)] });
    const snap = h.store.getSnapshot();
    expect(snap.load).toBe("ready");
    expect(snap.data.stocks).toHaveLength(1);
    expect(snap.data.genres).toHaveLength(genres.length);
    expect(snap.today).toBe("2026-10-23");
  });
  it("初回の読み込みの失敗は error になり、reload で直る", async () => {
    const server = new FakeServer();
    server.fetchFailures.push("network");
    const store = new StockStore("h1", { api: server, subscribe: () => () => {}, timeoutMs: 1000 });
    live.push(store);
    store.start();
    await flush();
    expect(store.getSnapshot().load).toBe("error");
    store.reload();
    await flush();
    expect(store.getSnapshot().load).toBe("ready");
  });
  it("通信の上限を超えたら error", async () => {
    const server = new FakeServer();
    server.held = true;
    const store = new StockStore("h1", { api: server, subscribe: () => () => {}, timeoutMs: 20 });
    live.push(store);
    store.start();
    await new Promise((r) => setTimeout(r, 60));
    expect(store.getSnapshot().load).toBe("error");
    server.release();
  });
});

describe("保存を待たない更新・行ごとの順番・戻し", () => {
  it("± は先に画面が変わり、保存の結果がそろう", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 2)] });
    h.server.held = true;
    h.store.step("s1", 1);
    expect(h.q("s1")?.quantity).toBe(3);
    expect(h.store.getSnapshot().pendingIds.has("s1")).toBe(true);
    h.server.release();
    await flush();
    expect(h.server.stocks.get("s1")?.quantity).toBe(3);
    expect(h.q("s1")?.quantity).toBe(3);
    expect(h.store.getSnapshot().pendingIds.size).toBe(0);
  });
  it("+ を3回すばやく押すと、送信中の値のあとは最後の値だけを送る", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 1)] });
    h.server.held = true;
    h.store.step("s1", 1);
    h.store.step("s1", 1);
    h.store.step("s1", 1);
    expect(h.q("s1")?.quantity).toBe(4);
    h.server.release();
    await flush();
    const sends = h.server.calls.filter((c) => c.startsWith("updateStock"));
    expect(sends).toEqual(['updateStock:s1:{"quantity":2}', 'updateStock:s1:{"quantity":4}']);
    expect(h.server.stocks.get("s1")?.quantity).toBe(4);
  });
  it("別の列は列ごとに送る(互いに消し合わない)", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 1)] });
    h.server.held = true;
    h.store.step("s1", 1);
    h.store.patchStock("s1", { expiresOn: "2026-10-30" });
    h.store.patchStock("s1", { locationId: "loc-veg" });
    h.server.release();
    await flush();
    expect(h.server.calls.filter((c) => c.startsWith("updateStock"))).toEqual([
      'updateStock:s1:{"quantity":2}',
      'updateStock:s1:{"expiresOn":"2026-10-30","locationId":"loc-veg"}',
    ]);
    expect(h.q("s1")).toMatchObject({ quantity: 2, expiresOn: "2026-10-30", locationId: "loc-veg" });
  });
  it("失敗したら最後にサーバーから受け取った値に戻し、知らせる", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 2)] });
    h.server.failures.push("network");
    h.store.step("s1", 1);
    expect(h.q("s1")?.quantity).toBe(3);
    await flush();
    expect(h.q("s1")?.quantity).toBe(2);
    expect(h.notices).toEqual([{ kind: "save_failed", itemName: "牛乳" }]);
    expect(h.store.getSnapshot().pendingIds.size).toBe(0);
  });
  it("通信の上限を超えたら失敗として戻す", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 2)], timeoutMs: 30 });
    h.server.held = true;
    h.store.step("s1", 1);
    await new Promise((r) => setTimeout(r, 80));
    expect(h.q("s1")?.quantity).toBe(2);
    expect(h.notices[0]?.kind).toBe("save_failed");
    h.server.release();
  });
  it("相手が先に使い切っていたら(0 行)行を消して gone で知らせる", async () => {
    const h = await setup({ items: [natto], stocks: [stock("s1", "natto", 1)] });
    h.server.stocks.delete("s1");
    h.store.step("s1", 1);
    await flush();
    expect(h.q("s1")).toBeUndefined();
    expect(h.notices).toEqual([{ kind: "gone", itemName: "納豆" }]);
  });
  it("残量は ○→△→×→○", async () => {
    const h = await setup({ items: [mayo] });
    h.store.cycleLevel("mayo");
    expect(h.it("mayo")?.stockLevel).toBe("low");
    await flush();
    h.store.cycleLevel("mayo");
    h.store.cycleLevel("mayo");
    await flush();
    expect(h.it("mayo")?.stockLevel).toBe("full");
    expect(h.server.items.get("mayo")?.stockLevel).toBe("full");
  });
  it("残量の失敗は戻る", async () => {
    const h = await setup({ items: [mayo] });
    h.server.failures.push("unknown");
    h.store.setLevel("mayo", "out");
    await flush();
    expect(h.it("mayo")?.stockLevel).toBe("full");
    expect(h.notices).toEqual([{ kind: "save_failed", itemName: "マヨネーズ" }]);
  });
});

describe("使い切りと「元に戻す」", () => {
  it("0 にすると行がすぐ消え、削除を送る", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 1)] });
    const handle = h.store.step("s1", -1);
    expect(handle?.label).toBe("牛乳を使い切りました");
    expect(h.q("s1")).toBeUndefined();
    await flush();
    expect(h.server.stocks.has("s1")).toBe(false);
  });
  it("元に戻すと、同じ id・同じ値(createdAt を含む)で作り直す", async () => {
    const original = stock("s1", "milk", 1, { expiresOn: "2026-10-30", locationId: "loc-veg" }, 5);
    const h = await setup({ items: [milk], stocks: [original] });
    const before = h.q("s1")!;
    const handle = h.store.useUp("s1")!;
    await flush();
    handle.undo();
    expect(h.q("s1")).toBeDefined();
    await flush();
    const after = h.server.stocks.get("s1")!;
    expect(after).toMatchObject({ id: "s1", quantity: 1, expiresOn: "2026-10-30", locationId: "loc-veg", createdAt: before.createdAt });
    expect(h.q("s1")?.createdAt).toBe(before.createdAt);
  });
  it("削除の送信中に元に戻しても、削除のあとに作り直す", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 1)] });
    h.server.held = true;
    const handle = h.store.useUp("s1")!;
    handle.undo();
    h.server.release();
    await flush();
    expect(h.server.calls.filter((c) => /Stock/.test(c))).toEqual(["deleteStock:s1", "insertStock:s1"]);
    expect(h.server.stocks.has("s1")).toBe(true);
    expect(h.q("s1")).toBeDefined();
  });
  it("削除をまだ送っていないうちに元に戻したら、削除を送らず値を書き戻す", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 3), stock("s2", "milk", 1)] });
    h.server.held = true;
    h.store.step("s1", 1); // 送信中
    const handle = h.store.useUp("s1")!; // 削除は待ち
    handle.undo();
    h.server.release();
    await flush();
    expect(h.server.calls.some((c) => c.startsWith("deleteStock"))).toBe(false);
    expect(h.server.stocks.get("s1")?.quantity).toBe(4); // 使い切る直前の画面の値(送信中の + を含む)
  });
  it("使い切りの失敗は行を戻す", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 1)] });
    h.server.failures.push("network");
    h.store.useUp("s1");
    await flush();
    expect(h.q("s1")).toBeDefined();
    expect(h.notices[0]).toEqual({ kind: "save_failed", itemName: "牛乳" });
  });
});

describe("Realtime・読み直しの取り込み", () => {
  const row = (over: Partial<ItemStock>): ItemStock => ({ ...stock("s1", "milk", 2), ...over });
  it("相手の変更が黙って反映され、古い知らせは無視する", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 2)] });
    const cur = h.q("s1")!;
    h.send({ table: "item_stock", operation: "UPDATE", row: row({ quantity: 5, updatedAt: "2026-11-09T00:00:00.000900+00:00" }) });
    expect(h.q("s1")?.quantity).toBe(5);
    h.send({ table: "item_stock", operation: "UPDATE", row: row({ quantity: 1, updatedAt: cur.updatedAt }) });
    expect(h.q("s1")?.quantity).toBe(5);
  });
  it("相手の INSERT で行が出て、DELETE で消える", async () => {
    const h = await setup({ items: [milk], stocks: [] });
    const r = row({ id: "s9", updatedAt: "2026-11-09T00:00:00.000900+00:00" });
    h.send({ table: "item_stock", operation: "INSERT", row: r });
    expect(h.q("s9")).toBeDefined();
    h.send({ table: "item_stock", operation: "DELETE", oldRow: r });
    expect(h.q("s9")).toBeUndefined();
  });
  it("送信中の行には画面の値を変えず、失敗したら相手の値に戻る", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 2)] });
    h.server.held = true;
    h.store.step("s1", 1);
    h.send({ table: "item_stock", operation: "UPDATE", row: row({ quantity: 7, updatedAt: "2026-11-09T00:00:00.000900+00:00" }) });
    expect(h.q("s1")?.quantity).toBe(3);
    h.server.failures.push("network");
    h.server.release();
    await flush();
    expect(h.q("s1")?.quantity).toBe(7);
  });
  it("元に戻して作り直している最中の行は、自分の DELETE の知らせで消さない", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 1)] });
    const old = h.q("s1")!;
    const handle = h.store.useUp("s1")!;
    h.server.held = true;
    handle.undo();
    h.send({ table: "item_stock", operation: "DELETE", oldRow: old });
    expect(h.q("s1")).toBeDefined();
    h.server.release();
    await flush();
    expect(h.q("s1")).toBeDefined();
  });
  it("作り直されたあとの行には、古い DELETE の知らせを効かせない", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 1)] });
    const old = h.q("s1")!;
    const handle = h.store.useUp("s1")!;
    await flush();
    handle.undo();
    await flush();
    h.send({ table: "item_stock", operation: "DELETE", oldRow: old });
    expect(h.q("s1")).toBeDefined();
  });
  it("切れている間に消えた行は、つながったときの読み直しで消える", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 1), stock("s2", "milk", 1)] });
    h.server.stocks.delete("s2");
    h.status("reconnecting");
    expect(h.store.getSnapshot().connection).toBe("reconnecting");
    h.status("subscribed");
    await flush();
    expect(h.q("s2")).toBeUndefined();
    expect(h.q("s1")).toBeDefined();
    expect(h.store.getSnapshot().connection).toBe("online");
  });
  it("読み直しの最中に届いた行は、読み直しの結果に無くても消さない", async () => {
    const h = await setup({ items: [milk], stocks: [] });
    h.server.held = true;
    h.status("subscribed"); // 読み直し開始(保留)
    h.send({ table: "item_stock", operation: "INSERT", row: row({ id: "s5", updatedAt: "2026-11-09T00:00:00.000900+00:00" }) });
    h.server.release();
    await flush();
    expect(h.q("s5")).toBeDefined();
  });
});

describe("オフライン", () => {
  it("offline の間は操作が何もしない。戻ると読み直す", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 2)] });
    h.store.setOnline(false);
    expect(h.store.getSnapshot().connection).toBe("offline");
    h.store.step("s1", 1);
    expect(h.store.useUp("s1")).toBeNull();
    expect(h.q("s1")?.quantity).toBe(2);
    expect(h.server.calls.some((c) => c.startsWith("updateStock"))).toBe(false);
    h.server.stocks.set("s1", { ...h.server.stocks.get("s1")!, quantity: 9, updatedAt: h.server.stamp() });
    h.store.setOnline(true);
    await flush();
    expect(h.store.getSnapshot().connection).toBe("online");
    expect(h.q("s1")?.quantity).toBe(9);
  });
  it("offline で始めて読み込めなかったら error、戻ると自動で読み直す", async () => {
    const server = new FakeServer();
    server.fetchFailures.push("network");
    const store = new StockStore("h1", { api: server, subscribe: () => () => {}, isOnline: () => false });
    live.push(store);
    store.start();
    await flush();
    expect(store.getSnapshot()).toMatchObject({ load: "error", connection: "offline" });
    store.setOnline(true);
    await flush();
    expect(store.getSnapshot().load).toBe("ready");
  });
});

describe("登録", () => {
  const base = {
    name: "ヨーグルト", tracking: "count" as const, genreId: "g-dairy", unitId: "u-ko", quantity: 3, stockLevel: "full" as const,
    locationId: "loc-fridge", purchasedOn: "2026-10-23", expiresOn: "2026-10-30",
  };
  it("在庫がすぐ一覧に出て、品物 → 在庫の順に送る", async () => {
    const h = await setup();
    h.server.held = true;
    const p = h.store.register(base);
    expect(h.store.getSnapshot().data.stocks).toHaveLength(1);
    expect(h.store.getSnapshot().data.items[0]).toMatchObject({ name: "ヨーグルト", lastExpiryDays: 7 });
    h.server.release();
    expect(await p).toEqual({ ok: true });
    expect(h.server.calls.filter((c) => /insert/.test(c))).toEqual(["insertItem:ヨーグルト", "insertStock:id-2"]);
    expect(h.server.stocks.get("id-2")).toMatchObject({ itemId: "id-1", quantity: 3 });
  });
  it("失敗したら見た目を戻し、入力を返す", async () => {
    const h = await setup();
    h.server.failures.push("network");
    const r = await h.store.register(base);
    expect(r).toEqual({ ok: false, reason: "network", input: base });
    expect(h.store.getSnapshot().data.items).toHaveLength(0);
    expect(h.store.getSnapshot().data.stocks).toHaveLength(0);
    expect(h.notices).toEqual([]);
    expect(h.server.calls.some((c) => c.startsWith("insertStock"))).toBe(false);
  });
  it("在庫の保存に失敗したら在庫だけ戻す(品物は残る)", async () => {
    const h = await setup();
    h.server.insertStock = async () => ({ ok: false, reason: "network" });
    const r = await h.store.register(base);
    expect(r).toMatchObject({ ok: false, reason: "network" });
    expect(h.store.getSnapshot().data.items).toHaveLength(1);
    expect(h.store.getSnapshot().data.stocks).toHaveLength(0);
  });
  it("既存の品物には品物の値の書き換えと在庫の追加", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 1)] });
    const r = await h.store.register({ ...base, name: "牛乳", unitId: "u-pack", genreId: "g-dairy", locationId: "loc-veg", expiresOn: "2026-10-30" });
    expect(r).toEqual({ ok: true });
    expect(h.server.items.get("milk")).toMatchObject({ locationId: "loc-veg", lastExpiryDays: 7 });
    expect([...h.server.stocks.values()].filter((s) => s.itemId === "milk")).toHaveLength(2);
  });
  it("単位の食い違いは送らずに誤りを返す", async () => {
    const h = await setup({ items: [milk], stocks: [stock("s1", "milk", 1)] });
    const r = await h.store.register({ ...base, name: "牛乳", unitId: "u-ko" });
    expect(r).toMatchObject({ ok: false, reason: { error: "unit_mismatch" } });
    expect(h.server.calls.some((c) => /insert|update/.test(c))).toBe(false);
  });
  it("同じ名前を同時に登録されたら、読み直して既存の品物への登録としてやり直す", async () => {
    const h = await setup();
    // 相手が先に「ヨーグルト」を作った(この画面はまだ知らない)
    const theirs = item("theirs", "ヨーグルト", { unitId: "u-ko", genreId: "g-dairy", locationId: "loc-fridge" });
    h.server.items.set("theirs", { ...theirs, updatedAt: h.server.stamp() });
    const r = await h.store.register(base);
    expect(r).toEqual({ ok: true });
    expect(h.store.getSnapshot().data.items).toHaveLength(1);
    expect(h.store.getSnapshot().data.items[0].id).toBe("theirs");
    expect(h.store.getSnapshot().data.stocks).toHaveLength(1);
    expect([...h.server.stocks.values()]).toHaveLength(1);
    expect(h.notices).toEqual([]);
  });
});

// ---- run 2(stock-master): マスタ、品物の削除・管理のしかた、「元に戻す」 ----
const dairyStock = (id: string, qty: number, over = {}) => stock(id, "milk", qty, over);

describe("マスタの追加・名前の変更(規則 10・17)", () => {
  it("追加は先に画面に出て、次の並び・単位は ± で数える・ジャンルの既定は未選択で送る", async () => {
    const h = await setup();
    h.server.held = true;
    expect(h.store.addMaster("genre", "  乾物 ")).toEqual({ ok: true });
    const g = h.store.getSnapshot().data.genres.find((x) => x.name === "乾物");
    expect(g).toMatchObject({ sortOrder: 8, defaultLocationId: null });
    expect(h.store.addMaster("unit", "箱")).toEqual({ ok: true });
    h.server.release();
    await flush();
    expect(h.server.masters.genre.size).toBe(genres.length + 1);
    expect([...h.server.masters.unit.values()].find((u) => u.name === "箱")).toMatchObject({ isCountable: true, sortOrder: 7 });
  });
  it("空・重複は送らずに返す", async () => {
    const h = await setup();
    expect(h.store.addMaster("genre", "  ")).toEqual({ ok: false, error: "empty" });
    expect(h.store.addMaster("genre", "肉")).toEqual({ ok: false, error: "taken" });
    expect(h.server.calls.filter((c) => c.startsWith("insertMaster"))).toEqual([]);
  });
  it("同時に同じ名前: 追加した行を画面から消し、name_taken(追加)で知らせる", async () => {
    const h = await setup();
    h.server.masters.genre.set("other", { ...genres[0], id: "other", name: "乾物", sortOrder: 20 });
    h.store.addMaster("genre", "乾物");
    await flush();
    expect(h.notices).toEqual([{ kind: "name_taken", itemName: "乾物", subject: "ジャンル", adding: true }]);
    expect(h.store.getSnapshot().data.genres.filter((g) => g.name === "乾物").map((g) => g.id)).toEqual([]);
  });
  it("名前の変更: 同じ名前は何もせず、2人の同時は値を戻して name_taken で知らせる", async () => {
    const h = await setup();
    expect(h.store.renameMaster("genre", "g-meat", "肉")).toEqual({ ok: true });
    expect(h.server.calls.some((c) => c.startsWith("updateMaster"))).toBe(false);
    h.server.masters.genre.set("g-meat", { ...genres[1], name: "お肉" });
    expect(h.store.renameMaster("genre", "g-meat", "お魚")).toEqual({ ok: true });
    expect(h.store.getSnapshot().data.genres.find((g) => g.id === "g-meat")?.name).toBe("お魚");
    h.server.masters.genre.set("x", { ...genres[0], id: "x", name: "お魚" });
    await flush();
    expect(h.notices).toEqual([{ kind: "name_taken", itemName: "お魚", subject: "ジャンル", adding: false }]);
  });
  it("既定の場所と ± で数えるは patch で送る", async () => {
    const h = await setup();
    h.store.setGenreDefaultLocation("g-meat", null);
    h.store.setUnitCountable("u-g", true);
    await flush();
    expect(h.server.calls).toContain('updateMaster:genre:g-meat:{"defaultLocationId":null}');
    expect(h.server.calls).toContain('updateMaster:unit:u-g:{"isCountable":true}');
  });
  it("相手が先に消していた(0 行)なら画面から消して master_gone", async () => {
    const h = await setup();
    h.server.masters.unit.delete("u-g");
    h.store.renameMaster("unit", "u-g", "グラム");
    await flush();
    expect(h.notices).toEqual([{ kind: "master_gone", itemName: "グラム" }]);
    expect(h.store.getSnapshot().data.units.find((u) => u.id === "u-g")).toBeUndefined();
  });
});

describe("マスタの削除と「元に戻す」(規則 11)", () => {
  it("使用中は消さずに in_use を返す", async () => {
    const h = await setup({ items: [milk] });
    expect(h.store.deleteMaster("genre", "g-dairy")).toEqual({ error: "in_use" });
    expect(h.server.calls.some((c) => c.startsWith("deleteMaster"))).toBe(false);
  });
  it("既定の場所に使われていた場所: 画面のジャンルの既定は空になり、元に戻すと同じ id で作り直して既定も戻る", async () => {
    const h = await setup();
    h.server.masters.location.set("loc-extra", { ...locations[0], id: "loc-extra", name: "パントリー", sortOrder: 9, createdAt: "2026-10-01T00:00:09Z" });
    h.server.masters.genre.set("g-meat", { ...genres[1], defaultLocationId: "loc-extra" });
    h.store.reload();
    await flush();
    const handle = h.store.deleteMaster("location", "loc-extra");
    expect(handle && "label" in handle && handle.label).toBe("パントリーを削除しました");
    expect(h.store.getSnapshot().data.genres.find((g) => g.id === "g-meat")?.defaultLocationId).toBeNull();
    expect(h.store.getSnapshot().data.locations.some((l) => l.id === "loc-extra")).toBe(false);
    await flush();
    expect(h.server.masters.location.has("loc-extra")).toBe(false);
    expect((h.server.masters.genre.get("g-meat") as Genre).defaultLocationId).toBeNull();
    (handle as { undo: () => void }).undo();
    expect(h.store.getSnapshot().data.genres.find((g) => g.id === "g-meat")?.defaultLocationId).toBe("loc-extra");
    await flush();
    expect(h.server.masters.location.get("loc-extra")).toMatchObject({ name: "パントリー", sortOrder: 9, createdAt: "2026-10-01T00:00:09Z" });
    expect((h.server.masters.genre.get("g-meat") as Genre).defaultLocationId).toBe("loc-extra");
    expect(h.notices).toEqual([]);
  });
  it("送信前に元に戻すと、削除を送らずに値が戻る", async () => {
    const h = await setup();
    h.server.masters.unit.set("u-x", { ...units[0], id: "u-x", name: "箱", sortOrder: 9 });
    h.store.reload();
    await flush();
    h.server.held = true;
    h.store.setUnitCountable("u-x", false); // 送信中にして、次の削除を送信待ちにする
    const handle = h.store.deleteMaster("unit", "u-x") as { undo: () => void };
    handle.undo();
    h.server.release();
    await flush();
    expect(h.server.calls.some((c) => c.startsWith("deleteMaster"))).toBe(false);
    expect(h.server.masters.unit.has("u-x")).toBe(true);
    expect(h.store.getSnapshot().data.units.some((u) => u.id === "u-x")).toBe(true);
  });
  it("サーバーで使用中になっていた(conflict)なら、消した行を戻して in_use で知らせる", async () => {
    const h = await setup();
    h.server.masters.unit.set("u-x", { ...units[0], id: "u-x", name: "箱", sortOrder: 9 });
    h.store.reload();
    await flush();
    h.server.items.set("peer", item("peer", "相手の品", { unitId: "u-x" })); // 手元はまだ知らない
    h.store.deleteMaster("unit", "u-x");
    await flush();
    expect(h.notices).toEqual([{ kind: "in_use", itemName: "箱" }]);
    expect(h.store.getSnapshot().data.units.some((u) => u.id === "u-x")).toBe(true);
  });
  it("作り直しで同じ名前ができていたら undo_failed", async () => {
    const h = await setup();
    h.server.masters.unit.set("u-x", { ...units[0], id: "u-x", name: "箱", sortOrder: 9 });
    h.store.reload();
    await flush();
    const handle = h.store.deleteMaster("unit", "u-x") as { undo: () => void };
    await flush();
    h.server.masters.unit.set("u-y", { ...units[0], id: "u-y", name: "箱", sortOrder: 10 });
    handle.undo();
    await flush();
    expect(h.notices).toEqual([{ kind: "undo_failed", itemName: "箱" }]);
    expect(h.store.getSnapshot().data.units.some((u) => u.id === "u-x")).toBe(false);
  });
});

describe("品物の値", () => {
  it("名前: 空・重複は送らない。変更は先に画面に出る。単位を変えても在庫の数は変わらない", async () => {
    const h = await setup({ items: [milk, natto], stocks: [dairyStock("s1", 200)] });
    expect(h.store.renameItem("milk", " ")).toEqual({ ok: false, error: "empty" });
    expect(h.store.renameItem("milk", "納豆")).toEqual({ ok: false, error: "taken" });
    expect(h.store.renameItem("milk", " 低脂肪乳 ")).toEqual({ ok: true });
    expect(h.it("milk")?.name).toBe("低脂肪乳");
    h.store.setItemUnit("milk", "u-g");
    h.store.setItemGenre("milk", "g-veg");
    h.store.setRegular("milk", true);
    await flush();
    expect(h.server.items.get("milk")).toMatchObject({ name: "低脂肪乳", unitId: "u-g", genreId: "g-veg", isRegular: true });
    expect(h.server.stocks.get("s1")?.quantity).toBe(200);
  });
  it("相手が先に削除していたら、品物と在庫を画面から消して item_gone", async () => {
    const h = await setup({ items: [milk], stocks: [dairyStock("s1", 2)] });
    h.server.items.delete("milk");
    h.store.setRegular("milk", true);
    await flush();
    expect(h.notices).toEqual([{ kind: "item_gone", itemName: "牛乳" }]);
    expect(h.it("milk")).toBeUndefined();
    expect(h.q("s1")).toBeUndefined();
  });
  it("2人の同時の名前変更は name_taken で戻す", async () => {
    const h = await setup({ items: [milk] });
    h.server.items.set("peer", item("peer", "ヨーグルト"));
    h.store.renameItem("milk", "ヨーグルト");
    await flush();
    expect(h.notices).toEqual([{ kind: "name_taken", itemName: "ヨーグルト", subject: "品物", adding: false }]);
    expect(h.it("milk")?.name).toBe("牛乳");
  });
  it("オフラインでは何もしない", async () => {
    const h = await setup({ items: [milk], online: false });
    expect(h.store.renameItem("milk", "あ")).toEqual({ ok: false, error: "offline" });
    expect(h.store.deleteItem("milk")).toBeNull();
    expect(h.store.deleteMaster("unit", "u-g")).toBeNull();
    expect(h.store.addMaster("unit", "新")).toEqual({ ok: false, error: "offline" });
    expect(h.store.changeTracking("milk", { to: "level", level: "full" })).toBeNull();
  });
});

describe("品物の削除と「元に戻す」(規則 12・14・15)", () => {
  const setupMilk = () => setup({ items: [milk, natto], stocks: [dairyStock("s1", 2, { expiresOn: "2026-10-30" }), dairyStock("s2", 1, { locationId: "loc-shelf" }), stock("n1", "natto", 3)] });

  it("画面から品物と在庫が消え、削除は1回送る。元に戻すと同じ id・値・作った時刻で、品物 → 在庫の順に作り直す", async () => {
    const h = await setupMilk();
    const createdAt = h.it("milk")?.createdAt;
    const handle = h.store.deleteItem("milk") as { label: string; undo: () => void };
    expect(handle.label).toBe("牛乳を削除しました");
    expect(h.it("milk")).toBeUndefined();
    expect(h.q("s1")).toBeUndefined();
    expect(h.q("n1")).toBeDefined();
    await flush();
    expect(h.server.calls.filter((c) => c.startsWith("deleteItem"))).toEqual(["deleteItem:milk"]);
    h.server.calls.length = 0;
    handle.undo();
    await flush();
    expect(h.server.calls.filter((c) => /^(insertItem|insertStock)/.test(c))).toEqual(["insertItem:牛乳", "insertStock:s1", "insertStock:s2"]);
    expect(h.server.items.get("milk")?.createdAt).toBe(createdAt);
    expect(h.server.stocks.get("s1")).toMatchObject({ quantity: 2, expiresOn: "2026-10-30" });
    expect(h.server.stocks.get("s2")).toMatchObject({ quantity: 1, locationId: "loc-shelf" });
    expect(h.notices).toEqual([]);
  });
  it("6秒の間にこの端末でした別の操作(別の品物の ±)も戻る。相手(Realtime)の変更は戻さない", async () => {
    const h = await setupMilk();
    const handle = h.store.deleteItem("milk") as { undo: () => void };
    h.store.step("n1", 1); // この端末の操作
    const peer = { ...stock("p1", "natto", 5), updatedAt: "2026-11-09T00:00:00.900000+00:00" };
    h.send({ table: "item_stock", operation: "INSERT", row: peer } as RowChange);
    await flush();
    expect(h.q("n1")?.quantity).toBe(4);
    handle.undo();
    await flush();
    expect(h.q("n1")?.quantity).toBe(3);
    expect(h.server.stocks.get("n1")?.quantity).toBe(3);
    expect(h.q("p1")).toBeDefined();
    expect(h.it("milk")).toBeDefined();
  });
  it("6秒の間に登録した行は、元に戻すと消える", async () => {
    const h = await setupMilk();
    const handle = h.store.deleteItem("milk") as { undo: () => void };
    const reg = await h.store.register({
      name: "新しい品", tracking: "count", genreId: "g-veg", unitId: "u-ko", quantity: 1, stockLevel: "full",
      locationId: "loc-fridge", purchasedOn: "2026-10-23", expiresOn: null,
    });
    expect(reg).toEqual({ ok: true });
    expect([...h.server.items.values()].some((i) => i.name === "新しい品")).toBe(true);
    handle.undo();
    await flush();
    expect([...h.server.items.values()].some((i) => i.name === "新しい品")).toBe(false);
    expect(h.store.getSnapshot().data.items.some((i) => i.name === "新しい品")).toBe(false);
    expect(h.it("milk")).toBeDefined();
  });
  it("新しい UndoHandle が出たら前の控えは捨てる(前の元に戻すは何もしない)", async () => {
    const h = await setupMilk();
    const first = h.store.deleteItem("milk") as { undo: () => void };
    h.store.deleteItem("natto");
    first.undo();
    await flush();
    expect(h.it("milk")).toBeUndefined();
  });
  it("削除がまだ送信待ちなら、元に戻すと送らずに値が戻る(在庫も作り直さない)", async () => {
    const h = await setupMilk();
    h.server.held = true;
    h.store.setRegular("milk", true); // 送信中にする
    const handle = h.store.deleteItem("milk") as { undo: () => void };
    handle.undo();
    h.server.release();
    await flush();
    expect(h.server.calls.some((c) => c.startsWith("deleteItem"))).toBe(false);
    expect(h.server.items.has("milk")).toBe(true);
    expect(h.server.stocks.has("s1")).toBe(true);
    expect(h.it("milk")?.isRegular).toBe(true); // 削除の直前の値(送信中の ★ を含む)に戻る
  });
  it("作り直しで同じ名前の品物ができていたら undo_failed(品物は戻らず、在庫も送らない)", async () => {
    const h = await setupMilk();
    const handle = h.store.deleteItem("milk") as { undo: () => void };
    await flush();
    h.server.items.set("other", item("other", "牛乳"));
    h.server.calls.length = 0;
    handle.undo();
    await flush();
    expect(h.notices).toEqual([{ kind: "undo_failed", itemName: "牛乳" }]);
    expect(h.it("milk")).toBeUndefined();
    expect(h.q("s1")).toBeUndefined();
    expect(h.server.calls.some((c) => c.startsWith("insertStock"))).toBe(false);
  });
});

describe("管理のしかたの変更(規則 13・14)", () => {
  it("数 → 残量: 品物の update は1回で関係する列をまとめ、在庫は送らず(DB の trigger が消す)、画面からは消える", async () => {
    const m = item("milk", "牛乳", { restockAtCount: 2 });
    const h = await setup({ items: [m], stocks: [dairyStock("s1", 2, { locationId: "loc-shelf" }), dairyStock("s2", 1)] });
    h.store.changeTracking("milk", { to: "level", level: "low" });
    expect(h.q("s1")).toBeUndefined();
    expect(h.it("milk")).toMatchObject({ tracking: "level", stockLevel: "low", restockAtLevel: "low", restockAtCount: null });
    await flush();
    expect(h.server.calls.filter((c) => c.startsWith("updateItem"))).toHaveLength(1);
    expect(h.server.calls.some((c) => c.startsWith("deleteStock"))).toBe(false);
    expect(h.server.stocks.size).toBe(0);
  });
  it("残量 → 数: 品物の update のあとに在庫を作る。0 なら作らない。単位は選んだもの", async () => {
    const mayo2 = item("mayo", "マヨネーズ", { tracking: "level", unitId: null, stockLevel: "full", locationId: "loc-shelf", restockAtLevel: "low" });
    const h = await setup({ items: [mayo2] });
    h.store.changeTracking("mayo", { to: "count", unitId: "u-ko", quantity: 2 });
    expect(h.it("mayo")).toMatchObject({ tracking: "count", stockLevel: null, unitId: "u-ko", restockAtLevel: null });
    await flush();
    const calls = h.server.calls.filter((c) => /^(updateItem|insertStock)/.test(c));
    expect(calls[0]).toMatch(/^updateItem:mayo/);
    expect(calls[1]).toMatch(/^insertStock:/);
    expect([...h.server.stocks.values()][0]).toMatchObject({ itemId: "mayo", quantity: 2, locationId: "loc-shelf" });

    const h2 = await setup({ items: [mayo2] });
    h2.store.changeTracking("mayo", { to: "count", unitId: "u-ko", quantity: 0 });
    await flush();
    expect(h2.server.stocks.size).toBe(0);
    expect(h2.it("mayo")?.tracking).toBe("count");
  });
  it("品物の update の失敗: 品物と在庫を最後にサーバーから受け取った値に戻し、save_failed", async () => {
    const h = await setup({ items: [milk], stocks: [dairyStock("s1", 2)] });
    h.server.failures.push("network");
    h.store.changeTracking("milk", { to: "level", level: "full" });
    await flush();
    expect(h.notices).toEqual([{ kind: "save_failed", itemName: "牛乳" }]);
    expect(h.it("milk")?.tracking).toBe("count");
    expect(h.q("s1")?.quantity).toBe(2);
  });
  it("元に戻す(数 → 残量): 在庫を同じ id・値で作り直し、品物も元の列に戻す", async () => {
    const m = item("milk", "牛乳", { restockAtCount: 2 });
    const h = await setup({ items: [m], stocks: [dairyStock("s1", 2, { expiresOn: "2026-10-30" }), dairyStock("s2", 1, { locationId: "loc-shelf" })] });
    const handle = h.store.changeTracking("milk", { to: "level", level: "full" }) as { label: string; undo: () => void };
    expect(handle.label).toBe("牛乳を残量で管理に変えました");
    await flush();
    h.server.calls.length = 0;
    handle.undo();
    await flush();
    expect(h.server.calls.filter((c) => /^(updateItem|insertStock)/.test(c)).map((c) => c.split(":")[0] + ":" + c.split(":")[1])).toEqual(["updateItem:milk", "insertStock:s1", "insertStock:s2"]);
    expect(h.server.items.get("milk")).toMatchObject({ tracking: "count", stockLevel: null, restockAtCount: 2, restockAtLevel: null });
    expect(h.server.stocks.get("s1")).toMatchObject({ quantity: 2, expiresOn: "2026-10-30" });
    expect(h.server.stocks.get("s2")).toMatchObject({ quantity: 1, locationId: "loc-shelf" });
  });
  it("元に戻す(残量 → 数): 作った在庫を消し、品物を残量に戻す", async () => {
    const mayo2 = item("mayo", "マヨネーズ", { tracking: "level", unitId: "u-ko", stockLevel: "low", restockAtLevel: "low", locationId: "loc-shelf" });
    const h = await setup({ items: [mayo2] });
    const handle = h.store.changeTracking("mayo", { to: "count", unitId: "u-ko", quantity: 2 }) as { undo: () => void };
    await flush();
    handle.undo();
    await flush();
    expect(h.server.items.get("mayo")).toMatchObject({ tracking: "level", stockLevel: "low", restockAtLevel: "low" });
    expect(h.server.stocks.size).toBe(0);
    expect(h.it("mayo")?.tracking).toBe("level");
  });
  it("同じ向きには変えられない(null)", async () => {
    const h = await setup({ items: [milk] });
    expect(h.store.changeTracking("milk", { to: "count", unitId: "u-ko", quantity: 1 })).toBeNull();
  });
  it("残量の品物に、古い画面の相手が在庫を入れようとすると conflict(登録の失敗)", async () => {
    const mayo2 = item("mayo", "マヨネーズ", { tracking: "level", unitId: null, stockLevel: "full" });
    const h = await setup({ items: [mayo2] });
    h.server.items.set("milk", { ...milk, tracking: "level", stockLevel: "full", unitId: null, updatedAt: h.server.stamp() }); // サーバーでは残量
    const r = await h.store.register({
      name: "牛乳", tracking: "count", genreId: "g-dairy", unitId: "u-ko", quantity: 1, stockLevel: "full", locationId: "loc-fridge", purchasedOn: "2026-10-23", expiresOn: null,
    });
    expect(r.ok).toBe(false);
  });
});
