import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { buildRows, dateAt } from '@/lib/chartRows';
import { num, shortDate } from '@/lib/format';
import type { Point, Projection, Unit, Window } from '@/lib/types';
import { colors, fonts, fontSize } from '@/theme/tokens';

function useAxis() {
  const tick = { fill: colors.inkSecondary, fontSize: fontSize.small, fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' };
  return { colors, tick };
}

type SeriesKey = 'main' | 'avg' | 'forecast';

function Legend({ items }: { items: { label: string; kind: SeriesKey }[] }) {
  return (
    <div className="legend" aria-hidden="true">
      {items.map((i) => (
        <span key={i.label}>
          <i
            className={`swatch ${i.kind === 'forecast' ? 'dashed' : 'line'}`}
            style={i.kind === 'forecast' ? undefined : { background: i.kind === 'main' ? 'var(--ink)' : 'var(--accent)' }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

type TrendProps = {
  main: Point[];
  avg?: Point[];
  projection?: Projection | null;
  unit: Unit;
  mainLabel: string;
  avgLabel?: string;
  mainStyle?: 'line' | 'dots';
  label: string;
};

/** Main series (ink), optional average (accent, 2.5px) and a dashed accent forecast. */
export function TrendChart({ main, avg = [], projection, unit, mainLabel, avgLabel, mainStyle = 'line', label }: TrendProps) {
  const { colors, tick } = useAxis();
  const { rows, origin } = buildRows(main, avg, projection?.line ?? [], unit);
  if (rows.length < 2) return null;
  return (
    <figure role="img" aria-label={label}>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="x"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickCount={4}
              tickFormatter={(x: number) => shortDate(dateAt(origin, x))}
              tick={tick}
              stroke={colors.border}
              tickLine={false}
            />
            <YAxis
              domain={['auto', 'auto']}
              tickCount={4}
              width={44}
              tick={tick}
              stroke={colors.border}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => num(v, 0)}
            />
            <Tooltip
              isAnimationActive={false}
              labelFormatter={(x) => shortDate(dateAt(origin, Number(x)))}
              formatter={(v, name) => [`${num(Number(v))} ${unit}`, name === 'main' ? mainLabel : name === 'avg' ? avgLabel : 'Forecast']}
              contentStyle={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, fontFamily: fonts.mono, fontSize: 12 }}
              labelStyle={{ color: colors.inkSecondary }}
              itemStyle={{ color: colors.ink }}
            />
            {avg.length ? (
              <Line dataKey="avg" stroke={colors.accent} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
            ) : null}
            {projection ? (
              <Line dataKey="forecast" stroke={colors.accent} strokeWidth={2} strokeDasharray="6 5" dot={false} connectNulls isAnimationActive={false} />
            ) : null}
            {mainStyle === 'dots' ? (
              <Scatter dataKey="main" fill={colors.ink} isAnimationActive={false} shape={(p: { cx?: number; cy?: number; payload?: { main?: number } }) =>
                  p.payload?.main == null || !Number.isFinite(p.cy) ? <g /> : <circle cx={p.cx} cy={p.cy} r={3} fill={colors.ink} />
                } />
            ) : (
              <Line dataKey="main" stroke={colors.ink} strokeWidth={2} dot={{ r: 3, fill: colors.ink, strokeWidth: 0 }} connectNulls isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: mainLabel, kind: 'main' },
          ...(avg.length && avgLabel ? [{ label: avgLabel, kind: 'avg' as const }] : []),
          ...(projection ? [{ label: 'Forecast', kind: 'forecast' as const }] : []),
        ]}
      />
    </figure>
  );
}

/** Sets per week, in the accent; this week is the solid bar. */
export function WeeklyBars({ weeks }: { weeks: Window[] }) {
  const { colors, tick } = useAxis();
  if (!weeks.length) return null;
  const data = weeks.map((w) => ({ label: shortDate(w.end), sets: w.sets }));
  const label = `Sets per week over the last ${weeks.length} weeks: ${weeks.map((w) => w.sets).join(', ')}.`;
  return (
    <figure role="img" aria-label={label}>
      <div className="chart short">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis dataKey="label" tick={tick} stroke={colors.border} tickLine={false} interval={1} />
            <YAxis tick={tick} width={44} axisLine={false} tickLine={false} allowDecimals={false} tickCount={3} />
            <Bar dataKey="sets" radius={0} maxBarSize={24} isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell key={i} fill={colors.accent} fillOpacity={i === data.length - 1 ? 1 : 0.4} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
