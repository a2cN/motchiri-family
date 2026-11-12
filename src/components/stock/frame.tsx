"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { itemsHref, mastersHref, type StockOrigin } from "@/modules/stock/routes";
import { STOCK_SECTIONS, type StockSectionKey } from "./sections";
import { cn } from "cn";

// 画面の枠(docs/design/stock-supply/README.md、docs/design/stock/ の Component Specs)。
// 下のタブ(スマホ・iPad 縦。上の階層の画面だけ)、左のサイドバー(iPad 横。サブ画面にも)、ヘッダーの右の「品物」「マスタ」(iPad 横では出さない)。
// 幅の区切り: 768px 未満 = スマホ、768〜1023px = iPad 縦(md)、1024px 以上 = iPad 横(lg)。本文は最大 792px。
// タブとサイドバーの項目は STOCK_SECTIONS(sections.ts)の設定 1 つから描く(30 S-09)。

const FRAME = "mx-auto flex h-14 w-full items-center px-4 md:px-6";

export function StockToaster() {
  return (
    <Toaster
      offset={{ bottom: "var(--toast-bottom, calc(24px + env(safe-area-inset-bottom)))" }}
      mobileOffset={{ bottom: "var(--toast-bottom, calc(24px + env(safe-area-inset-bottom)))", left: 16, right: 16 }}
      style={{ "--width": "480px" } as React.CSSProperties}
    />
  );
}

/** 文字を打つ欄(日付と select は除く)にフォーカスがある間だけ true(下の帯を隠す。Component Specs 5) */
function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isTextEntry = (el: Element | null) =>
      !!el && el.matches('input:not([type="date"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea, [inputmode]');
    const update = () => setTyping(isTextEntry(document.activeElement));
    update();
    const later = () => setTimeout(update, 0);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", later);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", later);
    };
  }, []);
  return typing;
}

export type Active = StockSectionKey | null;

function Tabs({ active }: { active: Active }) {
  return (
    <nav aria-label="倉庫の画面" className="border-t border-border bg-card lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto flex max-w-[35rem]">
        {STOCK_SECTIONS.filter((x) => x.tab).map(({ key, href, label, icon: Icon }) => {
          const current = active === key;
          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn("flex h-16 flex-col items-center justify-center gap-0.5 no-underline", current ? "font-strong text-foreground" : "text-muted-foreground")}
              >
                <span className={cn("flex h-8 w-14 items-center justify-center rounded-control", current && "bg-primary")}>
                  <Icon aria-hidden="true" className="size-6" />
                </span>
                <span className="text-base">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Sidebar({ active }: { active: Active }) {
  return (
    <div className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-card lg:flex">
      <div className="px-3 pt-2">
        <Link href="/" className="inline-flex min-h-11 min-w-11 items-center text-lg text-foreground no-underline">
          <span aria-hidden="true">‹ </span>トップ
        </Link>
        <div className="mt-2 text-lg font-heading">もっちり倉庫</div>
      </div>
      <nav aria-label="倉庫の画面" className="mt-4">
        <ul>
          {STOCK_SECTIONS.filter((x) => x.sidebar).map(({ key, href, label, icon: Icon }) => {
            const current = active === key;
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex h-12 items-center gap-3 border-l-4 px-3 text-base no-underline",
                    current ? "border-foreground bg-primary font-strong text-primary-foreground" : "border-transparent text-foreground",
                  )}
                >
                  <Icon aria-hidden="true" className="size-6" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

// 下に固定する帯とタブの入れ物。高さを測って --bottom-stack-h と --toast-bottom に入れる(「元に戻す」が帯・タブの 8px 上に出る)
function BottomStack({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => {
      const h = el.offsetHeight;
      root.style.setProperty("--bottom-stack-h", `${h}px`);
      root.style.setProperty("--toast-bottom", h > 0 ? `${h + 8}px` : "calc(24px + env(safe-area-inset-bottom))");
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--bottom-stack-h");
      root.style.removeProperty("--toast-bottom");
    };
  }, []);
  return (
    <div ref={ref} data-bottom-stack="" className="fixed inset-x-0 bottom-0 flex flex-col lg:left-60">
      {children}
    </div>
  );
}

export function Frame({
  back,
  backHref,
  headerNav,
  level = "sub",
  active = null,
  title,
  headerRight,
  bar,
  barAllSizes = false,
  widthClass = "max-w-[792px]",
  children,
}: {
  back: "top" | "list";
  /** 「‹ もどる」の行き先(省略時: top は /、list は /stock/) */
  backHref?: string;
  /** ヘッダーの右の「品物」「マスタ」(上の階層の画面だけ。スマホと iPad 縦。iPad 横は出さない)。値は開いた元(戻り先と種別の初期値になる) */
  headerNav?: StockOrigin;
  /** top = 上の階層の画面(下のタブを出す。スマホと iPad 縦)、sub = サブ画面(タブなし。サイドバーは iPad 横のどちらにも出る) */
  level?: "top" | "sub";
  /** サイドバー・タブで選ばれた見た目にする項目 */
  active?: Active;
  title: string;
  /** h1 の行の右(iPad 以上で出す「＋ 品物の登録」) */
  headerRight?: React.ReactNode;
  bar?: React.ReactNode;
  barAllSizes?: boolean;
  widthClass?: string;
  children: React.ReactNode;
}) {
  const typing = useTyping();
  const tabs = level === "top";
  const showStack = (bar || tabs) && !typing;
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:pl-60">
      <Sidebar active={active} />
      <header className="border-b border-border bg-background">
        <div className={cn(FRAME, "max-w-[792px] justify-between")}>
          <Link
            href={backHref ?? (back === "top" ? "/" : "/stock/")}
            className="inline-flex min-h-11 min-w-11 items-center text-lg text-foreground no-underline"
          >
            <span aria-hidden="true">‹ </span>
            {back === "top" ? "トップ" : "もどる"}
          </Link>
          {headerNav && (
            <nav aria-label="倉庫のほかの画面" className="flex items-center gap-2 lg:hidden">
              <Link href={itemsHref({ from: headerNav, kind: headerNav === "supply" ? "supply" : "food" })} className="inline-flex min-h-11 min-w-11 items-center justify-center text-base text-foreground no-underline">
                品物
              </Link>
              <Link href={mastersHref({ from: headerNav })} className="inline-flex min-h-11 min-w-11 items-center justify-center text-base text-foreground no-underline">
                マスタ
              </Link>
            </nav>
          )}
        </div>
      </header>
      <main className={cn("mx-auto w-full flex-1 px-4 pt-6 md:px-6", widthClass)} style={{ paddingBottom: "calc(var(--bottom-stack-h, 0px) + 24px + env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-heading">{title}</h1>
          {headerRight}
        </div>
        {children}
      </main>
      {showStack && (
        <BottomStack>
          {bar && (
            <div
              className={cn("relative border-t border-border bg-card px-4 pt-3", !barAllSizes && "md:hidden")}
              style={{ paddingBottom: tabs ? "0.75rem" : "calc(0.75rem + env(safe-area-inset-bottom))" }}
            >
              <div className="mx-auto w-full max-w-[40rem]">{bar}</div>
            </div>
          )}
          {tabs && <Tabs active={active} />}
        </BottomStack>
      )}
    </div>
  );
}
