// モジュールの登録の一覧(PT-04)。モジュールを足すときに変えるのは、
// ここの1行と、src/app/<id>/page.tsx の2つだけ。
export type PortalModule = {
  id: string; // 要件定義 §1 の識別子(例: 'stock')
  name: string; // 画面の文言(例: 'もっちり倉庫')
  href: `/${string}/`; // basePath を含まない、末尾スラッシュ付きのパス
};

export const portalModules: readonly PortalModule[] = [
  { id: "stock", name: "もっちり倉庫", href: "/stock/" },
];
