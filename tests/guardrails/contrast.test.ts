import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, derivePairs, evaluate, formatRatio, parseTokenScopes } from "../../scripts/contrast.mjs";

// コントラストの検査の道具の自己テスト(30_architecture.md §1「テスト」の自己テスト 1〜8)。
// 測った数字を人間が見る前に、道具が正しいことを示す。実際の tokens.css に対するゲートは 50 で作る(D-05)。

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

describe("contrastRatio", () => {
  it("1: 黒/白 = 21、白/白 = 1、fg と bg を入れ替えても同じ", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 10);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBe(1);
    expect(contrastRatio(hex("#4a3428"), hex("#fff8f0"))).toBe(contrastRatio(hex("#fff8f0"), hex("#4a3428")));
  });

  it("2: #767676/#ffffff は 4.5 を満たし(4.54)、#777777/#ffffff は満たさない(4.47)。境目で丸めない", () => {
    const pass = contrastRatio(hex("#767676"), hex("#ffffff"));
    const fail = contrastRatio(hex("#777777"), hex("#ffffff"));
    expect(pass).toBeGreaterThanOrEqual(4.5);
    expect(formatRatio(pass)).toBe("4.54");
    expect(fail).toBeLessThan(4.5);
    expect(formatRatio(fail)).toBe("4.47");
  });

  it("3: 足場の値の回帰。#4a3428/#fff8f0 が 10.99 以上 11.00 未満", () => {
    const r = contrastRatio(hex("#4a3428"), hex("#fff8f0"));
    expect(r).toBeGreaterThanOrEqual(10.99);
    expect(r).toBeLessThan(11);
    expect(formatRatio(contrastRatio(hex("#7a5e4e"), hex("#fff8f0")))).toBe("5.63");
    expect(formatRatio(contrastRatio(hex("#4a3428"), hex("#f6b98a")))).toBe("6.74");
    expect(formatRatio(contrastRatio(hex("#b8682f"), hex("#fff8f0")))).toBe("3.94");
  });

  it("表示は切り捨てる(4.496 を 4.50 と見せない)", () => {
    expect(formatRatio(4.496)).toBe("4.49");
    expect(formatRatio(4.5)).toBe("4.50");
    expect(formatRatio(null)).toBe("-");
  });
});

describe("parseTokenScopes と evaluate", () => {
  const css = `
    /* コメント :root { --background: #000000; } */
    :root { --foreground: #000000; --background: #ffffff; --card: #ffffff; --card-foreground: var(--foreground); }
    @theme inline { --color-foreground: var(--foreground); }
    [data-direction="x"] { --foreground: #777777; --extra: #123456; --extra-foreground: #ffffff; }
  `;

  it("最上位の :root と [data-direction] だけを読み、@theme とコメントは見ない", () => {
    const scopes = parseTokenScopes(css);
    expect(Object.keys(scopes).sort()).toEqual(["direction:x", "root"]);
    expect(scopes.root.foreground).toBe("#000000");
    expect(scopes.root["color-foreground"]).toBeUndefined();
  });

  it("6: direction:<id> が root を上書きし、書いていない名前は root を使う", () => {
    const scopes = parseTokenScopes(css);
    expect(scopes["direction:x"].foreground).toBe("#777777");
    expect(scopes["direction:x"].background).toBe("#ffffff");
    const results = evaluate(css, [{ fg: "foreground", bg: "background", min: 4.5 }], { scopes: ["direction:x"] });
    const fb = results.find((r) => r.fg === "foreground" && r.bg === "background");
    expect(fb?.ratio).toBeCloseTo(4.478, 2);
    expect(fb?.status).toBe("fail");
    const rootResult = evaluate(css, [{ fg: "foreground", bg: "background", min: 4.5 }], { scopes: ["root"] });
    expect(rootResult.find((r) => r.fg === "foreground")?.status).toBe("pass");
  });

  it("4: var() を同じ範囲で解決する。循環は失敗にする", () => {
    const ok = evaluate(css, [], { scopes: ["root"] });
    const cardPair = ok.find((r) => r.fg === "card-foreground");
    expect(cardPair?.status).toBe("pass");
    expect(cardPair?.ratio).toBeCloseTo(21, 5);

    const loop = evaluate(`:root { --a: var(--b); --b: var(--a); --c: #ffffff; }`, [{ fg: "a", bg: "c", min: 4.5 }]);
    expect(loop[0].status).toBe("unsupported");
  });

  it("5: 組に使うトークンが無ければ missing、oklch() と透明度つきの16進は unsupported(どれも失敗)", () => {
    const base = `:root { --bg: #ffffff; --fg-oklch: oklch(0.2 0 0); --fg-alpha: #000000cc; --fg-rgb: rgb(0 0 0); }`;
    const results = evaluate(base, [
      { fg: "nothing", bg: "bg", min: 4.5 },
      { fg: "fg-oklch", bg: "bg", min: 4.5 },
      { fg: "fg-alpha", bg: "bg", min: 4.5 },
      { fg: "fg-rgb", bg: "bg", min: 4.5 },
    ]);
    expect(results.map((r) => r.status)).toEqual(["missing", "unsupported", "unsupported", "unsupported"]);
    expect(results.every((r) => r.ratio === null)).toBe(true);
  });

  it("3桁の16進を読む", () => {
    const r = evaluate(`:root { --f: #000; --b: #fff; }`, [{ fg: "f", bg: "b", min: 4.5 }]);
    expect(r[0].status).toBe("pass");
    expect(r[0].ratio).toBeCloseTo(21, 5);
  });

  it("auto と list の両方にある組は、min の大きいほうを1件として扱う", () => {
    const tokens = `:root { --foreground: #777777; --background: #ffffff; }`;
    const results = evaluate(tokens, [{ fg: "foreground", bg: "background", min: 3, use: "大きい文字" }]);
    expect(results).toHaveLength(1);
    expect(results[0].min).toBe(4.5);
    expect(results[0].source).toBe("auto");
    expect(results[0].status).toBe("fail");
  });

  it("存在しない範囲を指定したらエラー", () => {
    expect(() => evaluate(css, [], { scopes: ["direction:nai"] })).toThrow();
  });
});

describe("derivePairs", () => {
  it("7: X/X-foreground と foreground/background の組を作る", () => {
    const pairs = derivePairs(["background", "foreground", "card", "card-foreground", "ok", "ok-foreground", "ring", "orphan-foreground"]);
    expect(pairs).toEqual([
      { fg: "foreground", bg: "background", min: 4.5 },
      { fg: "card-foreground", bg: "card", min: 4.5 },
      { fg: "ok-foreground", bg: "ok", min: 4.5 },
    ]);
  });
});

describe("わざと AA 未満の組", () => {
  // 計画の「わざと AA 未満の組を入れて失敗する」の機械による証明
  const deliberately = `
    :root { --background: #ffffff; --foreground: #000000; --pale: #cccccc; --pale-foreground: #ffffff; --line: #eeeeee; }
  `;

  it("8: 本文の組で AA 未満(#ffffff の文字が #cccccc の地の上)は fail を返す", () => {
    const results = evaluate(deliberately, []);
    const bad = results.find((r) => r.fg === "pale-foreground" && r.bg === "pale");
    expect(bad?.status).toBe("fail");
    expect(bad?.ratio).toBeLessThan(4.5);
    const good = results.find((r) => r.fg === "foreground" && r.bg === "background");
    expect(good?.status).toBe("pass");
  });

  it("8b: 非テキストの基準 3 にも届かない組(#eeeeee の線が #ffffff の地の上)は fail を返す", () => {
    const results = evaluate(deliberately, [{ fg: "line", bg: "background", min: 3, use: "非テキスト: 線" }]);
    const bad = results.find((r) => r.fg === "line");
    expect(bad?.status).toBe("fail");
    expect(bad?.ratio).toBeLessThan(3);
  });

  it("8c: CLI は、AA 未満の組を含む tokens.css で終了コード 1、通る tokens.css で 0", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "contrast-"));
    try {
      const script = path.resolve(__dirname, "..", "..", "scripts", "contrast.mjs");
      const pairs = path.join(dir, "pairs.json");
      writeFileSync(pairs, JSON.stringify({ pairs: [] }));
      const badCss = path.join(dir, "bad.css");
      writeFileSync(badCss, deliberately);
      const bad = spawnSync("node", [script, `--css=${badCss}`, `--pairs=${pairs}`], { encoding: "utf8" });
      expect(bad.status).toBe(1);
      expect(bad.stdout).toContain("**FAIL**");

      const goodCss = path.join(dir, "good.css");
      writeFileSync(goodCss, `:root { --background: #ffffff; --foreground: #000000; }`);
      const good = spawnSync("node", [script, `--css=${goodCss}`, `--pairs=${pairs}`], { encoding: "utf8" });
      expect(good.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
