import type { Metadata } from "next";
import Link from "next/link";
import { Main } from "@/components/site-header";
import { DIRECTIONS } from "./_data/directions";

export const metadata: Metadata = { title: { absolute: "モックの目次 | モック" } };

const ROWS = [
  { path: "", label: "見本帳" },
  { path: "stock/", label: "在庫" },
  { path: "shopping-list/", label: "買い物リスト" },
  { path: "item-new/", label: "品物の登録" },
] as const;

// モックの目次(40_design_brief.md「目次」)。data-direction で包まない(足場の :root の見た目)。
export default function MockIndex() {
  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4 md:px-6">
          <span className="text-lg font-bold">モック</span>
        </div>
      </header>
      <Main>
        <h1 className="text-2xl font-bold">デザインの見本(モック)</h1>
        <p className="mt-2 text-base">デザインの見本(モック)です。データは架空で、保存されません。</p>
        <p className="text-base text-muted-foreground">同じ画面を、案ごとに開いて見比べてください。</p>

        <h2 className="mt-8 mb-3 text-lg font-bold">案の入口</h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
          {DIRECTIONS.map((d) => (
            <li key={d.id}>
              {/* タイルは、その案の data-direction で包む(その案の card の面・角・影・文字) */}
              <Link
                data-direction={d.id}
                href={`/mock/${d.id}/`}
                className="card-border block rounded-lg bg-card p-4 font-sans text-card-foreground no-underline shadow-card"
              >
                <span className="block text-xl font-heading">
                  案{d.letter} {d.name}
                </span>
                <span className="mt-1 block text-base text-muted-foreground">{d.tagline}</span>
                <span aria-hidden="true" className="mt-3 flex gap-2">
                  <span className="size-6 rounded-full border border-border bg-background" />
                  <span className="size-6 rounded-full border border-border bg-primary" />
                  <span className="size-6 rounded-full border border-border bg-secondary" />
                  <span className="size-6 rounded-full border border-border bg-foreground" />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <h2 className="mt-8 mb-3 text-lg font-bold">見比べ表</h2>
        <table className="w-full max-w-md border-collapse text-base">
          <caption className="sr-only">画面と案の見比べ表</caption>
          <thead>
            <tr>
              <th scope="col" className="p-2 text-left font-bold">
                画面
              </th>
              {DIRECTIONS.map((d) => (
                <th key={d.id} scope="col" className="p-2 font-bold">
                  {d.letter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <th scope="row" className="p-2 text-left font-normal">
                  {r.label}
                </th>
                {DIRECTIONS.map((d) => (
                  <td key={d.id} className="text-center">
                    <Link
                      href={`/mock/${d.id}/${r.path}`}
                      aria-label={`${r.label} — 案${d.letter}`}
                      className="inline-flex size-11 items-center justify-center text-lg font-bold text-foreground underline"
                    >
                      {d.letter}
                    </Link>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Main>
    </>
  );
}
