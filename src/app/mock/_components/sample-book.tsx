"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Direction } from "../_data/directions";
import type { SupplyLevel } from "../_data/types";
import { Card } from "./card";
import { QuantityStepper } from "./quantity-stepper";
import { SupplyLevelButton } from "./supply-level-button";
import { showUndo } from "./undo";

// 案の見本帳(40_design_brief.md「案の見本帳」)。その案の色・文字・部品の見本と、3画面への入口。
// クラス名は静的な文字列で書く(Tailwind が拾うため)。

const SWATCHES: { token: string; fg: string; className: string }[] = [
  { token: "background", fg: "foreground", className: "bg-background text-foreground" },
  { token: "card", fg: "card-foreground", className: "bg-card text-card-foreground" },
  { token: "primary", fg: "primary-foreground", className: "bg-primary text-primary-foreground" },
  { token: "secondary", fg: "secondary-foreground", className: "bg-secondary text-secondary-foreground" },
  { token: "muted", fg: "muted-foreground", className: "bg-muted text-muted-foreground" },
  { token: "accent", fg: "accent-foreground", className: "bg-accent text-accent-foreground" },
  { token: "ok", fg: "ok-foreground", className: "bg-ok text-ok-foreground" },
  { token: "warn", fg: "warn-foreground", className: "bg-warn text-warn-foreground" },
  { token: "alert", fg: "alert-foreground", className: "bg-alert text-alert-foreground" },
  { token: "inverse", fg: "inverse-foreground", className: "bg-inverse text-inverse-foreground" },
];

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-3 text-lg font-heading">{children}</h2>;
}

function Sample({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="mb-1 text-base text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

export function SampleBook({ direction }: { direction: Direction }) {
  const [quantity, setQuantity] = useState(2);
  const [checked, setChecked] = useState([false, true]);
  const [unit, setUnit] = useState("本");
  const [mode, setMode] = useState("location");
  const [levels, setLevels] = useState<SupplyLevel[]>(["full", "low", "out"]);
  const next: Record<SupplyLevel, SupplyLevel> = { full: "low", low: "out", out: "full" };
  const levelName = ["トイレットペーパー", "食器用洗剤", "ティッシュペーパー"];

  return (
    <>
      <H2>色</H2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
        {SWATCHES.map((s) => (
          <div key={s.token}>
            <div className={`flex h-16 items-center justify-center rounded-lg border border-border text-lg ${s.className}`}>あいう 123</div>
            <div className="mt-1 text-base text-muted-foreground">
              {s.token}
              <br />/ {s.fg}
            </div>
          </div>
        ))}
        <div>
          <div className="flex h-16 items-center justify-center rounded-lg bg-background text-lg font-strong text-muted-foreground">あいう 123</div>
          <div className="mt-1 text-base text-muted-foreground">muted-foreground</div>
        </div>
        <div>
          <div className="flex h-16 items-center justify-center rounded-lg bg-background text-lg font-strong text-destructive">あいう 123</div>
          <div className="mt-1 text-base text-muted-foreground">destructive</div>
        </div>
        <div>
          <div className="flex h-16 items-center rounded-lg bg-background">
            <div className="w-full border-t-2 border-input" />
          </div>
          <div className="mt-1 text-base text-muted-foreground">input(線)</div>
        </div>
        <div>
          <div className="flex h-16 items-center rounded-lg bg-background">
            <div className="w-full border-t-2 border-ring" />
          </div>
          <div className="mt-1 text-base text-muted-foreground">ring(線)</div>
        </div>
        <div>
          <div className="flex h-16 items-center rounded-lg bg-background">
            <div className="w-full border-t-2 border-border" />
          </div>
          <div className="mt-1 text-base text-muted-foreground">border(線)</div>
        </div>
      </div>

      <H2>文字</H2>
      <Card className="space-y-2">
        <div className="text-2xl font-heading">もっちり倉庫</div>
        <div className="text-lg font-heading">冷蔵庫</div>
        <div className="text-lg font-strong">牛乳</div>
        <p className="text-base">期限 10/24(金)・2本・食器用洗剤</p>
        <p className="text-base text-muted-foreground">在庫なし</p>
        <p className="text-lg tabular-nums">1 2 3 4 5 6 7 8 9 0</p>
      </Card>

      <H2>部品</H2>
      <Card>
        <Sample label="主なボタン">
          <Button type="button">登録する</Button>
        </Sample>
        <Sample label="控えめなボタン(−/+ と数)">
          <QuantityStepper
            name="牛乳"
            quantity={quantity}
            unit="本"
            decreaseDisabled={quantity <= 0}
            onDecrease={() => setQuantity((q) => Math.max(0, q - 1))}
            onIncrease={() => setQuantity((q) => q + 1)}
          />
        </Sample>
        <Sample label="入力欄">
          <Label htmlFor="sample-name" className="mb-1">
            品物名
          </Label>
          <Input id="sample-name" autoComplete="off" />
        </Sample>
        <Sample label="チェック(未・済)">
          <ul>
            {["牛乳", "バナナ"].map((n, i) => (
              <li key={n} className="border-t border-border first:border-t-0">
                <label className="flex min-h-14 items-center gap-3 py-2">
                  <Checkbox checked={checked[i]} onCheckedChange={() => setChecked((c) => c.map((v, k) => (k === i ? !v : v)))} />
                  <span className={checked[i] ? "text-lg font-strong text-muted-foreground line-through" : "text-lg font-strong"}>{n}</span>
                </label>
              </li>
            ))}
          </ul>
        </Sample>
        <Sample label="選択のチップ(単位)">
          <ToggleGroup aria-label="単位" value={[unit]} onValueChange={(v) => v[0] && setUnit(v[0])}>
            {["個", "本", "パック"].map((u) => (
              <ToggleGroupItem key={u} value={u}>
                {u}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Sample>
        <Sample label="切り替え">
          <ToggleGroup joined aria-label="まとまりの切り替え" value={[mode]} onValueChange={(v) => v[0] && setMode(v[0])}>
            <ToggleGroupItem value="location">場所別</ToggleGroupItem>
            <ToggleGroupItem value="genre">ジャンル別</ToggleGroupItem>
          </ToggleGroup>
        </Sample>
        <Sample label="印">
          <div className="flex flex-wrap gap-2">
            <Badge variant="alert">期限切れ</Badge>
            <Badge variant="warn">期限間近</Badge>
            <Badge variant="secondary">いつもの</Badge>
            <Badge variant="warn">残量△</Badge>
            <Badge variant="alert">残量×</Badge>
            <Badge variant="muted">手入力</Badge>
          </div>
        </Sample>
        <Sample label="残量のボタン(押すと順送り)">
          <div className="flex flex-wrap items-center gap-3">
            {levels.map((level, i) => (
              <SupplyLevelButton
                key={levelName[i]}
                name={levelName[i]}
                level={level}
                onCycle={() => setLevels((ls) => ls.map((l, k) => (k === i ? next[l] : l)))}
              />
            ))}
          </div>
        </Sample>
        <Sample label="「元に戻す」の表示">
          <Button type="button" variant="secondary" onClick={() => showUndo("見本です", () => {})}>
            「元に戻す」の表示を見る
          </Button>
        </Sample>
      </Card>

      <H2>画面</H2>
      <Card as="section" className="p-0 md:p-0">
        <ul>
          {[
            { href: "stock/", label: "在庫(もっちり倉庫)" },
            { href: "shopping-list/", label: "買い物リスト" },
            { href: "item-new/", label: "品物の登録" },
          ].map((s) => (
            <li key={s.href} className="border-t border-border first:border-t-0">
              <Link href={`/mock/${direction.id}/${s.href}`} className="flex h-14 items-center justify-between px-4 text-lg font-strong text-foreground no-underline">
                {s.label}
                <span aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
