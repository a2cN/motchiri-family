import type { Metadata } from "next";
import { ShoppingMemoScreen } from "../_components/shopping-list-view";

export const metadata: Metadata = { title: { absolute: "買い物メモ | モック" } };

export default function Page() {
  return <ShoppingMemoScreen />;
}
