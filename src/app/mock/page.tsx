import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "目次" };

const GROUPS = [
  {
    title: "食材の在庫 /mock/stock/",
    base: "/mock/stock/",
    states: [
      ["", "場所別(ヘッダーの右に品物・マスタ、いつもの のカード)"],
      ["full", "ページ全体(パスタの期限に年が付く)"],
      ["regular-only", "在庫が0件で いつもの だけある"],
      ["gone", "納豆: 在庫が先に消えていた(新しい文)"],
    ],
  },
  {
    title: "品物の一覧 /mock/items/",
    base: "/mock/items/",
    states: [
      ["", "品物の一覧(食材だけ。切り替え・目安なし)"],
      ["full", "ページ全体"],
      ["empty", "品物が0件"],
      ["undo", "牛乳を削除した直後(元に戻す)"],
      ["undo-failed", "元に戻せなかった"],
    ],
  },
  {
    title: "品物の編集 /mock/item-edit/",
    base: "/mock/item-edit/",
    states: [
      ["id=milk", "牛乳(4つのカード + 在庫2件)"],
      ["id=milk&state=full", "ページ全体"],
      ["id=milk&state=tracking", "残量で管理に変える(パネル)"],
      ["id=soy&state=tracking", "しょうゆ: 数で管理に変える(パネル)"],
      ["id=milk&state=tracking-undo", "牛乳を残量で管理に変えた直後"],
      ["id=pork&state=unit", "豚こま肉の単位を g → 個にした直後"],
      ["id=milk&state=name-error", "品物名が同じ名前(卵)"],
      ["id=milk&state=item-gone", "相手が先に削除していた"],
      ["id=milk&state=offline", "オフライン"],
    ],
  },
  {
    title: "マスタ /mock/masters/",
    base: "/mock/masters/",
    states: [
      ["", "マスタ"],
      ["full", "ページ全体"],
      ["default-cleared", "パントリーを削除し、飲み物の既定の場所が未選択"],
      ["in-use", "魚を削除しようとしたら使用中になっていた"],
      ["name-taken", "ジャンル「乾物」を足したら同じ名前が先にあった"],
      ["error", "読み込みのエラー"],
      ["offline", "オフライン"],
      ["offline-tap", "オフラインで「変更」を押した直後"],
    ],
  },
  {
    title: "品物の登録(run 1 のモック。差分の対象外) /mock/item-new/",
    base: "/mock/item-new/",
    states: [["", "初期値"]],
  },
];

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-safe md:px-6">
      <h1 className="text-2xl font-heading">デザインの見本(モック)</h1>
      <p className="mt-2 text-base">stock-master(run 2)の差分のモックです。データは架空で、保存されません。本番にはこのページも ?state= もありません。</p>
      {GROUPS.map((g) => (
        <section key={g.base} className="mt-6">
          <h2 className="text-lg font-heading">{g.title}</h2>
          <ul>
            {g.states.map(([q, label]) => {
              const href = q === "" ? g.base : q.startsWith("id=") ? `${g.base}?${q}` : `${g.base}?state=${q}`;
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
