import type { Metadata } from "next";
import { SupplyScreen } from "../_components/supply-view";

export const metadata: Metadata = { title: { absolute: "日用品の残量 | モック" } };

export default function Page() {
  return <SupplyScreen />;
}
