import type { Metadata } from "next";
import { MastersScreen } from "../_components/masters-view";

export const metadata: Metadata = { title: { absolute: "マスタ | モック" } };

export default function Page() {
  return <MastersScreen />;
}
