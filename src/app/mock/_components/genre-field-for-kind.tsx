"use client";

import { useMockState } from "../_state/mock-state";
import type { ItemKind } from "../_data/types";
import { Field } from "./form-bits";
import { NativeSelect } from "./native-select";
import { SupplyGenreField } from "./genre-field";

// ジャンルの欄。食材はマスタの値から選ぶ(必須)、日用品は自由入力 + 候補のチップ(空でよい)。品物の登録・在庫登録・品物の編集で共通。
export function GenreFieldForKind({
  idPrefix,
  kind,
  value,
  onChange,
  onCommit,
  error,
  candidates,
  allowEmpty = false,
}: {
  idPrefix: string;
  kind: ItemKind;
  value: string;
  onChange: (v: string) => void;
  onCommit?: (v: string) => void;
  error?: string | null;
  candidates: string[];
  /** 食材の「選んでください」を残すか(登録は残す。編集は残さない) */
  allowEmpty?: boolean;
}) {
  const { masters } = useMockState();
  if (kind === "supply") {
    return <SupplyGenreField id={`${idPrefix}-genre`} value={value} onChange={onChange} onCommit={onCommit} candidates={candidates} />;
  }
  return (
    <Field label="ジャンル" htmlFor={`${idPrefix}-genre`} error={error} errorId={`${idPrefix}-genre-err`}>
      <NativeSelect
        id={`${idPrefix}-genre`}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${idPrefix}-genre-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        {(allowEmpty || value === "") && <option value="">選んでください</option>}
        {masters.genres.map((g) => (
          <option key={g.name} value={g.name}>
            {g.name}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
