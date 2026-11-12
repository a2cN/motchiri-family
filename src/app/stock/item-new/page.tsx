import type { Metadata } from "next";
import { Suspense } from "react";
import { ItemNewView } from "@/components/stock/item-new-view";

export const metadata: Metadata = { title: "品物の登録" };

// ?from= は useSearchParams で読むので Suspense の中に置く(静的書き出し。30_architecture.md S-10)
export default function ItemNewPage() {
  return (
    <Suspense>
      <ItemNewView />
    </Suspense>
  );
}
