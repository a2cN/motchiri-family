import { describe, expect, it } from "vitest";
import { data, item, stock } from "./fixtures";
import { groupFoodStock } from "./grouping";

const milk = item("milk", "牛乳", { genreId: "g-dairy" });
const pork = item("pork", "豚こま肉", { genreId: "g-meat", unitId: "u-g" });
const mayo = item("mayo", "マヨネーズ", { tracking: "level", unitId: null, stockLevel: "full", genreId: "g-season", locationId: "loc-fridge" });
const bread = item("bread", "食パン", { genreId: "g-dairy", locationId: null });

describe("groupFoodStock", () => {
  it("場所別: マスタの順で、期限の近い順 → 期限なし → 残量の行。空のまとまりは出さない", () => {
    const d = data([milk, pork, mayo, bread], [
      stock("s1", "milk", 1, { expiresOn: "2026-11-01" }, 1),
      stock("s2", "milk", 1, { expiresOn: "2026-10-23" }, 2),
      stock("s3", "pork", 200, { expiresOn: null }, 3),
      stock("s4", "bread", 1, { locationId: null }, 4),
      stock("s5", "milk", 2, { locationId: "loc-shelf", expiresOn: null }, 5),
    ]);
    const groups = groupFoodStock(d, "location");
    expect(groups.map((g) => g.label)).toEqual(["冷蔵庫", "棚", "場所なし"]);
    const fridge = groups[0].rows.map((r) => (r.kind === "count" ? r.stock.id : `level:${r.item.id}`));
    expect(fridge).toEqual(["s2", "s1", "s3", "level:mayo"]);
    expect(groups[2].rows).toHaveLength(1);
  });

  it("同じ期限(または期限なし)の行は登録した順(古い順)", () => {
    const d = data([milk], [
      stock("late", "milk", 1, { expiresOn: "2026-10-30", createdAt: "2026-10-02T00:00:00Z" }),
      stock("early", "milk", 1, { expiresOn: "2026-10-30", createdAt: "2026-10-01T00:00:00Z" }),
      stock("n2", "milk", 1, { createdAt: "2026-10-04T00:00:00Z" }),
      stock("n1", "milk", 1, { createdAt: "2026-10-03T00:00:00Z" }),
    ]);
    const ids = groupFoodStock(d, "location")[0].rows.map((r) => (r.kind === "count" ? r.stock.id : ""));
    expect(ids).toEqual(["early", "late", "n1", "n2"]);
  });

  it("ジャンル別: ジャンルの sort_order の順、残量で管理の行はその品物のジャンル", () => {
    const d = data([milk, pork, mayo], [stock("s1", "milk", 1), stock("s2", "pork", 100)]);
    const groups = groupFoodStock(d, "genre");
    expect(groups.map((g) => g.label)).toEqual(["肉", "卵・乳製品", "調味料"]);
    expect(groups[2].rows[0]).toMatchObject({ kind: "level" });
  });

  it("日用品と、品物の無い在庫は出さない", () => {
    const supply = item("soap", "洗剤", { itemKind: "supply", genreId: null });
    const d = data([supply], [stock("x", "soap", 1), stock("y", "missing", 1)]);
    expect(groupFoodStock(d, "location")).toEqual([]);
  });

  it("在庫の無い数で管理の品物は出ない", () => {
    expect(groupFoodStock(data([milk]), "location")).toEqual([]);
  });
});
