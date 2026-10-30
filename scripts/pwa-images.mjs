// アイコンと起動時の画面の PNG を作る(30_architecture.md D-19、OD-stock-uiux-23・24)。
// tokens.css を読み込んだ型紙(scripts/pwa-images/template.html)を Playwright の WebKit で開き、スクリーンショットにする。
// 色は型紙の中で var(--…) だけで塗る。文字は Zen Maru Gothic(SIL OFL 1.1)を、この実行のときだけ Google Fonts から読む。
// フォントのファイルは app/ に置かない。置くのは作った PNG だけ。
// 品質ゲートには入れない。トークンか絵柄を変えたとき、人が `npm run pwa-images` を実行して PNG を commit する。
// 前提: npm run e2e:install(WebKit)と、ネットワーク。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, ".playwright-browsers");
const { webkit } = await import("@playwright/test");

const tokensCss = fs.readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");
const template = fs.readFileSync(path.join(root, "scripts/pwa-images/template.html"), "utf8");
const devices = JSON.parse(fs.readFileSync(path.join(root, "src/pwa/startup-devices.json"), "utf8")).devices;

const browser = await webkit.launch();

async function render({ width, height, ratio, html, out }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: ratio });
  const page = await context.newPage();
  await page.setContent(template, { waitUntil: "networkidle" });
  await page.evaluate(({ css, body }) => {
    document.getElementById("tokens").textContent = css;
    document.getElementById("root").innerHTML = body;
  }, { css: tokensCss, body: html });
  const faces = await page.evaluate(() => document.fonts.load('700 40px "Zen Maru Gothic"', "もっちりファミリー"));
  await page.evaluate(() => document.fonts.ready);
  if (faces.length === 0) throw new Error("Zen Maru Gothic を読み込めなかった(ネットワークを確認)");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: false });
  await context.close();
  console.log(`wrote ${path.relative(root, out)} (${width * ratio}x${height * ratio})`);
}

// アイコン: 桜色(primary)の正方形に「も」(高さ約 55%、中央)。角は丸めない・透明にしない(iOS が丸める)。
for (const [size, out] of [
  [192, "public/icons/icon-192.png"],
  [512, "public/icons/icon-512.png"],
  [180, "src/app/apple-icon.png"],
]) {
  await render({
    width: size, height: size, ratio: 1,
    html: `<div class="icon" style="width:${size}px;height:${size}px;font-size:${size * 0.55}px">も</div>`,
    out: path.join(root, out),
  });
}

// 起動時の画面: 地(background)、中央に「も」(短い辺の 20%)、その下に「もっちりファミリー」。縦・横とも同じ構図。
fs.rmSync(path.join(root, "public/splash"), { recursive: true, force: true });
for (const d of devices) {
  for (const [w, h] of [[d.width, d.height], [d.height, d.width]]) {
    const short = Math.min(w, h);
    await render({
      width: w, height: h, ratio: d.ratio,
      html: `<div class="splash" style="width:${w}px;height:${h}px"><div style="font-size:${short * 0.2}px;line-height:1">も</div><div class="label">もっちりファミリー</div></div>`,
      out: path.join(root, "public/splash", `${w * d.ratio}x${h * d.ratio}.png`),
    });
  }
}

await browser.close();
