import type { Metadata } from "next";
import { SupplyView } from "@/components/stock/supply-view";

export const metadata: Metadata = { title: "日用品" };

export default function SupplyPage() {
  return <SupplyView />;
}
