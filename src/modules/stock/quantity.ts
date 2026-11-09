// 数の入力の読み取りと ±(OD-stock-uiux-46 A)、数の表示。

export type QuantityParse =
  | { ok: true; value: number }
  | { ok: false; error: "empty" | "not_a_number" | "too_precise" | "not_positive" };

/** 全角の数字・「.」「．」を半角にして読む。小数第二位以下は誤り(丸めない)。positive は 0 を許さない */
export function parseQuantity(text: string, mode: "positive" | "non_negative"): QuantityParse {
  const s = text.normalize("NFKC").trim();
  if (s === "") return { ok: false, error: "empty" };
  const m = /^(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return { ok: false, error: "not_a_number" };
  if ((m[2] ?? "").length > 1) return { ok: false, error: "too_precise" };
  const value = Number(`${m[1]}.${(m[2] ?? "").slice(0, 1) || "0"}`);
  if (mode === "positive" && value <= 0) return { ok: false, error: "not_positive" };
  return { ok: true, value };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** form: 1 以下から − は変わらない。list: 1 未満から − は 0 */
export function stepQuantity(value: number, delta: 1 | -1, where: "form" | "list"): number {
  if (delta === 1) return round1(value + 1);
  if (where === "form") return value <= 1 ? value : round1(value - 1);
  return value < 1 ? 0 : round1(value - 1);
}

/** 整数は小数点なし、小数は第一位 */
export function formatQuantity(value: number): string {
  const r = round1(value);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
