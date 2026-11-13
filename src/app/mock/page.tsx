import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "目次" };

const GROUPS: { title: string; base: string; states: [string, string][] }[] = [
  {
    title: "食材の在庫 /mock/stock/",
    base: "/mock/stock/",
    states: [
      ["", "食材の在庫(スマホ・iPad 縦は下のタブ3つ、iPad 横は左のサイドバー5項目)"],
      ["offline-launch", "電波の無い所で開いた直後(新の1文「買い物リストとメモは、電波が無くても使えます。」)"],
    ],
  },
  { title: "日用品 /mock/supply/", base: "/mock/supply/", states: [["", "日用品の画面(タブ3つ / サイドバー5項目)"]] },
  {
    title: "買い物リスト /mock/shopping-list/",
    base: "/mock/shopping-list/",
    states: [
      ["", "通常の形"],
      ["offline", "電波が無い(オフラインのカード + まだ送っていない変更 2件)"],
      ["pending", "電波はあるが送れていない変更が1件(1行だけ)"],
      ["offline-empty", "電波が無く、端末に写しが無い"],
      ["error", "最初の読み込みに失敗"],
      ["duplicate", "「卵」を追加した直後(足さない + 通知)"],
      ["typing", "入力欄に「しょ」と打っている(タブが隠れ、入力の帯は残る)"],
      ["save-failed", "送った変更が拒まれた直後(豆腐)"],
    ],
  },
  {
    title: "買い物メモ /mock/shopping-memo/",
    base: "/mock/shopping-memo/",
    states: [
      ["", "通常の形"],
      ["offline", "電波が無い(オフラインのカード + まだ送っていない変更 1件)"],
    ],
  },
  {
    title: "在庫登録 /mock/check-in/",
    base: "/mock/check-in/",
    states: [
      ["", "通常の形(3件)"],
      ["offline", "電波が無い(カード + 押した直後の通知)"],
      ["offline-nodata", "電波が無く、品物のデータが無い"],
      ["partial-failed", "途中の失敗(牛乳は登録でき、シャンプーの詰め替えで失敗)"],
    ],
  },
  {
    title: "品物の登録 /mock/item-new/",
    base: "/mock/item-new/",
    states: [
      ["state=restock", "食材・数で管理・単位パック、補充の目安「数で決める」1"],
      ["from=supply&state=restock", "日用品・残量で管理、補充の目安「△で」(既定)"],
    ],
  },
  {
    title: "品物の編集 /mock/item-edit/",
    base: "/mock/item-edit/",
    states: [
      ["id=natto", "納豆(補充の目安「数で決める」1)"],
      ["id=natto&state=panel", "管理のしかたを変えるパネルを開いた形"],
    ],
  },
  {
    title: "品物の一覧 /mock/items/",
    base: "/mock/items/",
    states: [
      ["kind=food", "食材側(行の補足「数で管理 · 目安 1 パック以下」など)"],
      ["kind=supply", "日用品側(「残量で管理 · 目安 △」「目安なし」)"],
    ],
  },
  { title: "マスタ /mock/masters/(参考。差分の対象外)", base: "/mock/masters/", states: [["", "マスタ"]] },
];

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-safe md:px-6">
      <h1 className="text-2xl font-heading">デザインの見本(モック)</h1>
      <p className="mt-2 text-base">stock-shopping(run 3b)の差分のモックです。データは架空で、保存されません。本番にはこのページも ?state= もありません(50 の C8 で消します)。</p>
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
