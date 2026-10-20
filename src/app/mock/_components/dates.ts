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

/** 期限の印。期限切れ = 0 日より前、期限間近 = 今日。
 *  モックのデータは −1・−2・0・+8 以上・なし だけなので、OD-stock-uiux-08 のどちらの答えでも同じ表示になる(決定 12)。 */
export function expiryStatus(expiresInDays: number | null): "expired" | "soon" | "none" {
  if (expiresInDays === null) return "none";
  if (expiresInDays < 0) return "expired";
  if (expiresInDays === 0) return "soon";
  return "none";
}
