import type { Metadata } from "next";
import { Suspense } from "react";
import { StockView } from "../_views/stock-view";

export const metadata: Metadata = { title: "食材の在庫" };

export default function Page() {
  return (
    <Suspense>
      <StockView />
    </Suspense>
  );
}
