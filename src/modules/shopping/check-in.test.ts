import { describe, expect, it } from "vitest";
import { data, item, stock } from "@/modules/stock/fixtures";
import { checkInTotal, initialEdits, planCheckIn, toRegistrationInput } from "./check-in";
import type { ShoppingListEntry } from "./types";

const entry = (id: string, name: string, over: Partial<ShoppingListEntry> = {}): ShoppingListEntry => ({
  id, householdId: "h1", createdAt: `2026-11-14T00:00:0${id.length}Z`, updatedAt: "t", itemId: null, name, source: "manual",
  isChecked: true, isDismissed: false, prevStockLevel: null, deletedAt: null, ...over,
});
const milk = item("milk", "牛乳", { lastExpiryDays: 10 });
const mayo = item("mayo", "マヨ", { tracking: "level", unitId: null, stockLevel: "full", genreId: "g-season" });
const wrap = item("wrap", "ラップ", { itemKind: "supply", genreId: null, locationId: null, supplyGenre: "キッチン", restockAtCount: 1 });
const d = data([milk, mayo, wrap], [stock("s1", "milk", 1)]);
const TODAY = "2026-10-23";

describe("planCheckIn(カード分け)", () => {
  it("チェックした行だけ。数の既存 = count、残量の既存 = levelEntries、無い名前 = new。手入力の行も名前で品物に当てる(L-06)", () => {
    const plan = planCheckIn(
      [entry("a", "牛乳", { itemId: "milk", source: "low" }), entry("b", "マヨ"), entry("c", "バナナ"), entry("d", "ラップ"), entry("e", "未チェック", { isChecked: false }), entry("f", "外した", { isDismissed: true })],
      d,
    );
    expect(plan.cards.map((c) => [c.entry.id, c.kind])).toEqual([["a", "count"], ["c", "new"], ["d", "count"]]);
    expect(plan.levelEntries.map((e) => e.id)).toEqual(["b"]);
    expect(checkInTotal(plan)).toBe(4);
  });
  it("品物が削除されて itemId だけ残った行は、同じ名前の品物が無ければ新しい品物", () => {
    const plan = planCheckIn([entry("a", "牛乳2", { itemId: "gone" })], d);
    expect(plan.cards[0].kind).toBe("new");
  });
});

describe("toRegistrationInput", () => {
  it("既存の数の食材: 品物の値 + カードの個数・期限(購入日 + 前回の日数)・場所。購入日は今日。目安は品物のまま", () => {
    const plan = planCheckIn([entry("a", "牛乳", { itemId: "milk" })], d);
    const edits = initialEdits(plan.cards[0], d, TODAY);
    expect(edits).toMatchObject({ qty: "1", expiresOn: "2026-11-02", locationId: "loc-fridge" });
    expect(toRegistrationInput(plan.cards[0], { ...edits, qty: "3" }, d, TODAY)).toMatchObject({
      kind: "food", name: "牛乳", tracking: "count", genreId: "g-dairy", unitId: "u-pack", quantity: 3, purchasedOn: TODAY, expiresOn: "2026-11-02",
      restockAtCount: null, restockAtLevel: null,
    });
  });
  it("既存の数の日用品: 期限・場所は無い。目安は品物のまま(今の数に足すのは planRegistration)", () => {
    const plan = planCheckIn([entry("d", "ラップ")], d);
    const edits = initialEdits(plan.cards[0], d, TODAY);
    expect(toRegistrationInput(plan.cards[0], edits, d, TODAY)).toMatchObject({ kind: "supply", locationId: null, expiresOn: null, restockAtCount: 1, supplyGenre: "キッチン" });
  });
  it("新しい品物: ジャンル → 単位 → 個数の誤りを返し、目安は既定値(数: なし)", () => {
    const plan = planCheckIn([entry("c", "バナナ")], d);
    const edits = initialEdits(plan.cards[0], d, TODAY);
    expect(toRegistrationInput(plan.cards[0], edits, d, TODAY)).toEqual({ errors: { genre: true, unit: true } });
    expect(toRegistrationInput(plan.cards[0], { ...edits, genreId: "g-veg", unitId: "u-ko", qty: "0" }, d, TODAY)).toEqual({ errors: { qty: "not_positive" } });
    expect(toRegistrationInput(plan.cards[0], { ...edits, genreId: "g-veg", unitId: "u-ko", qty: "3", expiresOn: "2026-10-30", locationId: "loc-veg" }, d, TODAY)).toMatchObject({
      kind: "food", tracking: "count", genreId: "g-veg", unitId: "u-ko", quantity: 3, expiresOn: "2026-10-30", locationId: "loc-veg", restockAtCount: null, restockAtLevel: null,
    });
  });
  it("新しい残量の品物は個数が要らず、目安は △で(OD-stock-uiux-18 A)", () => {
    const plan = planCheckIn([entry("c", "バナナ")], d);
    const edits = { ...initialEdits(plan.cards[0], d, TODAY), tracking: "level" as const, genreId: "g-veg", stockLevel: "low" as const };
    expect(toRegistrationInput(plan.cards[0], edits, d, TODAY)).toMatchObject({ tracking: "level", quantity: null, unitId: null, stockLevel: "low", restockAtLevel: "low", restockAtCount: null });
  });
  it("新しい日用品: ジャンルは自由入力(空は null)", () => {
    const plan = planCheckIn([entry("c", "ゴミ袋")], d);
    const edits = { ...initialEdits(plan.cards[0], d, TODAY), kind: "supply" as const, unitId: "u-ko", supplyGenre: " ごみ " };
    expect(toRegistrationInput(plan.cards[0], edits, d, TODAY)).toMatchObject({ kind: "supply", genreId: null, supplyGenre: "ごみ", locationId: null, expiresOn: null });
  });
});
