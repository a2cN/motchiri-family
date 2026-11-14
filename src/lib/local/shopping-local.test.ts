import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxOp, ShoppingListEntry } from "@/modules/shopping/types";
import { createDb } from "./db";
import { DexieShoppingLocal } from "./shopping-local";
import { forgetMembership, parseMembership, readMembership, rememberMembership } from "./membership";

const H = "h1";
const entry = (id: string, name = id): ShoppingListEntry => ({
  id, householdId: H, createdAt: "2026-01-01T00:00:00.000000+00:00", updatedAt: "2026-01-01T00:00:00.000000+00:00",
  itemId: null, name, source: "manual", isChecked: false, isDismissed: false, prevStockLevel: null, deletedAt: null,
});
const op = (seq: number): OutboxOp => ({ seq, kind: "patch_entry", id: "a", patch: { isChecked: true }, at: "2026-01-01T00:00:00.000Z" });

let n = 0;
const fresh = () => createDb(`test-${++n}`);
// Node には localStorage が無い(単体テストの環境)。同じ口を持つ小さな偽物
beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("DexieShoppingLocal(30 Interfaces §7)", () => {
  it("書いたものを読み出せる(再読み込み = 別のインスタンスでも残る)", async () => {
    const db = fresh();
    const a = new DexieShoppingLocal({ householdId: H, userId: "u1" }, db);
    await a.commit({ list: [entry("a"), entry("b")], memo: { householdId: H, body: "メモ", updatedAt: "t" }, cursor: "c1", candidates: [{ id: "i", name: "牛乳", itemKind: "food" }], outboxAdd: [op(1), op(2)] });
    const b = new DexieShoppingLocal({ householdId: H, userId: "u1" }, db);
    const got = await b.load();
    expect(got.list.map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(got.memo?.body).toBe("メモ");
    expect(got.cursor).toBe("c1");
    expect(got.candidates).toHaveLength(1);
    expect(got.outbox.map((o) => o.seq)).toEqual([1, 2]);
  });

  it("outboxRemove・outboxPut が効く", async () => {
    const db = fresh();
    const a = new DexieShoppingLocal({ householdId: H, userId: "u1" }, db);
    await a.commit({ outboxAdd: [op(1), op(2)] });
    await a.commit({ outboxRemove: [1], outboxPut: [{ ...op(2), patch: { isChecked: false } } as OutboxOp] });
    const got = await a.load();
    expect(got.outbox).toHaveLength(1);
    expect(got.outbox[0]).toMatchObject({ seq: 2, patch: { isChecked: false } });
  });

  it("別の利用者・別の世帯の写しは使う前に消える(L-19)", async () => {
    const db = fresh();
    await new DexieShoppingLocal({ householdId: H, userId: "u1" }, db).commit({ list: [entry("a")], cursor: "c", outboxAdd: [op(1)] });
    const other = await new DexieShoppingLocal({ householdId: H, userId: "u2" }, db).load();
    expect(other.list).toEqual([]);
    expect(other.outbox).toEqual([]);
    expect(other.cursor).toBeNull();
    await new DexieShoppingLocal({ householdId: H, userId: "u2" }, db).commit({ list: [entry("z")] });
    const otherHousehold = await new DexieShoppingLocal({ householdId: "h2", userId: "u2" }, db).load();
    expect(otherHousehold.list).toEqual([]);
  });

  it("同じ利用者・同じ世帯なら残る(期限切れのあと同じ人で入り直した場合)", async () => {
    const db = fresh();
    await new DexieShoppingLocal({ householdId: H, userId: "u1" }, db).commit({ list: [entry("a")], outboxAdd: [op(1)] });
    const again = await new DexieShoppingLocal({ householdId: H, userId: "u1" }, db).load();
    expect(again.list).toHaveLength(1);
    expect(again.outbox).toHaveLength(1);
  });

  it("clear() でぜんぶ消え、そのあとも書ける(ログアウト。L-19)", async () => {
    const db = fresh();
    const a = new DexieShoppingLocal({ householdId: H, userId: "u1" }, db);
    await a.commit({ list: [entry("a")], cursor: "c", outboxAdd: [op(1)] });
    await a.clear();
    const got = await a.load();
    expect(got).toMatchObject({ list: [], outbox: [], cursor: null, memo: null, candidates: [] });
    await a.commit({ list: [entry("b")] });
    expect((await a.load()).list).toHaveLength(1);
  });
});

describe("membership(30 Interfaces §10)", () => {
  it("覚える・読む・忘れる。メールや名前は入らない", () => {
    expect(readMembership()).toBeNull();
    rememberMembership({ userId: "u1", householdId: "h1" }, new Date("2026-11-14T00:00:00Z"));
    expect(readMembership()).toEqual({ userId: "u1", householdId: "h1", verifiedAt: "2026-11-14T00:00:00.000Z" });
    expect(Object.keys(JSON.parse(localStorage.getItem("motchiri.membership") ?? "{}")).sort()).toEqual(["householdId", "userId", "verifiedAt"]);
    forgetMembership();
    expect(readMembership()).toBeNull();
  });
  it("壊れた値は無かったことにする", () => {
    for (const raw of ["", "{", "null", "[]", '{"userId":1}', '{"userId":"","householdId":"h","verifiedAt":"t"}']) expect(parseMembership(raw)).toBeNull();
  });
});
