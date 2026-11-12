import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { findBottomOverlap, findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";

// stock-supply のモックの画面ごとのスクリーンショットと検査(40_design_brief.md「撮るスクリーンショット」)。
// 出力先は E2E_SCREENSHOT_DIR/<プロジェクト名>/。時計は 2026-10-23(金)正午に固定する。モックと一緒に消える。
// 通知が出る状態(toast: true)は、通知つきの見える範囲の画像に加えて、通知を閉じたあとのページ全体の画像(-full)も撮る
// (通知の下に隠れる行を確かめるため。run 2 のスクリーンショットで通知が行を隠した)。
const dir = path.resolve(process.env.E2E_SCREENSHOT_DIR ?? "e2e-artifacts/mock-screenshots");

type Shot = { file: string; url: string; full?: boolean; toast?: boolean };
const stock = (state?: string): Shot => ({ file: `mock-stock${state ? `-${state}` : ""}.png`, url: `mock/stock/${state ? `?state=${state}` : ""}`, full: state === "full" });
const supply = (state?: string, toast = false): Shot => ({
  file: `mock-supply${state ? `-${state}` : ""}.png`,
  url: `mock/supply/${state ? `?state=${state}` : ""}`,
  full: state === "full",
  toast,
});
const itemNew = (state?: string): Shot => ({
  file: `mock-item-new-supply${state ? `-${state}` : ""}.png`,
  url: `mock/item-new/?from=supply${state ? `&state=${state}` : ""}`,
  full: state === "full" || state === "count-full",
});
const items = (kind: "supply" | "food", state?: string): Shot => ({
  file: `mock-items-${kind}${state ? `-${state}` : ""}.png`,
  url: `mock/items/?kind=${kind}${state ? `&state=${state}` : ""}`,
  full: state === "full",
});
const edit = (id: string, state?: string): Shot => ({
  file: `mock-item-edit-${id}${state ? `-${state}` : ""}.png`,
  url: `mock/item-edit/?id=${id}&from=supply${state ? `&state=${state}` : ""}`,
  full: state === "full",
});

const shots: Shot[] = [
  stock(), stock("full"),
  supply(), supply("full"), supply("used-up", true), supply("error"), supply("offline", true), supply("save-failed", true), supply("item-gone", true),
  itemNew(), itemNew("full"), itemNew("count-full"), itemNew("kind-error"),
  items("supply"), items("supply", "full"), items("food", "full"),
  edit("shampoo"), edit("shampoo", "full"), edit("toilet", "full"),
];

for (const s of shots) {
  test(s.file, async ({ page }, info) => {
    await page.clock.setFixedTime(new Date("2026-10-23T12:00:00+09:00"));
    const response = await page.goto(s.url);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForTimeout(700); // 通知の出入りと描画が落ち着くまで
    const out = path.join(dir, info.project.name);
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, s.file), fullPage: !!s.full });
    expect(await findHorizontalOverflow(page)).toBeNull();
    expect(await findSmallInputs(page)).toEqual([]);
    expect(await findSmallTapTargets(page)).toEqual([]);
    if (!s.full) expect(await findBottomOverlap(page)).toBeNull();
    if (s.toast) {
      // 通知を閉じて、ページ全体を撮り直す(通知の下に隠れていた行が見える)
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(1);
      await page.evaluate(() => (window as unknown as { __mockDismissToast?: () => void }).__mockDismissToast?.());
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
      await page.screenshot({ path: path.join(out, s.file.replace(/\.png$/, "-full.png")), fullPage: true });
    }
  });
}
