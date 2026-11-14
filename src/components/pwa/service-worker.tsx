"use client";

import { useEffect } from "react";

// service worker の登録と、新しい版への切り替え(30_architecture.md Interfaces §11、L-16)。見た目は無い。
// 本番の build だけ。切り替えは、(1) 起動の直後に待っている版があればすぐ、(2) 使っている間に届いたら画面が裏に回ったとき。
// 行列は IndexedDB にあるので、読み直しで失われない。

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const hadController = sw.controller !== null;
    // 切り替えを頼んだときだけ読み直す(最初の導入の clientsClaim による controllerchange では読み直さない)
    let switching = false;
    let reloading = false;
    const onControllerChange = () => {
      if (!switching || reloading) return;
      reloading = true;
      window.location.reload();
    };
    sw.addEventListener("controllerchange", onControllerChange);

    let registration: ServiceWorkerRegistration | null = null;
    const activate = (waiting: ServiceWorker | null) => {
      if (!waiting) return;
      switching = true;
      waiting.postMessage({ type: "SKIP_WAITING" });
    };
    const onVisibility = () => {
      if (!registration) return;
      if (document.visibilityState === "hidden") activate(registration.waiting);
      else void registration.update().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibility);

    void sw
      .register(`${BASE}/sw.js`, { scope: `${BASE}/` })
      .then((reg) => {
        registration = reg ?? null;
        // (1) 起動の直後に待っている版があれば、すぐ切り替える
        if (reg?.waiting && hadController) activate(reg.waiting);
      })
      .catch((e: unknown) => console.error("[sw] 登録に失敗", e));

    return () => {
      sw.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return null;
}
