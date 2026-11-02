import Link from "next/link";
import { cn } from "cn";

// 入口の枠(ログイン画面、世帯に結びついていない画面、世帯を確かめられなかった画面)。
// 上寄せの1列。ヘッダーは置かない(40_design_brief.md「共通: 入口の枠」)。
export function EntryFrame({
  children,
  centered = false,
}: {
  children: React.ReactNode;
  centered?: boolean;
}) {
  return (
    <main
      className={cn(
        "flex min-h-dvh w-full flex-1 flex-col bg-background px-4 pb-safe text-foreground md:px-6",
        centered ? "justify-center py-6" : "pt-6 md:pt-16 lg:pt-8",
      )}
    >
      <div className="mx-auto w-full max-w-100">{children}</div>
    </main>
  );
}

export function NameRow() {
  return <p className="text-lg font-heading text-foreground">もっちりファミリー</p>;
}

export function MockNote() {
  return (
    <p className="mt-8 text-base text-muted-foreground">
      これはモックです。入力した内容はどこにも送りません。
    </p>
  );
}

// 画面のヘッダー(モック用の写し)。足場の正典 §2 の高さ 56px・最大幅・左右の余白のまま、右に任意の要素。
const FRAME = "mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 md:px-6";

export function MockPortalHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="border-b border-border bg-background">
      <div className={FRAME}>
        <h1 className="text-lg font-bold">もっちりファミリー</h1>
        {right}
      </div>
    </header>
  );
}

export function MockBackHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="border-b border-border bg-background">
      <div className={FRAME}>
        <Link
          href="/mock/top/"
          className="inline-flex min-h-11 min-w-11 items-center text-lg text-foreground no-underline"
        >
          <span aria-hidden="true">‹ </span>トップ
        </Link>
        {right}
      </div>
    </header>
  );
}

export function MockMain({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-safe md:px-6">{children}</main>
  );
}
