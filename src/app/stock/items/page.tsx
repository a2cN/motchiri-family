import type { Metadata } from "next";
import { ItemsView } from "@/components/stock/items-view";

export const metadata: Metadata = { title: "品物の一覧" };

export default function ItemsPage() {
  return <ItemsView />;
}
