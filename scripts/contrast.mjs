// コントラスト(UI-04)の検査。トークンの値(src/styles/tokens.css)と、組の一覧
// (src/styles/contrast-pairs.json)から、WCAG 2.1 のコントラスト比を計算する。
// 依存なし(30_architecture.md D-01〜D-04)。関数を export し、直接実行されたときだけ CLI として動く。
//
// 使い方: npm run contrast [-- --scope=root --scope=direction:anzu]
//   --scope  測る範囲(何度でも)。付けなければ tokens.css で見つかったすべての範囲
//   --css, --pairs  tokens.css と組の一覧の別のファイルを使う(自己確認用。付けなくてよい)
// 終了コード: 評価したすべての組が pass なら 0、1件でも fail / missing / unsupported があれば 1。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const VAR = /^var\(\s*--([A-Za-z0-9_-]+)\s*\)$/;
const ROOT_SELECTOR = /^:root$/;
const DIRECTION_SELECTOR = /^\[data-direction="([a-z][a-z0-9-]*)"\]$/;

/**
 * tokens.css の最上位の `:root { … }` と `[data-direction="<id>"] { … }` から、
 * `--<name>: <value>;` を読む。`@theme` など、ほかのブロックは見ない。
 * 戻り値: 範囲の名前(`root`、`direction:<id>`)→ { トークン名 → 値の文字列 }。
 * `direction:<id>` は `root` の上に重ねたもの(書いていない名前は `root` の値)。
 * @param {string} css
 * @returns {Record<string, Record<string, string>>}
 */
export function parseTokenScopes(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  /** @type {Record<string, Record<string, string>>} */
  const own = {};
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open === -1) break;
    const selector = text.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") depth--;
      j++;
    }
    const body = text.slice(open + 1, j - 1);
    let scope = null;
    if (ROOT_SELECTOR.test(selector)) scope = "root";
    else {
      const m = DIRECTION_SELECTOR.exec(selector);
      if (m) scope = `direction:${m[1]}`;
    }
    if (scope) {
      own[scope] ??= {};
      for (const decl of body.split(";")) {
        const colon = decl.indexOf(":");
        if (colon === -1) continue;
        const name = decl.slice(0, colon).trim();
        if (!name.startsWith("--")) continue;
        own[scope][name.slice(2)] = decl.slice(colon + 1).replace(/!important/, "").trim();
      }
    }
    i = j;
  }
  /** @type {Record<string, Record<string, string>>} */
  const scopes = {};
  const root = own.root ?? {};
  if (own.root) scopes.root = { ...root };
  for (const [name, values] of Object.entries(own)) {
    if (name !== "root") scopes[name] = { ...root, ...values };
  }
  return scopes;
}

/** sRGB の1成分(0〜255)を線形にする。しきい値は 0.04045。 */
function linearize(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG 2.1 のコントラスト比。丸めない。fg と bg を入れ替えても同じ。
 * @param {[number, number, number]} a
 * @param {[number, number, number]} b
 */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 命名規則から自動で作る組。`X` と `X-foreground` が両方あれば X-foreground が文字、X が背景。
 * 加えて `foreground` と `background` があれば、その組。
 * @param {string[]} tokenNames
 * @returns {{ fg: string, bg: string, min: number }[]}
 */
export function derivePairs(tokenNames) {
  const names = new Set(tokenNames);
  /** @type {{ fg: string, bg: string, min: number }[]} */
  const pairs = [];
  if (names.has("foreground") && names.has("background")) {
    pairs.push({ fg: "foreground", bg: "background", min: 4.5 });
  }
  for (const name of tokenNames) {
    if (name.endsWith("-foreground")) {
      const base = name.slice(0, -"-foreground".length);
      if (base && names.has(base)) pairs.push({ fg: name, bg: base, min: 4.5 });
    }
  }
  return pairs;
}

/**
 * トークンを不透明な RGB に解決する。16進と var() だけを受け付ける。
 * @returns {{ rgb: [number, number, number] } | { status: "missing" | "unsupported", detail: string }}
 */
function resolveColor(name, map, seen = []) {
  if (seen.includes(name)) {
    return { status: "unsupported", detail: `循環: ${[...seen, name].join(" → ")}` };
  }
  const value = map[name];
  if (value === undefined) return { status: "missing", detail: `--${name} が無い` };
  const ref = VAR.exec(value);
  if (ref) return resolveColor(ref[1], map, [...seen, name]);
  const hex = HEX.exec(value);
  if (!hex) return { status: "unsupported", detail: `--${name}: ${value}(不透明な16進だけ使える)` };
  let h = hex[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return { rgb: [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)) };
}

/**
 * 組を評価する。合否は ratio >= min(丸めた値で比べない。4.499 は失敗)。
 * 同じ fg・bg の組が auto と list の両方にあれば、min の大きいほうを1件として扱う。
 * @param {string} css tokens.css の文字列
 * @param {{ fg: string, bg: string, min: number, use?: string }[]} pairs 明示の一覧
 * @param {{ scopes?: string[] }} [options]
 * @returns {{ scope: string, fg: string, bg: string, min: number, ratio: number | null,
 *   status: "pass" | "fail" | "missing" | "unsupported", source: "auto" | "list", use: string, detail?: string }[]}
 */
export function evaluate(css, pairs, options = {}) {
  const scopes = parseTokenScopes(css);
  const names = options.scopes ?? Object.keys(scopes);
  const results = [];
  for (const scope of names) {
    const map = scopes[scope];
    if (!map) throw new Error(`範囲 ${scope} が tokens.css に無い(あるのは ${Object.keys(scopes).join(", ")})`);
    /** @type {Map<string, { fg: string, bg: string, min: number, source: "auto" | "list", use: string }>} */
    const merged = new Map();
    const add = (p, source) => {
      const key = `${p.fg}\u0000${p.bg}`;
      const prev = merged.get(key);
      if (!prev || p.min > prev.min || (p.min === prev.min && source === "list")) {
        merged.set(key, { fg: p.fg, bg: p.bg, min: p.min, source, use: p.use ?? prev?.use ?? "" });
      } else if (!prev.use && p.use) {
        prev.use = p.use;
      }
    };
    for (const p of derivePairs(Object.keys(map))) add(p, "auto");
    for (const p of pairs) add(p, "list");
    for (const p of merged.values()) {
      const fg = resolveColor(p.fg, map);
      const bg = resolveColor(p.bg, map);
      const bad = [fg, bg].find((x) => "status" in x);
      if (bad && "status" in bad) {
        const status = [fg, bg].some((x) => "status" in x && x.status === "unsupported") ? "unsupported" : "missing";
        results.push({ scope, ...p, ratio: null, status, detail: bad.detail });
        continue;
      }
      const ratio = contrastRatio(/** @type {any} */ (fg).rgb, /** @type {any} */ (bg).rgb);
      results.push({ scope, ...p, ratio, status: ratio >= p.min ? "pass" : "fail" });
    }
  }
  return results;
}

/** 小数第2位で切り捨てて表示する(4.496 を 4.50 と見せない)。 */
export function formatRatio(ratio) {
  if (ratio === null) return "-";
  return (Math.floor(ratio * 100 + 1e-9) / 100).toFixed(2);
}

/** 結果を Markdown の表にする。 */
export function formatTable(results) {
  const rows = results.map((r) =>
    [
      r.scope,
      `\`${r.fg}\``,
      `\`${r.bg}\``,
      formatRatio(r.ratio),
      String(r.min),
      r.status === "pass" ? "pass" : `**${r.status.toUpperCase()}**${r.detail ? `(${r.detail})` : ""}`,
      r.source,
      r.use,
    ].join(" | "),
  );
  return [
    "| 範囲 | 文字 | 背景 | 比 | 基準 | 結果 | 出どころ | 用途 |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r} |`),
  ].join("\n");
}

function main(argv) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const args = argv.slice(2);
  const opt = (name) => args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
  const cssPath = opt("css")[0] ?? path.join(here, "..", "src", "styles", "tokens.css");
  const pairsPath = opt("pairs")[0] ?? path.join(here, "..", "src", "styles", "contrast-pairs.json");
  const scopes = opt("scope");
  const css = fs.readFileSync(cssPath, "utf8");
  const { pairs } = JSON.parse(fs.readFileSync(pairsPath, "utf8"));
  const results = evaluate(css, pairs, scopes.length ? { scopes } : {});
  console.log(formatTable(results));
  const failed = results.filter((r) => r.status !== "pass");
  const byScope = new Map();
  for (const r of results) {
    const cur = byScope.get(r.scope) ?? { text: Infinity, nonText: Infinity };
    if (r.ratio !== null) {
      const key = r.min >= 4.5 ? "text" : "nonText";
      cur[key] = Math.min(cur[key], r.ratio);
    }
    byScope.set(r.scope, cur);
  }
  console.log("");
  for (const [scope, m] of byScope) {
    console.log(
      `${scope}: 最小の比 本文(基準 4.5)${formatRatio(m.text === Infinity ? null : m.text)} / 非テキスト(基準 3)${formatRatio(m.nonText === Infinity ? null : m.nonText)}`,
    );
  }
  console.log(
    failed.length === 0
      ? `結果: ${results.length} 組すべて pass`
      : `結果: ${results.length} 組のうち ${failed.length} 組が pass でない`,
  );
  return failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv);
}
