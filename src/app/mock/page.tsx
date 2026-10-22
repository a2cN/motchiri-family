import type { Metadata } from "next";
import { MockIndexScreen } from "./_components/mock-index-view";

export const metadata: Metadata = { title: { absolute: "モックの目次 | モック" } };

// モックの目次(40_design_brief.md rev2「目次」)。
export default function MockIndex() {
  return <MockIndexScreen />;
}
