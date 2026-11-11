import { describe, expect, it } from "vitest";
import { data, item, stock } from "./fixtures";
import { checkMasterName, isMasterInUse, nextSortOrder, softReferences, sortMasters } from "./masters";

describe("isMasterInUse(固い参照だけ。承認済みモックの usedBy と同じ)", () => {
  it("ジャンル: 食材の品物が使っていれば使用中(在庫の有無によらない)", () => {
    const d = data([item("milk", "牛乳")]);
    expect(isMasterInUse("genre", "g-dairy", d)).toBe(true);
    expect(isMasterInUse("genre", "g-meat", d)).toBe(false);
  });
  it("場所: 在庫の場所と残量で管理の品物の場所は使用中。ジャンルの既定・数で管理の前回の場所は使用中でない", () => {
    const d = data(
      [item("milk", "牛乳", { locationId: "loc-freezer" }), item("mayo", "マヨ", { tracking: "level", unitId: null, stockLevel: "full", locationId: "loc-shelf" })],
      [stock("s1", "milk", 1, { locationId: "loc-veg" })],
    );
    expect(isMasterInUse("location", "loc-veg", d)).toBe(true);
    expect(isMasterInUse("location", "loc-shelf", d)).toBe(true);
    expect(isMasterInUse("location", "loc-freezer", d)).toBe(false); // 数で管理の前回の場所だけ
    expect(isMasterInUse("location", "loc-fridge", d)).toBe(false); // ジャンルの既定だけ
  });
  it("単位: 数で管理の品物が使っていれば使用中。残量で管理に残した単位は使用中でない", () => {
    const d = data([item("milk", "牛乳", { unitId: "u-pack" }), item("mayo", "マヨ", { tracking: "level", unitId: "u-g", stockLevel: "full" })]);
    expect(isMasterInUse("unit", "u-pack", d)).toBe(true);
    expect(isMasterInUse("unit", "u-g", d)).toBe(false);
  });
});

describe("softReferences(消すと trigger が空にする行)", () => {
  it("場所: 既定にしているジャンルと、数で管理の品物の前回の場所", () => {
    const d = data([item("milk", "牛乳", { locationId: "loc-fridge" }), item("mayo", "マヨ", { tracking: "level", unitId: null, stockLevel: "full", locationId: "loc-fridge" })]);
    const refs = softReferences("location", "loc-fridge", d);
    expect(refs.filter((r) => r.table === "genre").map((r) => r.id).sort()).toEqual(["g-dairy", "g-meat", "g-veg"]);
    expect(refs.filter((r) => r.table === "item")).toEqual([{ table: "item", id: "milk", column: "location_id" }]);
  });
  it("単位: 残量で管理の品物に残した単位", () => {
    const d = data([item("mayo", "マヨ", { tracking: "level", unitId: "u-g", stockLevel: "full" })]);
    expect(softReferences("unit", "u-g", d)).toEqual([{ table: "item", id: "mayo", column: "unit_id" }]);
  });
  it("ジャンルは無い", () => {
    expect(softReferences("genre", "g-veg", data([item("a", "あ", { genreId: "g-veg" })]))).toEqual([]);
  });
});

describe("名前・並び", () => {
  it("前後の空白を除いて完全一致で比べる。空は empty、自分自身は除く", () => {
    const d = data();
    expect(checkMasterName("genre", "  野菜・果物 ", d)).toEqual({ ok: false, error: "taken" });
    expect(checkMasterName("genre", "野菜・果物", d, "g-veg")).toEqual({ ok: true, name: "野菜・果物" });
    expect(checkMasterName("genre", "   ", d)).toEqual({ ok: false, error: "empty" });
    expect(checkMasterName("location", " 乾物棚 ", d)).toEqual({ ok: true, name: "乾物棚" });
    expect(checkMasterName("unit", "個 ", d)).toEqual({ ok: false, error: "taken" });
  });
  it("次の並び = 最大 + 1(無ければ 1)", () => {
    expect(nextSortOrder([])).toBe(1);
    expect(nextSortOrder([{ sortOrder: 3 }, { sortOrder: 9 }, { sortOrder: 4 }])).toBe(10);
  });
  it("sort_order → 作った順 → id", () => {
    const rows = [
      { sortOrder: 2, createdAt: "b", id: "z" },
      { sortOrder: 1, createdAt: "c", id: "y" },
      { sortOrder: 2, createdAt: "a", id: "x" },
      { sortOrder: 2, createdAt: "a", id: "w" },
    ];
    expect(sortMasters(rows).map((r) => r.id)).toEqual(["y", "w", "x", "z"]);
  });
});
