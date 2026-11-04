"use client";

import { useEffect, useState } from "react";

// 確かめ中(OD-auth-household-12 A)。起動時の画面と同じ構図(中央に「も」、その下に「もっちりファミリー」)。
// 1秒を超えたら「確かめています…」を出す。この画面のあいだ、守られた画面の中身は描かない。
export function CheckingView() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 1000);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="flex w-full flex-1 flex-col bg-background px-4 pb-safe text-foreground">
      <div role="status" className="flex flex-1 flex-col items-center justify-center">
        <span aria-hidden="true" className="font-heading text-foreground" style={{ fontSize: "20vmin", lineHeight: 1 }}>
          も
        </span>
        <h1 className="mt-6 text-xl font-heading">もっちりファミリー</h1>
        {slow ? <p className="mt-4 text-base text-muted-foreground">確かめています…</p> : null}
      </div>
    </main>
  );
}
