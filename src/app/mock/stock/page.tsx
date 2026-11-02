import type { Metadata } from "next";
import { StockView } from "../_components/stock-view";

export const metadata: Metadata = { title: { absolute: "もっちり倉庫 | モック" } };

export default function Page() {
  return <StockView />;
}
