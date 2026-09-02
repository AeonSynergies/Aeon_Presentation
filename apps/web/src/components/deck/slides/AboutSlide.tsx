import type { DeckConfig } from "@aeon/types";
import * as React from "react";
import { DeckLogo } from "../Logo";

// Light inline markup for the body's key terms: **bold** for bold ink text, __bold__ for
// bold accent-colored text. Not real markdown/HTML — just enough to let each deck's own
// copy call out a couple of phrases, matching the reference design's bolded/colored terms.
function renderInlineMarkup(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|__(.+?)__/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) parts.push(<b key={key++}>{match[1]}</b>);
    else if (match[2] !== undefined) (
      parts.push(
        <b className="accent" key={key++}>
          {match[2]}
        </b>
      )
    );
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function AboutSlide({ deck }: { deck: DeckConfig }) {
  const a = deck.staticContent.about;
  const focusAreas = a.focusAreas ?? [];
  // A blank line between paragraphs in `body` becomes a separate <p> — lets a deck's copy
  // carry more than one paragraph without changing the schema.
  const paragraphs = a.body.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  const left = (
    <div className="about-split-left">
      <div className="eyebrow">
        <span>{a.eyebrow || "ABOUT US"}</span>
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
      {paragraphs.map((p, i) => (
        <p className="lede" key={i}>
          {renderInlineMarkup(p)}
        </p>
      ))}
    </div>
  );

  if (focusAreas.length === 0) {
    return <div className="about-split single">{left}</div>;
  }

  return (
    <div className="about-split">
      {left}
      <div className="about-split-right">
        <div className="focus-label">{a.focusLabel || "FOCUS AREAS"}</div>
        <div className="focus-grid">
          {focusAreas.map((f, i) => (
            <div className="focus-tile" key={i}>
              {f.primary}
              {f.secondary ? <> <span className="accent">{f.secondary}</span></> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
