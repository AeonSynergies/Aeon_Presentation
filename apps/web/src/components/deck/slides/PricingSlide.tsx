import type { DeckConfig, SessionState } from "@aeon/types";
import { finalPriceFor, fmtMoney } from "@aeon/types";

export function PricingSlide({ deck, state }: { deck: DeckConfig; state: SessionState }) {
  const chosen = deck.services.filter((s) => state.selected.includes(s.id));
  let total = 0;
  let savedTotal = 0;
  let hasCustom = false;
  let hasPending = false;

  const cards = chosen.map((s) => {
    const { base, final, discounted } = finalPriceFor(s, state);
    if (final === undefined) {
      hasPending = true;
      const altQ = s.pricingDriverField ? deck.discoveryQuestions.find((q) => q.id === s.pricingDriverField) : null;
      const label = s.pricingDriverField ? s.pricingDriverLabel || altQ?.label || "value" : deck.pricingDriver.label;
      return (
        <div className="price-card" key={s.id}>
          <div className="pteam">{s.team.toUpperCase()}</div>
          <div className="pname">{s.name}</div>
          <span style={{ fontSize: "11.5px", color: "var(--fog)" }}>Enter {label.toLowerCase()} in Discovery Notes</span>
        </div>
      );
    }
    if (final === null) {
      hasCustom = true;
    } else {
      total += final;
      if (discounted && base !== null && base !== undefined) savedTotal += base - final;
    }
    return (
      <div className="price-card" key={s.id}>
        <div className="pteam">{s.team.toUpperCase()}</div>
        <div className="pname">{s.name}</div>
        {final === null ? (
          fmtMoney(null)
        ) : discounted ? (
          <span className="price-line">
            <span className="kpi-price strike">{fmtMoney(base)}</span>
            <span className="kpi-price">{fmtMoney(final)}</span>
          </span>
        ) : (
          <span className="kpi-price">{fmtMoney(final)}</span>
        )}
        {s.promoNote && (
          <div style={{ fontFamily: "var(--mono)", fontSize: "9px", color: "var(--teal)", marginTop: 2 }}>
            {"\u{1F381}"} {s.promoNote}
          </div>
        )}
      </div>
    );
  });

  const ledeParts: string[] = [];
  if (state.driverValue !== null && state.driverValue !== "") ledeParts.push(`${state.driverValue} ${deck.pricingDriver.unit}`);
  ledeParts.push(`${chosen.length} service${chosen.length === 1 ? "" : "s"} selected`);

  return (
    <>
      <div className="eyebrow">
        <span>PRICING SUMMARY</span>
      </div>
      <h1 className="slide-title">
        Your <span className="accent">monthly investment</span>
      </h1>
      <p className="lede">{ledeParts.join(" across ")}.</p>
      <div className={`price-grid${chosen.length > 4 ? " price-grid-3" : ""}`}>{cards}</div>
      {chosen.length > 0 ? (
        <div className="total-row">
          <span className="tlabel">Estimated Total / Month</span>
          <span className="tval">
            ${total.toLocaleString("en-US")}
            {hasCustom || hasPending ? " +" : ""}
          </span>
        </div>
      ) : (
        <div className="empty-note">Select at least one service in Discovery Notes.</div>
      )}
      {savedTotal > 0 && (
        <div className="savings-note">Includes a negotiated discount — ${savedTotal.toLocaleString("en-US")}/month off list pricing.</div>
      )}
      {hasCustom && <div className="surcharge-note">One or more selected services fall outside standard bands and are not included in the total above.</div>}
      {hasPending && (
        <div className="surcharge-note">One or more selected services need an additional answer in Discovery Notes and are not included in the total above yet.</div>
      )}
    </>
  );
}
