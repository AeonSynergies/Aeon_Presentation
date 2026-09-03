import type { DeckColors, LogoConfig, WatermarkConfig } from "@aeon/types";

// Ported from Presentation_Platform.html's isLightBg()/logoHtml()/watermarkHtml() —
// light/dark logo variant is chosen by the deck's own background luminance, not a
// global theme (CLAUDE.md: "must remain per-deck, not global").
export function isLightBg(hexColor: string | undefined): boolean {
  if (!hexColor) return true;
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

export function DeckLogo({
  logo,
  className,
  colors,
  onDark,
}: {
  logo: LogoConfig | undefined;
  className?: string;
  colors?: DeckColors;
  // Overrides the deck-wide luminance check (isLightBg) for a single slide that renders
  // this logo on a dark-gradient card while the rest of the deck stays light — e.g. the
  // Cover slide or a per-service intro slide.
  onDark?: boolean;
}) {
  if (!logo) return null;
  if (logo.type === "imagePair") {
    const light = onDark ? false : isLightBg(colors?.ink);
    const src = light ? logo.srcLight : logo.srcDark;
    return <img className={className} src={src} alt="" />;
  }
  if (logo.type === "image") {
    return <img className={className} src={logo.src} alt="" />;
  }
  const initials = (logo.wordmark || "??").slice(0, 2).toUpperCase();
  return (
    <div className={`${className || ""} txt-logo`}>
      <span className="sq" style={{ background: "linear-gradient(135deg, var(--teal), var(--amber))" }}>
        {initials}
      </span>
      {logo.wordmark}
      {logo.sub && <span className="logo-sub">{logo.sub}</span>}
    </div>
  );
}

export function Watermark({ watermark }: { watermark: WatermarkConfig | undefined }) {
  if (!watermark || watermark.type !== "image") return null;
  return <img className="cover-mark" src={watermark.src} alt="" />;
}
