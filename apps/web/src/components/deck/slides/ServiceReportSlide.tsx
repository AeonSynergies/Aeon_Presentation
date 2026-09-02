import type { DeckService, ReportSlide } from "@aeon/types";
import { ReportTemplate } from "../ReportTemplate";

export function ServiceReportSlide({ svc, report }: { svc: DeckService; report: ReportSlide }) {
  const eyebrow = `${svc.team.toUpperCase()} · OUTPUT`;
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
