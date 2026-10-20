import type { Metadata } from "next";
import { PageTitle, ScreenHeader, ScreenMain } from "../../_components/screen-frame";
import { screenMetadata } from "../../_components/screen-meta";
import { ShoppingListView } from "../../_components/shopping-list-view";

type Props = { params: Promise<{ direction: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return screenMetadata(params, "買い物リスト");
}

export default async function ShoppingListPage({ params }: Props) {
  const { direction } = await params;
  return (
    <>
      <ScreenHeader backHref={`/mock/${direction}/`} backLabel="もどる" />
      <ScreenMain widthClass="max-w-[45rem]" withBar>
        <PageTitle>買い物リスト</PageTitle>
        <ShoppingListView />
      </ScreenMain>
    </>
  );
}
