import { describe, expect, it } from "vitest";
import { fromRestockUi, restockColumnsDefault, restockDefaults, restockLabel, toRestockUi } from "./restock";

describe("補充の目安の変換(R3-9)", () => {
  it("数: null = なし、0 = 切れたら、n = 数で決める", () => {
    expect(toRestockUi({ tracking: "count", restockAtCount: null, restockAtLevel: null })).toEqual({ kind: "none" });
    expect(toRestockUi({ tracking: "count", restockAtCount: 0, restockAtLevel: null })).toEqual({ kind: "zero" });
    expect(toRestockUi({ tracking: "count", restockAtCount: 1.5, restockAtLevel: null })).toEqual({ kind: "count", n: 1.5 });
  });
  it("残量: null = なし、low = △で、out = ×で", () => {
    expect(toRestockUi({ tracking: "level", restockAtCount: null, restockAtLevel: null })).toEqual({ kind: "none" });
    expect(toRestockUi({ tracking: "level", restockAtCount: null, restockAtLevel: "low" })).toEqual({ kind: "low" });
    expect(toRestockUi({ tracking: "level", restockAtCount: null, restockAtLevel: "out" })).toEqual({ kind: "out" });
  });
  it("列への変換は往復で変わらず、管理のしかたに合わない値はなしになる", () => {
    for (const ui of [{ kind: "none" }, { kind: "zero" }, { kind: "count", n: 2 }] as const) {
      expect(toRestockUi({ tracking: "count", ...fromRestockUi("count", ui) })).toEqual(ui);
    }
    for (const ui of [{ kind: "none" }, { kind: "low" }, { kind: "out" }] as const) {
      expect(toRestockUi({ tracking: "level", ...fromRestockUi("level", ui) })).toEqual(ui);
    }
    expect(fromRestockUi("count", { kind: "low" })).toEqual({ restockAtCount: null, restockAtLevel: null });
    expect(fromRestockUi("level", { kind: "zero" })).toEqual({ restockAtCount: null, restockAtLevel: null });
  });
  it("既定値(OD-stock-uiux-18 A): 数はなし、残量は △で", () => {
    expect(restockDefaults("count")).toEqual({ kind: "none" });
    expect(restockDefaults("level")).toEqual({ kind: "low" });
    expect(restockColumnsDefault("level")).toEqual({ restockAtCount: null, restockAtLevel: "low" });
  });
  it("補足の文字(正典の部品)", () => {
    const c = (n: number | null) => ({ tracking: "count" as const, restockAtCount: n, restockAtLevel: null });
    expect(restockLabel(c(null), "本")).toBe("目安なし");
    expect(restockLabel(c(0), "本")).toBe("目安 切れたら");
    expect(restockLabel(c(1), "本")).toBe("目安 1 本以下");
    expect(restockLabel(c(1.5), "パック")).toBe("目安 1.5 パック以下");
    expect(restockLabel({ tracking: "level", restockAtCount: null, restockAtLevel: "low" }, "")).toBe("目安 △");
    expect(restockLabel({ tracking: "level", restockAtCount: null, restockAtLevel: "out" }, "")).toBe("目安 ×");
  });
});
