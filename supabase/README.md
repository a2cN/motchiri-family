# supabase/ — DB の migration、ローカルの環境、本番への適用の手順

この README は、人間が行う手順を含む。**本番の Supabase を書き換えるのは人間だけ**(エージェントと CI は本番に接続しない)。メールアドレス・ユーザー ID・キーを、この README・SQL・チャットに書かない。

## 中身

| 場所 | 役割 |
|---|---|
| `config.toml` | ローカルの環境の設定。本番にそろえる値: 新しいテーブルを明示の GRANT なしでは公開しない(`auto_expose_new_tables = false`)、新規登録オフ(`[auth] enable_signup = false`)、メールの確認オフ、Postgres 17 |
| `migrations/` | 本番とローカルに当てる SQL。名前の順に1つずつ当てる |
| `tests/` | DB のテスト(pgTAP)。`npm run db:test` |
| `ops/production-check.sql` | 本番の状態を確かめる SQL(件数・真偽・版だけを出す) |
| `ops/link-household.sql` | 2人を1つの世帯に結びつける型紙 |
| `ops/rollback/` | migration ごとの取り消しの SQL(同じ名前) |
| `seed.sql` | 空。家族の情報・テストの利用者を書かない |

## ローカルの環境

前提: Docker(Docker Desktop など)が動いていて、WSL・シェルから `docker` を使える。

```bash
cd app
npm run db:start      # Postgres・Auth・PostgREST・API の入口を起動(初回はイメージの取得で数分かかる)
npm run db:test       # DB のテスト + supabase db advisors
npm run e2e           # db reset → build → playwright
npm run db:stop       # 止める(データは消える)
```

`config.toml` の `[auth.rate_limit] sign_in_sign_ups` は、E2E が何度もログインするため、ローカルだけ既定の30から200に上げてある(本番の設定ではない)。

## migration の決まり

1. テーブルを作ったら、同じファイルの中で: `alter table … enable row level security`、`revoke all on table … from public, anon, authenticated`、要る権限だけを `grant … to authenticated`、操作ごとのポリシー(`to authenticated` を必ず書く)
2. `anon` には何も GRANT しない
3. 関数は `public` に置かない(`private` に置く)。`revoke … from public, anon, authenticated` してから `grant execute … to authenticated`。`security definer` の関数は `set search_path = ''`
4. `alter default privileges` は使わない。シーケンスを作らない(主キーは UUID)
5. 本番に当てたあとの migration のファイルは書き換えない。直すときは新しい migration を足す
6. ファイルの中に、メール・ユーザー ID・名前を書かない。`begin;`・`commit;` を書かない
7. migration ごとに `ops/rollback/` に同じ名前の取り消しを置き、`ops/production-check.sql` に確かめる行を足す。`npm run db:types` で型を作り直す
8. 新しいテーブルは、`tests/grant_guard.test.sql` の一覧(`authenticated` の権限)に足すまでテストが通らない。業務テーブルの手本は `tests/policy_template.test.sql`

守りの検査: `npm test`(`tests/guardrails/migrations.test.ts`。Docker なしで動く補助の網)、`npm run db:test`(本物のカタログを見る。CI の `db` ジョブでも動く)。

## 人間の手順

### H3. GitHub の Variables(公開される値。秘密ではない)

次の値は、Supabase の管理画面の Project Settings(API)にある「Project URL」と「Publishable key」(無ければ `anon` の公開用キー)。**`service_role` と `secret` のキーは入れない。**

| どこに | 名前 |
|---|---|
| `a2cN/motchiri-family`(app)の Settings → Secrets and variables → Actions → **Variables** | `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY` |
| docs 側の private リポジトリの同じ場所(休止対策のワークフロー用) | 同じ2つ |

### H4. 本番に migration を当てる

1. Supabase の管理画面 → SQL Editor → 新しいクエリ
2. `migrations/` の、まだ当てていないファイルを、名前の順に1つずつ、中身をそのまま貼って実行する
3. `ops/production-check.sql` を貼って実行し、出た表をそのままチャットに貼る(ID・メールは出ない。`ok` が `false` の行があれば、そのまま伝える)
4. 画面で確かめる: Authentication の設定で新規登録がオフ、2人のアカウントが Confirmed、Data API が有効で `public` が公開されている

途中でエラーが出たら、`production-check.sql` で状態を見て、半分だけ当たっていれば `ops/rollback/` の同じ名前の SQL を実行してから(`if exists` で書いてあるので、何もなくても失敗しない)当て直す。

**`production-check.sql` の読み方**(世帯に結びつける前)

| 行 | 期待 |
|---|---|
| Postgres の主版が 17 | `ok = true`(違えば `config.toml` の `major_version` を直して再テスト) |
| household と member がある | true |
| RLS の無いテーブル 0 件 | true |
| anon が権限を持つもの 0 件 | true |
| authenticated の権限 | `household:SELECT / member:SELECT` |
| ポリシーの数 | household 1 / member 1 |
| private.current_household_ids | security definer=true / anon 実行=false |
| auth.users の数と確認済み | 2 / 2(アカウントが2人で、どちらも確認済み) |
| 世帯の数・メンバーの数 | 0・0(結びつけの前) |
| 結びついていない利用者 | 2 の行は結びつけの後に 0 になる(前は `false` でよい) |
| (参考)既定の権限・イベントトリガーの数 | 合否に使わない。ローカルの同じ問いの出力と並べて記録する |

### H5. 2人を世帯に結びつける

1. `ops/link-household.sql` を SQL Editor に貼る
2. `'<1人目のメール>'`・`'<2人目のメール>'` を、**SQL Editor の中でだけ**、2人のメールアドレスに書き換えて1回実行する(リポジトリ・チャット・文書に書かない。SQL Editor に保存しない)
3. 止まったら(世帯がすでにある / 2つのメールが同じ / 該当がちょうど2人でない)、何も作られていない。メッセージにメールは含まれない
4. `ops/production-check.sql` をもう一度実行し、表を貼る(世帯 1、メンバー 2、結びついていない利用者 0)
5. メール・ID を含む結果の画面を撮ってチャットに貼らない

### 取り消し

`ops/rollback/<同じ名前>.sql` を SQL Editor で実行する。失うのは世帯とメンバーの行(H5 でいつでも作り直せる)。Auth のアカウントには触れない。取り消したあと `production-check.sql` で、テーブルが無いことを確かめる。業務のテーブルが `household` を参照しているときは、`household` を消せない(そのテーブルの取り消しと組にする)。休止対策のワークフローも同時に無効にする(テーブルが無いと失敗し続ける)。

## 休止対策(docs リポジトリのワークフロー)

docs リポジトリの `.github/workflows/supabase-keepalive.yml` が、8時間ごとに、公開用キーで `anon` として `household` を読もうとし、権限(401・`42501`)で拒否されることを確かめる。拒否されなければ失敗になり、GitHub が通知のメールを送る。

- 初回: Actions の画面から「Run workflow」で1回動かし、緑になること(ログに `状態: 401 / code: 42501`)を確かめる
- **月に1回**、docs リポジトリの Actions の画面で、最後の実行の日時が新しいことを見る(ワークフローが無効になっても通知は来ない。Supabase の一時停止の警告メールが2つ目の網)
- 「拒否されたリクエスト」が Supabase の「活動」に数えられるかは**未確認**。一時停止の警告メールが来たら、方式を見直す(OD を起票)
