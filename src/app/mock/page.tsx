import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "目次" };

const GROUPS = [
  {
    title: "食材の在庫 /mock/stock/",
    base: "/mock/stock/",
    states: [
      ["", "データのある一覧(場所別)"],
      ["genre", "ジャンル別"],
      ["empty", "在庫0件"],
      ["loading", "読み込み中"],
      ["error", "読み込みのエラー"],
      ["offline-error", "電波が無くて読み込めない"],
      ["offline", "オフライン(一覧あり)"],
      ["offline-tap", "オフラインで + を押した直後"],
      ["undo", "牛乳を使い切った直後(元に戻す)"],
      ["save-failed", "ヨーグルトの保存の失敗"],
      ["gone", "納豆: 相手が先に使い切っていた"],
    ],
  },
  {
    title: "品物の登録 /mock/item-new/",
    base: "/mock/item-new/",
    states: [
      ["", "初期値"],
      ["level", "残量で管理"],
      ["suggest", "候補(牛 → 牛乳)"],
      ["error", "何も入れずに登録"],
      ["unit-error", "既存の品物の単位の誤り"],
      ["tracking-error", "既存の品物の管理のしかたの誤り"],
      ["register-failed", "登録の失敗(入れ直す)"],
      ["typing", "入力中(下の帯が隠れる)"],
      ["offline", "オフライン"],
    ],
  },
  {
    title: "品物の編集 /mock/item-edit/",
    base: "/mock/item-edit/",
    states: [
      ["id=milk", "牛乳(在庫2件)"],
      ["id=soy", "しょうゆ(残量)"],
      ["id=bread", "食パン(在庫なし)"],
      ["id=none", "見つからない品物"],
      ["id=milk&state=offline", "オフライン"],
    ],
  },
];

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-safe md:px-6">
      <h1 className="text-2xl font-heading">デザインの見本(モック)</h1>
      <p className="mt-2 text-base">stock-food のモックです。データは架空で、保存されません。本番にはこのページも ?state= もありません。</p>
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
