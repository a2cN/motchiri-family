import type { Metadata } from "next";
import { ItemNewView } from "../../_components/item-new-view";
import { PageTitle, ScreenHeader, ScreenMain } from "../../_components/screen-frame";
import { screenMetadata } from "../../_components/screen-meta";

type Props = { params: Promise<{ direction: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return screenMetadata(params, "品物の登録");
}

export default async function ItemNewPage({ params }: Props) {
  const { direction } = await params;
  return (
    <>
      <ScreenHeader backHref={`/mock/${direction}/`} backLabel="もどる" />
      <ScreenMain widthClass="max-w-[40rem]" withBar barOnMobileOnly>
        <PageTitle>品物の登録</PageTitle>
        <ItemNewView />
      </ScreenMain>
    </>
  );
}
