import type { Metadata } from "next";
import { Suspense } from "react";
import { ShoppingListView } from "../_views/shopping-list-view";

export const metadata: Metadata = { title: "買い物リスト" };

export default function Page() {
  return (
    <Suspense>
      <ShoppingListView />
    </Suspense>
  );
}
