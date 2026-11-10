import { useMemo } from 'react';

import { fromLb, num, parseDate, shortDate } from '@/lib/format';
import type { Point, Projection, Unit } from '@/lib/types';
import { colors } from '@/theme/tokens';

const W = 400;
const H = 210;
const PAD = { top: 26, right: 12, bottom: 22, left: 34 };
const DAY = 86_400_000;

/** Up to `count` round tick values covering [lo, hi]. */
function ticks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

type Props = {
  points: Point[]; // confirmed weigh-ins (lb)
  avg: Point[]; // 7-day average (lb)
  projection: Projection | null;
  flagged: Point[]; // outlying weigh-ins not yet confirmed (lb)
  unit: Unit;
  label: string;
};

const ms = (p: Point) => parseDate(p.date).getTime();

/** Scales, paths and ticks: everything the SVG needs, worked out once per data change. */
function layout(points: Point[], avg: Point[], fc: Point[], flagged: Point[], unit: Unit) {
  if (points.length < 2) return null;
  const all = [...points, ...avg, ...fc];
  const x0 = Math.min(...all.map(ms));
  const x1 = Math.max(...all.map(ms), x0 + DAY);
  const vals = all.map((p) => fromLb(p.value, unit));
  const pad = Math.max((Math.max(...vals) - Math.min(...vals)) * 0.12, 1);
  const lo = Math.min(...vals) - pad;
  const hi = Math.max(...vals) + pad;
  const sx = (t: number) => PAD.left + ((t - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
  const sy = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const path = (ps: Point[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${sx(ms(p)).toFixed(1)},${sy(fromLb(p.value, unit)).toFixed(1)}`).join('');
  const label = (t: number) => {
    const d = new Date(t);
    return shortDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };
  return {
    lo,
    hi,
    yTicks: ticks(lo, hi, 5).map((v) => ({ v, y: sy(v) })),
    xTicks: [0, 1 / 3, 2 / 3, 1].map((f) => x0 + f * (x1 - x0)).map((t) => ({ t, x: sx(t), text: label(t) })),
    dots: points.map((p) => ({ key: p.date, cx: sx(ms(p)), cy: sy(fromLb(p.value, unit)) })),
    avgPath: avg.length > 1 ? path(avg) : null,
    fcPath: fc.length > 1 ? path(fc) : null,
    flags: flagged
      .filter((p) => ms(p) >= x0 && ms(p) <= x1)
      .map((p) => {
        const v = fromLb(p.value, unit);
        return { key: p.date, v, cx: sx(ms(p)), cy: sy(v) };
      }),
  };
}

/**
 * Body weight on paper: ink dots for weigh-ins, the 7-day average as a 2.5px accent
 * line, the forecast dashed. Flagged weigh-ins are hollow orange circles; one far out
 * of range is pinned to the top with an arrow and its value.
 *
 * When the data arrives the average line draws left to right (~600 ms), then the dots
 * fade in (only when the system allows motion).
 */
export function WeightChart({ points, avg, projection, flagged, unit, label }: Props) {
  const fc = projection?.line;
  const geo = useMemo(() => layout(points, avg, fc ?? [], flagged, unit), [points, avg, fc, flagged, unit]);
  if (!geo) return null;
  const { lo, hi } = geo;

  return (
    <figure role="img" aria-label={label}>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {geo.yTicks.map(({ v, y }) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke={colors.grid} strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize={10} fill={colors.inkSecondary}>
              {num(v, 0)}
            </text>
          </g>
        ))}
        {geo.xTicks.map(({ t, x, text }, i) => (
          <text
            key={t}
            x={x}
            y={H - 6}
            textAnchor={i === 0 ? 'start' : i === geo.xTicks.length - 1 ? 'end' : 'middle'}
            fontSize={10}
            fill={colors.inkSecondary}>
            {text}
          </text>
        ))}
        <g className="chart-after">
          {geo.fcPath ? <path d={geo.fcPath} fill="none" stroke={colors.accent} strokeWidth={2} strokeDasharray="6 5" /> : null}
          {geo.dots.map((d) => (
            <circle key={d.key} cx={d.cx} cy={d.cy} r={2.6} fill={colors.ink} />
          ))}
        </g>
        {geo.avgPath ? (
          <path
            className="chart-draw"
            d={geo.avgPath}
            pathLength={1}
            fill="none"
            stroke={colors.accent}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        <g className="chart-after">
          {geo.flags.map((f) => {
            if (f.v > hi || f.v < lo) {
              const top = f.v > hi;
              const y = top ? PAD.top - 12 : H - PAD.bottom - 4;
              const anchor = f.cx > W - 90 ? 'end' : 'start';
              return (
                <g key={`f${f.key}`}>
                  <circle cx={f.cx} cy={y} r={4} fill={colors.bg} stroke={colors.flag} strokeWidth={2} />
                  <text x={anchor === 'end' ? f.cx - 8 : f.cx + 8} y={y + 3.5} textAnchor={anchor} fontSize={10} fill={colors.warnText}>
                    {top ? '↑' : '↓'} {num(f.v)} flagged
                  </text>
                </g>
              );
            }
            return <circle key={`f${f.key}`} cx={f.cx} cy={f.cy} r={4} fill={colors.bg} stroke={colors.flag} strokeWidth={2} />;
          })}
        </g>
      </svg>
      <div className="chart-legend" aria-hidden="true">
        <span>
          <svg width="8" height="8">
            <circle cx="4" cy="4" r="3" fill={colors.ink} />
          </svg>
          weigh-in
        </span>
        <span>
          <i className="swatch line" style={{ background: colors.accent, width: 14 }} />
          7-day avg
        </span>
        {geo.fcPath ? (
          <span>
            <i className="swatch dashed" style={{ width: 14 }} />
            forecast
          </span>
        ) : null}
        {geo.flags.length ? (
          <span>
            <svg width="10" height="10">
              <circle cx="5" cy="5" r="3.5" fill="none" stroke={colors.flag} strokeWidth="1.8" />
            </svg>
            flagged
          </span>
        ) : null}
      </div>
    </figure>
  );
}
