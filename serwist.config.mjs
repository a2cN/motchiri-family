// `serwist build`(@serwist/cli)の設定(30_architecture.md Interfaces §11)。next build のあと、out/ を数えて precache の一覧を作り、
// src/sw/sw.ts を esbuild で束ねて out/sw.js に書く。GitHub Pages の basePath(/motchiri-family/)と trailingSlash の URL に合わせる。

const BASE = "/motchiri-family/";
const LIMIT = 5 * 1024 * 1024;

// x/index.html → x/(trailingSlash: true の URL)、index.html → ""(ルート)
const toDirectoryUrl = async (entries) => ({
  manifest: entries.map((e) => {
    const url = e.url.replace(/(^|\/)index\.html$/, "$1");
    return { ...e, url };
  }),
  warnings: [],
});

// 起動のときに使われるのは機種ごとに1枚だけの画像(startup)。precache が上限を超えたら、これを外す
const dropStartupImages = (limit) => async (entries) => {
  const total = entries.reduce((n, e) => n + (e.size ?? 0), 0);
  if (total <= limit) return { manifest: entries, warnings: [] };
  const kept = entries.filter((e) => !/\/(splash\/|apple-)/.test(e.url));
  return { manifest: kept, warnings: [`precache が ${(total / 1048576).toFixed(2)} MB で上限 ${limit / 1048576} MB を超えたため、起動時の画像を外しました`] };
};

const report = async (entries) => {
  const total = entries.reduce((n, e) => n + (e.size ?? 0), 0);
  console.log(`[serwist] precache: ${entries.length} 件、${(total / 1048576).toFixed(2)} MB(上限 5 MB)`);
  if (total > LIMIT) throw new Error(`precache が 5 MB を超えています: ${total} bytes`);
  return { manifest: entries, warnings: [] };
};

const config = {
  swSrc: "src/sw/sw.ts",
  swDest: "out/sw.js",
  globDirectory: "out",
  globPatterns: ["**/*.{html,txt,js,css,png,ico,svg,webmanifest,json}"],
  // フォント(woff2)は precache に入れない(sw.ts の runtimeCaching)。mock と sw.js 自身も入れない
  globIgnores: ["sw.js", "sw.js.map", "**/*.woff2", "mock/**", "404.html"],
  modifyURLPrefix: { "": BASE },
  dontCacheBustURLsMatching: /\/_next\/static\//,
  maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
  manifestTransforms: [toDirectoryUrl, dropStartupImages(LIMIT), report],
};

export default config;
