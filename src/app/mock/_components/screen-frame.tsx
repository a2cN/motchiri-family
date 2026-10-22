"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { Refrigerator, ShoppingBasket, SlidersHorizontal, SprayCan } from "lucide-react";
import { cn } from "cn";
import { useMockDispatch } from "../_state/mock-state";

// 画面の枠(40_design_brief.md rev2「Component Specs」の共通・下のタブ・左のサイドバー・下の操作の帯)。
// 幅の区切り: 768px 未満 = スマホ、768〜1023px = iPad 縦(md)、1024px 以上 = iPad 横(lg)。

export type Active = "stock" | "supply" | "shopping-list" | "masters" | null;

const TABS = [
  { key: "stock", href: "/mock/stock/", label: "食材", Icon: Refrigerator },
  { key: "supply", href: "/mock/supply/", label: "日用品", Icon: SprayCan },
  { key: "shopping-list", href: "/mock/shopping-list/", label: "買い物リスト", Icon: ShoppingBasket },
] as const;

const FRAME = "mx-auto flex h-14 w-full items-center px-4 md:px-6";

function Tabs({ active }: { active: Active }) {
  return (
    <nav aria-label="倉庫の画面" className="border-t border-border bg-card lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto flex max-w-[35rem]">
        {TABS.map(({ key, href, label, Icon }) => {
          const current = active === key;
          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-0.5 no-underline",
                  current ? "font-strong text-foreground" : "text-muted-foreground",
                )}
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
  const dispatch = useMockDispatch();
  const items = [
    { key: "stock", href: "/mock/stock/", label: "食材", Icon: Refrigerator },
    { key: "supply", href: "/mock/supply/", label: "日用品", Icon: SprayCan },
    { key: "shopping-list", href: "/mock/shopping-list/", label: "買い物リスト", Icon: ShoppingBasket },
    { key: "masters", href: "/mock/masters/", label: "マスタ", Icon: SlidersHorizontal },
  ] as const;
  return (
    <div className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-card lg:flex">
      <div className="px-3 pt-2">
        <Link href="/mock/" className="inline-flex min-h-11 min-w-11 items-center text-lg text-foreground no-underline">
          <span aria-hidden="true">‹ </span>トップ
        </Link>
        <div className="mt-2 text-lg font-heading">もっちり倉庫</div>
      </div>
      <nav aria-label="倉庫の画面" className="mt-4">
        <ul>
          {items.map(({ key, href, label, Icon }) => {
            const current = active === key;
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  onClick={key === "masters" ? () => dispatch({ type: "nav/masters", from: "stock" }) : undefined}
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

// 下に固定する帯とタブの入れ物。高さを測って CSS 変数に入れる(本文の下の余白と「元に戻す」の位置が、帯の高さを知るため)。
function BottomStack({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => {
      const h = el.offsetHeight;
      root.style.setProperty("--bottom-stack-h", `${h}px`);
      root.style.setProperty("--toast-bottom", `${h > 0 ? h + 8 : 24}px`);
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

export type ScreenShellProps = {
  children: React.ReactNode;
  /** サイドバーで選ばれた見た目にする項目 */
  active?: Active;
  /** 上の階層の画面(下のタブと「‹ トップ」)か、サブ画面(「‹ もどる」)か */
  level: "top" | "sub";
  backHref?: string;
  /** 食材・日用品の右上の「マスタ」(スマホと iPad 縦) */
  mastersFrom?: "stock" | "supply";
  /** 下の操作の帯。tabletToo = iPad でも出す(サブ画面) */
  bar?: React.ReactNode;
  barOnTablet?: boolean;
  /** サイドバーを出さない画面(アイコンと起動時の画面) */
  noSidebar?: boolean;
  widthClass?: string;
};

export function ScreenShell({
  children,
  active = null,
  level,
  backHref = "/mock/",
  mastersFrom,
  bar,
  barOnTablet = false,
  noSidebar = false,
  widthClass = "max-w-5xl",
}: ScreenShellProps) {
  const dispatch = useMockDispatch();
  const hasTabs = level === "top" && !noSidebar;
  const sidebarOn = !noSidebar;
  return (
    <div className={cn("flex min-h-dvh flex-1 flex-col", sidebarOn && "lg:pl-60")}>
      {sidebarOn && <Sidebar active={active} />}
      <header className="border-b border-border bg-background">
        <div className={cn(FRAME, widthClass, "justify-between")}>
          {level === "top" || noSidebar ? (
            <Link href="/mock/" className="inline-flex min-h-11 min-w-11 items-center text-lg text-foreground no-underline">
              <span aria-hidden="true">‹ </span>トップ
            </Link>
          ) : (
            <Link href={backHref} className="inline-flex min-h-11 min-w-11 items-center text-lg text-foreground no-underline">
              <span aria-hidden="true">‹ </span>もどる
            </Link>
          )}
          {mastersFrom && (
            <Link
              href="/mock/masters/"
              onClick={() => dispatch({ type: "nav/masters", from: mastersFrom })}
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-base text-foreground no-underline lg:hidden"
            >
              マスタ
            </Link>
          )}
        </div>
      </header>
      <main
        className={cn("mx-auto w-full flex-1 px-4 pt-4 md:px-6", widthClass)}
        style={{ paddingBottom: "calc(var(--bottom-stack-h, 0px) + 24px)" }}
      >
        {children}
      </main>
      {(bar || hasTabs) && (
        <BottomStack>
          {bar && (
            <div
              className={cn(
                "relative border-t border-border bg-card px-4 py-3",
                !barOnTablet && "md:hidden",
              )}
              style={!hasTabs ? { paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" } : undefined}
            >
              <div className={cn("mx-auto w-full max-w-[40rem]", barOnTablet && "md:ml-auto md:mr-0 md:max-w-60")}>{bar}</div>
            </div>
          )}
          {hasTabs && <Tabs active={active} />}
        </BottomStack>
      )}
    </div>
  );
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-2xl font-heading">{children}</h1>;
}
