import { execFileSync } from "node:child_process";
import path from "node:path";

// ローカルの Supabase に SQL を流す小さな部品(E2E の準備と後片付け用)。ローカル(--local)以外には流さない。
const root = path.resolve(__dirname, "..");
const supabaseBin = path.join(root, "node_modules", ".bin", "supabase");

export function cli(args: string[]) {
  return execFileSync(supabaseBin, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

// 3つの画面サイズが並んで流れると、CLI の同時の呼び出しが衝突することがある。短い間をあけて数回だけやり直す
function cliWithRetry(args: string[]) {
  let last: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return cli(args);
    } catch (e) {
      last = e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300 + Math.floor(Math.random() * 700));
    }
  }
  throw last;
}

export function parseJson(text: string) {
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

/** 1文だけ流せる(複数の文は with … で1つにする)。 */
export function sql(query: string): Record<string, unknown>[] {
  const text = cliWithRetry(["db", "query", "--local", query]);
  // 行を返さない文(delete、insert)は、JSON ではなく件数の文字列が返る
  return text.includes("{") ? (parseJson(text).rows ?? []) : [];
}
