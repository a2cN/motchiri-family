import type { Metadata } from "next";
import { ItemsScreen } from "../_components/items-view";

export const metadata: Metadata = { title: { absolute: "品物の一覧 | モック" } };

export default function Page() {
  return <ItemsScreen />;
}
