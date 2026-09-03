import type { DeckService, ReportSlide } from "@aeon/types";
import { groupIntoRows } from "@aeon/types";
import { ReportTemplate } from "../ReportTemplate";

// A service with exactly one report on this slide (the common case — most services'
// reports fit on one slide, see paginateReports in getSlides.tsx) keeps the original
// full-size single-report layout. More than one renders together as rows of cards on one
// slide, matching the reference decks' layout (e.g. Route Invoice + Vehicle Invoice +
// Worker Comp + Rental & Lease Invoice together). Each row is sized to what's actually in
// it — a lone report in a row renders full-width, a pair renders side by side — rather
// than a fixed-column grid that leaves an empty half-width gap or crops a wide report (see
// reportSizeHint/groupIntoRows in packages/types/src/deck.ts). `reports` here is always
// already one page's worth (paginateReports already split off anything that wouldn't fit).
export function ServiceReportSlide({ svc, reports }: { svc: DeckService; reports: ReportSlide[] }) {
  const eyebrow = `${svc.team.toUpperCase()} · OUTPUT`;

  if (reports.length === 1) {
    const report = reports[0];
    return (
      <>
        <div className="eyebrow">
          <span>{eyebrow}</span>
        </div>
        <h1 className="slide-title">{report.title}</h1>
        <div className="report-single">
          <ReportTemplate template={report.template} />
        </div>
        {report.illustrative && (
          <div className="illustrative-note" style={{ marginTop: 12 }}>
            Illustrative sample — swap in your verified client output before presenting.
          </div>
        )}
      </>
    );
  }

  const rows = groupIntoRows(reports);

  return (
    <>
      <div className="eyebrow">
        <span>{eyebrow}</span>
      </div>
      <h1 className="slide-title">Sample Reports</h1>
      <div className="report-page">
        {rows.map((row, ri) => (
          <div className={`report-row report-row-${row.length}`} key={ri}>
            {row.map((report, ci) => (
              <div className="report-card" key={ci}>
                <h3 className="report-card-title">{report.title}</h3>
                <div className="report-card-body">
                  <ReportTemplate template={report.template} />
                </div>
                {report.illustrative && <div className="illustrative-note report-card-note">Illustrative sample — swap in your verified client output before presenting.</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
