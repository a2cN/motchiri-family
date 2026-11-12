import { describe, expect, it } from "vitest";
import {
  backHrefForEdit, itemEditHref, itemNewHref, itemsHref, kindOfOrigin, mastersHref, parseItemEditQuery, parseItemsQuery, parseOriginQuery, stockHref,
} from "./routes";

const p = (s: string) => new URLSearchParams(s);

describe("routes", () => {
  it("上の階層の画面", () => {
    expect(stockHref("stock")).toBe("/stock/");
    expect(stockHref("supply")).toBe("/stock/supply/");
    expect(kindOfOrigin("supply")).toBe("supply");
    expect(kindOfOrigin("stock")).toBe("food");
  });
  it("組み立て", () => {
    expect(itemsHref()).toBe("/stock/items/");
    expect(itemsHref({ from: "supply", kind: "supply" })).toBe("/stock/items/?from=supply&kind=supply");
    expect(mastersHref()).toBe("/stock/masters/");
    expect(mastersHref({ from: "supply" })).toBe("/stock/masters/?from=supply");
    expect(itemNewHref({ from: "supply" })).toBe("/stock/item-new/?from=supply");
    expect(itemEditHref({ id: "x", from: "supply" })).toBe("/stock/item-edit/?id=x&from=supply");
    expect(itemEditHref({ id: "x", from: "items", items: { from: "stock", kind: "supply" } })).toBe(
      "/stock/item-edit/?id=x&from=items&kind=supply&itemsFrom=stock",
    );
  });
  it("読み取り: 既定と知らない値", () => {
    expect(parseItemsQuery(p(""))).toEqual({ from: "stock", kind: "food" });
    expect(parseItemsQuery(p("from=supply"))).toEqual({ from: "supply", kind: "supply" });
    expect(parseItemsQuery(p("from=supply&kind=food"))).toEqual({ from: "supply", kind: "food" });
    expect(parseItemsQuery(p("from=http://evil&kind=zzz"))).toEqual({ from: "stock", kind: "food" });
    expect(parseOriginQuery(p("from=supply"))).toEqual({ from: "supply" });
    expect(parseOriginQuery(p("from=//x"))).toEqual({ from: "stock" });
  });
  it("品物の編集", () => {
    const q = parseItemEditQuery(p("id=a&from=items&kind=supply&itemsFrom=supply"));
    expect(q).toEqual({ id: "a", from: "items", items: { from: "supply", kind: "supply" } });
    expect(backHrefForEdit(q)).toBe("/stock/items/?from=supply&kind=supply");
    expect(backHrefForEdit(parseItemEditQuery(p("id=a&from=supply")))).toBe("/stock/supply/");
    expect(backHrefForEdit(parseItemEditQuery(p("id=a")))).toBe("/stock/");
    expect(backHrefForEdit(parseItemEditQuery(p("id=a&from=zzz")))).toBe("/stock/");
    expect(parseItemEditQuery(p("")).id).toBeNull();
  });
});
