"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { shoppingListHref } from "@/modules/stock/routes";
import { loadStateBody } from "./bits";
import { Frame } from "./frame";
import { OFFLINE_BODY, OfflineNote } from "./shopping-bits";
import { useShopping } from "./shopping-provider";
import { useAfterDelay } from "./stock-provider";

// 買い物メモの画面(docs/design/stock/ の mock-shopping-memo.png)。保存のボタンは無い。打った内容は全文を1つの値として送る(後勝ち。ADR 0004 §2)。

export function ShoppingMemoView() {
  const { store, snapshot } = useShopping();
  const { load, connection, hasLocalCopy, memo, pendingCount } = snapshot;
  const offline = connection === "offline";
  const showLoadingText = useAfterDelay(load === "loading", 1000);
  const frame = { back: "list", backHref: shoppingListHref(), active: "shopping-list", title: "買い物メモ", widthClass: "max-w-[40rem]" } as const;

  const state = loadStateBody({ load, offline: offline && !hasLocalCopy, showLoadingText, noun: "買い物メモ", onRetry: () => store.reload(), className: "mt-4" });
  if (state !== null) return <Frame {...frame}>{state}</Frame>;

  return (
    <Frame {...frame}>
      {offline && (
        <OfflineNote className="mt-4" pending={pendingCount}>
          {OFFLINE_BODY}
        </OfflineNote>
      )}
      <Label htmlFor="shopping-memo" className="sr-only">
        買い物メモ
      </Label>
      <Textarea id="shopping-memo" className="mt-4 min-h-[50dvh] rounded-lg" value={memo?.body ?? ""} maxLength={10_000} onChange={(e) => store.setMemo(e.target.value)} />
    </Frame>
  );
}
