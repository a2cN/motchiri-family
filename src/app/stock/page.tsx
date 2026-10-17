import type { Metadata } from "next";
import { BackHeader, Main } from "@/components/site-header";

export const metadata: Metadata = { title: "もっちり倉庫" };

export default function StockPage() {
  return (
    <>
      <BackHeader />
      <Main>
        <h1 className="text-2xl font-bold">もっちり倉庫</h1>
        <section className="mt-4 rounded-lg bg-muted p-6">
          <h2 className="text-lg font-bold">まだ在庫はありません</h2>
          <p className="text-base text-muted-foreground">
            食材と日用品の在庫は、ここに並ぶ予定です。いまは準備中です。
          </p>
        </section>
      </Main>
    </>
  );
}
