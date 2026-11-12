"use client";

import { useId } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { normalizeForSearch } from "@/modules/stock/supply";
import { UNDO_WINDOW_MS } from "@/modules/stock/store";
import { cn } from "cn";

// 倉庫の画面の部品(モックで承認した見た目。docs/design/stock-food/)。
// ---- 通知(Sonner。6秒、同時に1つ) ----
const SECONDS = UNDO_WINDOW_MS / 1000;
export const MSG_OFFLINE = "電波のある所で操作してください";

export function notify(message: string, action?: { label: string; onClick: () => void }) {
  toast.dismiss();
  toast(message, { duration: SECONDS * 1000, action });
}

// ---- 状態のカード(正典の空の状態のカードと同じ見た目。40 Design Principles Applied) ----
export function StateCard({
  title,
  children,
  role,
  className,
  action,
}: {
  title?: string;
  children?: React.ReactNode;
  role?: "status";
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section role={role} className={cn("rounded-lg bg-muted p-6", className)}>
      {title && <h2 className="text-lg font-heading text-foreground">{title}</h2>}
      {children && <p className="text-base text-muted-foreground">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}

export function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" className="min-w-40" onClick={onClick}>
      もう一度
    </Button>
  );
}

export function OfflineCard({ className, subject = "在庫" }: { className?: string; subject?: string }) {
  return (
    <StateCard role="status" title="電波がありません" className={className}>
      {subject}は見られますが、変えられません。電波のある所で操作してください。
    </StateCard>
  );
}

/** 数の入力の誤りの文(OD-stock-uiux-46 A) */
export const QUANTITY_ERROR: Record<"empty" | "not_a_number" | "too_precise" | "not_positive", string> = {
  empty: "個数を入れてください",
  not_a_number: "数を入れてください",
  too_precise: "小数は第一位までです",
  not_positive: "0 より大きい数を入れてください",
};

// ---- 入力欄まわり ----
export function Field({
  label,
  htmlFor,
  error,
  errorId,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <Label htmlFor={htmlFor} className="mb-1">
        {label}
      </Label>
      {children}
      {error && (
        <p id={errorId} className="mt-1 text-base text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function GroupField({
  label,
  error,
  errorId,
  children,
  ...rest
}: {
  label: string;
  error?: string | null;
  errorId?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const id = useId();
  return (
    <div className="mt-4 first:mt-0" role="group" aria-labelledby={id} {...rest}>
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

export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-12 w-full appearance-none rounded-control border border-input bg-card pr-10 pl-3 text-base text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-base text-foreground">
        ▾
      </span>
    </div>
  );
}

// 数の入力([−] [入力欄] [+] 単位)。オフラインのときは入力欄が readOnly、± は aria-disabled(見た目は変えない)
export function QtyField({
  id,
  label,
  value,
  unit,
  steppers,
  readOnly = false,
  minusDisabled = false,
  error,
  onChange,
  onBlur,
  onStep,
}: {
  id: string;
  label: string;
  value: string;
  unit: string;
  steppers: boolean;
  readOnly?: boolean;
  /** 0 の − を押せなくする(数の日用品。aria-disabled、見た目は変えない) */
  minusDisabled?: boolean;
  error?: string | null;
  onChange: (v: string) => void;
  onBlur: () => void;
  onStep: (delta: 1 | -1) => void;
}) {
  const errId = `${id}-err`;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {steppers && (
          <Button type="button" variant="secondary" size="icon" aria-label={`${label}を1減らす`} aria-disabled={readOnly || minusDisabled || undefined} onClick={() => onStep(-1)}>
            <span aria-hidden="true">−</span>
          </Button>
        )}
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          className="w-24 text-center text-lg tabular-nums"
          value={value}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        {steppers && (
          <Button type="button" variant="secondary" size="icon" aria-label={`${label}を1増やす`} aria-disabled={readOnly || undefined} onClick={() => onStep(1)}>
            <span aria-hidden="true">+</span>
          </Button>
        )}
        {unit && <span className="text-base">{unit}</span>}
      </div>
      {error && (
        <p id={errId} className="mt-1 text-base text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** 読み込み中・読み込みの失敗の本文(null なら読み込めている)。名詞だけ画面ごとに替える(docs/design/stock-master/ OD-stock-master-02 (1)) */
export function loadStateBody({
  load, offline, showLoadingText, noun, onRetry, className,
}: {
  load: "loading" | "ready" | "error";
  offline: boolean;
  showLoadingText: boolean;
  noun: string;
  onRetry: () => void;
  className?: string;
}): React.ReactNode {
  if (load === "loading") {
    return showLoadingText ? (
      <StateCard role="status" className={className}>
        読み込んでいます…
      </StateCard>
    ) : (
      <></>
    );
  }
  if (load === "error") {
    return offline ? (
      <StateCard title="電波がありません" className={className} action={<RetryButton onClick={onRetry} />}>
        {noun}を読み込むには電波が要ります。電波のある所で、もう一度お試しください。
      </StateCard>
    ) : (
      <StateCard title="つながりませんでした" className={className} action={<RetryButton onClick={onRetry} />}>
        通信できなかったため、{noun}を読み込めませんでした。電波のよい場所で、もう一度お試しください。
      </StateCard>
    );
  }
  return null;
}

/**
 * 日用品のジャンル(OD-stock-uiux-35 B・45 A): 自由入力 + いま使っている語の候補のチップ。空でもかまわない。
 * onCommit は欄を離れたとき・チップを押したときに呼ぶ(品物の編集は、ここで保存する)。
 */
export function SupplyGenreField({
  id, value, onChange, onCommit, candidates, readOnly = false,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onCommit?: (v: string) => void;
  candidates: string[];
  readOnly?: boolean;
}) {
  const q = normalizeForSearch(value.trim());
  const shown = candidates.filter((c) => q === "" || normalizeForSearch(c).includes(q));
  return (
    <div className="mt-4 first:mt-0">
      <Label htmlFor={id} className="mb-1">
        ジャンル
      </Label>
      <Input
        id={id}
        value={value}
        autoComplete="off"
        readOnly={readOnly}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit?.(value.trim())}
      />
      <p id={`${id}-hint`} className="mt-1 text-base text-muted-foreground">
        空でもかまいません
      </p>
      <p className="sr-only" aria-live="polite">
        {shown.length > 0 ? `候補 ${shown.length}件` : ""}
      </p>
      {shown.length > 0 && (
        <div className="mt-2">
          <ToggleGroup
            aria-label="ジャンルの候補"
            value={candidates.includes(value.trim()) ? [value.trim()] : []}
            onValueChange={(v) => {
              if (readOnly) return;
              onChange(v[0] ?? "");
              onCommit?.(v[0] ?? "");
            }}
          >
            {shown.map((c) => (
              <ToggleGroupItem key={c} value={c}>
                {c}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
    </div>
  );
}
