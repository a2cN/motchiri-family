# もっちりファミリー(app)

家族2人のための家庭用ポータル(PWA)のアプリのコード。Next.js(App Router、TypeScript)の静的書き出しを GitHub Pages で公開する。

公開 URL: <https://a2cn.github.io/motchiri-family/>

## 前提

- Node 24(`.nvmrc`、`engines`)。`.npmrc` の `engine-strict=true` により、別の版の Node では `npm install` が失敗する
- E2E のみ: Playwright の WebKit と、日本語のフォント(Linux では `fonts-noto-cjk` など)
- `dev`・`build`・`e2e`・`db:*`: Docker(ローカルの Supabase を動かす)。`npm run db:start` を先に実行する。環境変数 `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` があれば、ローカルの Supabase は要らない(CI の build)
- Supabase の migration・本番への適用・人間の手順: `supabase/README.md`

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー。`http://localhost:3000/motchiri-family/`。ローカルの Supabase か環境変数が要る |
| `npm run lint` | ESLint と Stylelint(サーバー専用の Next.js 機能、色の直書き、`dark:` を禁止) |
| `npm run typecheck` | `next typegen` と `tsc --noEmit` |
| `npm test` | Vitest(単体テストと、lint の規則の自己テスト) |
| `npm run build` | 静的書き出し(`out/`)。ローカルの Supabase か環境変数が要る(`scripts/supabase-env.mjs` が URL と公開用キーを渡す) |
| `npm run db:start` / `db:stop` | ローカルの Supabase(Postgres・Auth・PostgREST・API の入口)を起動・停止する(Docker) |
| `npm run db:reset` | 空の DB に migration を当て直す |
| `npm run db:test` | DB のテスト(pgTAP: RLS の見張り、GRANT の見張り、世帯の分離)と、`supabase db advisors`。ローカルの Supabase が要る |
| `npm run db:types` | migration を変えたあと、`src/lib/supabase/database.types.ts` を作り直す |
| `npm run check:client-secrets` | service_role・秘密のキーが、`src/`・`public/`・`out/`・管理下のファイルに無いことの検査。`npm run build` のあとに実行する |
| `npm run e2e:install` | Playwright の WebKit を `.playwright-browsers/`(git の管理外)に入れる。初回だけ |
| `npm run e2e` | ローカルの DB を作り直し(`db reset`)、`build` のあと、`out/` を `basePath` の下で配り、iPad 縦・横と iPhone 縦で画面とログインを検査する。ローカルの Supabase が要る(テストの利用者は `e2e/global-setup.ts` が作る)。スクリーンショットは `e2e-artifacts/screenshots/<機種>/<画面>.png`(`E2E_SCREENSHOT_DIR` で変えられる) |
| `npm run secrets:scan` | `gitleaks`(別途インストール)で作業ツリーの秘密を検査する |

## 決まり

- `output: 'export'`(静的書き出し)。サーバーで動く Next.js の機能(Server Actions、Cookies、Route Handler、`next/headers` など)は使えない
- `basePath` は `/motchiri-family`(`next.config.ts` の1か所)
- 色・角の丸み・影は `src/styles/tokens.css` のトークンだけ。ライトモードのみ
- 秘密、実データ、個人情報をこのリポジトリに置かない。Supabase の URL と公開用キーは、ビルドのときに環境変数から埋め込む(ローカルはローカルの Supabase から、CI はリポジトリの Variables から)。`.env*` は使わない。service_role のキーはクライアント・リポジトリに置かない(`npm run check:client-secrets` と CI が検査する)
- `@supabase/supabase-js` を import してよいのは `src/lib/supabase/` だけ。新規登録・パスワードの再設定などを呼ぶコードは書けない(ESLint)
- migration の決まり(テーブルごとに RLS を有効にし、全部の権限を取り消してから、要るものだけを `authenticated` に GRANT する)は `supabase/README.md`
- pre-commit(gitleaks): clone のあと `git config core.hooksPath .githooks` を1回実行する
