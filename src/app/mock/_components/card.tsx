import { cn } from "cn";

// カード(40_design_brief.md「共通: ページの枠」)。shadcn の card は使わず、div とトークンで作る。
export function Card({
  className,
  as: Tag = "div",
  ...props
}: React.ComponentProps<"div"> & { as?: "div" | "section" }) {
  return (
    <Tag
      className={cn("card-border rounded-lg bg-card p-4 text-card-foreground shadow-card md:p-5", className)}
      {...props}
    />
  );
}

// 空の状態のカード: 面 muted、影なし、内側 24px
export function EmptyCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-muted p-6">
      <h2 className="text-lg font-heading text-foreground">{title}</h2>
      <p className="text-base text-muted-foreground">{children}</p>
    </section>
  );
}
