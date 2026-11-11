"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "cn";

// 画面の枠(docs/design/stock-food/brief.md Component Specs 1、docs/design/stock-master/)。下のタブ・サイドバーは出さない(run 3)。
// ヘッダーの右の「品物」「マスタ」は食材の在庫の一覧だけ(3つの画面サイズとも)。
// 本文は最大 792px で中央(iPad 横も iPad 縦と同じ配置)。

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

// 下に固定する帯。高さを測って --toast-bottom と本文の下の余白に入れる(「元に戻す」が帯の 8px 上に出る)
function BottomBar({ children, allSizes }: { children: React.ReactNode; allSizes: boolean }) {
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
    <div
      ref={ref}
      data-bottom-stack=""
      className={cn("fixed inset-x-0 bottom-0 border-t border-border bg-card px-4 pt-3", !allSizes && "md:hidden")}
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto w-full max-w-[40rem]">{children}</div>
    </div>
  );
}

export function Frame({
  back,
  backHref,
  nav = false,
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
  /** ヘッダーの右の「品物」「マスタ」(食材の在庫の一覧だけ) */
  nav?: boolean;
  title: string;
  /** h1 の行の右(iPad 以上で出す「＋ 品物の登録」) */
  headerRight?: React.ReactNode;
  bar?: React.ReactNode;
  barAllSizes?: boolean;
  widthClass?: string;
  children: React.ReactNode;
}) {
  const typing = useTyping();
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="border-b border-border bg-background">
        <div className={cn(FRAME, "max-w-[792px] justify-between")}>
          <Link
            href={backHref ?? (back === "top" ? "/" : "/stock/")}
            className="inline-flex min-h-11 min-w-11 items-center text-lg text-foreground no-underline"
          >
            <span aria-hidden="true">‹ </span>
            {back === "top" ? "トップ" : "もどる"}
          </Link>
          {nav && (
            <nav aria-label="倉庫のほかの画面" className="flex items-center gap-2">
              <Link href="/stock/items/" className="inline-flex min-h-11 min-w-11 items-center justify-center text-base text-foreground no-underline">
                品物
              </Link>
              <Link href="/stock/masters/" className="inline-flex min-h-11 min-w-11 items-center justify-center text-base text-foreground no-underline">
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
      {bar && !typing && <BottomBar allSizes={barAllSizes}>{bar}</BottomBar>}
    </div>
  );
}
