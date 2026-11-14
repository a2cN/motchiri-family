import type { Metadata } from "next";
import { ShoppingListView } from "@/components/stock/shopping-list-view";

export const metadata: Metadata = { title: "買い物リスト" };

export default function ShoppingListPage() {
  return <ShoppingListView />;
}
