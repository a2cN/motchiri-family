# もっちりファミリー(app)

家族2人のための家庭用ポータル(PWA)のアプリのコード。Next.js(App Router、TypeScript)の静的書き出しを GitHub Pages で公開する。

公開 URL: <https://a2cn.github.io/motchiri-family/>

## 前提

- Node 24(`.nvmrc`、`engines`)。`.npmrc` の `engine-strict=true` により、別の版の Node では `npm install` が失敗する
- E2E のみ: Playwright の WebKit と、日本語のフォント(Linux では `fonts-noto-cjk` など)

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー。`http://localhost:3000/motchiri-family/` |
| `npm run lint` | ESLint と Stylelint(サーバー専用の Next.js 機能、色の直書き、`dark:` を禁止) |
| `npm run typecheck` | `next typegen` と `tsc --noEmit` |
| `npm test` | Vitest(単体テストと、lint の規則の自己テスト) |
| `npm run build` | 静的書き出し(`out/`) |
| `npm run e2e:install` | Playwright の WebKit を `.playwright-browsers/`(git の管理外)に入れる。初回だけ |
| `npm run e2e` | `build` のあと、`out/` を `basePath` の下で配り、iPad 縦・横と iPhone 縦で画面を検査する。スクリーンショットは `e2e-artifacts/screenshots/<機種>/<画面>.png`(`E2E_SCREENSHOT_DIR` で変えられる) |
| `npm run secrets:scan` | `gitleaks`(別途インストール)で作業ツリーの秘密を検査する |

## 決まり

- `output: 'export'`(静的書き出し)。サーバーで動く Next.js の機能(Server Actions、Cookies、Route Handler、`next/headers` など)は使えない
- `basePath` は `/motchiri-family`(`next.config.ts` の1か所)
- 色・角の丸み・影は `src/styles/tokens.css` のトークンだけ。ライトモードのみ
- 秘密、実データ、個人情報をこのリポジトリに置かない。環境変数は `.env*`(git の管理外)で渡す
- pre-commit(gitleaks): clone のあと `git config core.hooksPath .githooks` を1回実行する
