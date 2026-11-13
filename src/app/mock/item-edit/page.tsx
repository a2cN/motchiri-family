import type { Metadata } from "next";
import { Suspense } from "react";
import { ItemEditView } from "../_views/item-edit-view";

export const metadata: Metadata = { title: "品物の編集" };

export default function Page() {
  return (
    <Suspense>
      <ItemEditView />
    </Suspense>
  );
}
