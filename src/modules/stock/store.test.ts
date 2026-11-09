import { afterEach, describe, expect, it } from "vitest";
import type { RowChange } from "@/lib/supabase/realtime";
import type { StockFailure, StockResult } from "@/lib/supabase/stock";
import { genres, item, locations, stock, units } from "./fixtures";
import { StockStore, type FailureNotice, type StockApi } from "./store";
import type { Item, ItemPatch, ItemStock, NewItem, NewItemStock, StockData, StockPatch } from "./types";

// Supabase を偽物に差し替えた store の単体テスト。偽のサーバーは行を持ち、サーバーの時刻(updatedAt)を単調に進める。

const flush = async () => {
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
};

class FakeServer implements StockApi {
  items = new Map<string, Item>();
  stocks = new Map<string, ItemStock>();
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
    return { ok: true, value: { genres, locations, units, items: [...this.items.values()], stocks: [...this.stocks.values()] } };
  }
  async insertItem(row: NewItem): Promise<StockResult<Item>> {
    this.calls.push(`insertItem:${row.name}`);
    await this.gate();
    const f = this.fail<Item>();
    if (f) return f;
    if ([...this.items.values()].some((i) => i.name === row.name)) return { ok: false, reason: "name_taken" };
    const r: Item = { ...row, createdAt: this.stamp(), updatedAt: this.stamp() };
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
    const r = { ...cur, ...patch, updatedAt: this.stamp() };
    this.items.set(id, r);
    return { ok: true, value: r };
  }
  async insertStock(row: NewItemStock): Promise<StockResult<ItemStock>> {
    this.calls.push(`insertStock:${row.id}`);
    await this.gate();
    const f = this.fail<ItemStock>();
    if (f) return f;
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
