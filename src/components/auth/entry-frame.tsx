import { cn } from "cn";

// 入口の枠(ログイン画面、世帯に結びついていない画面、世帯を確かめられなかった画面)。
// 上寄せの1列。ヘッダーは置かない(docs の正典 auth「共通: 入口の枠」)。
export function EntryFrame({ children, centered = false }: { children: React.ReactNode; centered?: boolean }) {
  return (
    <main
      className={cn(
        "flex w-full flex-1 flex-col bg-background px-4 pb-safe text-foreground md:px-6",
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
