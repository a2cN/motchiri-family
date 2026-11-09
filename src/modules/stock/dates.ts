// 日本時間(要件定義 §2)で数える。端末のタイムゾーンを使わない。日付は YYYY-MM-DD の文字列のまま比べる(30_architecture.md D-17)。

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const DAY_MS = 86_400_000;

const jstParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });

/** 日本時間の今日("YYYY-MM-DD") */
export function todayInJst(now: Date = new Date()): string {
  const parts = Object.fromEntries(jstParts.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const utc = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  return toIso(utc(iso) + days * DAY_MS);
}

/** to − from(日数) */
export function daysBetween(fromIso: string, toIso_: string): number {
  return Math.round((utc(toIso_) - utc(fromIso)) / DAY_MS);
}

/** 期限間近の最後の日: 今日を含む最も近い金曜。今日が金曜なら 7 日後(OD-stock-uiux-08 B) */
export function soonUntil(todayIso: string): string {
  const dow = new Date(utc(todayIso)).getUTCDay();
  const untilFriday = (5 - dow + 7) % 7 || 7;
  return addDays(todayIso, untilFriday);
}

/** expired = 今日より前、soon = 今日〜soonUntil */
export function expiryStatus(expiresOn: string | null, todayIso: string): "expired" | "soon" | "none" {
  if (expiresOn === null) return "none";
  if (expiresOn < todayIso) return "expired";
  return expiresOn <= soonUntil(todayIso) ? "soon" : "none";
}

/** 「10/24(金)」。今日と違う年のときは「2027/1/5(火)」(モックは 2026 年だけで確かめた形) */
export function formatDay(iso: string, todayIso?: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const w = WEEKDAYS[new Date(utc(iso)).getUTCDay()];
  const sameYear = todayIso === undefined || Number(todayIso.slice(0, 4)) === y;
  return sameYear ? `${m}/${d}(${w})` : `${y}/${m}/${d}(${w})`;
}
