"use client";

import { useEffect, useState } from "react";
import { useMock } from "../_state/mock-state";
import { EntryFrame, MockNote } from "./bits";

// 確かめ中(OD-12)。A: 起動時の画面と同じ構図。1秒を超えたら「確かめています…」/ B: 地だけ / C: 文字だけ。
export function CheckingView() {
  const { settings } = useMock();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 1000);
    return () => clearTimeout(t);
  }, []);

  if (settings.checking === "c") {
    return (
      <EntryFrame>
        <h1 className="sr-only">もっちりファミリー</h1>
        <p role="status" className="text-base text-muted-foreground">
          確かめています…
        </p>
        <MockNote />
      </EntryFrame>
    );
  }

  if (settings.checking === "b") {
    return (
      <main className="flex min-h-dvh w-full flex-1 flex-col bg-background px-4 pb-safe text-foreground">
        <h1 className="sr-only">もっちりファミリー</h1>
        <div className="flex-1" />
        <MockNote />
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh w-full flex-1 flex-col bg-background px-4 pb-safe text-foreground">
      <div role="status" className="flex flex-1 flex-col items-center justify-center">
        <span
          aria-hidden="true"
          className="font-heading text-foreground"
          style={{ fontSize: "20vmin", lineHeight: 1 }}
        >
          も
        </span>
        <h1 className="mt-6 text-xl font-heading">もっちりファミリー</h1>
        {slow ? <p className="mt-4 text-base text-muted-foreground">確かめています…</p> : null}
      </div>
      <MockNote />
    </main>
  );
}
