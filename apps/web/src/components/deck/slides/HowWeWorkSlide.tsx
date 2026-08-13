import type { DeckConfig } from "@aeon/types";

export function HowWeWorkSlide({ deck }: { deck: DeckConfig }) {
  const steps = deck.staticContent.how.steps;
  const nums = ["01", "02", "03"];
  return (
    <>
      <div className="eyebrow">
        <span>HOW WE WORK WITH YOUR BUSINESS</span>
      </div>
      <h1 className="slide-title">
        From first call to <span className="accent">running your back office</span>
      </h1>
      <p className="lede">A three-stage partnership, not a one-time handoff.</p>
      <div className="stepline">
        {steps.map((s, i) => (
          <div className="step" key={i}>
            <span className="num">{nums[i] || String(i + 1).padStart(2, "0")}</span>
            <div className="stitle">{s.t}</div>
            <div className="sdesc">{s.d}</div>
          </div>
        ))}
      </div>
    </>
  );
}
