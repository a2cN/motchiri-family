import { cn } from "cn";

// 素の <select>(40_design_brief.md 決定 5 C)。見た目は入力欄と同じ枠・角、右端に「▾」(飾り)。
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-12 w-full appearance-none rounded-control border border-input bg-card pr-10 pl-3 text-base text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
