"use client";

import { useSyncExternalStore } from "react";

// 今日の日付は、画面が開いたあと(マウント後)に決める(30_architecture.md D-11)。静的書き出しは画面をビルドのときにも描くので、
// ビルドの日付を HTML に焼き込まない。E2E は page.clock.setFixedTime で固定する。
// 戻り値は「今日」を表す日付(時刻は正午)。サーバー側の描画とマウント前は null。

const noop = () => () => {};

function todayKey(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export function useToday(): Date | null {
  const key = useSyncExternalStore(noop, todayKey, () => null);
  if (key === null) return null;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 12);
}

/** 「10/24(金)」の形。年は出さない。 */
export function formatDay(base: Date, offsetDays: number): string {
  const day = addDays(base, offsetDays);
  return `${day.getMonth() + 1}/${day.getDate()}(${WEEKDAYS[day.getDay()]})`;
}

/** `<input type="date">` の値(YYYY-MM-DD) */
export function toInputValue(base: Date, offsetDays: number): string {
  const day = addDays(base, offsetDays);
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${m}-${d}`;
}

/** 次の金曜までの日数(今日が金曜なら 7、ほかの日は今日を含む最も近い金曜まで)。OD-stock-uiux-08 B */
export function daysUntilNextFriday(base: Date): number {
  const dow = base.getDay();
  const diff = (5 - dow + 7) % 7;
  return diff === 0 ? 7 : diff;
}

/** 期限の印。期限切れ = 今日より前、期限間近 = 今日〜次の金曜(OD-stock-uiux-08 B)。 */
export function expiryStatus(expiresInDays: number | null, today: Date | null): "expired" | "soon" | "none" {
  if (expiresInDays === null || today === null) return "none";
  if (expiresInDays < 0) return "expired";
  if (expiresInDays <= daysUntilNextFriday(today)) return "soon";
  return "none";
}

/** `<input type="date">` の値(YYYY-MM-DD)を「今日から何日後」にする。空・不正なら null */
export function daysFromToday(base: Date, value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate());
  return Math.round((target - today) / 86_400_000);
}
