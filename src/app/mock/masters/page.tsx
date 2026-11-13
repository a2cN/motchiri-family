import type { Metadata } from "next";
import { Suspense } from "react";
import { MastersView } from "../_views/masters-view";

export const metadata: Metadata = { title: "マスタ" };

export default function Page() {
  return (
    <Suspense>
      <MastersView />
    </Suspense>
  );
}
