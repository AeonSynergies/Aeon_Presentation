import type { DeckService, ReportSlide } from "@aeon/types";
import { ReportTemplate } from "../ReportTemplate";

// A service with exactly one report keeps the original full-size single-report layout. A
// service with more than one (its own already-assigned reports — this never regroups which
// service a report belongs to) renders them together as a card grid on one slide instead of
// one slide per report, matching the reference decks' layout (e.g. Route Invoice + Vehicle
// Invoice + Worker Comp + Rental & Lease Invoice together on one slide).
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
        <ReportTemplate template={report.template} />
        {report.illustrative && (
          <div className="illustrative-note" style={{ marginTop: 12 }}>
            Illustrative sample — swap in your verified client output before presenting.
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">
        <span>{eyebrow}</span>
      </div>
      <h1 className="slide-title">Sample Reports</h1>
      <div className="report-card-grid">
        {reports.map((report, i) => (
          <div className="report-card" key={i}>
            <h3 className="report-card-title">{report.title}</h3>
            <ReportTemplate template={report.template} />
            {report.illustrative && <div className="illustrative-note report-card-note">Illustrative sample — swap in your verified client output before presenting.</div>}
          </div>
        ))}
      </div>
    </>
  );
}
