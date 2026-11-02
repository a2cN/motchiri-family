import type { Metadata } from "next";
import { MemberErrorView } from "../_components/member-error-view";

export const metadata: Metadata = { title: { absolute: "つながりませんでした | モック" } };

export default function Page() {
  return <MemberErrorView />;
}
