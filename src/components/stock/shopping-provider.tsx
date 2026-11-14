"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { DexieShoppingLocal } from "@/lib/local/shopping-local";
import { ShoppingStore, type ShoppingFailureNotice } from "@/modules/shopping/store";
import type { ShoppingSnapshot } from "@/modules/shopping/types";
import type { StockStore } from "@/modules/stock/store";
import { notify } from "./bits";

// 買い物リストの store の Provider(30_architecture.md Interfaces §6)。倉庫の Provider の内側に置き、倉庫の画面の間を移っても同じ store。
// 倉庫の store とは、品物の削除の控え(setShoppingHooks)と、手入力の候補(品物の名前の写し)でつなぐ。

const ShoppingContext = createContext<ShoppingStore | null>(null);

/** 拒まれた送信・元に戻せなかった文(docs/design/stock-shopping/ OD-stock-shopping-02 (6) A: 助言なし) */
export function shoppingFailureMessage(n: ShoppingFailureNotice): string {
  return n.kind === "undo_failed" ? `${n.itemName}を元に戻せませんでした` : `${n.itemName}を保存できませんでした`;
}

export function ShoppingProvider({ stockStore, children }: { stockStore: StockStore; children: React.ReactNode }) {
  const { householdId, userId } = useAuth();
  // 端末のデータは Dexie(part 2)。持ち主(世帯・利用者)が違う写しは、使う前に消える(L-19)
  const store = useMemo(
    () => (householdId ? new ShoppingStore(householdId, { local: new DexieShoppingLocal({ householdId, userId }) }) : null),
    [householdId, userId],
  );

  useEffect(() => {
    if (!store) return;
    store.start();
    stockStore.setShoppingHooks(store);
    const off = store.onFailure((n) => notify(shoppingFailureMessage(n)));
    // 手入力の候補: 倉庫の store が読み込めたら、品物の名前の写しを渡す(読むだけ。ADR 0004 §1)
    const feed = () => {
      const snap = stockStore.getSnapshot();
      if (snap.load === "ready") {
        store.setCandidates(snap.data.items.map((i) => ({ id: i.id, name: i.name, itemKind: i.itemKind })).sort((a, b) => a.name.localeCompare(b.name, "ja")));
      }
    };
    feed();
    const unsubscribe = stockStore.subscribe(feed);
    return () => {
      unsubscribe();
      off();
      stockStore.setShoppingHooks(null);
      store.stop();
    };
  }, [store, stockStore]);

  if (!store) return <>{children}</>;
  return <ShoppingContext.Provider value={store}>{children}</ShoppingContext.Provider>;
}

export function useShopping(): { store: ShoppingStore; snapshot: ShoppingSnapshot } {
  const store = useContext(ShoppingContext);
  if (!store) throw new Error("useShopping は ShoppingProvider の中でだけ使える");
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { store, snapshot };
}
