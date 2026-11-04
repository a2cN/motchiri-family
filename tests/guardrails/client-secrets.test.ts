import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanProject, scanText } from "../../scripts/check-client-secrets.mjs";

// サービス用のキーの検査の自己テスト(30_architecture.md Interfaces §4)。
// 偽の秘密のキーは、テストの実行中に組み立てる(完成した文字列をソースに置くと gitleaks が反応するため)。

const fakeSecretKey = () => ["sb", "secret", "z".repeat(20)].join("_");
const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const fakeJwt = (role: string) =>
  [b64url({ alg: "HS256", typ: "JWT" }), b64url({ iss: "local", role }), "c2lnbmF0dXJl"].join(".");
const NAME = ["service", "role"].join("_");

type Result = { file: string; line: number; kind: string };
const dirs: string[] = [];

function project(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "client-secrets-"));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}
const scan = (root: string, opts: { exactSecret?: string; trackedFiles?: string[] } = {}): Result[] =>
  scanProject({ root, trackedFiles: [], ...opts });

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("サービス用のキーの検査", () => {
  it("何も無いプロジェクトは通る", () => {
    expect(scan(project({ "src/a.ts": "export const a = 1;\n", "out/index.html": "<html></html>" }))).toEqual([]);
  });

  it("src/ に、秘密のキーの形があれば失敗する(値は結果に含まれない)", () => {
    const key = fakeSecretKey();
    const results = scan(project({ "src/a.ts": `const k = "${key}";\n` }));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ file: "src/a.ts", line: 1 });
    expect(JSON.stringify(results)).not.toContain(key);
  });

  it("role が service_role の JWT は失敗し、role が anon の JWT は通る", () => {
    expect(scan(project({ "out/_next/x.js": `var k="${fakeJwt("service_role")}"` }))).toHaveLength(1);
    expect(scan(project({ "out/_next/x.js": `var k="${fakeJwt("anon")}"` }))).toEqual([]);
  });

  it("新しい形式の公開用キー(sb_publishable_…)は通る", () => {
    const pub = ["sb", "publishable", "z".repeat(20)].join("_");
    expect(scan(project({ "out/index.html": `<script>var k="${pub}"</script>` }))).toEqual([]);
  });

  it("src/ の中では service_role という語だけで失敗する(大文字小文字を問わない)", () => {
    expect(scan(project({ "src/a.ts": `// ${NAME}\n` }))).toHaveLength(1);
    expect(scan(project({ "src/a.ts": `const x = process.env.${NAME.toUpperCase()};\n` }))).toHaveLength(1);
    expect(scan(project({ "public/a.js": `${NAME}` }))).toHaveLength(1);
  });

  it("out/ の中では service_role という語だけでは失敗しない(supabase-js の配布物が含む)", () => {
    expect(scan(project({ "out/_next/chunk.js": `/* ${NAME} */ var p="sb_secret_"` }))).toEqual([]);
  });

  it("管理下のファイルに値の形があれば失敗する(名前だけなら通る)", () => {
    const root = project({ "docs/note.md": `${fakeSecretKey()}\n`, "docs/word.md": `${NAME}\n` });
    const results = scan(root, { trackedFiles: ["docs/note.md", "docs/word.md"] });
    expect(results.map((r) => r.file)).toEqual(["docs/note.md"]);
  });

  it("環境変数 SUPABASE_SECRET_KEY_CHECK の値そのものが成果物にあれば失敗する", () => {
    const secret = "local-secret-value-for-test-0123456789";
    expect(scan(project({ "out/a.js": `var k="${secret}"` }), { exactSecret: secret })).toHaveLength(1);
    expect(scan(project({ "out/a.js": `var k="other"` }), { exactSecret: secret })).toEqual([]);
  });

  it("scanText は行の番号と種類だけを返す", () => {
    const found = scanText(`a\nb ${fakeSecretKey()}\n`, { checkName: false });
    expect(found).toEqual([{ line: 2, kind: "秘密のキー(sb_secret_…)の形" }]);
  });
});
