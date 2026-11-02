import type { Metadata } from "next";
import { LoginView } from "../_components/login-view";

export const metadata: Metadata = { title: { absolute: "ログイン(ログインが切れたあと) | モック" } };

export default function Page() {
  return <LoginView expired />;
}
