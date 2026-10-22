import type { Metadata } from "next";
import { ItemNewScreen } from "../_components/item-new-view";

export const metadata: Metadata = { title: { absolute: "品物の登録 | モック" } };

export default function Page() {
  return <ItemNewScreen />;
}
