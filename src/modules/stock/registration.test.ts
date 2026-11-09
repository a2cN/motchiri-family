import { describe, expect, it } from "vitest";
import { data, item, stock } from "./fixtures";
import { defaultLocationForGenre, planRegistration, prefillFromItem, validateRegistration, type RegistrationInput } from "./registration";

const ids = { householdId: "h1", itemId: "new-item", stockId: "new-stock" };
const milk = item("milk", "牛乳", { genreId: "g-dairy", unitId: "u-pack", locationId: "loc-shelf", lastExpiryDays: 7 });
const input = (over: Partial<RegistrationInput> = {}): RegistrationInput => ({
  name: "牛乳",
  tracking: "count",
  genreId: "g-dairy",
  unitId: "u-pack",
  quantity: 2,
  stockLevel: "full",
  locationId: "loc-fridge",
  purchasedOn: "2026-10-20",
  expiresOn: "2026-10-30",
  ...over,
});

describe("prefillFromItem / defaultLocationForGenre", () => {
  it("品物の値と、購入日 + 前回の日数の期限、品物の場所を入れる", () => {
    const p = prefillFromItem(milk, data([milk]), "2026-10-23");
    expect(p).toMatchObject({ tracking: "count", genreId: "g-dairy", unitId: "u-pack", locationId: "loc-shelf", expiresOn: "2026-10-30" });
  });
  it("前回が無ければ期限は空、品物の場所が無ければジャンルの既定の場所", () => {
    const bare = item("b", "豚", { genreId: "g-meat", locationId: null, lastExpiryDays: null });
    const p = prefillFromItem(bare, data([bare]), "2026-10-23");
    expect(p.expiresOn).toBeNull();
    expect(p.locationId).toBe("loc-fridge");
    expect(defaultLocationForGenre("g-season", data())).toBe("loc-shelf");
    expect(defaultLocationForGenre("nope", data())).toBeNull();
  });
});

describe("planRegistration: 新しい品物", () => {
  it("品物と在庫を作り、前回の日数 = 期限 − 購入日、補充の目安は既定値", () => {
    const plan = planRegistration(input({ name: "ヨーグルト" }), data(), ids);
    expect(plan).toMatchObject({
      newItem: { id: "new-item", name: "ヨーグルト", itemKind: "food", tracking: "count", lastExpiryDays: 10, restockAtCount: null, restockAtLevel: null, locationId: "loc-fridge" },
      newStock: { id: "new-stock", itemId: "new-item", quantity: 2, expiresOn: "2026-10-30", purchasedOn: "2026-10-20" },
    });
  });
  it("期限が空なら前回の日数は null", () => {
    const plan = planRegistration(input({ name: "ヨーグルト", expiresOn: null }), data(), ids);
    expect("newItem" in plan && plan.newItem?.lastExpiryDays).toBeNull();
  });
  it("残量で管理は在庫を作らず、残量の目安は △ で", () => {
    const plan = planRegistration(input({ name: "しょうゆ", tracking: "level", unitId: null, quantity: null, stockLevel: "low", expiresOn: "2026-10-30" }), data(), ids);
    expect(plan).toEqual({
      newItem: expect.objectContaining({ tracking: "level", stockLevel: "low", restockAtLevel: "low", unitId: null, lastExpiryDays: null }),
    });
  });
});

describe("planRegistration: 既存の品物(OD-stock-food-06)", () => {
  it("(1) ジャンルは書き換え、(3) 場所は登録の場所で書き換え、(2) 期限があれば日数も", () => {
    const d = data([milk], [stock("s", "milk", 1, { locationId: "loc-shelf" })]);
    const plan = planRegistration(input({ genreId: "g-meat" }), d, ids);
    expect(plan).toEqual({
      itemPatch: { id: "milk", patch: { genreId: "g-meat", locationId: "loc-fridge", lastExpiryDays: 10 } },
      newStock: expect.objectContaining({ itemId: "milk", id: "new-stock" }),
    });
  });
  it("(2) 期限を空で登録しても前回の日数は残す(patch に入れない)", () => {
    const plan = planRegistration(input({ expiresOn: null, locationId: "loc-shelf" }), data([milk]), ids);
    expect(plan).toEqual({ newStock: expect.objectContaining({ expiresOn: null }) });
  });
  it("(3) 場所なしで登録したら、場所なしを覚える", () => {
    const plan = planRegistration(input({ expiresOn: null, locationId: null }), data([milk]), ids);
    expect(plan).toMatchObject({ itemPatch: { patch: { locationId: null } } });
  });
  it("単位は、在庫が 0 件のときだけ書き換える", () => {
    const plan = planRegistration(input({ unitId: "u-ko", expiresOn: null, locationId: "loc-shelf" }), data([milk]), ids);
    expect(plan).toMatchObject({ itemPatch: { patch: { unitId: "u-ko" } } });
  });
  it("在庫があるのに単位を変えたら誤り", () => {
    const d = data([milk], [stock("s", "milk", 1)]);
    expect(planRegistration(input({ unitId: "u-ko" }), d, ids)).toEqual({ error: "unit_mismatch", itemName: "牛乳", currentUnitId: "u-pack" });
  });
  it("管理のしかたが違えば誤り", () => {
    expect(planRegistration(input({ tracking: "level" }), data([milk]), ids)).toEqual({ error: "tracking_mismatch", itemName: "牛乳", currentTracking: "count" });
  });
  it("残量で管理の既存の品物: 残量と場所を書く", () => {
    const soy = item("soy", "しょうゆ", { tracking: "level", unitId: null, stockLevel: "full", genreId: "g-season", locationId: "loc-shelf" });
    const plan = planRegistration(input({ name: "しょうゆ", tracking: "level", genreId: "g-season", unitId: null, quantity: null, stockLevel: "out", locationId: "loc-shelf" }), data([soy]), ids);
    expect(plan).toEqual({ itemPatch: { id: "soy", patch: { stockLevel: "out" } } });
  });
});

describe("validateRegistration", () => {
  it("名前・ジャンル・単位・個数の欠けを見つける", () => {
    expect(validateRegistration(input({ name: "  " }), data())).toEqual({ error: "name_empty" });
    expect(validateRegistration(input({ name: "x", genreId: null }), data())).toEqual({ error: "genre_missing" });
    expect(validateRegistration(input({ name: "x", unitId: null }), data())).toEqual({ error: "unit_missing" });
    expect(validateRegistration(input({ name: "x", quantity: 0 }), data())).toEqual({ error: "quantity_invalid" });
    expect(validateRegistration(input({ name: "x" }), data())).toBeNull();
  });
  it("名前は前後の空白を除いて既存と比べる", () => {
    expect(validateRegistration(input({ name: " 牛乳 ", tracking: "level" }), data([milk]))).toMatchObject({ error: "tracking_mismatch" });
  });
});
