import type { Metadata } from "next";
import Link from "next/link";
import { BackHeader, Main } from "@/components/site-header";

export const metadata: Metadata = { title: "ページが見つかりません" };

export default function NotFound() {
  return (
    <>
      <BackHeader />
      <Main>
        <h1 className="text-2xl font-bold">ページが見つかりません</h1>
        <p className="text-base text-muted-foreground">
          アドレスがまちがっているか、ページが移動しました。
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-11 items-center text-base text-foreground underline"
        >
          トップへもどる
        </Link>
      </Main>
    </>
  );
}
