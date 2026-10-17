import path from "node:path";
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";

// CSS の色の直書きの禁止(D-12)の自己テスト。違反の例は文字列として持つ。

const root = path.resolve(__dirname, "..", "..");

async function warnings(code: string, filePath: string) {
  const result = await stylelint.lint({
    code,
    codeFilename: path.join(root, filePath),
    configFile: path.join(root, "stylelint.config.mjs"),
  });
  return result.results.flatMap((r) => r.warnings);
}

describe("CSS の色の直書きの禁止", () => {
  it("G10: 16進の色", async () => {
    const w = await warnings(".x { color: #ffcc99; }\n", "src/app/x.css");
    expect(w.map((x) => x.rule)).toContain("color-no-hex");
  });

  it("G11: 色の関数 oklch", async () => {
    const w = await warnings(".x { color: oklch(0.9 0.05 60); }\n", "src/app/x.css");
    expect(w.map((x) => x.rule)).toContain("function-disallowed-list");
  });

  it("G11b: 色の名前 red", async () => {
    const w = await warnings(".x { color: red; }\n", "src/app/x.css");
    expect(w.map((x) => x.rule)).toContain("color-named");
  });

  it("G12: tokens.css は例外(同じ値でも失敗しない)", async () => {
    const w = await warnings(
      ":root { --a: oklch(0.9 0.05 60); --b: #ffcc99; --c: rgb(1 2 3); }\n",
      "src/styles/tokens.css",
    );
    expect(w).toEqual([]);
  });

  it("対照: トークンの参照と Tailwind v4 のルールは通る", async () => {
    const w = await warnings(
      '@import "tailwindcss";\n@theme inline { --color-x: var(--x); }\n@utility pb-safe { padding-bottom: 1rem; }\n.x { color: var(--foreground); outline: 2px solid var(--ring); }\n',
      "src/app/x.css",
    );
    expect(w).toEqual([]);
  });
});
