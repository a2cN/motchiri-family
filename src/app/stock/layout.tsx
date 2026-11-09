import { StockProvider } from "@/components/stock/stock-provider";

// 倉庫の全画面に store の Provider と通知(Sonner)を置く(30_architecture.md D-19)。
export default function StockLayout({ children }: { children: React.ReactNode }) {
  return <StockProvider>{children}</StockProvider>;
}
