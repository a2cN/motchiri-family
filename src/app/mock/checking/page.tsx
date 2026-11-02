import type { Metadata } from "next";
import { CheckingView } from "../_components/checking-view";

export const metadata: Metadata = { title: { absolute: "確かめ中 | モック" } };

export default function Page() {
  return <CheckingView />;
}
