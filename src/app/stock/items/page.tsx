import type { Metadata } from "next";
import { Suspense } from "react";
import { ItemsView } from "@/components/stock/items-view";

export const metadata: Metadata = { title: "品物の一覧" };

// ?from=・?kind= は useSearchParams で読むので Suspense の中に置く(静的書き出し。30_architecture.md S-10)
export default function ItemsPage() {
  return (
    <Suspense>
      <ItemsView />
    </Suspense>
  );
}
