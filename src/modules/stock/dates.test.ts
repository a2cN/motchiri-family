import { describe, expect, it } from "vitest";
import { addDays, daysBetween, expiryStatus, formatDay, soonUntil, todayInJst } from "./dates";

describe("todayInJst", () => {
  it("UTC の 15:00 以降は日本時間では翌日", () => {
    expect(todayInJst(new Date("2026-10-22T14:59:59Z"))).toBe("2026-10-22");
    expect(todayInJst(new Date("2026-10-22T15:00:00Z"))).toBe("2026-10-23");
  });
  it("端末のタイムゾーンによらない", () => {
    const before = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    expect(todayInJst(new Date("2026-10-23T03:00:00Z"))).toBe("2026-10-23");
    process.env.TZ = before;
  });
});

describe("日付の計算", () => {
  it("addDays は月・年をまたぐ", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("daysBetween は to − from", () => {
    expect(daysBetween("2026-10-20", "2026-10-23")).toBe(3);
    expect(daysBetween("2026-10-23", "2026-10-20")).toBe(-3);
    expect(daysBetween("2026-10-25", "2026-11-01")).toBe(7);
  });
});

describe("期限の印(OD-stock-uiux-08 B)", () => {
  it("今日が金曜なら 7 日後まで(2026-10-23 は金曜)", () => {
    expect(soonUntil("2026-10-23")).toBe("2026-10-30");
  });
  it("今日が月曜なら その週の金曜", () => {
    expect(soonUntil("2026-10-19")).toBe("2026-10-23");
  });
  it("今日が土曜なら 次の金曜", () => {
    expect(soonUntil("2026-10-24")).toBe("2026-10-30");
  });
  it("期限切れ・期限間近・なし", () => {
    const today = "2026-10-23";
    expect(expiryStatus("2026-10-22", today)).toBe("expired");
    expect(expiryStatus("2026-10-23", today)).toBe("soon");
    expect(expiryStatus("2026-10-30", today)).toBe("soon");
    expect(expiryStatus("2026-10-31", today)).toBe("none");
    expect(expiryStatus(null, today)).toBe("none");
  });
});

describe("formatDay", () => {
  it("今年は月/日(曜)", () => {
    expect(formatDay("2026-10-24", "2026-10-23")).toBe("10/24(土)");
    expect(formatDay("2026-10-23")).toBe("10/23(金)");
  });
  it("違う年は年を付ける", () => {
    expect(formatDay("2027-05-11", "2026-10-23")).toBe("2027/5/11(火)");
  });
});
