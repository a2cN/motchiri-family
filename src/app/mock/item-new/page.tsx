import type { Metadata } from "next";
import { Suspense } from "react";
import { ItemNewView } from "../_views/item-new-view";

export const metadata: Metadata = { title: "品物の登録" };

export default function Page() {
  return (
    <Suspense>
      <ItemNewView />
    </Suspense>
  );
}
