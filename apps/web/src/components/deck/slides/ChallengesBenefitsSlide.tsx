import type { DeckConfig } from "@aeon/types";

export function ChallengesSlide({ deck }: { deck: DeckConfig }) {
  const items = deck.staticContent.challenges.items;
  return (
    <>
      <div className="eyebrow">
        <span>THE REALITY ON THE GROUND</span>
      </div>
      <h1 className="slide-title">
        What every <span className="accent">client</span> is fighting
      </h1>
      <p className="lede">None of this is unique to one operator — it's the operating reality of the industry today.</p>
      <div className="problem-grid">
        {items.map((i, idx) => (
          <div className="problem-card" key={idx}>
            {i}
          </div>
        ))}
      </div>
    </>
  );
}

export function BenefitsSlide({ deck }: { deck: DeckConfig }) {
  const items = deck.staticContent.benefits.items;
  return (
    <>
      <div className="eyebrow">
        <span>WHY PARTNER WITH US</span>
      </div>
      <h1 className="slide-title">
        What your <span className="accent">expert team</span> takes off your plate
      </h1>
      <div className="problem-grid">
        {items.map((i, idx) => (
          <div className="problem-card benefit" key={idx}>
            {i}
          </div>
        ))}
      </div>
    </>
  );
}
