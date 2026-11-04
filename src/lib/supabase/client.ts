import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// ブラウザ用の Supabase クライアントを1つだけ作る(30_architecture.md Interfaces §5)。
// 最初に呼ばれたときに作る。モジュールの読み込み時には作らない(静的書き出しのビルドで、サーバー側の描画に localStorage が無いため)。
// 呼んでよいのは、ブラウザでの effect・イベントの中だけ。
// URL と公開用キーはビルドのときに埋め込まれる。公開される値(ADR 0002)。コードにも .env にも書かない。
let client: SupabaseClient<Database> | undefined;

export function getSupabase(): SupabaseClient<Database> {
  if (client) return client;
  // process.env.NEXT_PUBLIC_… は、このままの形で書く(Next.js が埋め込むのはこの形だけ)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase の URL と公開用キーがビルドに埋め込まれていません(npm run build は scripts/supabase-env.mjs を通す)");
  }
  client = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // URL からセッションを読む方式は使わない
      detectSessionInUrl: false,
    },
  });
  return client;
}
