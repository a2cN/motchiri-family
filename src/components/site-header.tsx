import Link from "next/link";

const FRAME = "mx-auto flex h-14 w-full max-w-5xl items-center px-4 md:px-6";

// トップ用のヘッダー。ここの「もっちりファミリー」がこの画面の h1。リンクにしない(今いる画面)。
export function PortalHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className={FRAME}>
        <h1 className="text-lg font-bold">もっちりファミリー</h1>
      </div>
    </header>
  );
}

// トップへ戻るリンクのヘッダー。枠なしで起動すると戻るボタンが無いので、画面の中に置く。
export function BackHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className={FRAME}>
        <Link
          href="/"
          className="inline-flex min-h-11 min-w-11 items-center text-lg text-foreground no-underline"
        >
          <span aria-hidden="true">‹ </span>トップ
        </Link>
      </div>
    </header>
  );
}

export function Main({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-safe md:px-6">
      {children}
    </main>
  );
}
