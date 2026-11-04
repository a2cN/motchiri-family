"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SignInFailure } from "@/lib/supabase/auth";
import { useAuth } from "./auth-context";
import { EntryFrame, NameRow } from "./entry-frame";

// ログイン画面(OD-auth-household-09 A・10 A・11 A・18 A)。上寄せの1列。ログイン画面に専用の URL は無い(どの URL でも、その場で出る)。
// 新規登録・パスワードの再設定の入口は置かない(PT-02)。

const ERROR_TEXT: Record<SignInFailure, string> = {
  invalid_credentials: "メールアドレスかパスワードがちがいます。",
  network: "通信できませんでした。電波のよい場所で、もう一度ログインしてください。",
  rate_limited: "何度も試したため、いまはログインできません。しばらく待ってから、もう一度ログインしてください。",
  unknown: "ログインできませんでした。しばらく待ってから、もう一度ログインしてください。続くときは、管理者に知らせてください。",
};

const NOTICE_TEXT = {
  "logged-out": "ログアウトしました。",
  expired: "ログインが切れました。もう一度ログインしてください。",
} as const;

export function LoginView() {
  const { signIn, notice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [resultError, setResultError] = useState<SignInFailure | null>(null);
  const [sending, setSending] = useState(false);
  const [showNotice, setShowNotice] = useState(true);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [focusTarget, setFocusTarget] = useState<{ to: "email" | "password"; n: number } | null>(null);

  useEffect(() => {
    if (!focusTarget) return;
    (focusTarget.to === "email" ? emailRef : passwordRef).current?.focus();
  }, [focusTarget]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    const trimmed = email.trim();
    const eErr =
      trimmed === "" ? "メールアドレスを入れてください" : /^.+@.+$/.test(trimmed) ? null : "メールアドレスの形を確かめてください";
    const pErr = password === "" ? "パスワードを入れてください" : null;
    setEmailError(eErr);
    setPasswordError(pErr);
    setResultError(null);
    setShowNotice(false);
    if (eErr || pErr) {
      setFocusTarget({ to: eErr ? "email" : "password", n: Date.now() });
      return;
    }
    setSending(true);
    const result = await signIn(trimmed, password);
    setSending(false);
    if (!result.ok) {
      setResultError(result.reason);
      if (result.reason === "invalid_credentials") setFocusTarget({ to: "password", n: Date.now() });
    }
  }

  const credentialsInvalid = resultError === "invalid_credentials";
  const noticeText = showNotice && notice ? NOTICE_TEXT[notice] : null;

  return (
    <EntryFrame>
      <NameRow />
      <h1 className="mt-6 text-2xl font-heading">ログイン</h1>
      {noticeText ? (
        <p role="status" className="mt-4 rounded-lg bg-muted px-4 py-3 text-base text-foreground">
          {noticeText}
        </p>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="mt-6">
        <div>
          <Label htmlFor="login-email">メールアドレス</Label>
          <Input
            id="login-email"
            ref={emailRef}
            className="mt-2"
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            value={email}
            readOnly={sending}
            aria-invalid={emailError || credentialsInvalid ? true : undefined}
            aria-describedby={emailError ? "login-email-error" : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
            }}
          />
          {emailError ? (
            <p id="login-email-error" className="mt-2 text-base text-destructive">
              {emailError}
            </p>
          ) : null}
        </div>
        <div className="mt-4">
          <Label htmlFor="login-password">パスワード</Label>
          <div className="relative mt-2">
            <Input
              id="login-password"
              ref={passwordRef}
              className="pr-13"
              type={show ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              enterKeyHint="go"
              value={password}
              readOnly={sending}
              aria-invalid={passwordError || credentialsInvalid ? true : undefined}
              aria-describedby={passwordError ? "login-password-error" : undefined}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(null);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="パスワードを表示"
              aria-pressed={show}
              className="absolute top-0.5 right-0.5"
              onClick={() => setShow((v) => !v)}
            >
              {show ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
            </Button>
          </div>
          {passwordError ? (
            <p id="login-password-error" className="mt-2 text-base text-destructive">
              {passwordError}
            </p>
          ) : null}
        </div>
        {resultError ? (
          <div role="alert" className="mt-4 flex items-start gap-3 rounded-lg bg-alert px-4 py-3 text-base text-alert-foreground">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <p>{ERROR_TEXT[resultError]}</p>
          </div>
        ) : null}
        <Button type="submit" className="mt-6 w-full" aria-disabled={sending ? true : undefined}>
          {sending ? "ログインしています…" : "ログイン"}
        </Button>
      </form>
      <p className="mt-4 text-base text-muted-foreground">パスワードを忘れたときは、管理者に聞いてください。</p>
    </EntryFrame>
  );
}
