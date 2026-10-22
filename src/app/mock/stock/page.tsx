import type { Metadata } from "next";
import { StockScreen } from "../_components/stock-view";

export const metadata: Metadata = { title: { absolute: "食材の在庫 | モック" } };

export default function Page() {
  return <StockScreen />;
}
