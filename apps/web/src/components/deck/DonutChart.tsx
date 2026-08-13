import type { ChartSegment } from "@aeon/types";

// Ported from Presentation_Platform.html's donutChartSvg() — stacked <circle> segments
// using percent-based stroke-dasharray/dashoffset (pathLength=100), rotated -90deg so the
// first segment starts at 12 o'clock. Not a conic-gradient.
export function DonutChart({ segments, size = 92 }: { segments: ChartSegment[]; size?: number }) {
  const r = 80;
  const cx = 110;
  const cy = 110;
  const sw = 40;
  let offset = 0;
  return (
    <svg viewBox="0 0 220 220" width={size} height={size} style={{ flex: "0 0 auto" }}>
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {segments.map((seg, i) => {
          const dash = `${seg.pct} ${100 - seg.pct}`;
          const dashoffset = -offset;
          offset += seg.pct;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={sw}
              pathLength={100}
              strokeDasharray={dash}
              strokeDashoffset={dashoffset}
            />
          );
        })}
      </g>
    </svg>
  );
}
