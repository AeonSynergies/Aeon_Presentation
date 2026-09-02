import type { DeckConfig, DeckService } from "@aeon/types";

function ServiceRow({ s }: { s: DeckService }) {
  // tagline (a short benefit phrase) replaces the team name on this slide only — team
  // itself is untouched everywhere else (wizard, per-service eyebrows, CSV/PDF exports).
  // Falls back to team so an already-persisted service without a tagline yet still renders.
  const label = s.tagline?.trim() || s.team;
  return (
    <div className="svc-row">
      <span className="svc-name">{s.name}</span>
      <span className="svc-team">{label.toUpperCase()}</span>
    </div>
  );
}

export function PortfolioSlide({ deck }: { deck: DeckConfig }) {
  const major = deck.services.filter((s) => s.category === "major");
  const strategic = deck.services.filter((s) => s.category === "strategic");
  return (
    <>
      <div className="eyebrow">
        <span>COMPLETE SERVICE PORTFOLIO</span>
      </div>
      <h1 className="slide-title">
        {deck.services.length} services, <span className="accent">built around your business</span>
      </h1>
      <p className="lede">Every service is delivered by a team built around it — not a generalist pool spread thin.</p>
      <div className="grid-2">
        <div>
          <span className="cat-label">Major Business Support Services</span>
          {major.length ? major.map((s) => <ServiceRow s={s} key={s.id} />) : <div className="empty-note">No major services configured.</div>}
        </div>
        <div>
          <span className="cat-label">Strategic &amp; Virtual Assistance Services</span>
          {strategic.length ? (
            strategic.map((s) => <ServiceRow s={s} key={s.id} />)
          ) : (
            <div className="empty-note">No strategic services configured.</div>
          )}
        </div>
      </div>
    </>
  );
}
