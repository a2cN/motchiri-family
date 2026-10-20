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

/**
 * 16px 未満の入力欄(UI-05。16px 未満だと iOS の Safari が拡大してしまう)。
 * 測らないもの(30_architecture.md D-15): aria-hidden の祖先を持つ要素、描かれていない要素(getClientRects が空)、
 * visibility: hidden の要素。部品の土台のライブラリが、フォームのために置く隠れた input を誤検出しないため。
 */
export async function findSmallInputs(page: Page) {
  return page.evaluate(() => {
    const els = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
    return Array.from(els)
      .filter(
        (el) =>
          !el.closest('[aria-hidden="true"]') &&
          el.getClientRects().length > 0 &&
          getComputedStyle(el).visibility !== "hidden",
      )
      .map((el) => ({ tag: el.tagName.toLowerCase(), fontSize: parseFloat(getComputedStyle(el).fontSize) }))
      .filter((x) => x.fontSize < 16);
  });
}

/**
 * 押せる範囲が 44×44px 未満のもの(UI-03)。
 * 対象(30_architecture.md D-15): リンク、ボタン、checkbox・radio、role が button / checkbox / switch / tab / option / menuitem のもの、summary。
 * <label> の中にある input と role=checkbox・radio・switch は、label の大きさを測る(行全体を押せる作りを正しく扱う)。
 * 測らないもの: aria-hidden の祖先を持つ要素、描かれていない要素、visibility: hidden の要素。
 * 擬似要素(::before など)で広げた押せる範囲は測れない。押せる範囲は要素自身か label の大きさで作る。
 */
export async function findSmallTapTargets(page: Page) {
  return page.evaluate(() => {
    const els = document.querySelectorAll(
      'a[href], button, input[type="checkbox"], input[type="radio"], [role="button"], [role="checkbox"], [role="switch"], [role="tab"], [role="option"], [role="menuitem"], summary',
    );
    return Array.from(els)
      .filter(
        (el) =>
          !el.closest('[aria-hidden="true"]') &&
          el.getClientRects().length > 0 &&
          getComputedStyle(el).visibility !== "hidden",
      )
      .map((el) => {
        const labelled = el.matches('input, [role="checkbox"], [role="radio"], [role="switch"]') ? el.closest("label") : null;
        const target = labelled ?? el;
        const r = target.getBoundingClientRect();
        const text = (target.textContent ?? "").trim() || target.getAttribute("aria-label") || target.tagName.toLowerCase();
        return { text, width: r.width, height: r.height };
      })
      .filter((x) => x.width < 44 || x.height < 44);
  });
}
