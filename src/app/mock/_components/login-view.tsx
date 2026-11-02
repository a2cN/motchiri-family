"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMock, type Settings } from "../_state/mock-state";
import { CheckingView } from "./checking-view";
import { EntryFrame, MockNote, NameRow } from "./bits";

// ログイン画面(OD-09・10・11・18)。どのメール・パスワードでも、結果は設定で決まる。通信も保存もしない。

type Reason = Exclude<Settings["loginResult"], "success">;

const TEXT_CREDENTIALS = "メールアドレスかパスワードがちがいます。";
const TEXT_NETWORK = "通信できませんでした。電波のよい場所で、もう一度ログインしてください。";
const TEXT_RATE = "何度も試したため、いまはログインできません。しばらく待ってから、もう一度ログインしてください。";
const TEXT_UNKNOWN =
  "ログインできませんでした。しばらく待ってから、もう一度ログインしてください。続くときは、管理者に知らせてください。";

// OD-11 の A(4つ)・B(2つ)・C(1つ)。B・C の文言は 40 に無いので、A の unknown の文言を仮に使う(44 に書いた)
function errorText(style: Settings["errorStyle"], reason: Reason): string {
  if (style === "c") return TEXT_UNKNOWN;
  if (style === "b") return reason === "credentials" ? TEXT_CREDENTIALS : TEXT_UNKNOWN;
  return { credentials: TEXT_CREDENTIALS, network: TEXT_NETWORK, rate: TEXT_RATE, unknown: TEXT_UNKNOWN }[reason];
}

export function LoginView({ expired = false }: { expired?: boolean }) {
  const router = useRouter();
  const { settings, notice, clearNotice } = useMock();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [resultError, setResultError] = useState<Reason | null>(null);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showNotice, setShowNotice] = useState(true);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [focusTarget, setFocusTarget] = useState<{ to: "email" | "password"; n: number } | null>(null);

  useEffect(() => {
    if (!focusTarget) return;
    (focusTarget.to === "email" ? emailRef : passwordRef).current?.focus();
  }, [focusTarget]);

  useEffect(() => {
    if (!checking) return;
    const dest =
      settings.household === "linked" ? "/mock/top/" : settings.household === "unlinked" ? "/mock/unlinked/" : "/mock/member-error/";
    const t = setTimeout(() => router.push(dest), 1000);
    return () => clearTimeout(t);
  }, [checking, settings.household, router]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    const trimmed = email.trim();
    const eErr = trimmed === "" ? "メールアドレスを入れてください" : /^.+@.+$/.test(trimmed) ? null : "メールアドレスの形を確かめてください";
    const pErr = password === "" ? "パスワードを入れてください" : null;
    setEmailError(eErr);
    setPasswordError(pErr);
    setResultError(null);
    setShowNotice(false);
    clearNotice();
    if (eErr || pErr) {
      setFocusTarget({ to: eErr ? "email" : "password", n: Date.now() });
      return;
    }
    setSending(true);
    if (settings.wait === "forever") return;
    setTimeout(() => {
      setSending(false);
      if (settings.loginResult === "success") {
        setChecking(true);
        return;
      }
      setResultError(settings.loginResult);
      if (settings.loginResult === "credentials") setFocusTarget({ to: "password", n: Date.now() });
    }, 1000);
  }

  if (checking) return <CheckingView />;

  const credentialsInvalid = resultError === "credentials";
  const noticeText = !showNotice
    ? null
    : expired
      ? "ログインが切れました。もう一度ログインしてください。"
      : notice === "logged-out"
        ? "ログアウトしました。"
        : null;

  return (
    <EntryFrame centered={settings.loginLayout === "c"}>
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
              className={settings.passwordToggle === "on" ? "pr-13" : undefined}
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
            {settings.passwordToggle === "on" ? (
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
            ) : null}
          </div>
          {passwordError ? (
            <p id="login-password-error" className="mt-2 text-base text-destructive">
              {passwordError}
            </p>
          ) : null}
        </div>
        {resultError ? (
          settings.errorStyle === "text" ? (
            <p role="alert" className="mt-4 text-base text-destructive">
              {errorText("a", resultError)}
            </p>
          ) : (
            <div role="alert" className="mt-4 flex items-start gap-3 rounded-lg bg-alert px-4 py-3 text-base text-alert-foreground">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <p>{errorText(settings.errorStyle, resultError)}</p>
            </div>
          )
        ) : null}
        <Button type="submit" className="mt-6 w-full" aria-disabled={sending ? true : undefined}>
          {sending ? "ログインしています…" : "ログイン"}
        </Button>
      </form>
      {settings.loginLayout === "b" ? null : (
        <p className="mt-4 text-base text-muted-foreground">パスワードを忘れたときは、管理者に聞いてください。</p>
      )}
      <MockNote />
    </EntryFrame>
  );
}
