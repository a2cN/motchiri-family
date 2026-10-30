import data from "./startup-devices.json";

// 起動時の画面(apple-touch-startup-image)の一覧(30_architecture.md D-18)。
// 機種の大きさは startup-devices.json の1か所に持ち、scripts/pwa-images.mjs(画像を作る)と
// src/app/layout.tsx(link を出す)が同じものを読む。media が機種と一致しない画像は iOS が使わない。
export type StartupImage = { url: string; media: string; file: string; width: number; height: number };

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const startupImages: StartupImage[] = data.devices.flatMap((d) =>
  (["portrait", "landscape"] as const).map((orientation) => {
    const w = d.width * d.ratio;
    const h = d.height * d.ratio;
    const [pxW, pxH] = orientation === "portrait" ? [w, h] : [h, w];
    const file = `${pxW}x${pxH}.png`;
    return {
      // basePath は Next が付けるかに頼らず、自分で付ける(manifest と同じ)
      url: `${basePath}/splash/${file}`,
      media: `(device-width: ${d.width}px) and (device-height: ${d.height}px) and (-webkit-device-pixel-ratio: ${d.ratio}) and (orientation: ${orientation})`,
      file,
      width: pxW,
      height: pxH,
    };
  }),
);
