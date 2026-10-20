import type { Metadata } from "next";
import { PageTitle, ScreenHeader, ScreenMain } from "../../_components/screen-frame";
import { screenMetadata } from "../../_components/screen-meta";
import { StockView } from "../../_components/stock-view";

type Props = { params: Promise<{ direction: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return screenMetadata(params, "在庫");
}

export default async function StockPage({ params }: Props) {
  const { direction } = await params;
  return (
    <>
      <ScreenHeader backHref={`/mock/${direction}/`} backLabel="もどる" />
      <ScreenMain>
        <PageTitle>もっちり倉庫</PageTitle>
        <StockView />
      </ScreenMain>
    </>
  );
}
