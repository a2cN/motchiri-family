import type { Metadata } from "next";
import { Suspense } from "react";
import { ItemEditView } from "@/components/stock/item-edit-view";

export const metadata: Metadata = { title: "品物の編集" };

// ?id= は useSearchParams で読むので Suspense の中に置く(静的書き出し。30_architecture.md D-18)
export default function ItemEditPage() {
  return (
    <Suspense>
      <ItemEditView />
    </Suspense>
  );
}
