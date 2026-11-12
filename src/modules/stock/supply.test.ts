import { describe, expect, it } from "vitest";
import { filterSupplyRows, groupSupplyItemsByGenre, normalizeForSearch, normalizeFreeText, supplyGenres, supplyRows, supplyStockOf } from "./supply";
import type { Item, ItemStock, StockData } from "./types";

const H = "h";
const item = (id: string, o: Partial<Item>): Item => ({
  id, householdId: H, createdAt: `2026-11-0${id.length}T00:00:00Z`, updatedAt: "", name: id, itemKind: "supply", tracking: "level",
  genreId: null, unitId: null, locationId: null, stockLevel: "full", restockAtCount: null, restockAtLevel: "low", isRegular: false,
  lastExpiryDays: null, supplyGenre: null, note: null, ...o,
});
const stock = (id: string, itemId: string, quantity: number, createdAt: string): ItemStock => ({
  id, householdId: H, createdAt, updatedAt: "", itemId, quantity, locationId: null, purchasedOn: "2026-11-01", expiresOn: null,
});
const data = (items: Item[], stocks: ItemStock[] = []): StockData => ({ genres: [], locations: [], units: [], items, stocks });

describe("supplyRows", () => {
  it("日用品だけを登録順に、数の行は合計と最初の在庫を持つ", () => {
    const d = data(
      [
        item("b", { createdAt: "2026-11-02T00:00:00Z" }),
        item("a", { createdAt: "2026-11-01T00:00:00Z", tracking: "count", stockLevel: null, unitId: "u" }),
        item("f", { itemKind: "food", createdAt: "2026-11-01T00:00:00Z" }),
      ],
      [stock("s2", "a", 1.2, "2026-11-03T00:00:00Z"), stock("s1", "a", 2, "2026-11-02T00:00:00Z")],
    );
    const rows = supplyRows(d);
    expect(rows.map((r) => r.item.id)).toEqual(["a", "b"]);
    expect(rows[0]).toMatchObject({ kind: "count", total: 3.2, stockId: "s1" });
    expect(rows[1]).toMatchObject({ kind: "level", level: "full" });
    expect(supplyStockOf("a", d)?.id).toBe("s1");
    expect(supplyStockOf("zzz", d)).toBeUndefined();
  });
  it("在庫が無い数の日用品は 0・stockId null", () => {
    const rows = supplyRows(data([item("a", { tracking: "count", stockLevel: null, unitId: "u" })]));
    expect(rows[0]).toMatchObject({ kind: "count", total: 0, stockId: null });
  });
});

describe("supplyGenres", () => {
  it("最も古い作った時刻の順、同じなら語の順、null は入れない、食材は数えない", () => {
    const d = data([
      item("a", { supplyGenre: "掃除", createdAt: "2026-11-05T00:00:00Z" }),
      item("b", { supplyGenre: "バス", createdAt: "2026-11-02T00:00:00Z" }),
      item("c", { supplyGenre: "掃除", createdAt: "2026-11-01T00:00:00Z" }),
      item("d", { supplyGenre: null }),
      item("e", { supplyGenre: "あ", createdAt: "2026-11-02T00:00:00Z" }),
    ]);
    expect(supplyGenres(d)).toEqual(["掃除", "あ", "バス"]);
  });
  it("品物のジャンルを直すと、使われなくなった語は消える", () => {
    expect(supplyGenres(data([item("a", { supplyGenre: "新" })]))).toEqual(["新"]);
  });
});

describe("検索", () => {
  const rows = supplyRows(
    data([item("a", { name: "SHAMPOO", supplyGenre: "バス" }), item("b", { name: "ラップ", supplyGenre: "キッチン" })]),
  );
  it("全角半角・大文字小文字を区別しない部分一致", () => {
    expect(normalizeForSearch("ＳＨＡＭ")).toBe("sham");
    expect(filterSupplyRows(rows, "ｓｈａｍ", null).map((r) => r.item.id)).toEqual(["a"]);
    expect(filterSupplyRows(rows, " プ ", null).map((r) => r.item.id)).toEqual(["b"]);
  });
  it("空の語は絞らない。ジャンルで絞る", () => {
    expect(filterSupplyRows(rows, "  ", null)).toHaveLength(2);
    expect(filterSupplyRows(rows, "", "バス").map((r) => r.item.id)).toEqual(["a"]);
    expect(filterSupplyRows(rows, "ラ", "バス")).toHaveLength(0);
  });
});

describe("groupSupplyItemsByGenre / normalizeFreeText", () => {
  it("使われた語の順、末尾にジャンルなし、空は出さない", () => {
    const g = groupSupplyItemsByGenre(
      data([
        item("a", { createdAt: "2026-11-01T00:00:00Z" }),
        item("b", { supplyGenre: "バス", createdAt: "2026-11-02T00:00:00Z" }),
        item("f", { itemKind: "food" }),
      ]),
    );
    expect(g.map((x) => [x.genre, x.items.map((i) => i.id)])).toEqual([["バス", ["b"]], [null, ["a"]]]);
    expect(groupSupplyItemsByGenre(data([]))).toEqual([]);
  });
  it("前後の空白を除き、空は null", () => {
    expect(normalizeFreeText("  あ い \n")).toBe("あ い");
    expect(normalizeFreeText(" \n ")).toBeNull();
  });
});
