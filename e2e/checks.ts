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

/**
 * 下に固定した帯・タブの裏に、本文の最後の要素が隠れていないか(40_design_brief.md rev2「rev1 のスクリーンショットから直すこと」)。
 * 一番下までスクロールして、`main` の中の最後の要素の下端が、固定した帯(`[data-bottom-stack]`)の上端より上にあることを確かめる。
 * 隠れていれば、その位置を返す。固定・絶対位置の要素(読み上げ用の隠れた文字など)と、描かれていない要素は測らない。
 */
export async function findBottomOverlap(page: Page) {
  return page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const stack = document.querySelector("[data-bottom-stack]");
    const stackRect = stack ? stack.getBoundingClientRect() : null;
    const stackTop = stackRect && stackRect.height > 0 ? stackRect.top : window.innerHeight;
    const main = document.querySelector("main");
    if (!main) return null;
    let maxBottom = 0;
    for (const el of Array.from(main.querySelectorAll("*"))) {
      const style = getComputedStyle(el);
      if (el.getClientRects().length === 0 || style.visibility === "hidden") continue;
      if (style.position === "absolute" || style.position === "fixed") continue;
      maxBottom = Math.max(maxBottom, el.getBoundingClientRect().bottom);
    }
    return maxBottom > stackTop + 0.5 ? { maxBottom, stackTop } : null;
  });
}
