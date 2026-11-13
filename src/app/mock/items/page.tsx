import type { Metadata } from "next";
import { Suspense } from "react";
import { ItemsView } from "../_views/items-view";

export const metadata: Metadata = { title: "品物の一覧" };

export default function Page() {
  return (
    <Suspense>
      <ItemsView />
    </Suspense>
  );
}
