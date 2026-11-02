import type { Metadata } from "next";
import { TopView } from "../_components/top-view";

export const metadata: Metadata = { title: { absolute: "トップ | モック" } };

export default function Page() {
  return <TopView />;
}
