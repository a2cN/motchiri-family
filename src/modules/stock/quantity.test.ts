import { describe, expect, it } from "vitest";
import { formatQuantity, parseQuantity, stepQuantity } from "./quantity";

describe("parseQuantity", () => {
  it("整数と第一位までの小数を読む", () => {
    expect(parseQuantity("3", "positive")).toEqual({ ok: true, value: 3 });
    expect(parseQuantity("0.5", "positive")).toEqual({ ok: true, value: 0.5 });
    expect(parseQuantity(" 2. ", "positive")).toEqual({ ok: true, value: 2 });
  });
  it("全角の数字と「．」を半角にする", () => {
    expect(parseQuantity("１２", "positive")).toEqual({ ok: true, value: 12 });
    expect(parseQuantity("１．５", "positive")).toEqual({ ok: true, value: 1.5 });
  });
  it("空・数でない・第二位以下は誤り(丸めない)", () => {
    expect(parseQuantity("", "positive")).toEqual({ ok: false, error: "empty" });
    expect(parseQuantity("  ", "non_negative")).toEqual({ ok: false, error: "empty" });
    expect(parseQuantity("abc", "positive")).toEqual({ ok: false, error: "not_a_number" });
    expect(parseQuantity("-1", "non_negative")).toEqual({ ok: false, error: "not_a_number" });
    expect(parseQuantity("1.25", "positive")).toEqual({ ok: false, error: "too_precise" });
  });
  it("positive は 0 を許さず、non_negative は許す", () => {
    expect(parseQuantity("0", "positive")).toEqual({ ok: false, error: "not_positive" });
    expect(parseQuantity("0", "non_negative")).toEqual({ ok: true, value: 0 });
  });
});

describe("stepQuantity", () => {
  it("+ は 1 足す(小数の誤差を残さない)", () => {
    expect(stepQuantity(0.5, 1, "list")).toBe(1.5);
    expect(stepQuantity(2.3, 1, "form")).toBe(3.3);
  });
  it("form: 1 以下から − は変わらない", () => {
    expect(stepQuantity(1, -1, "form")).toBe(1);
    expect(stepQuantity(0.5, -1, "form")).toBe(0.5);
    expect(stepQuantity(3, -1, "form")).toBe(2);
  });
  it("list: 1 未満から − は 0", () => {
    expect(stepQuantity(0.5, -1, "list")).toBe(0);
    expect(stepQuantity(1, -1, "list")).toBe(0);
    expect(stepQuantity(3.5, -1, "list")).toBe(2.5);
  });
});

describe("formatQuantity", () => {
  it("整数は小数点なし、小数は第一位", () => {
    expect(formatQuantity(3)).toBe("3");
    expect(formatQuantity(0.5)).toBe("0.5");
    expect(formatQuantity(2.0)).toBe("2");
  });
});
