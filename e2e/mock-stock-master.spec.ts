import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { findBottomOverlap, findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";

// stock-master のモックの画面ごとのスクリーンショットと検査(40_design_brief.md「撮るスクリーンショット」)。
// 出力先は E2E_SCREENSHOT_DIR/<プロジェクト名>/。時計は 2026-10-23(金)正午に固定する。モックと一緒に消える。
const dir = path.resolve(process.env.E2E_SCREENSHOT_DIR ?? "e2e-artifacts/mock-screenshots");

type Shot = { file: string; url: string; full?: boolean };
const stock = (state?: string): Shot => ({ file: `mock-stock${state ? `-${state}` : ""}.png`, url: `mock/stock/${state ? `?state=${state}` : ""}`, full: state === "full" });
const items = (state?: string): Shot => ({ file: `mock-items${state ? `-${state}` : ""}.png`, url: `mock/items/${state ? `?state=${state}` : ""}`, full: state === "full" });
const masters = (state?: string): Shot => ({ file: `mock-masters${state ? `-${state}` : ""}.png`, url: `mock/masters/${state ? `?state=${state}` : ""}`, full: state === "full" });
const edit = (id: string, state?: string): Shot => ({
  file: `mock-item-edit-${id}${state ? `-${state}` : ""}.png`,
  url: `mock/item-edit/?id=${id}${state ? `&state=${state}` : ""}`,
  full: state === "full",
});

const shots: Shot[] = [
  stock(), ...["full", "regular-only", "gone"].map(stock),
  items(), ...["full", "empty", "undo", "undo-failed"].map(items),
  edit("milk"), ...["full", "tracking", "tracking-undo", "name-error", "item-gone", "offline"].map((s) => edit("milk", s)),
  edit("soy", "tracking"), edit("pork", "unit"),
  masters(), ...["full", "default-cleared", "in-use", "name-taken", "error", "offline", "offline-tap"].map(masters),
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
  });
}
