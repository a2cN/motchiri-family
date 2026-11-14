import type { Metadata } from "next";
import { ShoppingMemoView } from "@/components/stock/shopping-memo-view";

export const metadata: Metadata = { title: "買い物メモ" };

export default function ShoppingMemoPage() {
  return <ShoppingMemoView />;
}
