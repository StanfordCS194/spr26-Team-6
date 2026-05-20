"use client";

export type RadarAxis = {
  /** Axis label shown next to the outer edge. */
  label: string;
  /** The factor's raw sub-score. */
  value: number;
  /** Max possible value on this factor (used to normalize). */
  max: number;
};

type Props = {
  data: RadarAxis[];
  /** Square size in pixels. Defaults to 360. */
  size?: number;
  /** Number of concentric rings drawn behind the polygon. */
  rings?: number;
};

/**
 * Pure-SVG radar chart. Each axis is normalized to value/max so that one
 * vertex sitting on the outer ring means "max possible on that factor."
 *
 * Axes are evenly spaced starting at the top (12 o'clock) and proceeding
 * clockwise.
 */
export function RadarChart({ data, size = 360, rings = 4 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const labelPadding = 56; // room outside the polygon for axis labels
  const maxRadius = size / 2 - labelPadding;
  const n = data.length;

  if (n < 3) {
    return (
      <p className="text-sm italic text-govbid-text-muted">
        Need at least 3 axes to render a radar chart.
      </p>
    );
  }

  // Angle for axis i, starting at top (-π/2), going clockwise.
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

  const pointAt = (i: number, ratio: number) => {
    const a = angleFor(i);
    return {
      x: cx + Math.cos(a) * maxRadius * ratio,
      y: cy + Math.sin(a) * maxRadius * ratio,
    };
  };

  // Concentric grid polygons (rings of the spiderweb).
  const gridPolygons: string[] = [];
  for (let r = 1; r <= rings; r++) {
    const ratio = r / rings;
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = pointAt(i, ratio);
      pts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    }
    gridPolygons.push(pts.join(" "));
  }

  // Axis lines from center to outer edge.
  const axisLines = Array.from({ length: n }, (_, i) => {
    const outer = pointAt(i, 1);
    return { x1: cx, y1: cy, x2: outer.x, y2: outer.y };
  });

  // Data polygon — clamp ratios into [0, 1].
  const dataPoints = data.map((d, i) => {
    const safeMax = d.max > 0 ? d.max : 1;
    const ratio = Math.min(1, Math.max(0, d.value / safeMax));
    return pointAt(i, ratio);
  });
  const dataPolyPoints = dataPoints
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

  // Axis labels — positioned just outside the outer ring.
  const labelPositions = data.map((d, i) => {
    const a = angleFor(i);
    const lx = cx + Math.cos(a) * (maxRadius + 18);
    const ly = cy + Math.sin(a) * (maxRadius + 18);
    // Anchor based on horizontal position so labels don't overlap the chart.
    let anchor: "start" | "middle" | "end" = "middle";
    const cosA = Math.cos(a);
    if (cosA > 0.2) anchor = "start";
    else if (cosA < -0.2) anchor = "end";
    return { x: lx, y: ly, anchor, label: d.label, value: d.value, max: d.max };
  });

  // Top-of-scale tick on the vertical axis ("max" indicator like 100 / 1).
  const topTickRatios = Array.from({ length: rings + 1 }, (_, i) => i / rings);

  return (
    <div
      className="mx-auto"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Compatibility factor radar chart"
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {/* Grid rings */}
        {gridPolygons.map((pts, i) => (
          <polygon
            key={`ring-${i}`}
            points={pts}
            fill="none"
            stroke="rgb(203 213 225)"
            strokeWidth={1}
          />
        ))}

        {/* Axis spokes */}
        {axisLines.map((line, i) => (
          <line
            key={`spoke-${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="rgb(203 213 225)"
            strokeWidth={1}
          />
        ))}

        {/* Top-axis tick labels — show as fraction of max */}
        {topTickRatios.slice(1).map((ratio, i) => (
          <text
            key={`tick-${i}`}
            x={cx + 4}
            y={cy - maxRadius * ratio}
            fontSize={10}
            fill="rgb(148 163 184)"
            dominantBaseline="middle"
          >
            {Math.round(ratio * 100)}%
          </text>
        ))}

        {/* Data polygon */}
        <polygon
          points={dataPolyPoints}
          fill="rgb(94 178 184 / 0.35)"
          stroke="rgb(56 138 144)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {dataPoints.map((p, i) => (
          <circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill="rgb(56 138 144)"
          />
        ))}

        {/* Axis labels with the per-factor value */}
        {labelPositions.map((l, i) => (
          <g key={`label-${i}`}>
            <text
              x={l.x}
              y={l.y - 5}
              fontSize={12}
              fontWeight={600}
              fill="rgb(30 27 75)"
              textAnchor={l.anchor}
              dominantBaseline="middle"
            >
              {l.label}
            </text>
            <text
              x={l.x}
              y={l.y + 9}
              fontSize={11}
              fill="rgb(100 116 139)"
              textAnchor={l.anchor}
              dominantBaseline="middle"
            >
              {formatValue(l.value, l.max)} / {formatValue(l.max, l.max)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function formatValue(v: number, max: number): string {
  // For fractional-max factors (binary timing, 0/0.5/1 award) show one decimal.
  if (max <= 1) return v.toFixed(1).replace(/\.0$/, "");
  return String(Math.round(v));
}
