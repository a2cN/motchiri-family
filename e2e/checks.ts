import type { Page } from "@playwright/test";

// 画面の検査。自己テスト(checks.spec.ts)が、わざと違反を入れた DOM でこれらが「違反あり」と
// 判定することを毎回確かめる(30_architecture.md D-13、D-20)。

/** 横スクロールが出ているか(PT-06)。出ていれば、その幅を返す。 */
export async function findHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const innerWidth = window.innerWidth;
    return scrollWidth > innerWidth ? { scrollWidth, innerWidth } : null;
  });
}

/** 文字が 16px 未満の入力欄(UI-05。16px 未満だと iOS の Safari が拡大してしまう)。 */
export async function findSmallInputs(page: Page) {
  return page.evaluate(() => {
    const els = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
    return Array.from(els)
      .map((el) => ({ tag: el.tagName.toLowerCase(), fontSize: parseFloat(getComputedStyle(el).fontSize) }))
      .filter((x) => x.fontSize < 16);
  });
}

/** 押せる範囲が 44×44px 未満のリンク・ボタン(UI-03)。 */
export async function findSmallTapTargets(page: Page) {
  return page.evaluate(() => {
    const els = document.querySelectorAll("a[href], button");
    return Array.from(els)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { text: (el.textContent ?? "").trim(), width: r.width, height: r.height };
      })
      .filter((x) => x.width < 44 || x.height < 44);
  });
}
