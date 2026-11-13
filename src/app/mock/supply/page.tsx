import type { Metadata } from "next";
import { Suspense } from "react";
import { SupplyView } from "../_views/supply-view";

export const metadata: Metadata = { title: "日用品" };

export default function Page() {
  return (
    <Suspense>
      <SupplyView />
    </Suspense>
  );
}
