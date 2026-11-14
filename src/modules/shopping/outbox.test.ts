import { describe, expect, it } from "vitest";
import { applyOps, coalesce, pendingCount } from "./outbox";
import type { OutboxOp, ShoppingListEntry } from "./types";

const H = "h1";
const row = (id: string, over: Partial<ShoppingListEntry> = {}): ShoppingListEntry => ({
  id, householdId: H, createdAt: "2026-11-14T00:00:00Z", updatedAt: "2026-11-14T00:00:00Z", itemId: null, name: id, source: "manual",
  isChecked: false, isDismissed: false, prevStockLevel: null, deletedAt: null, ...over,
});
const patch = (seq: number, id: string, p: OutboxOp extends infer T ? (T extends { patch: infer P } ? P : never) : never, at = "t"): OutboxOp => ({ seq, kind: "patch_entry", id, patch: p, at });

describe("applyOps(画面の値 = 写し + 行列)", () => {
  it("写しに行列を順に当てる: チェック・外した印・削除の印", () => {
    const { list } = applyOps([row("a"), row("b"), row("c")], null, [patch(1, "a", { isChecked: true }), patch(2, "b", { isDismissed: true }), patch(3, "c", { deleted: true }, "T")], H);
    expect(list.find((e) => e.id === "a")?.isChecked).toBe(true);
    expect(list.find((e) => e.id === "b")?.isDismissed).toBe(true);
    expect(list.find((e) => e.id === "c")?.deletedAt).toBe("T");
  });
  it("deleted: false は削除の印を外す", () => {
    const { list } = applyOps([row("a", { deletedAt: "T" })], null, [patch(1, "a", { deleted: false })], H);
    expect(list[0].deletedAt).toBeNull();
  });
  it("insert_manual は写しに無ければ行を足す(あれば足さない = 冪等)", () => {
    const op: OutboxOp = { seq: 1, kind: "insert_manual", id: "n1", name: "豆乳", at: "2026-11-14T01:00:00Z" };
    const once = applyOps([], null, [op], H).list;
    expect(once).toEqual([expect.objectContaining({ id: "n1", name: "豆乳", source: "manual", itemId: null, createdAt: "2026-11-14T01:00:00Z", householdId: H })]);
    const twice = applyOps(once, null, [op, op], H).list;
    expect(twice).toHaveLength(1);
  });
  it("set_memo は本文を上書きし、写しが無くても作れる。更新時刻は写しのまま", () => {
    const m = applyOps([], { householdId: H, body: "古い", updatedAt: "U" }, [{ seq: 1, kind: "set_memo", body: "新しい", at: "t" }], H).memo;
    expect(m).toEqual({ householdId: H, body: "新しい", updatedAt: "U" });
    expect(applyOps([], null, [{ seq: 1, kind: "set_memo", body: "x", at: "t" }], H).memo?.body).toBe("x");
  });
  it("無い行への patch は無視する", () => {
    expect(applyOps([], null, [patch(1, "zzz", { isChecked: true })], H).list).toEqual([]);
  });
});

describe("coalesce(合流)", () => {
  it("同じ行の送っていない patch_entry は1つにまとめ(後の値が勝つ)、位置と seq は変わらない", () => {
    const ops = [patch(1, "a", { isChecked: true }), patch(2, "b", { isChecked: true })];
    const plan = coalesce(ops, { kind: "patch_entry", id: "a", patch: { isChecked: false, isDismissed: true }, at: "t2" }, null);
    expect(plan.add).toBeNull();
    expect(plan.put).toEqual([{ seq: 1, kind: "patch_entry", id: "a", patch: { isChecked: false, isDismissed: true }, at: "t2" }]);
  });
  it("送信中の op には触れず、新しい op として足す", () => {
    const ops = [patch(1, "a", { isChecked: true })];
    const plan = coalesce(ops, { kind: "patch_entry", id: "a", patch: { isChecked: false }, at: "t2" }, 1);
    expect(plan.put).toEqual([]);
    expect(plan.add).toMatchObject({ kind: "patch_entry", id: "a" });
  });
  it("insert_manual のあとの patch_entry はまとめない(insert を先に送る)", () => {
    const ops: OutboxOp[] = [{ seq: 1, kind: "insert_manual", id: "n", name: "x", at: "t" }];
    const plan = coalesce(ops, { kind: "patch_entry", id: "n", patch: { isChecked: true }, at: "t" }, null);
    expect(plan.add).toMatchObject({ kind: "patch_entry" });
    expect(plan.put).toEqual([]);
  });
  it("set_memo は送っていないものを消して最後の1つだけ残す(送信中は残す)", () => {
    const ops: OutboxOp[] = [
      { seq: 1, kind: "set_memo", body: "a", at: "t" },
      { seq: 2, kind: "set_memo", body: "ab", at: "t" },
    ];
    const plan = coalesce(ops, { kind: "set_memo", body: "abc", at: "t" }, 1);
    expect(plan.remove).toEqual([2]);
    expect(plan.add).toMatchObject({ body: "abc" });
  });
});

describe("pendingCount(L-20: 宛先の数)", () => {
  it("同じ行への変更は1件、メモは1件", () => {
    expect(pendingCount([patch(1, "a", { isChecked: true }), patch(2, "a", { isDismissed: true }), patch(3, "b", {}), { seq: 4, kind: "set_memo", body: "", at: "t" }])).toBe(3);
    expect(pendingCount([])).toBe(0);
  });
});
