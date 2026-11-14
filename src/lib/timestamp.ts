// サーバーの時刻(マイクロ秒まで持つ文字列)の比べ方。倉庫と買い物リストの store が使う。

/** "2026-11-09T05:52:49.111983+00:00" のようなサーバーの時刻をマイクロ秒まで比べる(Date はミリ秒までしか持たない) */
export function timeKey(ts: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(ts);
  if (m && (m[4] === undefined || m[4] === "Z" || /^[+-]00(:?00)?$/.test(m[4]))) return `${m[1]}T${m[2]}.${(m[3] ?? "").padEnd(6, "0").slice(0, 6)}`;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? ts : `${new Date(ms).toISOString().slice(0, 19)}.${String(ms % 1000).padStart(3, "0")}000`;
}
export const cmpTs = (a: string, b: string): number => {
  const x = timeKey(a);
  const y = timeKey(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

