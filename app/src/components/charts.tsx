import { DashPathEffect, useFont } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import { Bar, CartesianChart, Line, Scatter } from 'victory-native';

import { fromLb, isoDate, num, parseDate, shortDate } from '@/lib/format';
import type { Point, Projection, Unit, Window } from '@/lib/types';
import { fontAssets, scale, sizes, space, useTheme } from '@/theme';

import { Text } from './Text';

const DAY_MS = 86_400_000;

type Row = { x: number; main?: number; avg?: number; forecast?: number };

function dayIndex(iso: string, origin: number): number {
  return Math.round((parseDate(iso).getTime() - origin) / DAY_MS);
}

function isoFromIndex(x: number, origin: number): string {
  const d = new Date(origin);
  d.setDate(d.getDate() + x);
  return isoDate(d);
}

/** Merge series into one row per day, as CartesianChart expects. */
export function buildRows(
  main: Point[],
  avg: Point[],
  forecast: Point[],
  unit: Unit,
): { rows: Row[]; origin: number } {
  const all = [...main, ...avg, ...forecast];
  if (!all.length) return { rows: [], origin: 0 };
  const origin = Math.min(...all.map((p) => parseDate(p.date).getTime()));
  const byX = new Map<number, Row>();
  const put = (series: Point[], key: 'main' | 'avg' | 'forecast') => {
    for (const p of series) {
      const x = dayIndex(p.date, origin);
      const row = byX.get(x) ?? { x };
      row[key] = fromLb(p.value, unit);
      byX.set(x, row);
    }
  };
  put(main, 'main');
  put(avg, 'avg');
  put(forecast, 'forecast');
  return { rows: [...byX.values()].sort((a, b) => a.x - b.x), origin };
}

function Legend({ items }: { items: { label: string; kind: 'main' | 'avg' | 'forecast' }[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {items.map((i) => (
        <View key={i.label} style={styles.legendItem}>
          <View
            style={[
              styles.swatch,
              i.kind === 'forecast'
                ? { borderColor: colors.inkSecondary, borderTopWidth: sizes.chartStroke, borderStyle: 'dashed' }
                : { backgroundColor: i.kind === 'main' ? colors.accent : colors.inkSecondary },
            ]}
          />
          <Text variant="caption" tone="secondary">
            {i.label}
          </Text>
        </View>
      ))}
    </View>
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
  accessibilityLabel: string;
};

/** Main series (accent), optional average (inkSecondary) and dashed forecast. */
export function TrendChart({
  main,
  avg = [],
  projection,
  unit,
  mainLabel,
  avgLabel,
  mainStyle = 'line',
  accessibilityLabel,
}: TrendProps) {
  const { colors } = useTheme();
  const font = useFont(fontAssets.mono, scale.caption.fontSize);
  const { rows, origin } = buildRows(main, avg, projection?.line ?? [], unit);
  if (rows.length < 2) return null;

  const axis = { font, labelColor: colors.inkSecondary, lineColor: colors.border, lineWidth: sizes.hairline };
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={styles.chart}>
        <CartesianChart
          data={rows}
          xKey="x"
          yKeys={['main', 'avg', 'forecast']}
          domainPadding={{ top: space.sm, bottom: space.sm, left: space.xs, right: space.xs }}
          xAxis={{ ...axis, tickCount: 4, formatXLabel: (x) => shortDate(isoFromIndex(Number(x), origin)) }}
          yAxis={[{ ...axis, tickCount: 4, formatYLabel: (y) => num(Number(y), 0) }]}
          frame={{ lineColor: 'transparent', lineWidth: 0 }}>
          {({ points }) => (
            <>
              {mainStyle === 'dots' ? (
                <Scatter points={points.main} radius={sizes.chartDot} color={colors.accent} />
              ) : (
                <>
                  <Line points={points.main} color={colors.accent} strokeWidth={sizes.chartStroke} connectMissingData />
                  <Scatter points={points.main} radius={sizes.chartDot} color={colors.accent} />
                </>
              )}
              <Line points={points.avg} color={colors.inkSecondary} strokeWidth={sizes.chartStroke} connectMissingData />
              <Line points={points.forecast} color={colors.inkSecondary} strokeWidth={sizes.chartStroke} connectMissingData>
                <DashPathEffect intervals={[space.xs, space.xs]} />
              </Line>
            </>
          )}
        </CartesianChart>
      </View>
      <Legend
        items={[
          { label: mainLabel, kind: 'main' },
          ...(avg.length && avgLabel ? [{ label: avgLabel, kind: 'avg' as const }] : []),
          ...(projection ? [{ label: 'Forecast', kind: 'forecast' as const }] : []),
        ]}
      />
    </View>
  );
}

/** Sets per week, last 8 weeks; the current week is the main (accent) bar. */
export function WeeklyBars({ weeks }: { weeks: Window[] }) {
  const { colors } = useTheme();
  const font = useFont(fontAssets.mono, scale.caption.fontSize);
  if (!weeks.length) return null;
  const data = weeks.map((w, i) => ({ i, sets: w.sets }));
  const axis = { font, labelColor: colors.inkSecondary, lineColor: colors.border, lineWidth: sizes.hairline };
  const label = `Sets per week over the last ${weeks.length} weeks: ${weeks.map((w) => w.sets).join(', ')}.`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.bars}>
      <CartesianChart
        data={data}
        xKey="i"
        yKeys={['sets']}
        domain={{ y: [0] }} // bars start at zero, or the smallest week draws as nothing
        domainPadding={{ left: space.md, right: space.md, top: space.sm }}
        xAxis={{ ...axis, tickCount: weeks.length, formatXLabel: (i) => {
            // Every other week, counting back from this week, so labels don't collide.
            const idx = Number(i);
            return (weeks.length - 1 - idx) % 2 === 0 ? shortDate(weeks[idx]?.end ?? weeks[0].end) : '';
          } }}
        yAxis={[{ ...axis, tickCount: 3, formatYLabel: (y) => num(Number(y), 0) }]}
        frame={{ lineColor: 'transparent', lineWidth: 0 }}>
        {({ points, chartBounds }) =>
          points.sets.map((p, idx) => (
            <Bar
              key={idx}
              points={[p]}
              chartBounds={chartBounds}
              color={idx === points.sets.length - 1 ? colors.accent : colors.border}
              barWidth={space.md}
              roundedCorners={{ topLeft: sizes.barRadius, topRight: sizes.barRadius }}
            />
          ))
        }
      </CartesianChart>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { height: sizes.chartHeight },
  bars: { height: sizes.barChartHeight },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  swatch: { width: space.sm, height: sizes.chartStroke },
});
