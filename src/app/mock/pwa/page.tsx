import type { Metadata } from "next";
import { PwaScreen } from "../_components/pwa-view";

export const metadata: Metadata = { title: { absolute: "アイコンと起動時の画面 | モック" } };

export default function Page() {
  return <PwaScreen />;
}
