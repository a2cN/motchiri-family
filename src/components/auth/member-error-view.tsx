"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "./auth-context";
import { EntryFrame, NameRow } from "./entry-frame";

// 世帯を確かめられなかった画面(OD-auth-household-13 A)。「もう一度」と「ログアウト」。
export function MemberErrorView() {
  const { retry, signOut } = useAuth();
  return (
    <EntryFrame>
      <NameRow />
      <h1 className="mt-6 text-2xl font-heading">つながりませんでした</h1>
      <p className="mt-4 text-base text-foreground">
        通信できなかったため、世帯を確かめられませんでした。電波のよい場所で、もう一度お試しください。
      </p>
      <Button type="button" className="mt-6 w-full" onClick={retry}>
        もう一度
      </Button>
      <Button type="button" variant="ghost" size="text" className="mt-2 w-full" onClick={() => void signOut()}>
        ログアウト
      </Button>
    </EntryFrame>
  );
}
