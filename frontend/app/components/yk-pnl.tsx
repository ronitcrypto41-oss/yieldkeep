"use client";

// frontend/app/components/yk-pnl.tsx
// EVERYTHING the dashboard graph needs, in ONE file:
//   ChartStyles (styles), AddressAvatar, and PnlLine (Net PnL line + gains/losses ring + PnL-per-harvest bars).
// Colors are shared everywhere: green = gain, red = loss, white = no amount.
// It does not import from charts.tsx or pnl-chart.tsx, so those two files are no longer needed.

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PnlPoint } from "@/lib/use-pnl-history";

export type Range = "7D" | "30D" | "ALL";

const CHART_CSS = `
.yk-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.yk-toolbar-left { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }

.yk-seg { display: inline-flex; padding: 3px; gap: 2px; border: 1px solid var(--border, rgba(148,163,184,0.3)); border-radius: 10px; background: var(--bg-card, transparent); }
.yk-seg button { appearance: none; border: 0; background: transparent; color: var(--text-2, #cbd5e1); font: inherit; font-size: 12px; font-weight: 600; letter-spacing: 0.02em; padding: 6px 12px; border-radius: 7px; cursor: pointer; transition: background 0.12s, color 0.12s; }
.yk-seg button:hover:not(:disabled) { color: var(--text, #f9fafb); }
.yk-seg button.is-on { background: #3b82f6; color: #fff; }
.yk-seg button:disabled { opacity: 0.4; cursor: not-allowed; }

.yk-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-bottom: 24px; }
@media (max-width: 1100px) { .yk-grid-2 { grid-template-columns: 1fr; } }

.yk-chart-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.yk-sub { margin: 4px 0 0; font-size: 12px; color: var(--text-3, #94a3b8); }
.yk-legend { display: flex; gap: 14px; font-size: 12px; color: var(--text-2, #cbd5e1); align-items: center; }
.yk-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }

.yk-axis { fill: var(--text-3, #94a3b8); font-size: 11px; }
.yk-gridline { stroke: var(--border, rgba(148,163,184,0.3)); stroke-width: 1; }
.yk-zero { stroke: var(--text-3, #94a3b8); stroke-opacity: 0.5; stroke-width: 1; }

.yk-tip { position: absolute; pointer-events: none; z-index: 5; transform: translate(-50%, calc(-100% - 12px)); min-width: 150px; padding: 10px 12px; border-radius: 10px; font-size: 12px; line-height: 1.5; background: var(--bg-card, #1f2937); color: var(--text, #f9fafb); border: 1px solid var(--border, rgba(148,163,184,0.3)); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); white-space: nowrap; }
.yk-tip b { display: block; font-size: 14px; margin: 2px 0; font-variant-numeric: tabular-nums; }
.yk-tip span { color: var(--text-3, #94a3b8); }

.yk-empty { height: 220px; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 24px; font-size: 13px; color: var(--text-3, #94a3b8); border: 1px dashed var(--border, rgba(148,163,184,0.3)); border-radius: 12px; }

.yk-hero { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.yk-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; font-size: 12px; font-weight: 600; color: var(--text-2, #cbd5e1); border: 1px solid var(--border, rgba(148,163,184,0.3)); background: var(--bg-card, transparent); }
.yk-pill.warn { color: #f59e0b; border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.08); }
.yk-pill.ok { color: #22c55e; border-color: rgba(34, 197, 94, 0.35); background: rgba(34, 197, 94, 0.08); }
.yk-pill.bad { color: #ef4444; border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.08); }

.yk-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.yk-table th { text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3, #94a3b8); border-bottom: 1px solid var(--border, rgba(148,163,184,0.3)); }
.yk-table td { padding: 12px; border-bottom: 1px solid var(--border, rgba(148,163,184,0.3)); }
.yk-table tr:last-child td { border-bottom: 0; }
.yk-table .r { text-align: right; font-variant-numeric: tabular-nums; }
.yk-pos { color: #22c55e; }
.yk-neg { color: #ef4444; }

.yk-feed { list-style: none; margin: 12px 0 0; padding: 0; }
.yk-feed li { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border, rgba(148,163,184,0.3)); }
.yk-feed li:last-child { border-bottom: 0; }
.yk-feed .grow { flex: 1; min-width: 0; }
.yk-feed .who { font-size: 14px; font-weight: 600; }
.yk-feed .when { font-size: 12px; color: var(--text-3, #94a3b8); }
.yk-feed .amt { font-variant-numeric: tabular-nums; font-weight: 700; text-align: right; }
.yk-kind { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; margin-right: 8px; }
.yk-kind.deposit { background: rgba(59,130,246,0.15); color: #60a5fa; }
.yk-kind.withdraw { background: rgba(249,115,22,0.15); color: #fb923c; }
.yk-kind.harvest { background: rgba(34,197,94,0.15); color: #4ade80; }
.yk-avatars { display: flex; }
.yk-avatars > * { margin-left: -8px; box-shadow: 0 0 0 2px var(--bg-card, #1f2937); border-radius: 50%; }
.yk-avatars > *:first-child { margin-left: 0; }

.yk-chart-wrap { position: relative; width: 100%; }
.yk-chart-wrap svg { display: block; }
.yk-chart-note { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin: 10px 0 2px; font-size: 12px; color: var(--text-2, #cbd5e1); }
.yk-sum { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 14px 0 6px; }
@media (max-width: 700px) { .yk-sum { grid-template-columns: 1fr; } }
.yk-sum > div { border: 1px solid var(--border, rgba(148,163,184,0.3)); border-radius: 12px; padding: 12px 14px; background: rgba(148,163,184,0.06); }
.yk-sum span { display: block; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3, #94a3b8); }
.yk-sum b { display: block; margin-top: 4px; font-size: 18px; font-variant-numeric: tabular-nums; }
.yk-keys { display: flex; flex-wrap: wrap; gap: 16px; margin: 10px 0 0; font-size: 12px; color: var(--text-2, #cbd5e1); }
.yk-keys i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
.yk-live-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
.yk-live-badge.up { color: #22c55e; background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.35); }
.yk-live-badge.down { color: #ef4444; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.35); }
`;

export function ChartStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CHART_CSS }} />;
}

/* deterministic avatar for an address */
export function AddressAvatar({ address, size = 32, logo }: { address: string; size?: number; logo?: string }) {
  const h = (i: number) => parseInt(address.slice(2 + i * 4, 6 + i * 4) || "0", 16);
  const a = h(0) % 360;
  const b = (a + 40 + (h(1) % 140)) % 360;
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "none" }} />;
  }
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "none",
        display: "inline-block",
        background: `linear-gradient(135deg, hsl(${a} 75% 58%), hsl(${b} 75% 45%))`,
        boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.25)",
      }}
    />
  );
}

const GREEN = "#22c55e";
const RED = "#ef4444";
const WHITE = "#e5e7eb"; // no amount = white, same as the empty ring
const isZero = (v: number) => Math.abs(v) < 1e-9;
const tone = (v: number) => (isZero(v) ? WHITE : v > 0 ? GREEN : RED);
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

function PnlLineChart({ points, range, live }: { points: PnlPoint[]; range: Range; live: number }) {
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

    // split the line where it crosses zero, so profit runs are green, loss runs are red, zero runs are white
    const ex: { t: number; v: number }[] = [line[0]];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      if (a.v * b.v < 0) ex.push({ t: a.t + ((b.t - a.t) * (0 - a.v)) / (b.v - a.v), v: 0 });
      ex.push(b);
    }
    const runs: { up: boolean; zero: boolean; pts: { t: number; v: number }[] }[] = [];
    for (let i = 1; i < ex.length; i++) {
      const a = ex[i - 1], b = ex[i];
      const up = a.v + b.v >= 0;
      const last = runs[runs.length - 1];
      if (last && last.up === up) last.pts.push(b);
      else runs.push({ up, zero: false, pts: [a, b] });
    }
    runs.forEach((r) => { r.zero = r.pts.every((q) => isZero(q.v)); });
    const paths = runs.map((r) => {
      const d = r.pts.map((p, i) => `${i ? "L" : "M"} ${x(p.t)} ${y(p.v)}`).join(" ");
      const area = `${d} L ${x(r.pts[r.pts.length - 1].t)} ${zeroY} L ${x(r.pts[0].t)} ${zeroY} Z`;
      return { up: r.up, zero: r.zero, d, area };
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
  const flat = m.inside.every((p) => Math.abs(p.v) < 1e-9) && Math.abs(live) < 1e-9;
  const lc = tone(live);
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
          <path key={`a${i}`} d={p.area} fill={p.zero ? WHITE : p.up ? GREEN : RED} fillOpacity={p.zero ? 0 : 0.16} />
        ))}
        {m.paths.map((p, i) => (
          <path key={`l${i}`} d={p.d} fill="none" stroke={p.zero ? WHITE : p.up ? GREEN : RED} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* harvest markers: a diamond on the line at every harvest */}
        {m.inside.filter((p) => p.kind === "harvest").map((p, i) => (
          <g key={i} transform={`translate(${m.x(p.t)} ${m.y(p.v)})`}>
            <rect x="-5" y="-5" width="10" height="10" transform="rotate(45)" fill={tone(p.v)} stroke="#fff" strokeWidth="1.5" />
          </g>
        ))}

        {/* live point */}
        <circle cx={m.x(m.now)} cy={m.y(live)} r="9" fill={lc} fillOpacity="0.18" />
        <circle cx={m.x(m.now)} cy={m.y(live)} r="5.5" fill={lc} stroke="#fff" strokeWidth="2" />
        <text x={m.x(m.now) - 14} y={m.y(live) + (live >= 0 ? -12 : 20)} textAnchor="end" fill={lc} fontSize="12" fontWeight="700">
          {fmtPnl(live)} USDC
        </text>

        {flat && (
          <text className="yk-axis" x={(L + w - R) / 2} y={m.zeroY - 40} textAnchor="middle">
            Flat at 0 until a harvest adds yield. It then moves up or down with your PnL.
          </text>
        )}

        {tip && (
          <g>
            <line x1={tip.x} x2={tip.x} y1={T} y2={H - B} stroke="currentColor" strokeOpacity="0.35" strokeDasharray="4 4" />
            <circle cx={tip.x} cy={tip.y} r="5" fill={tone(tip.v)} stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>

      {tip && (
        <div className="yk-tip" style={{ left: Math.min(w - 90, Math.max(90, tip.x)), top: tip.y }}>
          <span>{dLong(tip.t)}</span>
          <b style={{ color: tone(tip.v) }}>{fmtPnl(tip.v)} USDC</b>
          <span>{kindName(tip.kind)} · Net PnL</span>
        </div>
      )}
    </div>
  );
}

/* ---------- donut: how much of your PnL movement was gain (green) vs loss (red) ---------- */
const SPLIT_CSS = `
.yk-pnl-split { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 20px; align-items: center; }
@media (max-width: 960px) { .yk-pnl-split { grid-template-columns: 1fr; } }
.yk-donut { border: 1px solid var(--border, rgba(148,163,184,0.3)); border-radius: 14px; padding: 18px 16px; background: rgba(148,163,184,0.05); text-align: center; }
.yk-donut h3 { margin: 0 0 10px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3, #94a3b8); font-weight: 700; }
.yk-donut svg { display: block; margin: 0 auto; }
.yk-donut ul { list-style: none; margin: 14px 0 0; padding: 0; text-align: left; font-size: 13px; }
.yk-donut li { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border, rgba(148,163,184,0.3)); }
.yk-donut li:last-child { border-bottom: 0; }
.yk-donut li i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; }
.yk-donut li b { font-variant-numeric: tabular-nums; }
.yk-donut p { margin: 10px 0 0; font-size: 11px; color: var(--text-3, #94a3b8); }
.yk-bars-title { margin: 22px 0 0; font-size: 14px; font-weight: 700; }
`;

function PnlDonut({ points, live }: { points: PnlPoint[]; live: number }) {
  const d = useMemo(() => {
    let prev = 0, gain = 0, loss = 0, harvests = 0;
    for (const p of [...points, { t: 0, v: live } as PnlPoint]) {
      const diff = p.v - prev;
      if (diff > 1e-9) gain += diff;
      else if (diff < -1e-9) loss += -diff;
      prev = p.v;
      if (p.kind === "harvest") harvests++;
    }
    return { gain, loss, total: gain + loss, harvests };
  }, [points, live]);

  const S = 170, c = S / 2, r = 62, sw = 22, C = 2 * Math.PI * r;
  const empty = d.total <= 0;
  const gl = empty ? 0 : (d.gain / d.total) * C;
  const ll = empty ? 0 : (d.loss / d.total) * C;
  const gap = !empty && gl > 0 && ll > 0 ? 3 : 0;
  const pct = (v: number) => (empty ? "0%" : `${((v / d.total) * 100).toFixed(1)}%`);
  const net = live;

  return (
    <div className="yk-donut">
      <h3>Gains vs losses</h3>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Share of PnL movement that was gain or loss">
        <g transform={`rotate(-90 ${c} ${c})`}>
          {empty ? (
            <circle cx={c} cy={c} r={r} fill="none" stroke={WHITE} strokeOpacity="0.9" strokeWidth={sw} />
          ) : (
            <>
              {gl > 0 && <circle cx={c} cy={c} r={r} fill="none" stroke={GREEN} strokeWidth={sw} strokeDasharray={`${Math.max(0, gl - gap)} ${C}`} />}
              {ll > 0 && <circle cx={c} cy={c} r={r} fill="none" stroke={RED} strokeWidth={sw} strokeDasharray={`${Math.max(0, ll - gap)} ${C}`} strokeDashoffset={-gl} />}
            </>
          )}
        </g>
        <text x={c} y={c - 2} textAnchor="middle" fontSize="18" fontWeight="700" fill={tone(net)}>{fmtPnl(net)}</text>
        <text x={c} y={c + 16} textAnchor="middle" className="yk-axis">USDC net</text>
      </svg>
      <ul>
        <li><span><i style={{ background: GREEN }} />Gains</span><b>{empty ? "0" : `+${d.gain.toFixed(d.gain < 1 ? 4 : 2)}`} · {pct(d.gain)}</b></li>
        <li><span><i style={{ background: RED }} />Losses</span><b>{empty ? "0" : `−${d.loss.toFixed(d.loss < 1 ? 4 : 2)}`} · {pct(d.loss)}</b></li>
        <li><span><i style={{ background: WHITE }} />Harvests counted</span><b>{d.harvests}</b></li>
      </ul>
      <p>{empty ? "Empty ring: no yield gain or loss yet." : "Total upward vs downward PnL moves, all time."}</p>
    </div>
  );
}

/* ---------- bars: PnL change at every harvest (green = gain, red = loss, white = no change) ---------- */
const BH = 240;

function PnlBars({ points, live }: { points: PnlPoint[]; live: number }) {
  const { ref, w } = useWidth();
  const [hi, setHi] = useState<number | null>(null);

  const bars = useMemo(() => {
    const out: { t: number; d: number; label: string }[] = [];
    let prev = 0;
    for (const p of points) {
      if (p.kind === "harvest") out.push({ t: p.t, d: p.v - prev, label: "Harvest" });
      prev = p.v;
    }
    if (Math.abs(live - prev) > 1e-9) out.push({ t: Date.now(), d: live - prev, label: "Since last harvest (live)" });
    return out.slice(-24);
  }, [points, live]);

  const L2 = 64, R2 = 24, T2 = 20, B2 = 40;
  const ax = axis(Math.min(0, ...bars.map((b) => b.d)), Math.max(0, ...bars.map((b) => b.d)));
  const plotW = w - L2 - R2;
  const n = Math.max(1, bars.length);
  const slot = plotW / n;
  const bw = Math.max(8, Math.min(48, slot * 0.6));
  const y = (v: number) => T2 + (1 - (v - ax.lo) / (ax.hi - ax.lo)) * (BH - T2 - B2);
  const every = Math.max(1, Math.ceil(bars.length / Math.max(2, Math.floor(plotW / 70))));

  return (
    <div className="yk-chart-wrap" ref={ref} style={{ height: BH }}>
      <svg width={w} height={BH} viewBox={`0 0 ${w} ${BH}`} role="img" aria-label="PnL change per harvest" onMouseLeave={() => setHi(null)}>
        {ax.ticks.map((tv) => (
          <g key={tv}>
            <line className={tv === 0 ? "yk-zero" : "yk-gridline"} x1={L2} x2={w - R2} y1={y(tv)} y2={y(tv)} strokeDasharray={tv === 0 ? undefined : "3 5"} />
            <text className="yk-axis" x={L2 - 10} y={y(tv) + 4} textAnchor="end">{fmtTick(tv, ax.step)}</text>
          </g>
        ))}
        {bars.map((b, i) => {
          const cx = L2 + (i + 0.5) * slot;
          const zero = isZero(b.d);
          const h = zero ? 6 : Math.max(3, Math.abs(y(b.d) - y(0)));
          const top = zero ? y(0) - 3 : Math.min(y(b.d), y(0));
          return (
            <g key={i} onMouseEnter={() => setHi(i)}>
              <rect x={cx - slot / 2} y={T2} width={slot} height={BH - T2 - B2} fill="transparent" />
              <rect x={cx - bw / 2} y={top} width={bw} height={h} rx="3" fill={tone(b.d)} fillOpacity={hi === null || hi === i ? 1 : 0.45} />
              {i % every === 0 && (
                <text className="yk-axis" x={cx} y={BH - 16} textAnchor="middle">{dShort(b.t)}</text>
              )}
            </g>
          );
        })}
        {bars.length === 0 && (
          <text className="yk-axis" x={(L2 + w - R2) / 2} y={y(0) - 14} textAnchor="middle">
            No harvest yet. A bar appears after each harvest.
          </text>
        )}
      </svg>
      {hi !== null && bars[hi] && (
        <div className="yk-tip" style={{ left: Math.min(w - 90, Math.max(90, L2 + (hi + 0.5) * slot)), top: Math.min(y(bars[hi].d), y(0)) }}>
          <span>{dLong(bars[hi].t)}</span>
          <b style={{ color: tone(bars[hi].d) }}>{fmtPnl(bars[hi].d)} USDC</b>
          <span>{bars[hi].label} · PnL change</span>
        </div>
      )}
    </div>
  );
}

/* ---------- the panel the dashboard uses: line chart + donut side by side, bars below ---------- */
export function PnlLine({ points, range, live }: { points: PnlPoint[]; range: Range; live: number }) {
  return (
    <div>
      <div className="yk-pnl-split">
        <style dangerouslySetInnerHTML={{ __html: SPLIT_CSS }} />
        <PnlLineChart points={points} range={range} live={live} />
        <PnlDonut points={points} live={live} />
      </div>
      <h3 className="yk-bars-title">PnL per harvest</h3>
      <p className="yk-sub" style={{ marginBottom: 8 }}>Each bar is how much your PnL changed at one harvest. Green = gain, red = loss, white = no change.</p>
      <PnlBars points={points} live={live} />
    </div>
  );
}