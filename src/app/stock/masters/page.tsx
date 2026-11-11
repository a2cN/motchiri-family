import type { Metadata } from "next";
import { MastersView } from "@/components/stock/masters-view";

export const metadata: Metadata = { title: "マスタ" };

export default function MastersPage() {
  return <MastersView />;
}
