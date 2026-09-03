import type { ReportTemplate as ReportTemplateT } from "@aeon/types";

function BarHighlights({ t }: { t: Extract<ReportTemplateT, { kind: "bar-highlights" }> }) {
  const max = Math.max(...t.items.map((i) => i.count), 1);
  const topN = t.items.slice(0, t.sidebarCount ?? 3);
  return (
    <div className="report-bar-highlights" data-variant={t.colorVariant}>
      <div className="rbh-main">
        <h3 className="rbh-chart-title">{t.chartTitle}</h3>
        <div className="rbh-bars">
          {t.items.map((item, i) => (
            <div className="rbh-bar-row" key={i}>
              <div className="rbh-bar-label">{item.label}</div>
              <div className="rbh-bar-track">
                <div className="rbh-bar-fill" style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
              <div className="rbh-bar-count">{item.count}</div>
            </div>
          ))}
        </div>
        <div className="rbh-summary">{t.summary}</div>
      </div>
      <div className="rbh-sidebar">
        <div className="rbh-sidebar-label">{t.sidebarLabel}</div>
        {topN.map((item, i) => (
          <div className="rbh-sidebar-card" key={i}>
            <div className="rbh-sidebar-value">{item.count}</div>
            <div className="rbh-sidebar-item-label">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ParticularsTable({ t }: { t: Extract<ReportTemplateT, { kind: "particulars-table" }> }) {
  // Only the "Actual %" cell carries the highlight color (over/under the suggested target)
  // — "Suggested %" is a fixed reference figure, never colored, matching the reference design.
  const actualPctClass = (row: (typeof t.rows)[number]) => (row.highlight ? `rpt-${row.highlight}` : "");
  const valueClass = (row: (typeof t.rows)[number]) => {
    if (!row.highlight) return "";
    if (!t.showPctColumns) return `rpt-${row.highlight}`;
    return row.bold ? `rpt-${row.highlight}` : "";
  };
  const colSpan = t.showPctColumns ? 4 : 2;
  return (
    <div className="report-particulars">
      <table className="rpt-table">
        <thead>
          <tr>
            <th>Particulars</th>
            {t.showPctColumns && (
              <>
                <th>Suggested %</th>
                <th>Actual %</th>
              </>
            )}
            <th>{t.valueColumnLabel || "Amount ($)"}</th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, i) =>
            row.sectionHeader ? (
              <tr className="rpt-section" key={i}>
                <td colSpan={colSpan}>{row.label}</td>
              </tr>
            ) : (
              <tr className={row.bold ? "rpt-bold" : ""} key={i}>
                <td>{row.label}</td>
                {t.showPctColumns && (
                  <>
                    <td>{row.suggestedPct != null ? `${row.suggestedPct}%` : ""}</td>
                    <td className={actualPctClass(row)}>{row.actualPct != null ? `${row.actualPct}%` : ""}</td>
                  </>
                )}
                <td className={valueClass(row)}>
                  {row.value != null && row.isCurrency !== false ? "$ " : ""}
                  {row.value}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {t.extraList && (
        <div className="rpt-extra">
          <h4>{t.extraList.heading}</h4>
          <div className="rpt-extra-grid">
            {t.extraList.items.map((item, i) => (
              <div className="rpt-extra-item" key={i}>
                <span>{item.label}</span>
                <b>{item.value}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OperationalTable({ t }: { t: Extract<ReportTemplateT, { kind: "operational-table" }> }) {
  return (
    <div className="report-operational-table">
      <table className="ot-table">
        <thead>
          <tr>
            {t.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {t.summary && (
        <div className="rpt-extra">
          <h4>{t.summary.label}</h4>
          <div className="rpt-extra-grid">
            {t.summary.items.map((item, i) => (
              <div className="rpt-extra-item" key={i}>
                <span>{item.label}</span>
                <b className={item.highlight ? `rpt-${item.highlight}` : ""}>{item.value}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ReportTemplate({ template }: { template: ReportTemplateT }) {
  if (template.kind === "bar-highlights") return <BarHighlights t={template} />;
  if (template.kind === "particulars-table") return <ParticularsTable t={template} />;
  if (template.kind === "operational-table") return <OperationalTable t={template} />;
  return null;
}
