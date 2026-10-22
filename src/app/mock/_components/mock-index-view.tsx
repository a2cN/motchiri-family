"use client";

import Link from "next/link";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useMockDispatch, useMockState } from "../_state/mock-state";
import { Card } from "./card";
import { GroupField } from "./form-bits";

// 目次 /mock/(40_design_brief.md rev2「目次」「モックの設定」)。

const ENTRIES = [
  { href: "/mock/stock/", label: "食材の在庫" },
  { href: "/mock/supply/", label: "日用品の残量" },
  { href: "/mock/shopping-list/", label: "買い物リスト" },
  { href: "/mock/shopping-memo/", label: "買い物メモ" },
  { href: "/mock/check-in/", label: "在庫登録" },
  { href: "/mock/item-new/", label: "品物の登録" },
  { href: "/mock/item-edit/", label: "品物の編集" },
  { href: "/mock/masters/", label: "マスタ" },
  { href: "/mock/pwa/", label: "アイコンと起動時の画面" },
] as const;

function SettingsCard() {
  const { settings } = useMockState();
  const dispatch = useMockDispatch();
  return (
    <Card as="section" className="mt-8">
      <h2 className="text-lg font-heading">モックの設定(見比べ用。本番にはありません)</h2>
      <p className="text-base text-muted-foreground">この設定は画面を移っても続き、再読み込みで既定に戻ります。</p>

      <div className="mt-4">
        <GroupField label="データ">
          <ToggleGroup
            aria-label="データ"
            value={[settings.data]}
            onValueChange={(v) => {
              if (v[0] === "initial" || v[0] === "empty") dispatch({ type: "settings/data", value: v[0] });
            }}
          >
            <ToggleGroupItem value="initial">初期のデータ</ToggleGroupItem>
            <ToggleGroupItem value="empty">空のデータ</ToggleGroupItem>
          </ToggleGroup>
        </GroupField>
        <GroupField label="「元に戻す」の表示">
          <ToggleGroup
            aria-label="「元に戻す」の表示"
            value={[String(settings.undoSeconds)]}
            onValueChange={(v) => {
              const n = Number(v[0]);
              if (n === 4 || n === 6 || n === 10) dispatch({ type: "settings/undo", value: n });
            }}
          >
            <ToggleGroupItem value="4">4秒</ToggleGroupItem>
            <ToggleGroupItem value="6">6秒</ToggleGroupItem>
            <ToggleGroupItem value="10">10秒</ToggleGroupItem>
          </ToggleGroup>
        </GroupField>
        <div className="mt-4">
          <GroupField label="チェック済みの行">
            <ToggleGroup
              aria-label="チェック済みの行"
              value={[settings.checkedOrder]}
              onValueChange={(v) => {
                if (v[0] === "stay" || v[0] === "bottom") dispatch({ type: "settings/order", value: v[0] });
              }}
            >
              <ToggleGroupItem value="stay">その場に残す</ToggleGroupItem>
              <ToggleGroupItem value="bottom">下へ移す</ToggleGroupItem>
            </ToggleGroup>
          </GroupField>
        </div>
      </div>
    </Card>
  );
}

export function MockIndexScreen() {
  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4 md:px-6">
          <span className="text-lg font-heading">モック</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-safe md:px-6">
        <h1 className="text-2xl font-heading">デザインの見本(モック)</h1>
        <p className="mt-2 text-base">デザインの見本(モック)です。データは架空で、保存されません。</p>
        <p className="text-base text-muted-foreground">さくらもち(2巡目)。8つの画面を触って確かめてください。</p>

        <Card as="section" className="mt-6 p-0 md:p-0">
          <h2 className="sr-only">画面の入口</h2>
          <ul>
            {ENTRIES.map((e) => (
              <li key={e.href} className="border-t border-border first:border-t-0">
                <Link
                  href={e.href}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 text-lg font-strong text-foreground no-underline active:bg-accent"
                >
                  {e.label}
                  <span aria-hidden="true" className="text-xl text-muted-foreground">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <SettingsCard />
      </main>
    </>
  );
}
