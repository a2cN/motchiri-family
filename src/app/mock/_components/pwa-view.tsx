import { Card } from "./card";
import { PageTitle, ScreenShell } from "./screen-frame";

// アイコン・起動時の画面・状態バーの見本(40_design_brief.md rev2「アイコン・起動時の画面・状態バーの見本」)。
// HTML で描いた候補の見本で、PNG ではない(PNG を作るのは 50 の scripts/pwa-images.mjs)。
// 状態バーは描けないので、図は「再現」であり実物ではない。この画面は配置の承認の対象ではない。

function Glyph({ size }: { size: number }) {
  return (
    <div
      className="flex items-center justify-center bg-primary font-heading text-foreground"
      style={{ width: size, height: size, fontSize: size * 0.55, lineHeight: 1 }}
    >
      も
    </div>
  );
}

// 桜もちの絵: 横長の楕円のもち(幅 64%・高さ 44%、primary、foreground の線を一辺の 3%)と、もちの下半分を包む葉(半楕円)
function MochiPicture({ size }: { size: number }) {
  const lineWidth = Math.max(1, Math.round(size * 0.03));
  return (
    <div className="relative bg-background" style={{ width: size, height: size }}>
      <div
        className="absolute border-foreground bg-primary"
        style={{
          left: "18%",
          top: "28%",
          width: "64%",
          height: "44%",
          borderRadius: "50%",
          borderStyle: "solid",
          borderWidth: lineWidth,
        }}
      />
      <div
        className="absolute bg-icon-leaf"
        style={{ left: "18%", top: "50%", width: "64%", height: "22%", borderRadius: "0 0 50% 50% / 0 0 100% 100%" }}
      />
    </div>
  );
}

function Rounded({ children, size }: { children: React.ReactNode; size: number }) {
  return (
    <div className="overflow-hidden" style={{ width: size, height: size, borderRadius: "22.5%" }}>
      {children}
    </div>
  );
}

function IconCandidate({ id, title, label }: { id: "A" | "B"; title: string; label: string }) {
  const draw = (size: number) => (id === "A" ? <Glyph size={size} /> : <MochiPicture size={size} />);
  return (
    <div className="mt-4 first:mt-0">
      <h3 className="text-base font-strong">{title}</h3>
      <div role="img" aria-label={label} className="mt-2 flex flex-wrap items-end gap-4">
        <div>
          <Rounded size={180}>{draw(180)}</Rounded>
          <p className="text-base text-muted-foreground">180px</p>
        </div>
        <div>
          <Rounded size={60}>{draw(60)}</Rounded>
          <p className="text-base text-muted-foreground">60px</p>
        </div>
        <div>
          <div className="border border-border" style={{ width: 182, height: 182 }}>
            {draw(180)}
          </div>
          <p className="text-base text-muted-foreground">原画(角を丸めない)</p>
        </div>
      </div>
    </div>
  );
}

function Splash({ id, width, height, scale, label }: { id: "A" | "B"; width: number; height: number; scale: number; label: string }) {
  const short = Math.min(width, height);
  return (
    <div role="img" aria-label={label} className="border border-border" style={{ width: width * scale + 2, height: height * scale + 2 }}>
      <div className="relative overflow-hidden" style={{ width: width * scale, height: height * scale }}>
        <div
          className="absolute top-0 left-0 flex flex-col items-center justify-center bg-background"
          style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          {id === "A" ? (
            <div className="font-heading text-foreground" style={{ fontSize: short * 0.2, lineHeight: 1 }}>
              も
            </div>
          ) : (
            <MochiPicture size={short * 0.3} />
          )}
          <div className="font-heading text-foreground" style={{ marginTop: 24, fontSize: 20 }}>
            もっちりファミリー
          </div>
        </div>
      </div>
    </div>
  );
}

function SplashSet({ id, title }: { id: "A" | "B"; title: string }) {
  const name = id === "A" ? "「も」の字" : "桜もちの絵";
  return (
    <div className="mt-4 first:mt-0">
      <h3 className="text-base font-strong">{title}</h3>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <figure>
          <Splash id={id} width={393} height={852} scale={0.4} label={`起動時の画面の候補 ${id}、iPhone 縦(${name})`} />
          <figcaption className="text-base text-muted-foreground">iPhone 縦</figcaption>
        </figure>
        <figure>
          <Splash id={id} width={810} height={1080} scale={0.3} label={`起動時の画面の候補 ${id}、iPad 縦(${name})`} />
          <figcaption className="text-base text-muted-foreground">iPad 縦</figcaption>
        </figure>
        <figure>
          <Splash id={id} width={1080} height={810} scale={0.3} label={`起動時の画面の候補 ${id}、iPad 横(${name})`} />
          <figcaption className="text-base text-muted-foreground">iPad 横</figcaption>
        </figure>
      </div>
    </div>
  );
}

function Battery() {
  return (
    <span aria-hidden="true" className="inline-block h-3 w-6 rounded-sm border border-current p-px">
      <span className="block h-full w-4/5 rounded-sm bg-current" />
    </span>
  );
}

type Band = { id: string; title: string; note: string; band: string };

const BANDS: Band[] = [
  { id: "A", title: "A default", note: "iOS の既定の明るい状態バー。帯は card の面、文字は foreground。(推奨)", band: "bg-card text-foreground" },
  { id: "B", title: "B black-translucent + 濃い帯", note: "帯は inverse、文字は inverse-foreground。淡い画面の上に濃い帯が出る。", band: "bg-inverse text-inverse-foreground" },
  { id: "C", title: "C black-translucent のまま", note: "帯は background、文字は白(card の値)。背景が淡いので時刻が読めない。", band: "bg-background text-card" },
  { id: "D", title: "D black", note: "帯は inverse、文字は inverse-foreground(B と同じ見た目)。ヘッダーとの間に安全領域の扱いが無い点だけ違う。", band: "bg-inverse text-inverse-foreground" },
];

function StatusBarFigure({ band }: { band: Band }) {
  return (
    <figure className="w-full max-w-[393px]">
      <div
        role="img"
        aria-label={`状態バーの再現 ${band.title}`}
        className="h-[120px] overflow-hidden border border-border bg-background"
      >
        <div className={`flex h-[47px] items-center justify-between px-6 text-base font-strong ${band.band}`}>
          <span>9:41</span>
          <Battery />
        </div>
        <div className="flex h-14 items-center border-b border-border bg-background px-4 text-lg text-foreground">‹ トップ</div>
      </div>
      <figcaption className="mt-1">
        <span className="block text-base font-strong">{band.title}</span>
        <span className="block text-base text-muted-foreground">{band.note}</span>
      </figcaption>
    </figure>
  );
}

export function PwaScreen() {
  return (
    <ScreenShell level="top" noSidebar>
      <PageTitle>アイコンと起動時の画面</PageTitle>
      <p className="mt-2 text-base">
        本物の画像ではなく、画面の上で描いた見本です。状態バーの図は再現で、実際の見え方はホーム画面に追加したアプリで確かめます。
      </p>

      <h2 className="mt-8 mb-3 text-lg font-heading">アイコン</h2>
      <Card>
        <IconCandidate id="A" title="A 「も」の字" label="アイコンの候補 A、「も」の字" />
        <IconCandidate id="B" title="B 桜もちの絵" label="アイコンの候補 B、桜もちの絵" />
      </Card>

      <h2 className="mt-8 mb-3 text-lg font-heading">起動時の画面</h2>
      <Card>
        <SplashSet id="A" title="A 「も」の字" />
        <SplashSet id="B" title="B 桜もちの絵" />
      </Card>

      <h2 className="mt-8 mb-3 text-lg font-heading">状態バー(再現)</h2>
      <Card>
        <div className="flex flex-wrap gap-6">
          {BANDS.map((b) => (
            <StatusBarFigure key={b.id} band={b} />
          ))}
        </div>
      </Card>
    </ScreenShell>
  );
}
