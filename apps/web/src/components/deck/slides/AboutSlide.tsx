import type { DeckConfig } from "@aeon/types";
import { DeckLogo } from "../Logo";

export function AboutSlide({ deck }: { deck: DeckConfig }) {
  const a = deck.staticContent.about;
  return (
    <>
      <div className="eyebrow">
        <span>ABOUT US</span>
      </div>
      <h1 className="slide-title">
        <span>{a.title1}</span> <span className="accent">{a.title2}</span>
      </h1>
      <div className="brand-lockup">
        <DeckLogo logo={deck.logo} colors={deck.colors} />
        {deck.secondaryLogo && (
          <>
            <span className="plus">/</span>
            <DeckLogo logo={deck.secondaryLogo} colors={deck.colors} />
          </>
        )}
      </div>
      <p className="lede" style={{ maxWidth: "100%" }}>
        {a.body}
      </p>
      <div className="panel-card">
        <ul>
          {a.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
