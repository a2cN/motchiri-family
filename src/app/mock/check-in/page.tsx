import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckInView } from "../_views/check-in-view";

export const metadata: Metadata = { title: "在庫に登録" };

export default function Page() {
  return (
    <Suspense>
      <CheckInView />
    </Suspense>
  );
}
