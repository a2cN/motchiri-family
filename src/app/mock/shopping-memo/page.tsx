import type { Metadata } from "next";
import { Suspense } from "react";
import { ShoppingMemoView } from "../_views/shopping-list-view";

export const metadata: Metadata = { title: "買い物メモ" };

export default function Page() {
  return (
    <Suspense>
      <ShoppingMemoView />
    </Suspense>
  );
}
