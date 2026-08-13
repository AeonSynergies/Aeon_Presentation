import type { DeckConfig } from "@aeon/types";

export function TeamSlide({ deck }: { deck: DeckConfig }) {
  return (
    <>
      <div className="eyebrow">
        <span>THE PEOPLE</span>
      </div>
      <h1 className="slide-title">
        Meet Your <span className="accent">Expert Team</span>
      </h1>
      <p className="lede">The people who run your back office day to day.</p>
      <div className="team-grid">
        {deck.team.map((m, i) => (
          <div className="team-card" key={i}>
            <div className="team-mono">{m.initials}</div>
            <div className="team-name">{m.name}</div>
            <div className="team-title">{m.title}</div>
            <div className="team-contact">
              <span>{m.email}</span>
              <br />
              <span>{m.phone}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="team-footer">A dedicated pod, ready to support you from day one.</div>
    </>
  );
}
