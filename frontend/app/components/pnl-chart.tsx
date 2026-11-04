"use client";

// frontend/app/components/pnl-chart.tsx
// Net PnL line: goes UP when your yield grows (green), DOWN when it shrinks (red),
// with a zero line, harvest markers and a live "Now" point. Styles come from <ChartStyles /> in charts.tsx.

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PnlPoint } from "@/lib/use-pnl-history";
import type { Range } from "@/app/components/charts";

const GREEN = "#22c55e";
const RED = "#ef4444";
const H = 320, L = 64, R = 24, T = 28, B = 36;

const midnight = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const addDays = (t: number, n: number) => {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
};
const dShort = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const dLong = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const fmtPnl = (v: number) => {
  const a = Math.abs(v);
  const s = a === 0 ? "0.00" : a < 1 ? a.toFixed(4) : a < 1000 ? a.toFixed(2) : a.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${s}`;
};

/* round axis values that include zero */
function axis(min: number, max: number) {
  let lo = Math.min(min, 0), hi = Math.max(max, 0);
  if (hi - lo < 1e-9) { lo = -0.5; hi = 0.5; }
  const pad = (hi - lo) * 0.12;
  lo = lo < 0 ? lo - pad : 0;
  hi = hi > 0 ? hi + pad : 0;
  const raw = (hi - lo) / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  const a = Math.floor(lo / step + 1e-9) * step;
  const b = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo: a, hi: b, ticks, step };
}
const fmtTick = (v: number, step: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(step < 0.01 ? 4 : step < 1 ? 2 : 0)}`);

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(300, Math.floor(el.clientWidth || 760)));
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

export function PnlLine({ points, range, live }: { points: PnlPoint[]; range: Range; live: number }) {
  const { ref: wrapRef, w } = useWidth();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hx, setHx] = useState<number | null>(null);

  const m = useMemo(() => {
    const now = Date.now();
    const end = addDays(midnight(now), 1);
    const first = points[0]?.t ?? now;
    const start = range === "ALL" ? Math.min(midnight(first), addDays(midnight(now), -2)) : addDays(midnight(now), -(range === "7D" ? 6 : 29));

    // value just before the window, so the line enters from the left edge at the right height
    let base = 0;
    const inside: PnlPoint[] = [];
    for (const p of points) (p.t < start ? (base = p.v) : inside.push(p));
    const line: PnlPoint[] = [{ t: start, v: base }, ...inside, { t: now, v: live }];

    const vals = line.map((p) => p.v);
    const ax = axis(Math.min(...vals), Math.max(...vals));
    const x = (t: number) => L + ((t - start) / Math.max(1, end - start)) * (w - L - R);
    const y = (v: number) => T + (1 - (v - ax.lo) / (ax.hi - ax.lo)) * (H - T - B);
    const zeroY = y(0);

    // split the line where it crosses zero, so profit runs are green and loss runs are red
    const ex: { t: number; v: number }[] = [line[0]];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      if (a.v * b.v < 0) ex.push({ t: a.t + ((b.t - a.t) * (0 - a.v)) / (b.v - a.v), v: 0 });
      ex.push(b);
    }
    const runs: { up: boolean; pts: { t: number; v: number }[] }[] = [];
    for (let i = 1; i < ex.length; i++) {
      const a = ex[i - 1], b = ex[i];
      const up = a.v + b.v >= 0;
      const last = runs[runs.length - 1];
      if (last && last.up === up) last.pts.push(b);
      else runs.push({ up, pts: [a, b] });
    }
    const paths = runs.map((r) => {
      const d = r.pts.map((p, i) => `${i ? "L" : "M"} ${x(p.t)} ${y(p.v)}`).join(" ");
      const area = `${d} L ${x(r.pts[r.pts.length - 1].t)} ${zeroY} L ${x(r.pts[0].t)} ${zeroY} Z`;
      return { up: r.up, d, area };
    });

    const days: number[] = [];
    for (let t = start; t < end; t = addDays(t, 1)) days.push(t);
    const every = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor((w - L - R) / 76))));
    const labels = days.filter((_, i) => i % every === 0);
    return { start, end, now, line, inside, ax, x, y, zeroY, paths, labels };
  }, [points, range, live, w]);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r) setHx(Math.min(w - R, Math.max(L, e.clientX - r.left)));
  };

  let tip: { x: number; y: number; t: number; v: number; kind?: string } | null = null;
  if (hx !== null) {
    const t = m.start + ((hx - L) / (w - L - R)) * (m.end - m.start);
    let p = m.line[0];
    for (const q of m.line) if (q.t <= t) p = q;
    tip = { x: m.x(p.t), y: m.y(p.v), t: p.t, v: p.v, kind: p.kind };
  }
  const up = live >= 0;
  const flat = m.inside.every((p) => Math.abs(p.v) < 1e-9) && Math.abs(live) < 1e-9;
  const lc = up ? GREEN : RED;
  const kindName = (k?: string) => (k === "harvest" ? "Harvest" : k === "deposit" ? "Deposit" : k === "withdraw" ? "Withdrawal" : "Live reading");

  return (
    <div className="yk-chart-wrap" ref={wrapRef} style={{ height: H }}>
      <svg ref={svgRef} width={w} height={H} viewBox={`0 0 ${w} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHx(null)} role="img" aria-label="Net PnL over time">

        {m.ax.ticks.map((tv) => (
          <g key={tv}>
            <line className={tv === 0 ? "yk-zero" : "yk-gridline"} x1={L} x2={w - R} y1={m.y(tv)} y2={m.y(tv)} strokeDasharray={tv === 0 ? undefined : "3 5"} />
            <text className="yk-axis" x={L - 10} y={m.y(tv) + 4} textAnchor="end">{fmtTick(tv, m.ax.step)}</text>
          </g>
        ))}
        {m.labels.map((t) => (
          <g key={t}>
            <line className="yk-gridline" x1={m.x(t)} x2={m.x(t)} y1={H - B} y2={H - B + 5} />
            <text className="yk-axis" x={m.x(t)} y={H - 12} textAnchor="middle">{dShort(t)}</text>
          </g>
        ))}

        <line x1={m.x(m.now)} x2={m.x(m.now)} y1={T} y2={H - B} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 4" />
        <text className="yk-axis" x={m.x(m.now)} y={T - 12} textAnchor="middle">Now</text>

        {m.paths.map((p, i) => (
          <path key={`a${i}`} d={p.area} fill={p.up ? GREEN : RED} fillOpacity="0.16" />
        ))}
        {m.paths.map((p, i) => (
          <path key={`l${i}`} d={p.d} fill="none" stroke={p.up ? GREEN : RED} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* harvest markers: a diamond on the line at every harvest */}
        {m.inside.filter((p) => p.kind === "harvest").map((p, i) => (
          <g key={i} transform={`translate(${m.x(p.t)} ${m.y(p.v)})`}>
            <rect x="-5" y="-5" width="10" height="10" transform="rotate(45)" fill={p.v >= 0 ? GREEN : RED} stroke="#fff" strokeWidth="1.5" />
          </g>
        ))}

        {/* live point */}
        <circle cx={m.x(m.now)} cy={m.y(live)} r="9" fill={lc} fillOpacity="0.18" />
        <circle cx={m.x(m.now)} cy={m.y(live)} r="5.5" fill={lc} stroke="#fff" strokeWidth="2" />
        <text x={m.x(m.now) - 14} y={m.y(live) + (live >= 0 ? -12 : 20)} textAnchor="end" fill={lc} fontSize="12" fontWeight="700">
          {fmtPnl(live)} USDC
        </text>

        {flat && (
          <text className="yk-axis" x={(L + w - R) / 2} y={m.zeroY - 14} textAnchor="middle">
            Flat at 0 until a harvest adds yield. It then moves up or down with your PnL.
          </text>
        )}

        {tip && (
          <g>
            <line x1={tip.x} x2={tip.x} y1={T} y2={H - B} stroke="currentColor" strokeOpacity="0.35" strokeDasharray="4 4" />
            <circle cx={tip.x} cy={tip.y} r="5" fill={tip.v >= 0 ? GREEN : RED} stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>

      {tip && (
        <div className="yk-tip" style={{ left: Math.min(w - 90, Math.max(90, tip.x)), top: tip.y }}>
          <span>{dLong(tip.t)}</span>
          <b className={tip.v >= 0 ? "yk-pos" : "yk-neg"}>{fmtPnl(tip.v)} USDC</b>
          <span>{kindName(tip.kind)} · Net PnL</span>
        </div>
      )}
    </div>
  );
}