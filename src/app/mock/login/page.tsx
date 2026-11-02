import type { Metadata } from "next";
import { LoginView } from "../_components/login-view";

export const metadata: Metadata = { title: { absolute: "ログイン | モック" } };

export default function Page() {
  return <LoginView />;
}
