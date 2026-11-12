import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "目次" };

const GROUPS: { title: string; base: string; states: [string, string][] }[] = [
  {
    title: "食材の在庫 /mock/stock/",
    base: "/mock/stock/",
    states: [
      ["", "食材の在庫(スマホ・iPad 縦は下のタブ2つ、iPad 横は左のサイドバー4項目。いつもの のカードに日用品2行)"],
      ["full", "ページ全体(いつもの のカードの全行)"],
    ],
  },
  {
    title: "日用品 /mock/supply/",
    base: "/mock/supply/",
    states: [
      ["", "日用品の画面"],
      ["full", "ページ全体"],
      ["used-up", "シャンプーの詰め替えを − で 0 にした直後(使い切りました + 元に戻す)"],
      ["error", "読み込みのエラー"],
      ["offline", "オフライン(カード + 押した直後の通知)"],
      ["save-failed", "食器用洗剤の残量の保存に失敗した直後"],
      ["item-gone", "洗濯用洗剤を + したが、相手が先に削除していた直後"],
    ],
  },
  {
    title: "品物の登録 /mock/item-new/?from=supply",
    base: "/mock/item-new/",
    states: [
      ["from=supply", "種別「日用品」で開いた形(残量で管理、残量 ○)"],
      ["from=supply&state=full", "ページ全体"],
      ["from=supply&state=count-full", "数で管理に切り替え、単位「本」(ページ全体)"],
      ["from=supply&state=kind-error", "種別「日用品」で品物名「牛乳」を入れて登録を押した直後"],
      ["", "(参考)食材で開いた形"],
    ],
  },
  {
    title: "品物の一覧 /mock/items/",
    base: "/mock/items/",
    states: [
      ["kind=supply", "日用品側(トイレットペーパー・ボディソープの詰め替えが いつもの ON)"],
      ["kind=supply&state=full", "日用品側のページ全体"],
      ["kind=food&state=full", "食材側のページ全体(いつもの ON の行)"],
    ],
  },
  {
    title: "品物の編集 /mock/item-edit/",
    base: "/mock/item-edit/",
    states: [
      ["id=shampoo&from=supply", "シャンプーの詰め替え(数で管理の日用品)"],
      ["id=shampoo&from=supply&state=full", "ページ全体"],
      ["id=toilet&from=supply&state=full", "トイレットペーパー(残量で管理の日用品、いつもの ON)のページ全体"],
      ["id=milk", "(参考)牛乳(食材)"],
    ],
  },
  {
    title: "マスタ /mock/masters/(参考。差分の対象外)",
    base: "/mock/masters/",
    states: [["", "マスタ"]],
  },
];

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-safe md:px-6">
      <h1 className="text-2xl font-heading">デザインの見本(モック)</h1>
      <p className="mt-2 text-base">stock-supply(run 3a)の差分のモックです。データは架空で、保存されません。本番にはこのページも ?state= もありません(50 の区切り 9 で消します)。</p>
      {GROUPS.map((g) => (
        <section key={g.base} className="mt-6">
          <h2 className="text-lg font-heading">{g.title}</h2>
          <ul>
            {g.states.map(([q, label]) => {
              const href = q === "" ? g.base : q.includes("=") ? `${g.base}?${q}` : `${g.base}?state=${q}`;
              return (
                <li key={q} className="border-t border-border first:border-t-0">
                  <Link href={href} className="flex min-h-12 items-center text-base text-foreground">
                    {label}
                    <span className="ml-2 text-muted-foreground">{q === "" ? "" : q}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
