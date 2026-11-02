"use client";

import Link from "next/link";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useMock, type Settings } from "../_state/mock-state";
import { MockMain, MockNote } from "./bits";

type Group<K extends keyof Settings> = {
  key: K;
  label: string;
  od: string;
  options: readonly { value: Settings[K]; label: string }[];
};

function g<K extends keyof Settings>(x: Group<K>): Group<K> {
  return x;
}

// 既定(推奨)は先頭。40_design_brief.md「モックの設定」+ OD-09・11・13 の選択肢の見比べ用に3つ足した。
const GROUPS = [
  g({ key: "checking", label: "確かめ中の見た目", od: "OD-12", options: [
    { value: "a", label: "A 起動時の画面と同じ" }, { value: "b", label: "B 地だけ" }, { value: "c", label: "C 文字だけ" } ] }),
  g({ key: "loginLayout", label: "ログイン画面の構成", od: "OD-09(追加)", options: [
    { value: "a", label: "A 上寄せ・案内あり" }, { value: "b", label: "B 案内なし" }, { value: "c", label: "C 縦の中央" } ] }),
  g({ key: "loginResult", label: "ログインの結果", od: "OD-11", options: [
    { value: "success", label: "成功" }, { value: "credentials", label: "メールかパスワードがちがう" },
    { value: "network", label: "通信の失敗" }, { value: "rate", label: "試しすぎ" }, { value: "unknown", label: "そのほか" } ] }),
  g({ key: "errorStyle", label: "誤りの分け方と見た目", od: "OD-11(追加)", options: [
    { value: "a", label: "A 4つ・枠" }, { value: "b", label: "B 2つ・枠" }, { value: "c", label: "C 1つ・枠" }, { value: "text", label: "4つ・文字だけ" } ] }),
  g({ key: "wait", label: "送信の待ち", od: "OD-09", options: [
    { value: "1s", label: "1秒" }, { value: "forever", label: "終わらない" } ] }),
  g({ key: "household", label: "世帯の確かめ", od: "OD-13・14", options: [
    { value: "linked", label: "結びついている" }, { value: "unlinked", label: "結びついていない" }, { value: "error", label: "通信の失敗" } ] }),
  g({ key: "memberError", label: "確かめられなかった画面", od: "OD-13(追加)", options: [
    { value: "a", label: "A もう一度 + ログアウト" }, { value: "b", label: "B ログアウトなし" }, { value: "c", label: "C 自動で確かめ直す" } ] }),
  g({ key: "passwordToggle", label: "パスワードを表示する切り替え", od: "OD-10", options: [
    { value: "on", label: "あり" }, { value: "off", label: "なし" } ] }),
  g({ key: "unlinkedCopy", label: "結びついていない画面の文言", od: "OD-14", options: [
    { value: "a", label: "A" }, { value: "b", label: "B" }, { value: "c", label: "C" } ] }),
  g({ key: "unlinkedRetry", label: "結びついていない画面の「もう一度確かめる」", od: "OD-15", options: [
    { value: "off", label: "なし" }, { value: "on", label: "あり" } ] }),
  g({ key: "logoutPos", label: "ログアウトの位置", od: "OD-16", options: [
    { value: "a", label: "A トップの本文の下" }, { value: "b", label: "B トップのヘッダーの右" }, { value: "c", label: "C 全画面のヘッダーの右" } ] }),
  g({ key: "logoutConfirm", label: "ログアウトの確認", od: "OD-16", options: [
    { value: "off", label: "なし" }, { value: "on", label: "あり" } ] }),
  g({ key: "who", label: "ログイン中の人", od: "OD-17", options: [
    { value: "a", label: "A トップと結びついていない画面" }, { value: "b", label: "B 結びついていない画面だけ" }, { value: "c", label: "C 出さない" } ] }),
  g({ key: "emailLength", label: "メールの長さ", od: "OD-17", options: [
    { value: "short", label: "短い" }, { value: "long", label: "長い" } ] }),
] as const;

const PAGES = [
  ["/mock/launch/", "起動のながれ", "確かめ中を2秒 → ログイン画面(OD-12)"],
  ["/mock/checking/", "確かめ中(止めたまま)", "OD-12。Aは1秒後に「確かめています…」"],
  ["/mock/login/", "ログイン", "OD-09・10・11。送ると設定のとおりに振る舞う"],
  ["/mock/login-expired/", "ログイン(ログインが切れたあと)", "OD-18。上と見比べる"],
  ["/mock/member-error/", "世帯を確かめられなかった", "OD-13"],
  ["/mock/unlinked/", "世帯に結びついていない", "OD-14・15・17"],
  ["/mock/top/", "トップ(ログインしたあと)", "OD-16・17"],
  ["/mock/stock/", "倉庫の空の画面(ログインしたあと)", "OD-16(位置 C のとき)"],
] as const;

function Setting<K extends keyof Settings>({ group }: { group: Group<K> }) {
  const { settings, set } = useMock();
  const id = `setting-${group.key}`;
  return (
    <div role="group" aria-labelledby={id} data-setting={group.key} className="mt-4">
      <p id={id} className="mb-2 text-base font-strong">
        {group.label}
        <span className="font-normal text-muted-foreground">({group.od})</span>
      </p>
      <ToggleGroup
        value={[settings[group.key] as string]}
        onValueChange={(v) => {
          if (v[0]) set(group.key, v[0] as Settings[K]);
        }}
      >
        {group.options.map((o) => (
          <ToggleGroupItem key={String(o.value)} value={o.value as string} data-opt={o.value}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export function MockIndexView() {
  return (
    <MockMain>
      <h1 className="text-2xl font-bold">モックの目次 — ログインと世帯</h1>
      <p className="mt-2 text-base text-muted-foreground">
        本番にはありません。ここの設定は、画面を移っても続きます(ページを直接開くと初期値)。
      </p>
      <h2 className="mt-6 text-lg font-bold">ページ</h2>
      <ul className="mt-2">
        {PAGES.map(([href, name, note]) => (
          <li key={href}>
            <Link href={href} className="inline-flex min-h-11 items-center text-base text-foreground underline">
              {name}
            </Link>
            <span className="block text-base text-muted-foreground">{note}</span>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-lg font-bold">設定(先頭が推奨)</h2>
      {GROUPS.map((group) => (
        <Setting key={group.key} group={group as Group<keyof Settings>} />
      ))}
      <MockNote />
    </MockMain>
  );
}
