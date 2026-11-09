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

/**
 * Body weight on paper: ink dots for weigh-ins, the 7-day average as a 2.5px accent
 * line, the forecast dashed. Flagged weigh-ins are hollow orange circles; one far out
 * of range is pinned to the top with an arrow and its value.
 */
export function WeightChart({ points, avg, projection, flagged, unit, label }: Props) {
  const fc = projection?.line ?? [];
  const all = [...points, ...avg, ...fc];
  if (points.length < 2) return null;
  const t = (p: Point) => parseDate(p.date).getTime();
  const x0 = Math.min(...all.map(t));
  const x1 = Math.max(...all.map(t), x0 + DAY);
  const vals = all.map((p) => fromLb(p.value, unit));
  const span = Math.max(...vals) - Math.min(...vals);
  const pad = Math.max(span * 0.12, 1);
  const lo = Math.min(...vals) - pad;
  const hi = Math.max(...vals) + pad;

  const sx = (ms: number) => PAD.left + ((ms - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
  const sy = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const path = (ps: Point[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${sx(t(p)).toFixed(1)},${sy(fromLb(p.value, unit)).toFixed(1)}`).join('');

  const yTicks = ticks(lo, hi, 5);
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((f) => x0 + f * (x1 - x0));
  const fmtX = (ms: number) => {
    const d = new Date(ms);
    return shortDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  const inFlag = flagged.filter((p) => t(p) >= x0 && t(p) <= x1);

  return (
    <figure role="img" aria-label={label}>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={sy(v)} y2={sy(v)} stroke={colors.grid} strokeWidth={1} />
            <text x={PAD.left - 6} y={sy(v) + 3} textAnchor="end" fontSize={10} fill={colors.inkSecondary}>
              {num(v, 0)}
            </text>
          </g>
        ))}
        {xTicks.map((ms, i) => (
          <text
            key={ms}
            x={sx(ms)}
            y={H - 6}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            fontSize={10}
            fill={colors.inkSecondary}>
            {fmtX(ms)}
          </text>
        ))}
        {fc.length > 1 ? <path d={path(fc)} fill="none" stroke={colors.accent} strokeWidth={2} strokeDasharray="6 5" /> : null}
        {points.map((p) => (
          <circle key={p.date} cx={sx(t(p))} cy={sy(fromLb(p.value, unit))} r={2.6} fill={colors.ink} />
        ))}
        {avg.length > 1 ? (
          <path d={path(avg)} fill="none" stroke={colors.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {inFlag.map((p) => {
          const v = fromLb(p.value, unit);
          const cx = sx(t(p));
          if (v > hi || v < lo) {
            const top = v > hi;
            const y = top ? PAD.top - 12 : H - PAD.bottom - 4;
            const anchor = cx > W - 90 ? 'end' : 'start';
            return (
              <g key={`f${p.date}`}>
                <circle cx={cx} cy={y} r={4} fill={colors.bg} stroke={colors.flag} strokeWidth={2} />
                <text x={anchor === 'end' ? cx - 8 : cx + 8} y={y + 3.5} textAnchor={anchor} fontSize={10} fill={colors.warnText}>
                  {top ? '↑' : '↓'} {num(v)} flagged
                </text>
              </g>
            );
          }
          return <circle key={`f${p.date}`} cx={cx} cy={sy(v)} r={4} fill={colors.bg} stroke={colors.flag} strokeWidth={2} />;
        })}
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
        {fc.length > 1 ? (
          <span>
            <i className="swatch dashed" style={{ width: 14 }} />
            forecast
          </span>
        ) : null}
        {inFlag.length ? (
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
