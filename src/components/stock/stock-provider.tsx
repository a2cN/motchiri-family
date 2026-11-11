"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { StockStore, type FailureNotice, type StockSnapshot } from "@/modules/stock/store";
import type { RegistrationInput } from "@/modules/stock/registration";
import { StockToaster } from "./frame";
import { notify } from "./bits";

// 倉庫の store の Provider(30_architecture.md D-19)。倉庫の画面の間を移っても同じ store。
// 失敗の知らせ(保存できなかった・もう使い切られていた)は、ここで通知にする。

type Refill = { input: RegistrationInput; nonce: number };

type StockContextValue = {
  store: StockStore;
  /** 登録の失敗の「入れ直す」: 失敗した入力を持って品物の登録を開く */
  refill: Refill | null;
  requestRefill: (input: RegistrationInput) => void;
  consumeRefill: () => void;
};

const StockContext = createContext<StockContextValue | null>(null);

/** 失敗の知らせの文(docs/design/stock-master/ OD-stock-master-02 (1)(2)) */
export function failureMessage(n: FailureNotice): string {
  switch (n.kind) {
    case "gone":
      return `${n.itemName}の在庫は、もうありませんでした`;
    case "item_gone":
    case "master_gone":
      return `${n.itemName}は、もう削除されていました`;
    case "in_use":
      return `${n.itemName}は使用中になったため、削除できませんでした`;
    case "name_taken":
      return `同じ名前の${n.subject ?? "品物"}があるため、「${n.itemName}」${n.adding ? "を追加" : "に"}できませんでした`;
    case "undo_failed":
      return `${n.itemName}を元に戻せませんでした`;
    default:
      return `${n.itemName}を保存できませんでした。電波のよい場所で、もう一度お試しください。`;
  }
}

export function StockProvider({ children }: { children: React.ReactNode }) {
  const { householdId } = useAuth();
  if (!householdId) return null;
  return <Inner householdId={householdId}>{children}</Inner>;
}

function Inner({ householdId, children }: { householdId: string; children: React.ReactNode }) {
  const store = useMemo(() => new StockStore(householdId), [householdId]);
  const router = useRouter();
  const pathname = usePathname();
  const [refill, setRefill] = useState<Refill | null>(null);

  useEffect(() => {
    store.start();
    const off = store.onFailure((n) => notify(failureMessage(n)));
    return () => {
      off();
      store.stop();
    };
  }, [store]);

  const requestRefill = useCallback(
    (input: RegistrationInput) => {
      setRefill({ input, nonce: Date.now() });
      if (!pathname.replace(/\/$/, "").endsWith("/stock/item-new")) router.push("/stock/item-new/");
    },
    [pathname, router],
  );
  const consumeRefill = useCallback(() => setRefill(null), []);

  const value = useMemo(() => ({ store, refill, requestRefill, consumeRefill }), [store, refill, requestRefill, consumeRefill]);
  return (
    <StockContext.Provider value={value}>
      {children}
      <StockToaster />
    </StockContext.Provider>
  );
}

export function useStockContext(): StockContextValue {
  const v = useContext(StockContext);
  if (!v) throw new Error("useStock は StockProvider の中でだけ使える");
  return v;
}

export function useStock(): { store: StockStore; snapshot: StockSnapshot } {
  const { store } = useStockContext();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { store, snapshot };
}

/** 条件が真になってから ms 経ったら true(読み込み中の文字を、1秒までは出さない) */
export function useAfterDelay(active: boolean, ms: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setElapsed(true), ms);
    return () => {
      clearTimeout(t);
      setElapsed(false);
    };
  }, [active, ms]);
  return active && elapsed;
}
