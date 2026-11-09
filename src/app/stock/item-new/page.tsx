import type { Metadata } from "next";
import { ItemNewView } from "@/components/stock/item-new-view";

export const metadata: Metadata = { title: "品物の登録" };

export default function ItemNewPage() {
  return <ItemNewView />;
}
