import { describe, expect, it } from "vitest";
import { candidatesFor, hasVisibleName, listView } from "./list-view";
import type { ShoppingListEntry } from "./types";

const row = (id: string, createdAt: string, over: Partial<ShoppingListEntry> = {}): ShoppingListEntry => ({
  id, householdId: "h", createdAt, updatedAt: createdAt, itemId: null, name: id, source: "manual",
  isChecked: false, isDismissed: false, prevStockLevel: null, deletedAt: null, ...over,
});

describe("listView", () => {
  it("削除の印・外した印を除き、作った順(同じ時刻は id 順)。チェックしても動かない", () => {
    const v = listView([row("c", "3"), row("a", "1", { isChecked: true }), row("x", "2", { isDismissed: true }), row("y", "2", { deletedAt: "T" }), row("b", "1")]);
    expect(v.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
});
describe("candidatesFor / hasVisibleName", () => {
  const items = [
    { id: "1", name: "牛乳", itemKind: "food" as const },
    { id: "2", name: "ミルク", itemKind: "supply" as const },
    { id: "3", name: "ＡＢＣ", itemKind: "food" as const },
  ];
  it("名前の部分一致(全角半角をそろえる)。空は出さない。多くて4件", () => {
    expect(candidatesFor("牛", items).map((i) => i.id)).toEqual(["1"]);
    expect(candidatesFor("abc", items).map((i) => i.id)).toEqual(["3"]);
    expect(candidatesFor("  ", items)).toEqual([]);
    expect(candidatesFor("あ", items)).toEqual([]);
  });
  it("重複は、画面に出ている行の名前だけで見る", () => {
    const entries = [row("卵", "1"), row("豆", "2", { deletedAt: "T" }), row("米", "3", { isDismissed: true })];
    expect(hasVisibleName(entries, "卵")).toBe(true);
    expect(hasVisibleName(entries, "豆")).toBe(false);
    expect(hasVisibleName(entries, "米")).toBe(false);
  });
});
