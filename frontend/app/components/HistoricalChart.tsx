"use client";

export function HistoricalChart() {
  const pts = [0, 2.1, 3.5, 4.8, 5.2, 6.1, 6.8, 7.2, 8.9, 9.4, 10.2, 10.8, 11.5, 12.4, 12.8, 13.2, 13.9, 14.6, 15.2, 15.8, 16.4, 17.1, 17.6, 18.2, 18.9, 19.5, 20.1, 20.8, 21.4, 22.0];

  const max = 25;
  const w = 400;
  const h = 140;
  const padX = 30;
  const padY = 10;
  const plotW = w - padX - 10;
  const plotH = h - padY - 20;

  const points = pts.map((v, i) => {
    const x = padX + (i / (pts.length - 1)) * plotW;
    const y = padY + plotH - (v / max) * plotH;
    return [x, y] as const;
  });

  const linePath = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const areaPath = linePath + ` L${points[points.length - 1][0]},${padY + plotH} L${padX},${padY + plotH} Z`;
  const lastPoint = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y axis labels */}
      {[0, 5, 10, 15, 20, 25].map((v) => {
        const y = padY + plotH - (v / max) * plotH;
        return (
          <g key={v}>
            <line x1={padX} y1={y} x2={w - 10} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            <text x={padX - 6} y={y + 3} fontSize="8" fill="#6b7280" textAnchor="end">{v}%</text>
          </g>
        );
      })}

      {/* X axis labels */}
      {["Sep 1", "Sep 8", "Sep 15", "Sep 22", "Sep 30"].map((label, i) => {
        const x = padX + (i / 4) * plotW;
        return (
          <text key={label} x={x} y={h - 4} fontSize="8" fill="#6b7280" textAnchor="middle">{label}</text>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill="url(#histGrad)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {/* End dot */}
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r="4" fill="#60a5fa" stroke="#05070f" strokeWidth="2" />
    </svg>
  );
}