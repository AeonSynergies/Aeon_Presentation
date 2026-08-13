import type { DeckService } from "@aeon/types";
import { ReportCard, reportGridClass } from "../ReportCard";

export function ServiceReportSlide({ svc }: { svc: DeckService }) {
  const r = svc.reportSlide;
  if (!r) return null;
  const eyebrow = `${svc.team.toUpperCase()} · OUTPUT`;
  const gridClass = reportGridClass(r.cards);
  return (
    <>
      <div className="eyebrow">
        <span>{eyebrow}</span>
      </div>
      <h1 className="slide-title">{r.title}</h1>
      <div className={gridClass}>
        {r.cards.map((card, i) => (
          <ReportCard card={card} key={i} />
        ))}
      </div>
      {r.illustrative && (
        <div className="illustrative-note" style={{ marginTop: 12 }}>
          Illustrative sample — swap in your verified client output before presenting.
        </div>
      )}
    </>
  );
}
