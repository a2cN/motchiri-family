import { afterEach, describe, expect, it } from "vitest";
import type { ShoppingApi } from "@/lib/supabase/shopping";
import type { ShoppingChange } from "@/lib/supabase/realtime";
import type { StockFailure, StockResult } from "@/lib/supabase/stock";
import { ShoppingStore, type ShoppingFailureNotice } from "./store";
import { MemoryShoppingLocal } from "./memory-local";
import type { EntryPatch, ShoppingListEntry, ShoppingMemo } from "./types";

const flush = async () => {
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
};

class FakeShoppingServer implements ShoppingApi {
  rows = new Map<string, ShoppingListEntry>();
  memo: ShoppingMemo = { householdId: "h1", body: "", updatedAt: "2026-11-14T00:00:00.000000+00:00" };
  clock = 100;
  failures: StockFailure[] = [];
  calls: string[] = [];
  fetchSince: Array<string | null> = [];
  stamp() {
    return `2026-11-14T00:00:00.${String(++this.clock).padStart(6, "0")}+00:00`;
  }
  private fail<T>(): StockResult<T> | null {
    const reason = this.failures.shift();
    return reason ? { ok: false, reason } : null;
  }
  add(id: string, over: Partial<ShoppingListEntry> = {}): ShoppingListEntry {
    const r: ShoppingListEntry = {
      id, householdId: "h1", createdAt: this.stamp(), updatedAt: this.stamp(), itemId: null, name: id, source: "manual",
      isChecked: false, isDismissed: false, prevStockLevel: null, deletedAt: null, ...over,
    };
    this.rows.set(id, r);
    return r;
  }
  async fetchList(_h: string, since: string | null): Promise<StockResult<ShoppingListEntry[]>> {
    this.calls.push("fetchList");
    this.fetchSince.push(since);
    const f = this.fail<ShoppingListEntry[]>();
    if (f) return f;
    return { ok: true, value: [...this.rows.values()].filter((r) => (since === null ? r.deletedAt === null : r.updatedAt >= since)) };
  }
  async fetchMemo(): Promise<StockResult<ShoppingMemo | null>> {
    return { ok: true, value: this.memo };
  }
  async insertManual(row: { id: string; householdId: string; name: string }): Promise<StockResult<null>> {
    this.calls.push(`insertManual:${row.id}`);
    const f = this.fail<null>();
    if (f) return f;
    if (!this.rows.has(row.id)) this.add(row.id, { name: row.name });
    return { ok: true, value: null };
  }
  async patchEntry(id: string, patch: EntryPatch): Promise<StockResult<ShoppingListEntry>> {
    this.calls.push(`patchEntry:${id}:${JSON.stringify(patch)}`);
    const f = this.fail<ShoppingListEntry>();
    if (f) return f;
    const cur = this.rows.get(id);
    if (!cur) return { ok: false, reason: "not_found" };
    const next = {
      ...cur,
      ...(patch.isChecked !== undefined ? { isChecked: patch.isChecked } : {}),
      ...(patch.isDismissed !== undefined ? { isDismissed: patch.isDismissed } : {}),
      ...(patch.deleted !== undefined ? { deletedAt: patch.deleted ? (cur.deletedAt ?? this.stamp()) : null } : {}),
      updatedAt: this.stamp(),
    };
    this.rows.set(id, next);
    return { ok: true, value: next };
  }
  async setMemo(_h: string, body: string): Promise<StockResult<ShoppingMemo>> {
    this.calls.push(`setMemo:${body}`);
    const f = this.fail<ShoppingMemo>();
    if (f) return f;
    this.memo = { ...this.memo, body, updatedAt: this.stamp() };
    return { ok: true, value: this.memo };
  }
  async finishCheckIn(_h: string, ids: string[], clearDismissed: boolean): Promise<StockResult<null>> {
    this.calls.push(`finishCheckIn:${ids.join(",")}:${clearDismissed}`);
    const f = this.fail<null>();
    if (f) return f;
    for (const r of this.rows.values()) {
      if (ids.includes(r.id) || (clearDismissed && r.isDismissed)) this.rows.set(r.id, { ...r, deletedAt: r.deletedAt ?? this.stamp(), updatedAt: this.stamp() });
    }
    return { ok: true, value: null };
  }
  async restoreEntries(rows: Array<{ id: string; itemId: string | null }>): Promise<StockResult<null>> {
    this.calls.push(`restoreEntries:${rows.map((r) => r.id).join(",")}`);
    for (const r of rows) {
      const cur = this.rows.get(r.id);
      if (cur) this.rows.set(r.id, { ...cur, deletedAt: null, itemId: r.itemId ?? cur.itemId, updatedAt: this.stamp() });
    }
    return { ok: true, value: null };
  }
}

type H = {
  server: FakeShoppingServer;
  store: ShoppingStore;
  local: MemoryShoppingLocal;
  notices: ShoppingFailureNotice[];
  send: (c: ShoppingChange) => void;
  status: (s: "subscribed" | "reconnecting" | "denied" | "connecting") => void;
  names: () => string[];
};
const live: ShoppingStore[] = [];
afterEach(() => live.splice(0).forEach((s) => s.stop()));

async function setup(opts: { rows?: Array<[string, Partial<ShoppingListEntry>]>; online?: boolean; local?: MemoryShoppingLocal } = {}): Promise<H> {
  const server = new FakeShoppingServer();
  for (const [id, over] of opts.rows ?? []) server.add(id, over);
  let onChange: (c: ShoppingChange) => void = () => {};
  let onStatus: (s: "subscribed" | "reconnecting" | "denied" | "connecting") => void = () => {};
  let n = 0;
  const local = opts.local ?? new MemoryShoppingLocal();
  const store = new ShoppingStore("h1", {
    api: server,
    local,
    subscribe: (_h, change, status) => {
      onChange = change;
      onStatus = status;
      return () => {};
    },
    now: () => new Date("2026-11-14T03:00:00Z"),
    newId: () => `new-${++n}`,
    timeoutMs: 1000,
    isOnline: () => opts.online ?? true,
  });
  live.push(store);
  const notices: ShoppingFailureNotice[] = [];
  store.onFailure((x) => notices.push(x));
  store.start();
  await flush();
  return { server, store, local, notices, send: (c) => onChange(c), status: (s) => onStatus(s), names: () => store.getSnapshot().entries.map((e) => e.name) };
}

describe("読み込みと取り込み", () => {
  it("初回は全部(削除の印の行を除く)を読んで ready。端末に写しができる", async () => {
    const h = await setup({ rows: [["卵", {}], ["牛乳", { deletedAt: "2026-11-14T00:00:00.000050+00:00" }]] });
    const s = h.store.getSnapshot();
    expect(s.load).toBe("ready");
    expect(h.names()).toEqual(["卵"]);
    expect(s.hasLocalCopy).toBe(true);
    expect(h.server.fetchSince[0]).toBeNull();
  });
  it("端末のデータの読み込みが遅くて、Realtime の接続が先に済んでも、写しの cursor を上書きして「写しが無い」にならない(Dexie の実体で出た競合)", async () => {
    class SlowLocal extends MemoryShoppingLocal {
      override async load() {
        await new Promise((r) => setTimeout(r, 30));
        return super.load();
      }
    }
    const server = new FakeShoppingServer();
    server.add("卵");
    const store = new ShoppingStore("h1", {
      api: server,
      local: new SlowLocal(),
      // 購読の直後(読み込みが終わる前)に subscribed が届く
      subscribe: (_h, _c, status) => {
        queueMicrotask(() => status("subscribed"));
        return () => {};
      },
      timeoutMs: 1000,
      isOnline: () => true,
    });
    live.push(store);
    store.start();
    await new Promise((r) => setTimeout(r, 120));
    const s = store.getSnapshot();
    expect(s.hasLocalCopy).toBe(true);
    expect(s.entries.map((e) => e.name)).toEqual(["卵"]);
    // 読み込みが済む前には取り込まない(取り込みは1回だけ。先に取り込むと、読み込みの値が cursor を上書きしたあとの電波の無い瞬間に「写しが無い」になる)
    expect(server.fetchSince).toEqual([null]);
  });
  it("2回目からは cursor の 60 秒前から読み、削除の印の付いた行は画面から消える(差分)", async () => {
    const h = await setup({ rows: [["卵", {}], ["米", {}]] });
    const row = h.server.rows.get("卵") as ShoppingListEntry;
    h.server.rows.set("卵", { ...row, deletedAt: h.server.stamp(), updatedAt: h.server.stamp() });
    await h.store.syncNow();
    expect(h.names()).toEqual(["米"]);
    // cursor(サーバーの最大の更新時刻 2026-11-14T00:00:00.0001xx)の 60 秒前
    expect(h.server.fetchSince[1]).toBe("2026-11-13T23:59:00.000Z");
  });
  it("初回の読み込みの失敗は error。reload で直る", async () => {
    const server = new FakeShoppingServer();
    server.failures.push("network");
    const store = new ShoppingStore("h1", { api: server, local: new MemoryShoppingLocal(), subscribe: () => () => {}, timeoutMs: 1000, isOnline: () => true });
    live.push(store);
    store.start();
    await flush();
    expect(store.getSnapshot().load).toBe("error");
    store.reload();
    await flush();
    expect(store.getSnapshot().load).toBe("ready");
  });
  it("端末に写しがあれば、電波が無くても ready で出す(ローカルから)", async () => {
    const local = new MemoryShoppingLocal();
    await local.commit({ list: [{ ...new FakeShoppingServer().add("卵") }], cursor: "2026-11-14T00:00:00.000100+00:00" });
    const h = await setup({ online: false, local });
    expect(h.store.getSnapshot()).toMatchObject({ load: "ready", connection: "offline", hasLocalCopy: true });
    expect(h.names()).toEqual(["卵"]);
  });
  it("端末に写しが無く電波も無いとき、hasLocalCopy は false(ローカルが空)", async () => {
    const h = await setup({ online: false });
    expect(h.store.getSnapshot()).toMatchObject({ hasLocalCopy: false, entries: [] });
  });
});

describe("書き込みの入口 enqueue(決まり 1〜4)", () => {
  it("チェック: 保存を待たずに画面が変わり、1件送って未同期が 0 に戻る", async () => {
    const h = await setup({ rows: [["卵", {}]] });
    const id = h.store.getSnapshot().entries[0].id;
    h.store.toggle(id);
    expect(h.store.getSnapshot().entries[0].isChecked).toBe(true);
    expect(h.store.getSnapshot().pendingCount).toBe(1);
    await flush();
    expect(h.server.rows.get("卵")?.isChecked).toBe(true);
    expect(h.store.getSnapshot().pendingCount).toBe(0);
  });
  it("オフライン: 画面は変わり、未同期が数えられ、送らない。電波が戻ると送る", async () => {
    const h = await setup({ rows: [["卵", {}]] });
    h.store.setOnline(false);
    h.store.toggle("卵");
    expect(h.store.addManual("豆乳")).toEqual({ ok: true });
    h.store.setMemo("牛乳は低脂肪");
    await flush();
    expect(h.store.getSnapshot()).toMatchObject({ pendingCount: 3, connection: "offline" });
    expect(h.server.calls.filter((c) => c.startsWith("patchEntry") || c.startsWith("insertManual") || c.startsWith("setMemo"))).toEqual([]);
    expect(h.names()).toEqual(["卵", "豆乳"]);
    h.store.setOnline(true);
    await flush();
    await h.store.syncNow();
    expect(h.server.rows.get("卵")?.isChecked).toBe(true);
    expect([...h.server.rows.values()].some((r) => r.name === "豆乳")).toBe(true);
    expect(h.server.memo.body).toBe("牛乳は低脂肪");
    expect(h.store.getSnapshot().pendingCount).toBe(0);
    expect(h.names()).toEqual(["卵", "豆乳"]);
  });
  it("オフラインでチェック → 外す → チェック は1回の送信にまとまる(合流)", async () => {
    const h = await setup({ rows: [["卵", {}]] });
    h.store.setOnline(false);
    h.store.toggle("卵");
    h.store.toggle("卵");
    h.store.toggle("卵");
    expect(h.store.getSnapshot().pendingCount).toBe(1);
    h.store.setOnline(true);
    await flush();
    expect(h.server.calls.filter((c) => c.startsWith("patchEntry"))).toEqual(['patchEntry:卵:{"isChecked":true}']);
  });
  it("送信待ちは古い順に1件ずつ送る(手入力の追加 → そのチェック)", async () => {
    const h = await setup();
    h.store.setOnline(false);
    h.store.addManual("豆乳");
    h.store.toggle("new-1");
    h.store.setOnline(true);
    await flush();
    expect(h.server.calls.filter((c) => /insertManual|patchEntry/.test(c))).toEqual(["insertManual:new-1", 'patchEntry:new-1:{"isChecked":true}']);
    expect(h.server.rows.get("new-1")?.isChecked).toBe(true);
  });
  it("通信の失敗は行列に残して再送する。同じ op を2回送っても結果は同じ(冪等)", async () => {
    const h = await setup({ rows: [["卵", {}]] });
    h.server.failures.push("network");
    h.store.toggle("卵");
    await flush();
    expect(h.store.getSnapshot().pendingCount).toBe(1);
    expect(h.notices).toEqual([]);
    await h.store.syncNow();
    expect(h.server.rows.get("卵")?.isChecked).toBe(true);
    expect(h.store.getSnapshot().pendingCount).toBe(0);
    h.store.setOnline(false);
    h.store.setOnline(true);
    await flush();
    expect(h.names()).toEqual(["卵"]);
  });
  it("拒まれた送信(conflict)は捨てて save_failed で知らせ、サーバーの値にそろえる(行列は詰まらない)", async () => {
    const h = await setup({ rows: [["卵", {}], ["米", {}]] });
    h.store.setOnline(false);
    h.store.toggle("卵");
    h.store.toggle("米");
    h.server.failures.push("conflict");
    h.store.setOnline(true);
    await flush();
    expect(h.notices).toEqual([{ kind: "save_failed", itemName: "卵" }]);
    expect(h.store.getSnapshot().entries.find((e) => e.name === "卵")?.isChecked).toBe(false);
    expect(h.server.rows.get("米")?.isChecked).toBe(true);
    expect(h.store.getSnapshot().pendingCount).toBe(0);
  });
  it("外す: 手入力の行は削除の印、自動の行は外した印。元に戻すと並びごと戻る", async () => {
    const h = await setup({ rows: [["卵", { source: "low", itemId: "i1" }], ["豆", {}], ["米", {}]] });
    const auto = h.store.dismiss(h.store.getSnapshot().entries[0].id);
    expect(auto?.label).toBe("卵を外しました");
    expect(h.names()).toEqual(["豆", "米"]);
    auto?.undo();
    expect(h.names()).toEqual(["卵", "豆", "米"]);
    await flush();
    const manual = h.store.dismiss("豆");
    await flush();
    expect(h.server.rows.get("豆")?.deletedAt).not.toBeNull();
    expect(h.names()).toEqual(["卵", "米"]);
    manual?.undo();
    await flush();
    expect(h.names()).toEqual(["卵", "豆", "米"]);
  });
  it("手入力の追加: 前後の空白を除く・空は何もしない・画面に出ている行と同じ名前は足さない(45 の決定 4 A)", async () => {
    const h = await setup({ rows: [["卵", {}]] });
    expect(h.store.addManual("  ")).toMatchObject({ ok: false, reason: "empty" });
    expect(h.store.addManual(" 卵 ")).toEqual({ ok: false, reason: "duplicate", name: "卵" });
    expect(h.store.addManual(" 豆乳 ")).toEqual({ ok: true });
    await flush();
    expect(h.names()).toEqual(["卵", "豆乳"]);
    expect(h.server.rows.get("new-1")?.name).toBe("豆乳");
  });
});

describe("メモ(決まり 7)", () => {
  it("打った本文はすぐ画面に出て、同期で全文を1つの値として送る", async () => {
    const h = await setup();
    h.store.setMemo("あ");
    h.store.setMemo("あい");
    expect(h.store.getSnapshot().memo?.body).toBe("あい");
    await h.store.syncNow();
    expect(h.server.memo.body).toBe("あい");
    expect(h.server.calls.filter((c) => c.startsWith("setMemo"))).toEqual(["setMemo:あい"]);
  });
  it("送っていない変更がある間は、相手のメモの変更を画面に出さない(送ったあとは後勝ち)", async () => {
    const h = await setup();
    h.store.setOnline(false);
    h.store.setMemo("自分の文");
    h.send({ table: "shopping_memo", row: { householdId: "h1", body: "相手の文", updatedAt: "2026-11-14T01:00:00.000000+00:00" } });
    expect(h.store.getSnapshot().memo?.body).toBe("自分の文");
    h.store.setOnline(true);
    await flush();
    expect(h.server.memo.body).toBe("自分の文");
    expect(h.store.getSnapshot().memo?.body).toBe("自分の文");
  });
  it("相手のメモの変更は、送っていない変更が無ければ出る", async () => {
    const h = await setup();
    h.send({ table: "shopping_memo", row: { householdId: "h1", body: "相手の文", updatedAt: "2026-11-14T01:00:00.000000+00:00" } });
    expect(h.store.getSnapshot().memo?.body).toBe("相手の文");
  });
  it("10000 字までに切る(L-24)", async () => {
    const h = await setup();
    h.store.setMemo("あ".repeat(10_050));
    expect(h.store.getSnapshot().memo?.body.length).toBe(10_000);
  });
});

describe("Realtime と読み直し", () => {
  it("相手の行の知らせは画面に出る。古い知らせでは巻き戻らない", async () => {
    const h = await setup({ rows: [["卵", {}]] });
    const cur = h.server.rows.get("卵") as ShoppingListEntry;
    h.send({ table: "shopping_list", row: { ...cur, isChecked: true, updatedAt: "2026-11-14T02:00:00.000000+00:00" } });
    expect(h.store.getSnapshot().entries[0].isChecked).toBe(true);
    h.send({ table: "shopping_list", row: { ...cur, isChecked: false, updatedAt: "2026-11-14T01:00:00.000000+00:00" } });
    expect(h.store.getSnapshot().entries[0].isChecked).toBe(true);
  });
  it("切断のあとの subscribed で、送る → 取り込む", async () => {
    const h = await setup({ rows: [["卵", {}]] });
    h.status("reconnecting");
    expect(h.store.getSnapshot().connection).toBe("reconnecting");
    h.server.add("豆");
    h.status("subscribed");
    await flush();
    expect(h.store.getSnapshot().connection).toBe("online");
    expect(h.names()).toEqual(["卵", "豆"]);
  });
});

describe("在庫登録 checkIn(決まり 10)", () => {
  const input = (name: string) => ({ name }) as never;
  it("行列を送り切ってから、カードごとに register → その行を消す。最後に残量の行と外した行を消す", async () => {
    const h = await setup({ rows: [["a", {}], ["b", {}], ["c", { isDismissed: true }], ["lv", {}]] });
    h.store.toggle("a");
    const order: string[] = [];
    const result = await h.store.checkIn({
      submissions: [{ entryId: "a", input: input("a") }, { entryId: "b", input: input("b") }],
      levelEntryIds: ["lv"],
      register: async (i) => {
        order.push(`register:${(i as { name: string }).name}:rows=${[...h.server.rows.values()].filter((r) => r.deletedAt !== null).length}`);
        return { ok: true };
      },
    });
    expect(result).toEqual({ ok: true });
    expect(h.server.rows.get("a")?.isChecked).toBe(true); // 行列が先に送られた
    expect(order).toEqual(["register:a:rows=0", "register:b:rows=1"]);
    expect(h.server.calls.filter((c) => c.startsWith("finishCheckIn"))).toEqual(["finishCheckIn:a:false", "finishCheckIn:b:false", "finishCheckIn:lv:true"]);
    expect(h.names()).toEqual([]);
  });
  it("途中で失敗したら止める。済んだカードの行は消えていて、残りは残る。もう一度確定すると残りだけ", async () => {
    const h = await setup({ rows: [["a", {}], ["b", {}], ["c", {}]] });
    const run = (fail: string | null) =>
      h.store.checkIn({
        submissions: ["a", "b", "c"].filter((id) => h.store.getSnapshot().entries.some((e) => e.id === id)).map((id) => ({ entryId: id, input: input(id) })),
        levelEntryIds: [],
        register: async (i) => ((i as { name: string }).name === fail ? { ok: false, reason: "network", input: i } : { ok: true }),
      });
    expect(await run("b")).toEqual({ ok: false, reason: "network", failedEntryId: "b", done: 1 });
    expect(h.names()).toEqual(["b", "c"]);
    expect(await run(null)).toEqual({ ok: true });
    expect(h.names()).toEqual([]);
    expect(h.server.calls.filter((c) => c === "finishCheckIn:a:false")).toHaveLength(1);
  });
  it("オフラインでは何もしない。行列を送り切れなければ止まる", async () => {
    const h = await setup({ rows: [["a", {}]] });
    h.store.setOnline(false);
    expect(await h.store.checkIn({ submissions: [], levelEntryIds: [], register: async () => ({ ok: true }) })).toEqual({ ok: false, reason: "offline", failedEntryId: null, done: 0 });
    h.store.setOnline(true);
    h.store.toggle("a");
    h.server.failures.push("network", "network", "network");
    expect(await h.store.checkIn({ submissions: [], levelEntryIds: [], register: async () => ({ ok: true }) })).toMatchObject({ ok: false, reason: "network" });
  });
});

describe("品物の削除の控え(ShoppingHooks)", () => {
  it("自動の行と同じ名前の手入力の行(生きているもの)を控え、元に戻すと印を外して item_id を戻す", async () => {
    const h = await setup({ rows: [["x", { itemId: "i1", source: "regular", name: "牛乳" }], ["y", { name: "牛乳" }], ["z", { name: "卵" }]] });
    const linked = h.store.linkedEntries("i1", "牛乳");
    expect(linked.map((e) => e.id).sort()).toEqual(["x", "y"]);
    expect(await h.store.restoreEntries(linked)).toBe(true);
    expect(h.server.calls).toContain("restoreEntries:x,y");
  });
  it("オフラインでは戻せない", async () => {
    const h = await setup({ online: false });
    expect(await h.store.restoreEntries([])).toBe(false);
  });
});
