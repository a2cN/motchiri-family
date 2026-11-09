import type { Metadata } from "next";
import { StockListView } from "@/components/stock/stock-list-view";

export const metadata: Metadata = { title: "もっちり倉庫" };

export default function StockPage() {
  return <StockListView />;
}
