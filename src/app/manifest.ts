import type { MetadataRoute } from "next";

// Web App Manifest(PT-05)。静的書き出しなので force-static にして out/manifest.webmanifest を出す。
// theme_color / background_color は書かない(30_architecture.md D-18: 色の置き場所を tokens.css の1か所に保つ)。
// Next は manifest の中の start_url・icons に basePath を自動では付けないので、自分で付ける。
export const dynamic = "force-static";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "もっちりファミリー",
    short_name: "もっちりファミリー",
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: "standalone",
    lang: "ja",
    icons: [
      { src: `${basePath}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${basePath}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
  };
}
