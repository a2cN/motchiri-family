import type { Metadata } from "next";
import { ItemEditScreen } from "../_components/item-edit-view";

export const metadata: Metadata = { title: { absolute: "品物の編集 | モック" } };

export default function Page() {
  return <ItemEditScreen />;
}
