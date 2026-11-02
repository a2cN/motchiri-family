"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useMock } from "../_state/mock-state";
import { CheckingView } from "./checking-view";
import { EntryFrame, MockNote, NameRow } from "./bits";

// 世帯を確かめられなかった画面(OD-13)。A: もう一度 + ログアウト / B: もう一度だけ / C: ボタンなしで自動で確かめ直す。
// 「もう一度」は確かめ中を1秒 → トップ(モックの簡略。設定に関係なく成功する)。C の自動は 8秒ごと。
const AUTO_MS = 8000;

export function MemberErrorView() {
  const router = useRouter();
  const { settings, logout } = useMock();
  const [checking, setChecking] = useState(false);
  const c = settings.memberError === "c";

  useEffect(() => {
    if (!c || checking) return;
    const t = setTimeout(() => setChecking(true), AUTO_MS);
    return () => clearTimeout(t);
  }, [c, checking]);

  useEffect(() => {
    if (!checking) return;
    const t = setTimeout(() => router.push("/mock/top/"), 1000);
    return () => clearTimeout(t);
  }, [checking, router]);

  if (checking) return <CheckingView />;

  return (
    <EntryFrame>
      <NameRow />
      <h1 className="mt-6 text-2xl font-heading">つながりませんでした</h1>
      <p className="mt-4 text-base text-foreground">
        通信できなかったため、世帯を確かめられませんでした。電波のよい場所で、もう一度お試しください。
      </p>
      {c ? (
        <p role="status" className="mt-4 text-base text-muted-foreground">
          数秒ごとに、自動でもう一度確かめます。
        </p>
      ) : (
        <>
          <Button type="button" className="mt-6 w-full" onClick={() => setChecking(true)}>
            もう一度
          </Button>
          {settings.memberError === "a" ? (
            <Button
              type="button"
              variant="ghost"
              size="text"
              className="mt-2 w-full"
              onClick={() => {
                logout();
                router.push("/mock/login/");
              }}
            >
              ログアウト
            </Button>
          ) : null}
        </>
      )}
      <MockNote />
    </EntryFrame>
  );
}
