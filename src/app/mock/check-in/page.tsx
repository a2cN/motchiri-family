import type { Metadata } from "next";
import { CheckInScreen } from "../_components/check-in-view";

export const metadata: Metadata = { title: { absolute: "在庫登録 | モック" } };

export default function Page() {
  return <CheckInScreen />;
}
