"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";

// 入力欄まわりの小さな部品(品物の登録・在庫登録・品物の編集で共通)。

export function Field({
  label,
  htmlFor,
  children,
  hint,
  error,
  errorId,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  errorId?: string;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <Label htmlFor={htmlFor} className="mb-1">
        {label}
      </Label>
      {children}
      {hint}
      {error && (
        <p id={errorId} className="mt-1 text-base text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// 単独のグループにラベルを付ける(チップの並び)
export function GroupField({
  label,
  children,
  error,
  errorId,
}: {
  label: string;
  children: React.ReactNode;
  error?: string | null;
  errorId?: string;
}) {
  const id = useId();
  return (
    <div className="mt-4 first:mt-0" role="group" aria-labelledby={id}>
      <div id={id} className="mb-1 text-base font-strong">
        {label}
      </div>
      {children}
      {error && (
        <p id={errorId} className="mt-1 text-base text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// fieldset と legend で包むグループ(管理のしかた・補充の目安・残量。40 rev3 Accessibility Notes)
export function FieldsetField({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-4 first:mt-0">
      <legend className="mb-1 text-base font-strong">{legend}</legend>
      {children}
    </fieldset>
  );
}
