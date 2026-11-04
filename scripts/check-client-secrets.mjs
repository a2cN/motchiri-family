// サービス用のキー(service_role・新しい形式の秘密のキー)が、クライアントのコード・ビルドの成果物・リポジトリに無いことの検査。
// 根拠: ADR 0002、30_architecture.md Interfaces §4・D-10。自己テストは tests/guardrails/client-secrets.test.ts。
//
// 見る場所と見るもの:
//   src/、public/    名前(service_role・SERVICE_ROLE。大文字小文字を問わない)と、値の形
//   out/             値の形だけ(supabase-js の配布物は、名前の語を含むので、名前で見ると必ず誤って失敗する)
//   管理下のファイル   値の形だけ(リポジトリに値が無いこと。gitleaks の二重の網)
// 値の形: (1) sb_secret_ + 英数字・_・- が16文字以上、(2) JWT で、真ん中の部分の role が service_role のもの、
//         (3) 環境変数 SUPABASE_SECRET_KEY_CHECK の値そのもの(あれば)。
// 見つけたら、ファイルの名前・行の番号・種類だけを出す。値は出さない。終了コード 1。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const NAME_RE = /service_role/i;
const SECRET_KEY_RE = /sb_secret_[A-Za-z0-9_-]{16,}/;
const JWT_RE = /eyJ[A-Za-z0-9_-]{5,}\.(eyJ[A-Za-z0-9_-]{5,})\.[A-Za-z0-9_-]{5,}/g;

function isServiceRoleJwtPayload(payloadB64) {
  try {
    const json = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return json?.role === "service_role";
  } catch {
    return false;
  }
}

/**
 * 1つの文字列を検査する。
 * @param {string} text
 * @param {{ checkName: boolean, exactSecret?: string }} options
 * @returns {{ line: number, kind: string }[]} 値は返さない
 */
export function scanText(text, { checkName, exactSecret }) {
  const found = [];
  text.split("\n").forEach((lineText, i) => {
    const line = i + 1;
    if (checkName && NAME_RE.test(lineText)) found.push({ line, kind: "service_role の名前" });
    if (SECRET_KEY_RE.test(lineText)) found.push({ line, kind: "秘密のキー(sb_secret_…)の形" });
    for (const m of lineText.matchAll(JWT_RE)) {
      if (isServiceRoleJwtPayload(m[1])) found.push({ line, kind: "role が service_role の JWT" });
    }
    if (exactSecret && lineText.includes(exactSecret)) found.push({ line, kind: "ローカルの秘密のキーの値" });
  });
  return found;
}

function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/**
 * @param {{ root: string, exactSecret?: string, trackedFiles?: string[] | null }} args
 *   trackedFiles: 管理下のファイルの一覧(root からの相対)。null なら `git ls-files` を実行する。[] なら見ない。
 * @returns {{ file: string, line: number, kind: string }[]}
 */
export function scanProject({ root, exactSecret, trackedFiles = null }) {
  const results = [];
  const seen = new Set();
  const visit = (file, checkName) => {
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (seen.has(rel)) return;
    seen.add(rel);
    let buffer;
    try {
      buffer = fs.readFileSync(file);
    } catch {
      return;
    }
    if (isBinary(buffer)) return;
    for (const f of scanText(buffer.toString("utf8"), { checkName, exactSecret })) {
      results.push({ file: rel, ...f });
    }
  };

  for (const dir of ["src", "public"]) for (const f of walk(path.join(root, dir))) visit(f, true);
  for (const f of walk(path.join(root, "out"))) visit(f, false);

  let files = trackedFiles;
  if (files === null) {
    try {
      files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
    } catch {
      files = [];
    }
  }
  for (const rel of files) visit(path.join(root, rel), false);
  return results;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const exactSecret = process.env.SUPABASE_SECRET_KEY_CHECK || undefined;
  const results = scanProject({ root, exactSecret });
  if (results.length === 0) {
    console.log("サービス用のキーの検査: 見つかりませんでした(src/、public/、out/、管理下のファイル)");
    return 0;
  }
  console.error("サービス用のキーの検査: 次の場所に見つかりました(値は出しません)");
  for (const r of results) console.error(`  ${r.file}:${r.line} ${r.kind}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
