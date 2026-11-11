import { describe, expect, it } from "vitest";
import { data, item, stock } from "./fixtures";
import { checkItemName, groupItemsByGenre, planTrackingChange, regularRows, totalQuantity, trackingDefaults } from "./items";

describe("品物名", () => {
  it("種別をまたいで世帯で1つ。前後の空白を除く", () => {
    const d = data([item("a", "牛乳"), item("b", "洗剤", { itemKind: "supply" })]);
    expect(checkItemName(" 洗剤 ", d)).toEqual({ ok: false, error: "taken" });
    expect(checkItemName("牛乳", d, "a")).toEqual({ ok: true, name: "牛乳" });
    expect(checkItemName("", d)).toEqual({ ok: false, error: "empty" });
  });
});

describe("groupItemsByGenre", () => {
  it("食材だけ。ジャンルは sort_order、カードの中は作った順、空のカードは出さない", () => {
    const d = data([
      item("a", "あ", { genreId: "g-dairy" }, 2),
      item("b", "い", { genreId: "g-dairy" }, 1),
      item("c", "う", { genreId: "g-veg" }, 3),
      item("d", "洗剤", { itemKind: "supply", genreId: null }, 4),
    ]);
    const groups = groupItemsByGenre(d);
    expect(groups.map((g) => g.label)).toEqual(["野菜・果物", "卵・乳製品"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("regularRows / totalQuantity", () => {
  it("いつもの = 食材のいつもの、作った順。数は場所を問わない合計(0 もある、小数第一位)、残量は残量", () => {
    const d = data(
      [
        item("milk", "牛乳", { isRegular: true }, 2),
        item("rice", "米", { isRegular: true }, 1),
        item("mayo", "マヨ", { isRegular: true, tracking: "level", unitId: null, stockLevel: "low" }, 3),
        item("x", "ほか", {}, 4),
      ],
      [stock("s1", "milk", 0.1), stock("s2", "milk", 0.2, { locationId: "loc-shelf" })],
    );
    expect(totalQuantity("milk", d)).toBe(0.3);
    const rows = regularRows(d);
    expect(rows.map((r) => r.item.id)).toEqual(["rice", "milk", "mayo"]);
    expect(rows[0]).toMatchObject({ kind: "count", total: 0 });
    expect(rows[1]).toMatchObject({ kind: "count", total: 0.3 });
    expect(rows[2]).toMatchObject({ kind: "level", level: "low" });
  });
});

describe("trackingDefaults(パネルの初期値)", () => {
  it("数 → 残量: 合計 0 なら ×、目安以下なら △、ほか ○", () => {
    const milk = item("milk", "牛乳", { restockAtCount: 2 });
    expect(trackingDefaults(milk, data([milk])).level).toBe("out");
    expect(trackingDefaults(milk, data([milk], [stock("s1", "milk", 2)])).level).toBe("low");
    expect(trackingDefaults(milk, data([milk], [stock("s1", "milk", 3)])).level).toBe("full");
    const plain = item("p", "ぱ");
    expect(trackingDefaults(plain, data([plain], [stock("s2", "p", 1)])).level).toBe("full");
  });
  it("残量 → 数: 単位は品物に残っているもの(無ければ null)、個数は × なら 0、ほか 1", () => {
    const a = item("a", "あ", { tracking: "level", unitId: "u-g", stockLevel: "out" });
    const b = item("b", "い", { tracking: "level", unitId: null, stockLevel: "full" });
    expect(trackingDefaults(a, data([a]))).toMatchObject({ unitId: "u-g", quantityText: "0" });
    expect(trackingDefaults(b, data([b]))).toMatchObject({ unitId: null, quantityText: "1" });
  });
});

describe("planTrackingChange", () => {
  const ids = { stockId: "new-s", householdId: "h1" };
  it("数 → 残量: 残量・補充の目安の既定値・場所は最も新しい在庫の場所、在庫は全部消える、単位は残す", () => {
    const milk = item("milk", "牛乳", { restockAtCount: 2, locationId: "loc-fridge" });
    const d = data([milk], [stock("old", "milk", 1, { locationId: "loc-shelf" }, 1), stock("new", "milk", 1, { locationId: "loc-freezer" }, 5)]);
    const plan = planTrackingChange(milk, { to: "level", level: "low" }, d, ids, "2026-10-23");
    expect(plan.itemPatch).toEqual({ tracking: "level", stockLevel: "low", restockAtCount: null, restockAtLevel: "low", locationId: "loc-freezer" });
    expect(plan.itemPatch).not.toHaveProperty("unitId");
    expect(plan.removedStocks.map((s) => s.id).sort()).toEqual(["new", "old"]);
    expect(plan.newStock).toBeNull();
  });
  it("数 → 残量: 在庫が無ければ場所は品物のまま", () => {
    const milk = item("milk", "牛乳", { locationId: "loc-veg" });
    expect(planTrackingChange(milk, { to: "level", level: "out" }, data([milk]), ids, "2026-10-23").itemPatch.locationId).toBe("loc-veg");
  });
  it("残量 → 数: 補充の目安はなし、在庫は個数が 0 より大きいときだけ作る(品物の場所・今日・期限なし)", () => {
    const mayo = item("mayo", "マヨ", { tracking: "level", unitId: null, stockLevel: "full", restockAtLevel: "low", locationId: "loc-shelf" });
    const plan = planTrackingChange(mayo, { to: "count", unitId: "u-ko", quantity: 2 }, data([mayo]), ids, "2026-10-23");
    expect(plan.itemPatch).toEqual({ tracking: "count", stockLevel: null, unitId: "u-ko", restockAtLevel: null, restockAtCount: null });
    expect(plan.newStock).toEqual({ id: "new-s", householdId: "h1", itemId: "mayo", quantity: 2, locationId: "loc-shelf", purchasedOn: "2026-10-23", expiresOn: null });
    expect(planTrackingChange(mayo, { to: "count", unitId: "u-ko", quantity: 0 }, data([mayo]), ids, "2026-10-23").newStock).toBeNull();
  });
});
