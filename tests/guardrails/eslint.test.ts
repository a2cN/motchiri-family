import path from "node:path";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// ガードレール(CLAUDE.md §7)が、将来の設定の変更で黙って無効にならないことを確かめる自己テスト。
// 違反の例はこのファイルの文字列として持つ。src/ の下には置かない(30_architecture.md D-20)。

const root = path.resolve(__dirname, "..", "..");
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: root });
});

async function errors(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, filePath) });
  return result.messages.filter((m) => m.severity === 2);
}

function ruleIds(messages: { ruleId: string | null }[]) {
  return messages.map((m) => m.ruleId);
}

describe("サーバー専用の Next.js 機能の禁止(D-11)", () => {
  it("G1: next/headers の import", async () => {
    const m = await errors(
      `import { cookies } from "next/headers";\nexport const c = cookies;\n`,
      "src/app/x/page.tsx",
    );
    expect(ruleIds(m)).toContain("no-restricted-imports");
  });

  it("G1b: next/server の import", async () => {
    const m = await errors(
      `import { NextResponse } from "next/server";\nexport const r = NextResponse;\n`,
      "src/app/x/page.tsx",
    );
    expect(ruleIds(m)).toContain("no-restricted-imports");
  });

  it("G1c: next/cache の import", async () => {
    const m = await errors(
      `import { revalidatePath } from "next/cache";\nexport const r = revalidatePath;\n`,
      "src/app/x/page.tsx",
    );
    expect(ruleIds(m)).toContain("no-restricted-imports");
  });

  it("G2: ファイルの先頭の 'use server'", async () => {
    const m = await errors(
      `"use server";\nexport async function act() {}\n`,
      "src/app/x/actions.ts",
    );
    expect(m.some((x) => x.ruleId === "no-restricted-syntax" && x.message.includes("use server"))).toBe(true);
  });

  it("G3: 関数の中の 'use server'", async () => {
    const m = await errors(
      `export default function Page() {\n  async function act() {\n    "use server";\n  }\n  return null;\n}\n`,
      "src/app/x/page.tsx",
    );
    expect(m.some((x) => x.ruleId === "no-restricted-syntax" && x.message.includes("use server"))).toBe(true);
  });

  it("G4: 中身のある route.ts(Route Handler)", async () => {
    const m = await errors(
      `export function GET() {\n  return new Response("x");\n}\n`,
      "src/app/api/x/route.ts",
    );
    expect(m.some((x) => x.ruleId === "no-restricted-syntax" && x.message.includes("Route Handler"))).toBe(true);
  });

  it.each(["src/proxy.ts", "src/middleware.ts"])("G5: %s(Proxy / Middleware)", async (file) => {
    const m = await errors(`export function proxy() {}\n`, file);
    expect(m.some((x) => x.ruleId === "no-restricted-syntax" && x.message.includes("Proxy"))).toBe(true);
  });

  it("G5b: dynamic = 'force-dynamic'", async () => {
    const m = await errors(
      `export const dynamic = "force-dynamic";\nexport default function P() {\n  return null;\n}\n`,
      "src/app/x/page.tsx",
    );
    expect(m.some((x) => x.ruleId === "no-restricted-syntax" && x.message.includes("force-dynamic"))).toBe(true);
  });

  it("G5c: revalidate(ISR)", async () => {
    const m = await errors(
      `export const revalidate = 60;\nexport default function P() {\n  return null;\n}\n`,
      "src/app/x/page.tsx",
    );
    expect(m.some((x) => x.ruleId === "no-restricted-syntax" && x.message.includes("revalidate"))).toBe(true);
  });

  it("対照: dynamic = 'force-static'(manifest で使う)は通る", async () => {
    const m = await errors(`export const dynamic = "force-static";\n`, "src/app/manifest.ts");
    expect(m).toEqual([]);
  });
});

describe("色などの直書きの禁止(D-12、D-19)", () => {
  it("G6: 任意値の色クラス bg-[#ffcc99]", async () => {
    const m = await errors(
      `export const X = () => <div className="bg-[#ffcc99]" />;\n`,
      "src/components/x.tsx",
    );
    expect(
      ruleIds(m).some((id) => id === "better-tailwindcss/no-restricted-classes" || id === "no-restricted-syntax"),
    ).toBe(true);
  });

  it("G6b: 任意値の角の丸み・影・余白", async () => {
    for (const cls of ["rounded-[7px]", "shadow-[0_1px_2px_black]", "p-[13px]"]) {
      const m = await errors(
        `export const X = () => <div className="${cls}" />;\n`,
        "src/components/x.tsx",
      );
      expect(ruleIds(m), cls).toContain("better-tailwindcss/no-restricted-classes");
    }
  });

  it("G7: Tailwind の既定の色 bg-red-500 は存在しないクラス", async () => {
    const m = await errors(
      `export const X = () => <div className="bg-red-500" />;\n`,
      "src/components/x.tsx",
    );
    expect(ruleIds(m)).toContain("better-tailwindcss/no-unknown-classes");
  });

  it("G7b: text-white / bg-white も存在しない", async () => {
    const m = await errors(
      `export const X = () => <div className="bg-white text-white" />;\n`,
      "src/components/x.tsx",
    );
    expect(ruleIds(m).filter((id) => id === "better-tailwindcss/no-unknown-classes").length).toBeGreaterThan(0);
  });

  it("G8: style 属性の色", async () => {
    const m = await errors(
      `export const X = () => <div style={{ color: "#fff" }} />;\n`,
      "src/components/x.tsx",
    );
    expect(ruleIds(m)).toContain("no-restricted-syntax");
  });

  it("G8b: TS の中の色の関数・テンプレート文字列", async () => {
    const m1 = await errors(`export const c = "oklch(0.9 0.05 60)";\n`, "src/components/x.ts");
    expect(ruleIds(m1)).toContain("no-restricted-syntax");
    const m2 = await errors("export const c = `rgb(${1} 2 3)`;\n", "src/components/x.ts");
    expect(ruleIds(m2)).toContain("no-restricted-syntax");
  });

  it("G9: dark: のクラス", async () => {
    const m = await errors(
      `export const X = () => <div className="dark:bg-background" />;\n`,
      "src/components/x.tsx",
    );
    expect(ruleIds(m)).toContain("better-tailwindcss/no-restricted-classes");
  });

  // shadcn/ui を入れたので、cn() の中のクラスも見ていることを確かめる(30_architecture.md §6、ADR 0006 決定 20 の宿題)
  it("G10: cn() の中の任意値の色(shadcn の部品の置き場所 src/components/ui/)", async () => {
    const m = await errors(
      `import { cn } from "cn";\nexport const X = ({ className }: { className?: string }) => <div className={cn("p-4", "bg-[#ffcc99]", className)} />;\n`,
      "src/components/ui/x.tsx",
    );
    expect(ruleIds(m)).toContain("better-tailwindcss/no-restricted-classes");
  });

  it("G10b: cn() の中の dark: と既定の色", async () => {
    const m = await errors(
      `import { cn } from "cn";\nexport const X = () => <div className={cn("dark:bg-background", "bg-red-500")} />;\n`,
      "src/components/ui/x.tsx",
    );
    expect(ruleIds(m)).toContain("better-tailwindcss/no-restricted-classes");
    expect(ruleIds(m)).toContain("better-tailwindcss/no-unknown-classes");
  });

  it("G10c: cva() の中の任意値の色", async () => {
    const m = await errors(
      `import { cva } from "class-variance-authority";\nexport const v = cva("p-4", { variants: { a: { x: "text-[#123456]" } } });\n`,
      "src/components/ui/x.tsx",
    );
    expect(ruleIds(m)).toContain("better-tailwindcss/no-restricted-classes");
  });

  it("G13: トークンのクラスは通る", async () => {
    const m = await errors(
      `export const X = () => <div className="bg-background text-foreground bg-primary text-primary-foreground rounded-lg shadow-card p-5 pb-safe" />;\n`,
      "src/components/x.tsx",
    );
    expect(m).toEqual([]);
  });

  it("対照: 色以外の任意値(grid-cols-[...])は通る", async () => {
    const m = await errors(
      `export const X = () => <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]" />;\n`,
      "src/components/x.tsx",
    );
    expect(m).toEqual([]);
  });
});
