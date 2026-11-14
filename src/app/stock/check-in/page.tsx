import type { Metadata } from "next";
import { CheckInView } from "@/components/stock/check-in-view";

export const metadata: Metadata = { title: "在庫に登録" };

export default function CheckInPage() {
  return <CheckInView />;
}
