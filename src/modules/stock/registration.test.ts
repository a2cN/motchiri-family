import { describe, expect, it } from "vitest";
import { data, item, stock } from "./fixtures";
import { defaultLocationForGenre, planRegistration, prefillFromItem, validateRegistration, type RegistrationInput } from "./registration";

const ids = { householdId: "h1", itemId: "new-item", stockId: "new-stock" };
const milk = item("milk", "牛乳", { genreId: "g-dairy", unitId: "u-pack", locationId: "loc-shelf", lastExpiryDays: 7 });
const input = (over: Partial<RegistrationInput> = {}): RegistrationInput => ({
  kind: "food",
  supplyGenre: null,
  note: null,
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

describe("日用品の登録(stock-supply)", () => {
  const wrap = item("wrap", "ラップ", { itemKind: "supply", genreId: null, locationId: null, unitId: "u-ko", supplyGenre: "キッチン", note: "30cm" });
  const sup = (over: Partial<RegistrationInput> = {}) =>
    input({ kind: "supply", name: "ラップ", genreId: null, locationId: null, expiresOn: null, unitId: "u-ko", quantity: 2, ...over });

  it("日用品はジャンル(マスタ)が無くてもよい。食材は必須のまま", () => {
    expect(validateRegistration(sup({ name: "新品" }), data([]))).toBeNull();
    expect(validateRegistration(input({ name: "新品", genreId: null }), data([]))).toEqual({ error: "genre_missing" });
  });
  it("別の種別に同じ名前があると kind_mismatch(管理のしかたの誤りより先)", () => {
    expect(validateRegistration(sup({ name: "牛乳", tracking: "level" }), data([milk]))).toEqual({ error: "kind_mismatch", itemName: "牛乳", currentKind: "food" });
    expect(validateRegistration(input({ name: "ラップ" }), data([wrap]))).toEqual({ error: "kind_mismatch", itemName: "ラップ", currentKind: "supply" });
  });
  it("新しい日用品: 場所・ジャンルのマスタなし、ジャンル・備考は入力のまま、目安は既定値", () => {
    const plan = planRegistration(sup({ name: "洗剤", supplyGenre: "掃除", note: "詰め替え", locationId: "loc-fridge" }), data([]), ids);
    expect("error" in plan).toBe(false);
    if ("error" in plan) return;
    expect(plan.newItem).toMatchObject({
      itemKind: "supply", genreId: null, locationId: null, supplyGenre: "掃除", note: "詰め替え", lastExpiryDays: null, restockAtCount: null,
    });
    expect(plan.newStock).toMatchObject({ locationId: null, expiresOn: null, quantity: 2 });
  });
  it("新しい残量の日用品は在庫を作らず、目安は low", () => {
    const plan = planRegistration(sup({ name: "洗剤", tracking: "level", unitId: null, quantity: null, stockLevel: "low" }), data([]), ids);
    if ("error" in plan) throw new Error("unexpected");
    expect(plan.newItem).toMatchObject({ stockLevel: "low", restockAtLevel: "low", unitId: null });
    expect(plan.newStock).toBeUndefined();
  });
  it("既存の数の日用品: 今の数に足し(小数第一位)、購入日を書き換え、ジャンル・備考が違えば品物を書き換える", () => {
    const stocks = [stock("w1", "wrap", 1.1, { locationId: null })];
    const plan = planRegistration(sup({ quantity: 2.2, supplyGenre: "掃除", note: "30cm", purchasedOn: "2026-10-25" }), data([wrap], stocks), ids);
    if ("error" in plan) throw new Error("unexpected");
    expect(plan.stockPatch).toEqual({ id: "w1", patch: { quantity: 3.3, purchasedOn: "2026-10-25" } });
    expect(plan.itemPatch).toEqual({ id: "wrap", patch: { supplyGenre: "掃除" } });
    expect(plan.newStock).toBeUndefined();
  });
  it("既存の数の日用品に在庫の行が無ければ新しい在庫", () => {
    const plan = planRegistration(sup({ supplyGenre: "キッチン", note: "30cm" }), data([wrap], []), ids);
    if ("error" in plan) throw new Error("unexpected");
    expect(plan.stockPatch).toBeUndefined();
    expect(plan.newStock).toMatchObject({ itemId: "wrap", quantity: 2, locationId: null });
    expect(plan.itemPatch).toBeUndefined();
  });
  it("単位の食い違い: 合計が 0 より大きければ誤り、0 なら単位を書き換えて足せる", () => {
    const pack = sup({ unitId: "u-pack" });
    expect(planRegistration(pack, data([wrap], [stock("w1", "wrap", 1, { locationId: null })]), ids)).toMatchObject({ error: "unit_mismatch" });
    const plan = planRegistration(pack, data([wrap], [stock("w1", "wrap", 0, { locationId: null })]), ids);
    if ("error" in plan) throw new Error("unexpected");
    expect(plan.itemPatch?.patch).toMatchObject({ unitId: "u-pack", supplyGenre: null, note: null });
    expect(plan.stockPatch?.patch.quantity).toBe(2);
  });
  it("既存の残量の日用品: 残量が違えば残量を書き換える", () => {
    const shampoo = item("shampoo", "シャンプー", { itemKind: "supply", tracking: "level", stockLevel: "full", genreId: null, locationId: null, unitId: null });
    const plan = planRegistration(sup({ name: "シャンプー", tracking: "level", unitId: null, quantity: null, stockLevel: "low" }), data([shampoo]), ids);
    if ("error" in plan) throw new Error("unexpected");
    expect(plan.itemPatch?.patch).toEqual({ stockLevel: "low" });
    expect(plan.stockPatch).toBeUndefined();
  });
  it("候補の初期値に種別・ジャンル・備考が入り、場所・期限は無い", () => {
    const p = prefillFromItem(wrap, data([wrap]), "2026-10-23");
    expect(p).toMatchObject({ kind: "supply", supplyGenre: "キッチン", note: "30cm", locationId: null, expiresOn: null });
  });
});
