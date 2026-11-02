import type { Metadata } from "next";
import { UnlinkedView } from "../_components/unlinked-view";

export const metadata: Metadata = { title: { absolute: "世帯に入っていません | モック" } };

export default function Page() {
  return <UnlinkedView />;
}
