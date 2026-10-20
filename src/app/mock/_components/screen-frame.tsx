import Link from "next/link";
import { cn } from "cn";

// 3画面と見本帳の枠(40_design_brief.md「共通: ページの枠」)。

const FRAME = "mx-auto flex h-14 w-full max-w-5xl items-center px-4 md:px-6";

export function ScreenHeader({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <header className="border-b border-border bg-background">
      <div className={FRAME}>
        <Link href={backHref} className="inline-flex min-h-11 min-w-11 items-center text-lg text-foreground no-underline">
          <span aria-hidden="true">‹ </span>
          {backLabel}
        </Link>
      </div>
    </header>
  );
}

// 本文の領域。左右 16px(768px 以上は 24px)、上 16px、下 24px(下の操作の帯がある画面は帯の高さ 72px を足す)。
export function ScreenMain({
  children,
  widthClass = "max-w-5xl",
  withBar = false,
  barOnMobileOnly = false,
}: {
  children: React.ReactNode;
  widthClass?: string;
  withBar?: boolean;
  barOnMobileOnly?: boolean;
}) {
  const bottom = !withBar ? "pb-6" : barOnMobileOnly ? "pb-24 md:pb-6" : "pb-24";
  return <main className={cn("mx-auto w-full flex-1 px-4 pt-4 md:px-6", widthClass, bottom)}>{children}</main>;
}

// 画面の下の操作の帯。画面の下に固定。面 card、影 shadow-bar(さくらもちは上に border の 1px の線)。
export function BottomBar({
  children,
  mobileOnly = false,
  widthClass = "max-w-[45rem]",
}: {
  children: React.ReactNode;
  mobileOnly?: boolean;
  widthClass?: string;
}) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 bg-card px-4 py-3 shadow-bar in-data-[direction=sakura]:border-t in-data-[direction=sakura]:border-border",
        mobileOnly && "md:hidden",
      )}
    >
      <div className={cn("mx-auto w-full", widthClass)}>{children}</div>
    </div>
  );
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-2xl font-heading">{children}</h1>;
}
