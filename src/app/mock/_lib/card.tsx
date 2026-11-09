import { cn } from "cn";

// まとまりのカード(正典。shadcn の card は使わず div とトークンで作る)
export function Card({ className, as: Tag = "div", ...props }: React.ComponentProps<"div"> & { as?: "div" | "section" }) {
  return <Tag className={cn("card-border rounded-lg bg-card p-4 text-card-foreground shadow-card md:p-5", className)} {...props} />;
}
