import type { Metadata } from "next";
import { Suspense } from "react";
import { MastersView } from "@/components/stock/masters-view";

export const metadata: Metadata = { title: "マスタ" };

// ?from= は useSearchParams で読むので Suspense の中に置く(静的書き出し。30_architecture.md S-10)
export default function MastersPage() {
  return (
    <Suspense>
      <MastersView />
    </Suspense>
  );
}
