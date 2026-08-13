import type { ReportCard as ReportCardT } from "@aeon/types";
import { DonutChart } from "./DonutChart";

// Ported from Presentation_Platform.html's chartCardHtml/metricsCardHtml/tableCardHtml/
// imageCardHtml + reportCardHtml dispatcher (see Aeon_Platform_Requirements_Spec.md
// Section 4: chart/metrics/table/image card types).
export function ReportCard({ card }: { card: ReportCardT }) {
  if (card.type === "chart") {
    return (
      <div className="panel-card">
        <h3>{card.title}</h3>
        <div className="chart-single">
          <DonutChart segments={card.segments} size={108} />
          <ul className="chart-legend">
            {card.segments.map((s, i) => (
              <li key={i}>
                <span className="legend-dot" style={{ background: s.color }} />
                {s.label}
                <b>{s.pct}%</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (card.type === "metrics") {
    return (
      <div className="panel-card metrics-card">
        <h3>{card.title}</h3>
        {card.meta && <div className="metrics-meta">{card.meta}</div>}
        <ul className="metrics-list">
          {card.rows.map((r, i) => (
            <li key={i}>
              <span>{r.label}</span>
              <b>{r.value}</b>
            </li>
          ))}
        </ul>
        {card.highlight && (
          <div className="metrics-highlight">
            <span>{card.highlight.label}</span>
            <b>{card.highlight.value}</b>
          </div>
        )}
      </div>
    );
  }

  if (card.type === "table") {
    return (
      <div className="panel-card table-card">
        <h3>{card.title}</h3>
        {card.stats && card.stats.length > 0 && (
          <div className="stat-row">
            {card.stats.map((s, i) => (
              <div className="stat-chip" key={i}>
                <div className="sval">{s.value}</div>
                <div className="slabel">{s.label}</div>
              </div>
            ))}
          </div>
        )}
        <table className="report-table">
          <thead>
            <tr>
              {card.columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (card.type === "image") {
    return (
      <div className="panel-card image-card">
        <h3>{card.title || "Sample Output"}</h3>
        <img src={card.src} alt="" />
      </div>
    );
  }

  return null;
}

/** Ported from slideServiceReport()'s grid-class selection — entirely data driven, not
 * CSS auto-layout: any wide card forces a stacked column; otherwise the choice is by
 * card count, with the 3-card case splitting on whether the third card is a table. */
export function reportGridClass(cards: ReportCardT[]): string {
  const hasWideCard = cards.some((c) => c.type === "table" && c.wide);
  if (hasWideCard) return "report-stack";
  if (cards.length === 1) return "grid-1";
  if (cards.length === 2) return "grid-2";
  if (cards.length === 3) return cards[2]?.type === "table" ? "grid-3-wide-last" : "grid-3";
  return "report-grid-4";
}
