"use client";

import { useId } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "cn";

// ---- 通知(Sonner。6秒、同時に1つ) ----
const SECONDS = 6;
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

export function RetryButton() {
  return (
    <Button type="button" className="min-w-40" onClick={() => window.location.reload()}>
      もう一度
    </Button>
  );
}

export function OfflineCard({ className }: { className?: string }) {
  return (
    <StateCard role="status" title="電波がありません" className={className}>
      在庫は見られますが、変えられません。電波のある所で操作してください。
    </StateCard>
  );
}

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
          <Button type="button" variant="secondary" size="icon" aria-label={`${label}を1減らす`} aria-disabled={readOnly || undefined} onClick={() => onStep(-1)}>
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
