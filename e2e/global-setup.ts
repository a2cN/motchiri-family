import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

// E2E の前に、ローカルの Supabase にテストの利用者と世帯を作る(30_architecture.md Interfaces §8)。
//   世帯 A: A1・A2 / 世帯 B: B1 / 世帯に結びつけない: U0
// メールは e2e-…@example.com(架空)、パスワードは実行のたびの乱数。ローカルの秘密のキーはこのプロセスのメモリの中だけ(ファイルにもログにも出さない)。
// 値は環境変数でテストのワーカーに渡す(E2E_…)。ローカル(127.0.0.1)以外には、何もしない。
const root = path.resolve(__dirname, "..");
const supabaseBin = path.join(root, "node_modules", ".bin", "supabase");

function cli(args: string[]) {
  return execFileSync(supabaseBin, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function parseJson(text: string) {
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

function sql(query: string): Record<string, unknown>[] {
  const text = cli(["db", "query", "--local", query]);
  // 行を返さない文(delete、insert)は、JSON ではなく件数の文字列が返る
  return text.includes("{") ? (parseJson(text).rows ?? []) : [];
}

export default async function globalSetup() {
  const status = parseJson(cli(["status", "-o", "json"]));
  const apiUrl: string = status.API_URL;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(apiUrl)) {
    throw new Error("E2E のテストの利用者は、ローカルの Supabase にだけ作る");
  }
  const publishableKey: string = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  // 管理用の API には、古い形式(JWT)のキーを使う。このプロセスのメモリの中だけ
  const adminKey: string = status.SERVICE_ROLE_KEY;

  // 前の実行の残りを消す(npm run e2e は先に db reset するが、手で playwright test だけを動かしたときのため)
  sql("delete from auth.users where email like 'e2e-%@example.com'");
  sql("delete from public.household as h where not exists (select 1 from public.member as m where m.household_id = h.id)");

  const password = `pw-${randomUUID()}`;
  const emails = {
    A1: "e2e-a1@example.com",
    A2: "e2e-a2@example.com",
    B1: "e2e-b1@example.com",
    U0: "e2e-u0@example.com",
  } as const;

  const ids: Record<string, string> = {};
  for (const [who, email] of Object.entries(emails)) {
    const res = await fetch(`${apiUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: adminKey, authorization: `Bearer ${adminKey}` },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`テストの利用者 ${who} を作れませんでした(HTTP ${res.status})`);
    ids[who] = (await res.json()).id;
  }

  // service_role には GRANT が無いので(Data Model)、世帯とメンバーは SQL で作る
  const householdA = String(sql("insert into public.household default values returning id")[0].id);
  const householdB = String(sql("insert into public.household default values returning id")[0].id);
  sql(
    `insert into public.member (user_id, household_id) values ('${ids.A1}', '${householdA}'), ('${ids.A2}', '${householdA}'), ('${ids.B1}', '${householdB}')`,
  );

  process.env.E2E_SUPABASE_URL = apiUrl;
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY = publishableKey;
  process.env.E2E_PASSWORD = password;
  process.env.E2E_HOUSEHOLD_A_ID = householdA;
  for (const [who, email] of Object.entries(emails)) process.env[`E2E_${who}_EMAIL`] = email;
}
