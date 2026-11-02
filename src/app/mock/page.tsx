import type { Metadata } from "next";
import { MockIndexView } from "./_components/mock-index-view";

export const metadata: Metadata = { title: { absolute: "モックの目次 | モック" } };

export default function Page() {
  return <MockIndexView />;
}
