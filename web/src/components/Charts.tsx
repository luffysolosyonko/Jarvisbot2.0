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
import { exerciseName, fromLb, num, shortDate } from '@/lib/format';
import type { ExerciseVolume, Point, Projection, Unit, Window } from '@/lib/types';
import { fonts, fontSize } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

function useAxis() {
  const { colors } = useTheme();
  const tick = { fill: colors.inkSecondary, fontSize: fontSize.caption, fontFamily: fonts.mono };
  return { colors, tick };
}

type SeriesKey = 'main' | 'avg' | 'forecast';

function Legend({ items }: { items: { label: string; kind: SeriesKey }[] }) {
  return (
    <div className="legend" aria-hidden="true" style={{ marginTop: 8 }}>
      {items.map((i) => (
        <span key={i.label}>
          <i
            className={`swatch ${i.kind === 'forecast' ? 'dashed' : 'line'}`}
            style={i.kind === 'forecast' ? undefined : { background: i.kind === 'main' ? 'var(--accent)' : 'var(--ink-secondary)' }}
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

/** Main series (accent), optional average (inkSecondary) and a dashed forecast. */
export function TrendChart({ main, avg = [], projection, unit, mainLabel, avgLabel, mainStyle = 'line', label }: TrendProps) {
  const { colors, tick } = useAxis();
  const { rows, origin } = buildRows(main, avg, projection?.line ?? [], unit);
  if (rows.length < 2) return null;
  return (
    <figure role="img" aria-label={label}>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={colors.border} />
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
              contentStyle={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, fontFamily: fonts.ui, fontSize: 14 }}
              labelStyle={{ color: colors.inkSecondary }}
              itemStyle={{ color: colors.ink }}
            />
            {avg.length ? (
              <Line dataKey="avg" stroke={colors.inkSecondary} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            ) : null}
            {projection ? (
              <Line dataKey="forecast" stroke={colors.inkSecondary} strokeWidth={2} strokeDasharray="8 8" dot={false} connectNulls isAnimationActive={false} />
            ) : null}
            {mainStyle === 'dots' ? (
              <Scatter dataKey="main" fill={colors.accent} isAnimationActive={false} shape={(p: { cx?: number; cy?: number; payload?: { main?: number } }) =>
                  p.payload?.main == null || !Number.isFinite(p.cy) ? <g /> : <circle cx={p.cx} cy={p.cy} r={3} fill={colors.accent} />
                } />
            ) : (
              <Line dataKey="main" stroke={colors.accent} strokeWidth={2} dot={{ r: 3, fill: colors.accent, strokeWidth: 0 }} connectNulls isAnimationActive={false} />
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

/** Sets per week; this week is the accent bar. */
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
            <CartesianGrid vertical={false} stroke={colors.border} />
            <XAxis dataKey="label" tick={tick} stroke={colors.border} tickLine={false} interval={1} />
            <YAxis tick={tick} width={44} axisLine={false} tickLine={false} allowDecimals={false} tickCount={3} />
            <Bar dataKey="sets" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell key={i} fill={i === data.length - 1 ? colors.accent : colors.border} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Volume per exercise, largest first. */
export function VolumeBars({ exercises, unit }: { exercises: ExerciseVolume[]; unit: Unit }) {
  const { colors, tick } = useAxis();
  const data = exercises
    .filter((e) => e.volume_lb > 0)
    .slice(0, 8)
    .map((e) => ({ name: exerciseName(e.exercise), volume: Math.round(fromLb(e.volume_lb, unit)) }));
  if (!data.length) return null;
  const label = `Volume by exercise: ${data.map((d) => `${d.name} ${d.volume} ${unit}`).join(', ')}.`;
  return (
    <figure role="img" aria-label={label}>
      <div style={{ width: '100%', height: data.length * 40 + 24 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid horizontal={false} stroke={colors.border} />
            <XAxis type="number" tick={tick} stroke={colors.border} tickLine={false} tickFormatter={(v: number) => num(v / 1000, 0) + 'k'} />
            <YAxis type="category" dataKey="name" width={120} tick={{ ...tick, fontFamily: fonts.ui }} axisLine={false} tickLine={false} />
            <Bar dataKey="volume" fill={colors.accent} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
