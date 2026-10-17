import type { NextConfig } from "next";

// GitHub Pages のプロジェクトサイト(https://<owner>.github.io/motchiri-family/)に合わせる。
// 開発・E2E・本番のすべてで同じ値を使う(30_architecture.md D-03)。
const BASE_PATH = "/motchiri-family";

const nextConfig: NextConfig = {
  output: "export",
  basePath: BASE_PATH,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
