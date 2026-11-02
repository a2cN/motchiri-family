import type { Metadata } from "next";
import { LaunchView } from "../_components/launch-view";

export const metadata: Metadata = { title: { absolute: "起動のながれ | モック" } };

export default function Page() {
  return <LaunchView />;
}
