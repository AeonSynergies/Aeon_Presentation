import type { DeckConfig, DeckService, SessionState } from "@aeon/types";
import { finalPriceFor, fmtMoney } from "@aeon/types";

// Detail slide for a service (Templates redesign, split light+dark category): a light
// "title + activities list" panel (What We Handle) paired with a dark "impact/KPIs +
// price" panel (What You'll Get) — reuses the same .about-split convention as the About
// slide rather than a bespoke layout, so every split-panel slide in the deck shares one
// visual system.
export function ServiceSlide({ deck, svc, state }: { deck: DeckConfig; svc: DeckService; state: SessionState }) {
  const { final } = finalPriceFor(svc, deck.discountRules, state);
  const priceDisplay = final === undefined ? undefined : fmtMoney(final);
  const model = deck.pricingModels.find((m) => m.id === svc.pricingModelId);
  const driverLabel = model?.label || "value";
  const driverValueShown = state.answers[svc.pricingModelId];
  const surchargeActive = !!(svc.surcharge && state.toggles[svc.surcharge.questionId]);

  return (
    <div className="about-split">
      <div className="about-split-left">
        <div className="eyebrow">
          <span>{svc.team.toUpperCase()}</span>
        </div>
        <h1 className="slide-title">{svc.name}</h1>
        <div className="split-heading">What We Handle</div>
        <ul className="plain-list">
          {svc.handle.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </div>
      <div className="about-split-right">
        <div className="split-heading">
          What You'll Get <span className="tag">IMPACT + KPIs</span>
        </div>
        <div className="stat-row">
          {svc.stats.map((s, i) => (
            <div className="stat-chip" key={i}>
              <div className="sval">{s.v}</div>
              <div className="slabel">{s.l}</div>
            </div>
          ))}
        </div>
        <ul className="plain-list">
          {svc.dashboards.map((k, i) => (
            <li key={i}>{k}</li>
          ))}
        </ul>
        <div className="illustrative-note">Impact figures are illustrative placeholders — swap in your verified client results before presenting.</div>
        <div className="svc-invest-row">
          <div className="inv-label">
            MONTHLY INVESTMENT
            {driverValueShown ? ` · ${driverValueShown} ${driverLabel.toUpperCase()}` : ""}
            {surchargeActive ? " · SURCHARGE APPLIED" : ""}
            {svc.promoNote ? ` · \u{1F381} ${svc.promoNote.toUpperCase()}` : ""}
          </div>
          <div className="kpi-price">
            {priceDisplay === undefined ? <span className="inv-pending">Enter {driverLabel.toLowerCase()} in Discovery Notes</span> : priceDisplay}
          </div>
        </div>
      </div>
    </div>
  );
}
