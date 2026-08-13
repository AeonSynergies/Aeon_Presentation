import type { DeckConfig, DeckService, SessionState } from "@aeon/types";
import { finalPriceFor, fmtMoney } from "@aeon/types";

export function ServiceSlide({ deck, svc, state }: { deck: DeckConfig; svc: DeckService; state: SessionState }) {
  const { final } = finalPriceFor(svc, state);
  const priceDisplay = final === undefined ? undefined : fmtMoney(final);
  const usesAltDriver = !!svc.pricingDriverField;
  const altQuestion = usesAltDriver ? deck.discoveryQuestions.find((q) => q.id === svc.pricingDriverField) : null;
  const driverLabel = usesAltDriver ? svc.pricingDriverLabel || altQuestion?.label || "value" : deck.pricingDriver.label;
  const driverValueShown = usesAltDriver ? state.answers[svc.pricingDriverField!] : state.driverValue;
  const surchargeActive = !!(svc.surcharge && state.toggles[svc.surcharge.questionId]);

  return (
    <>
      <div className="eyebrow">
        <span>{svc.team.toUpperCase()}</span>
      </div>
      <h1 className="slide-title">{svc.name}</h1>
      <div className="grid-2">
        <div className="panel-card">
          <h3>What We Handle</h3>
          <ul>
            {svc.handle.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
        <div className="panel-card">
          <h3>
            What You'll Get <span className="tag">IMPACT + KPIs</span>
          </h3>
          <div className="stat-row">
            {svc.stats.map((s, i) => (
              <div className="stat-chip" key={i}>
                <div className="sval">{s.v}</div>
                <div className="slabel">{s.l}</div>
              </div>
            ))}
          </div>
          <ul>
            {svc.dashboards.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
          <div className="illustrative-note">Impact figures are illustrative placeholders — swap in your verified client results before presenting.</div>
        </div>
      </div>
      <div className="panel-card" style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: "10.5px", color: "var(--fog)", letterSpacing: "0.04em" }}>
          MONTHLY INVESTMENT
          {driverValueShown ? ` · ${driverValueShown} ${driverLabel.toUpperCase()}` : ""}
          {surchargeActive ? " · SURCHARGE APPLIED" : ""}
          {svc.promoNote ? ` · \u{1F381} ${svc.promoNote.toUpperCase()}` : ""}
        </div>
        <div className="kpi-price">
          {priceDisplay === undefined ? (
            <span style={{ fontSize: "12.5px", color: "var(--fog)", fontFamily: "var(--body)", fontWeight: 400 }}>
              Enter {driverLabel.toLowerCase()} in Discovery Notes
            </span>
          ) : (
            priceDisplay
          )}
        </div>
      </div>
    </>
  );
}
