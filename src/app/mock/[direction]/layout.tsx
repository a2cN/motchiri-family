import { notFound } from "next/navigation";
import { MockToaster } from "../_components/mock-toaster";
import { MockProvider } from "../_state/mock-state";
import { DIRECTIONS, findDirection } from "../_data/directions";

// 1巡目の URL(30_architecture.md D-09): 案の数だけ静的に書き出す。状態の Provider はここに置く
// (レイアウトは画面の移動で作り直されないので、案の中を移動しても状態が続く。D-10)。
export const dynamicParams = false;

export function generateStaticParams() {
  return DIRECTIONS.map((d) => ({ direction: d.id }));
}

export default async function DirectionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ direction: string }>;
}) {
  const { direction } = await params;
  const d = findDirection(direction);
  if (!d) notFound();
  // data-direction を持つ要素に、背景・文字・文字の並びを付ける(font-sans はその要素の位置で var(--font-sans) を読む。D の §2)
  return (
    <div data-direction={d.id} className="flex min-h-dvh flex-1 flex-col bg-background font-sans text-foreground">
      <MockProvider>{children}</MockProvider>
      {/* 「元に戻す」の表示も data-direction の中に置く(その案の色・角・影を読むため) */}
      <MockToaster />
    </div>
  );
}
