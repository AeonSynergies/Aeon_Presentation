import type { DeckService } from "@aeon/types";

// Per-service "chapter title" slide (Templates redesign, dark-gradient category): just the
// team, the service name, and a short framing line — reuses svc.tagline (added for the
// About/Challenges/Benefits round) since it's already exactly that: a short benefit phrase
// per service. Falls back to the first "What We Handle" item so a service without a
// tagline yet still gets a framing line instead of a bare title.
export function ServiceIntroSlide({ svc }: { svc: DeckService }) {
  const framing = svc.tagline?.trim() || svc.handle[0] || "";
  return (
    <div className="dark-slide dark-slide-center">
      <div className="eyebrow">
        <span>{svc.team.toUpperCase()}</span>
      </div>
      <h1 className="slide-title">
        <span className="accent">{svc.name}</span>
      </h1>
      {framing && <p className="lede">{framing}</p>}
    </div>
  );
}
