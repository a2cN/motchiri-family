"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "./auth-context";
import { EntryFrame, NameRow } from "./entry-frame";

// 世帯に結びついていない画面(OD-auth-household-14 A・15 B・17 A)。「もう一度確かめる」は置かない。
export function UnlinkedView() {
  const { email, signOut } = useAuth();
  return (
    <EntryFrame>
      <NameRow />
      <h1 className="mt-6 text-2xl font-heading">まだ世帯に入っていません</h1>
      <p className="mt-4 text-base text-foreground">
        このアカウントは、まだ世帯に結びついていないため、使えません。管理者に、世帯に入れてもらってください。
      </p>
      <p className="mt-2 text-base text-muted-foreground">入れてもらったら、いったんログアウトして、もう一度ログインしてください。</p>
      {email ? <p className="mt-4 text-base wrap-anywhere text-muted-foreground">ログイン中: {email}</p> : null}
      <Button type="button" variant="secondary" className="mt-6 w-full" onClick={() => void signOut()}>
        ログアウト
      </Button>
    </EntryFrame>
  );
}
