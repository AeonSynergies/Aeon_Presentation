import type { DeckConfig, StaticContentGridItem } from "@aeon/types";

// A plain string is an already-persisted deck's old shape (before items became a
// title+description pair) — rendered as a description-only tile with no bold title, so old
// data never breaks, it just isn't as rich as a deck authored/edited since this redesign.
function GridItem({ item, index }: { item: StaticContentGridItem; index: number }) {
  const num = String(index + 1).padStart(2, "0");
  return (
    <div className="grid-item-numbered">
      <span className="grid-item-num">{num}</span>
      {typeof item === "string" ? (
        <p>{item}</p>
      ) : (
        <div>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
        </div>
      )}
    </div>
  );
}

export function ChallengesSlide({ deck }: { deck: DeckConfig }) {
  const items = deck.staticContent.challenges.items;
  return (
    <div className="dark-slide">
      <div className="eyebrow">
        <span>THE REALITY ON THE GROUND</span>
      </div>
      <h1 className="slide-title">
        What every <span className="accent">client</span> is fighting
      </h1>
      <p className="lede">None of this is unique to one operator — it's the operating reality of the industry today.</p>
      <div className="grid-numbered">
        {items.map((item, idx) => (
          <GridItem item={item} index={idx} key={idx} />
        ))}
      </div>
    </div>
  );
}

export function BenefitsSlide({ deck }: { deck: DeckConfig }) {
  const items = deck.staticContent.benefits.items;
  return (
    <div className="dark-slide">
      <div className="eyebrow">
        <span>WHY PARTNER WITH US</span>
      </div>
      <h1 className="slide-title">
        What your <span className="accent">expert team</span> takes off your plate
      </h1>
      <div className="grid-numbered">
        {items.map((item, idx) => (
          <GridItem item={item} index={idx} key={idx} />
        ))}
      </div>
    </div>
  );
}
