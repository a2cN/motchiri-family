import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// migration の静的な検査(30_architecture.md Interfaces §3)。Docker の無い場所(CI の verify など)でも動く補助の網。
// 正しさの本体は supabase/tests/ の DB のテスト(実際のカタログを見る)。

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)`;
const QUALIFIED = String.raw`${IDENT}\s*\.\s*${IDENT}`;

const norm = (s: string) => s.replace(/"/g, "").replace(/\s*\.\s*/g, ".").toLowerCase();

// コメント(-- … と /* … */)を除く
function stripComments(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** 違反の説明の一覧を返す。空なら通る。 */
export function checkMigration(rawSql: string): string[] {
  const sql = stripComments(rawSql);
  const problems: string[] = [];

  // スキーマ無しの create table
  const bare = new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(${IDENT})\s*(?:\(|as\b)`, "gi");
  for (const m of sql.matchAll(bare)) problems.push(`スキーマ無しの create table: ${m[1]}`);

  const creates = new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(${QUALIFIED})`, "gi");
  for (const m of sql.matchAll(creates)) {
    const table = norm(m[1]);
    const rls = new RegExp(String.raw`alter\s+table\s+(?:only\s+)?(${QUALIFIED})\s+enable\s+row\s+level\s+security`, "gi");
    const hasRls = [...sql.matchAll(rls)].some((x) => norm(x[1]) === table);
    if (!hasRls) problems.push(`${table}: enable row level security が無い`);

    const revokes = [...sql.matchAll(new RegExp(String.raw`revoke\s+[^;]*?\s+on\s+(?:table\s+)?(${QUALIFIED})\s+from\s+([^;]*);`, "gi"))];
    const revoked = revokes.filter((x) => norm(x[1]) === table).map((x) => x[2].toLowerCase());
    const hasAnon = revoked.some((r) => /\banon\b/.test(r));
    const hasAuthenticated = revoked.some((r) => /\bauthenticated\b/.test(r));
    if (!hasAnon || !hasAuthenticated) problems.push(`${table}: anon と authenticated の両方からの revoke が無い`);
  }

  if (/alter\s+default\s+privileges/i.test(sql)) problems.push("alter default privileges は使わない");
  if (/grant\s+[^;]*?\s+to\s+[^;]*\banon\b/i.test(sql)) problems.push("anon への grant は書かない");
  return problems;
}

const GOOD = `
create table public.thing (id uuid primary key);
alter table public.thing enable row level security;
revoke all on table public.thing from public, anon, authenticated;
grant select on table public.thing to authenticated;
`;

describe("migration の静的な検査(自己テスト)", () => {
  it("正しい SQL は通る", () => {
    expect(checkMigration(GOOD)).toEqual([]);
  });
  it("大文字小文字・引用符・空白の違いは許す", () => {
    const sql = `CREATE TABLE "public"."thing" (id int);
ALTER TABLE public . thing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."thing" FROM PUBLIC, ANON, AUTHENTICATED;`;
    expect(checkMigration(sql)).toEqual([]);
  });
  it("RLS の行が無い SQL は失敗する", () => {
    expect(checkMigration(GOOD.replace(/alter table[^;]*;/, ""))).toEqual([
      "public.thing: enable row level security が無い",
    ]);
  });
  it("revoke の無い SQL は失敗する", () => {
    expect(checkMigration(GOOD.replace(/revoke[^;]*;/, ""))).toEqual([
      "public.thing: anon と authenticated の両方からの revoke が無い",
    ]);
  });
  it("authenticated からの revoke だけ(anon が無い)でも失敗する", () => {
    expect(checkMigration(GOOD.replace("public, anon, authenticated", "authenticated")).length).toBe(1);
  });
  it("スキーマ無しの create table は失敗する", () => {
    expect(checkMigration("create table thing (id int);")).toContain("スキーマ無しの create table: thing");
  });
  it("grant … to anon は失敗する", () => {
    expect(checkMigration(`${GOOD}\ngrant select on table public.thing to anon;`)).toContain("anon への grant は書かない");
  });
  it("alter default privileges は失敗する", () => {
    expect(
      checkMigration(`${GOOD}\nalter default privileges in schema public revoke all on tables from anon;`),
    ).toContain("alter default privileges は使わない");
  });
  it("コメントの中の記述では誤って失敗しない", () => {
    expect(checkMigration(`-- grant select to anon はしない\n${GOOD}`)).toEqual([]);
  });
});

describe("supabase/migrations/ の実物", () => {
  const files = fs.existsSync(MIGRATIONS_DIR) ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")) : [];

  it("migration が1つ以上ある", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s は決まりを守っている", (file) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    expect(checkMigration(sql)).toEqual([]);
  });

  it.each(files)("%s に、取り消しの SQL が supabase/ops/rollback/ に同じ名前である", (file) => {
    expect(fs.existsSync(path.resolve(MIGRATIONS_DIR, "../ops/rollback", file))).toBe(true);
  });

  it.each(files)("%s に、メールアドレスらしい文字列が無い", (file) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    expect(sql).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });

  it.each(files)("%s に begin / commit が無い(CLI が包む)", (file) => {
    const sql = stripComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    expect(sql).not.toMatch(/^\s*(begin|commit)\s*;/im);
  });
});
