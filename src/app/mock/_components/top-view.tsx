"use client";

import Link from "next/link";
import { portalModules } from "@/modules/registry";
import { useMock } from "../_state/mock-state";
import { MockMain, MockNote, MockPortalHeader } from "./bits";
import { LogoutButton, LogoutConfirm } from "./logout-control";

// トップ(足場の正典 §2)の写し + ログアウトの導線(OD-16)とログイン中の人(OD-17)。
export function TopView() {
  const { settings, email } = useMock();
  const pos = settings.logoutPos;
  const showWho = settings.who === "a";
  const who = (
    <p className="text-base wrap-anywhere text-muted-foreground">ログイン中: {email}</p>
  );
  return (
    <>
      <MockPortalHeader right={pos === "a" ? undefined : <LogoutButton variant="header" />} />
      <MockMain>
        {pos === "a" ? null : <LogoutConfirm />}
        <ul className={`grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4 ${pos === "a" ? "" : "mt-4"}`}>
          {portalModules.map((m) => (
            <li key={m.id}>
              <Link
                href={`/mock${m.href}`}
                className="flex min-h-28 items-center justify-between rounded-lg bg-primary p-5 text-xl font-bold text-primary-foreground no-underline shadow-card active:bg-accent"
              >
                <span>{m.name}</span>
                <span aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
        {pos === "a" ? (
          <section aria-label="アカウント" className="mt-12">
            {showWho ? <div className="mb-3">{who}</div> : null}
            <LogoutButton variant="section" />
            <LogoutConfirm />
          </section>
        ) : showWho ? (
          <section aria-label="アカウント" className="mt-12">
            {who}
          </section>
        ) : null}
        <MockNote />
      </MockMain>
    </>
  );
}
