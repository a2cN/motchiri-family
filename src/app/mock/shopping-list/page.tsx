import type { Metadata } from "next";
import { ShoppingListScreen } from "../_components/shopping-list-view";

export const metadata: Metadata = { title: { absolute: "買い物リスト | モック" } };

export default function Page() {
  return <ShoppingListScreen />;
}
