// Supabase の URL と公開用キーを環境変数にして、後ろのコマンドを動かす。
//   node scripts/supabase-env.mjs -- <コマンド…>
// 1. NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY が両方あれば、そのまま使う(CI、本番向けのビルド)
// 2. 無ければ `supabase status -o json` から、ローカルの Supabase の値を取り出す(ローカル)
// 3. どちらも無ければ、案内を出して終了コード 1
// 値を画面・ログに出さない。.env 系のファイルを読まない・作らない(30_architecture.md D-11、CLAUDE.md §1・§11)。
// ローカルの値を使ったときは、検査用に SUPABASE_SECRET_KEY_CHECK(ローカルの秘密のキー)も子のプロセスだけに渡す(check-client-secrets.mjs が使う)。
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
export const KEY_VAR = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
export const SECRET_CHECK_VAR = "SUPABASE_SECRET_KEY_CHECK";

/**
 * 値の選び方(純粋な関数)。
 * @param {Record<string, string | undefined>} env
 * @param {Record<string, unknown> | null} status `supabase status -o json` の結果(無ければ null)
 * @returns {{ source: "env" | "local", vars: Record<string, string> } | null}
 */
export function selectSupabaseEnv(env, status) {
  if (env[URL_VAR] && env[KEY_VAR]) {
    return { source: "env", vars: { [URL_VAR]: env[URL_VAR], [KEY_VAR]: env[KEY_VAR] } };
  }
  const str = (v) => (typeof v === "string" && v !== "" ? v : undefined);
  const url = str(status?.API_URL);
  // 新しい形式の公開用キーを第一に、無ければ古い形式(anon)
  const key = str(status?.PUBLISHABLE_KEY) ?? str(status?.ANON_KEY);
  if (url && key) {
    const vars = { [URL_VAR]: url, [KEY_VAR]: key };
    const secret = str(status?.SECRET_KEY) ?? str(status?.SERVICE_ROLE_KEY);
    if (secret) vars[SECRET_CHECK_VAR] = secret;
    return { source: "local", vars };
  }
  return null;
}

export const MISSING_MESSAGE =
  "Supabase の URL と公開用キーがありません。ローカルなら `npm run db:start`、CI ならリポジトリの Variables(SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY)を確かめてください。";

function readLocalStatus(root) {
  const bin = path.join(root, "node_modules", ".bin", "supabase");
  const r = spawnSync(bin, ["status", "-o", "json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    return JSON.parse(r.stdout.slice(r.stdout.indexOf("{"), r.stdout.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
}

function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const sep = argv.indexOf("--");
  const command = sep === -1 ? [] : argv.slice(sep + 1);
  if (command.length === 0) {
    console.error("使い方: node scripts/supabase-env.mjs -- <コマンド…>");
    return 2;
  }
  // 環境にあれば、ローカルの Supabase の状態は読まない
  const fromEnv = selectSupabaseEnv(process.env, null);
  const chosen = fromEnv ?? selectSupabaseEnv(process.env, readLocalStatus(root));
  if (!chosen) {
    console.error(MISSING_MESSAGE);
    return 1;
  }
  console.error(`[supabase-env] ${chosen.source === "env" ? "環境変数" : "ローカルの Supabase"} の値を使います(値は表示しません)`);
  const r = spawnSync(command[0], command.slice(1), {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...chosen.vars },
  });
  if (r.error) {
    console.error(`コマンドを実行できませんでした: ${r.error.message}`);
    return 1;
  }
  return r.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
