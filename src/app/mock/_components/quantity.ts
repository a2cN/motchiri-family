// 数の入力の決まり(40_design_brief.md rev3 部品「数の入力」、OD-stock-uiux-46 A)。
// 打った値はフォーカスが外れたときに読む。全角の数字と「．」は半角に直す。小数は第一位まで(丸めない)。

export type QtyResult = { ok: true; value: number; text: string } | { ok: false; error: string };

/** "positive" = 0 より大きい(登録・在庫登録・目安の数)、"nonneg" = 0 以上(品物の編集の数。0 は使い切り) */
export type QtyMode = "positive" | "nonneg";

export const ERROR_EMPTY = "個数を入れてください";
export const ERROR_NAN = "数を入れてください";
export const ERROR_DECIMALS = "小数は第一位までです";
export const ERROR_POSITIVE = "0 より大きい数を入れてください";

export function parseQty(raw: string, mode: QtyMode = "positive"): QtyResult {
  const s = raw.normalize("NFKC").trim();
  if (s === "") return { ok: false, error: ERROR_EMPTY };
  const m = /^(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return { ok: false, error: ERROR_NAN };
  const decimals = m[2] ?? "";
  if (decimals.length > 1) return { ok: false, error: ERROR_DECIMALS };
  const value = Number(`${m[1]}.${decimals || "0"}`);
  if (mode === "positive" && value <= 0) return { ok: false, error: ERROR_POSITIVE };
  return { ok: true, value, text: formatQty(value) };
}

/** 数の表示: 整数は小数点なし、小数は第一位まで */
export function formatQty(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** 数と単位。spaced = 数と単位の間に空白(日用品の行。40 rev3 の例「2 本」) */
export function withUnit(value: number, unit: string, spaced = false): string {
  return `${formatQty(value)}${spaced && unit ? " " : ""}${unit}`;
}

/** フォーカスが外れたとき: 読めたら表示を直す(全角 → 半角、「1.0」→「1」)、読めなければ誤りの文 */
export function settleQty(text: string, mode: QtyMode = "positive"): { text: string; error: string | null } {
  const r = parseQty(text, mode);
  return r.ok ? { text: r.text, error: null } : { text, error: r.error };
}

/** ± を押したときの次の値。読めない値からは動かさない(null) */
export function stepQty(text: string, delta: 1 | -1, minimum: number): string | null {
  const r = parseQty(text, "nonneg");
  if (!r.ok) return delta === 1 ? "1" : null;
  const next = Math.round((r.value + delta) * 10) / 10;
  if (delta === -1 && next < minimum) return null;
  return formatQty(next);
}
