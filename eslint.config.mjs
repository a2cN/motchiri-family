import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import betterTailwind from "eslint-plugin-better-tailwindcss";

// 静的書き出し(output: 'export')では使えない Next.js の機能と、色などの直書きを止める。
// 根拠: ADR 0001(サーバー専用機能の禁止)、ADR 0005 決定 1・2(トークンだけ、ライトモードのみ)、
// 30_architecture.md D-11・D-12・D-19。規則が黙って無効にならないことは tests/guardrails/ が毎回確かめる。

const ADR_0001 = "ADR 0001: 静的書き出しでは使えない";

// TS・TSX の文字列に含まれる色の値(#fff、rgb(...)、oklch(...) など)
const HEX_COLOR = String.raw`#[0-9a-fA-F]{3,8}\b`;
const COLOR_FUNCTION = String.raw`\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(`;

const colorMessage =
  "色の値は src/styles/tokens.css だけに書く。トークンのクラス(bg-primary など)を使う(ADR 0005 決定 1、UI-02)";

// 新規登録・パスワードの再設定などを呼ぶコードの禁止(PT-02、30_architecture.md D-16)。
// 家族のアカウントは人間が管理画面で作る。名前を変えた呼び出しはすり抜けうるので、@supabase/supabase-js の import を src/lib/supabase/ に限ることで補う。
const PT02 = "PT-02: 新規登録・再設定などの経路を作らない。アカウントは人間が管理画面で作る";
const authCalls = [
  "signUp",
  "signInWithOtp",
  "signInWithOAuth",
  "signInAnonymously",
  "signInWithIdToken",
  "signInWithSSO",
  "resetPasswordForEmail",
].map((name) => ({
  selector: `CallExpression[callee.property.name='${name}']`,
  message: `${name}() は呼べない。${PT02}`,
}));
const authAdmin = {
  selector: "MemberExpression[property.name='admin'][object.property.name='auth']",
  message: `auth.admin は使えない(管理用の API はブラウザに置かない)。${PT02}`,
};

const useServer = {
  selector: "ExpressionStatement[directive='use server']",
  message: `'use server'(Server Actions)は使えない。${ADR_0001}`,
};
const forceDynamic = {
  selector:
    "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name='dynamic'][init.value='force-dynamic']",
  message: `dynamic = 'force-dynamic'(リクエストに依存する描画)は使えない。${ADR_0001}`,
};
const revalidate = {
  selector:
    "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name='revalidate']",
  message: `revalidate(ISR)は使えない。${ADR_0001}`,
};
const colorLiteral = [HEX_COLOR, COLOR_FUNCTION].flatMap((re) => [
  { selector: `Literal[value=/${re}/]`, message: colorMessage },
  { selector: `TemplateElement[value.raw=/${re}/]`, message: colorMessage },
]);
const forbiddenFile = {
  selector: "Program",
  message: `このファイルは置けない(Route Handler、Middleware、Proxy)。${ADR_0001}。manifest は manifest.ts(メタデータのファイル)で作る`,
};

const supabaseImport = {
  name: "@supabase/supabase-js",
  message: "@supabase/supabase-js を import してよいのは src/lib/supabase/ だけ(30_architecture.md D-16)",
};

const serverImports = {
  paths: [
    {
      name: "next/headers",
      message: `cookies・headers・draftMode は使えない。${ADR_0001}`,
    },
    {
      name: "next/server",
      message: `NextRequest・NextResponse は Route Handler と Proxy のためのもの。${ADR_0001}`,
    },
    {
      name: "next/cache",
      message: `revalidate 系(ISR)は使えない。${ADR_0001}`,
    },
  ],
};

// no-restricted-syntax は、同じファイルに当たる複数の設定ブロックで「上書き」になる(足し算にならない)。
// そのため、ファイルの種類ごとに、そこに当てる全部の selector をまとめて1ブロックにする。
const base = [useServer, ...colorLiteral, ...authCalls, authAdmin];
const appOnly = [forceDynamic, revalidate];

const colorTokenClasses = [
  "bg",
  "text",
  "border(-[xytrblse])?",
  "ring",
  "outline",
  "fill",
  "stroke",
  "from",
  "via",
  "to",
  "decoration",
  "accent",
  "caret",
  "divide",
  "shadow",
  "rounded(-[a-z]{1,2})?",
  "p[xytrblse]?",
  "m[xytrblse]?",
  "gap(-[xy])?",
  "space-[xy]",
  "inset(-[xy])?",
  "top",
  "right",
  "bottom",
  "left",
].join("|");

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "e2e-artifacts/**",
    ".playwright-browsers/**",
    // supabase gen types の生成物(npm run db:types)
    "src/lib/supabase/database.types.ts",
  ]),

  // サーバー専用の機能(D-11)
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { paths: [...serverImports.paths, supabaseImport] }],
      "no-restricted-syntax": ["error", ...base],
    },
  },
  // Supabase を使ってよい場所(src/lib/supabase/)。サーバー専用の import の禁止は残す
  {
    files: ["src/lib/supabase/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", serverImports],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...base, ...appOnly],
    },
  },
  // 色の直書きの検査は、テストのファイルには当てない(違反の例を文字列で持つことがあるため)
  {
    files: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", useServer],
    },
  },
  // そのファイルが存在すること自体を止める(Route Handler、Middleware、Proxy)
  {
    files: [
      "src/middleware.{ts,js,mjs}",
      "src/proxy.{ts,js,mjs}",
      "middleware.{ts,js,mjs}",
      "proxy.{ts,js,mjs}",
      "src/app/**/route.{ts,tsx,js,mjs}",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...base, ...appOnly, forbiddenFile],
    },
  },

  // Tailwind のクラス(D-12、D-19)
  {
    files: ["src/**/*.tsx"],
    plugins: { "better-tailwindcss": betterTailwind },
    settings: {
      "better-tailwindcss": { entryPoint: "src/app/globals.css" },
    },
    rules: {
      "better-tailwindcss/no-unknown-classes": "error",
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            {
              pattern: String.raw`(^|:)dark:`,
              message: "dark: は使わない。ライトモードのみ(ADR 0005 決定 2、UI-01)",
            },
            {
              pattern: String.raw`(^|:)!?-?(${colorTokenClasses})-\[`,
              message:
                "色・角の丸み・影・余白の任意値は使わない。トークンのクラスを使う(ADR 0005 決定 1、UI-02)",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
