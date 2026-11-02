"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useMock } from "../_state/mock-state";
import { CheckingView } from "./checking-view";
import { EntryFrame, MockNote, NameRow } from "./bits";

// 世帯に結びついていない画面(OD-14・15・17)。
const COPY = {
  a: {
    h1: "まだ世帯に入っていません",
    body: "このアカウントは、まだ世帯に結びついていないため、使えません。管理者に、世帯に入れてもらってください。",
    hint: "入れてもらったら、いったんログアウトして、もう一度ログインしてください。",
  },
  b: { h1: "このアカウントでは使えません", body: "管理者に知らせてください。", hint: null },
  c: {
    h1: "準備がまだ終わっていません",
    body: "このアカウントの準備が、まだ終わっていません。管理者に知らせてください。",
    hint: "入れてもらったら、いったんログアウトして、もう一度ログインしてください。",
  },
} as const;

export function UnlinkedView() {
  const router = useRouter();
  const { settings, email, logout } = useMock();
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!checking) return;
    const t = setTimeout(() => setChecking(false), 1000);
    return () => clearTimeout(t);
  }, [checking]);

  if (checking) return <CheckingView />;

  const copy = COPY[settings.unlinkedCopy];
  const retry = settings.unlinkedRetry === "on";
  const hint = copy.hint ? (retry ? "入れてもらったら、「もう一度確かめる」を押してください。" : copy.hint) : null;
  const doLogout = () => {
    logout();
    router.push("/mock/login/");
  };

  return (
    <EntryFrame>
      <NameRow />
      <h1 className="mt-6 text-2xl font-heading">{copy.h1}</h1>
      <p className="mt-4 text-base text-foreground">{copy.body}</p>
      {hint ? <p className="mt-2 text-base text-muted-foreground">{hint}</p> : null}
      {settings.who !== "c" ? (
        <p className="mt-4 text-base wrap-anywhere text-muted-foreground">ログイン中: {email}</p>
      ) : null}
      {retry ? (
        <>
          <Button type="button" className="mt-6 w-full" onClick={() => setChecking(true)}>
            もう一度確かめる
          </Button>
          <Button type="button" variant="ghost" size="text" className="mt-2 w-full" onClick={doLogout}>
            ログアウト
          </Button>
        </>
      ) : (
        <Button type="button" variant="secondary" className="mt-6 w-full" onClick={doLogout}>
          ログアウト
        </Button>
      )}
      <MockNote />
    </EntryFrame>
  );
}
