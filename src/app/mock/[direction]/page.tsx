import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SampleBook } from "../_components/sample-book";
import { PageTitle, ScreenHeader, ScreenMain } from "../_components/screen-frame";
import { screenMetadata } from "../_components/screen-meta";
import { findDirection } from "../_data/directions";

type Props = { params: Promise<{ direction: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return screenMetadata(params, "見本帳");
}

export default async function SampleBookPage({ params }: Props) {
  const { direction } = await params;
  const d = findDirection(direction);
  if (!d) notFound();
  return (
    <>
      <ScreenHeader backHref="/mock/" backLabel="モックの目次" />
      <ScreenMain>
        <PageTitle>
          案{d.letter} {d.name}
        </PageTitle>
        <p className="text-base text-muted-foreground">{d.tagline}</p>
        <SampleBook direction={d} />
      </ScreenMain>
    </>
  );
}
