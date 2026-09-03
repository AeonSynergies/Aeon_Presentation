import type { DeckConfig } from "@aeon/types";
import { DeckLogo, Watermark } from "../Logo";

export function CoverSlide({ deck }: { deck: DeckConfig }) {
  const c = deck.staticContent.cover;
  return (
    <div className="cover-wrap">
      <Watermark watermark={deck.watermark} />
      <DeckLogo logo={deck.logo} className="cover-logo" colors={deck.colors} onDark />
      <div className="cover-eyebrow">{deck.tagline ? deck.tagline.split(".")[0] : "Expert Back-Office Operations"}</div>
      <h1 className="cover-title">
        <span>{c.title1}</span>
        <br />
        <span className="accent">{c.title2}</span>
      </h1>
      <p className="cover-sub">{c.sub}</p>
      <div className="route-anim">
        <div className="van" />
      </div>
    </div>
  );
}
