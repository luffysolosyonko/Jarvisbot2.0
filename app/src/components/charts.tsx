import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line as SvgLine, Path, Text as SvgText } from 'react-native-svg';

import {
  barPath,
  evenTicks,
  linear,
  linePath,
  monoWidth,
  niceAxis,
} from '@/lib/chartScale';
import { fromLb, isoDate, num, parseDate, shortDate } from '@/lib/format';
import type { Point, Projection, Unit, Window } from '@/lib/types';
import { fonts, scale, sizes, space, useTheme, type ColorTokens } from '@/theme';

import { Text } from './Text';

const DAY_MS = 86_400_000;
const LABEL = scale.caption.fontSize;

type Row = { x: number; main?: number; avg?: number; forecast?: number };
type SeriesKey = 'main' | 'avg' | 'forecast';

function dayIndex(iso: string, origin: number): number {
  return Math.round((parseDate(iso).getTime() - origin) / DAY_MS);
}

function isoFromIndex(x: number, origin: number): string {
  const d = new Date(origin);
  d.setDate(d.getDate() + x);
  return isoDate(d);
}

/** Merge series into one row per day. */
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
  const put = (series: Point[], key: SeriesKey) => {
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

/** Width of the parent, measured once laid out (charts draw nothing until then). */
function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  return [width, (e) => setWidth(Math.round(e.nativeEvent.layout.width))];
}

function AxisLabel({
  x,
  y,
  anchor,
  color,
  children,
}: {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  color: string;
  children: string;
}) {
  return (
    <SvgText x={x} y={y} fill={color} fontSize={LABEL} fontFamily={fonts.mono} textAnchor={anchor}>
      {children}
    </SvgText>
  );
}

/** Horizontal grid lines with value labels on the left. */
function YGrid({
  ticks,
  y,
  left,
  right,
  colors,
}: {
  ticks: number[];
  y: (v: number) => number;
  left: number;
  right: number;
  colors: ColorTokens;
}) {
  return (
    <>
      {ticks.map((t) => (
        <SvgLine key={`y${t}`} x1={left} x2={right} y1={y(t)} y2={y(t)} stroke={colors.border} strokeWidth={sizes.hairline} />
      ))}
      {ticks.map((t) => (
        <AxisLabel key={`yl${t}`} x={left - space.xs} y={y(t) + LABEL / 3} anchor="end" color={colors.inkSecondary}>
          {num(t, 0)}
        </AxisLabel>
      ))}
    </>
  );
}

function Legend({ items }: { items: { label: string; kind: SeriesKey }[] }) {
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
  const [width, onLayout] = useWidth();
  const { rows, origin } = buildRows(main, avg, projection?.line ?? [], unit);
  if (rows.length < 2) return null;

  const height = sizes.chartHeight;
  const values = rows.flatMap((r) => [r.main, r.avg, r.forecast]).filter((v): v is number => v != null);
  const { domain: yDomain, ticks: yTicks } = niceAxis(Math.min(...values), Math.max(...values), 4);
  const yLabelWidth = Math.max(...yTicks.map((t) => monoWidth(num(t, 0), LABEL)));
  const left = yLabelWidth + space.xs * 2;
  const right = width - space.xs;
  const top = space.sm;
  const bottom = height - LABEL - space.xs * 2;
  const xMin = rows[0].x;
  const xMax = rows[rows.length - 1].x;
  const x = linear([xMin, xMax], [left + space.xs, right - space.xs]);
  const y = linear(yDomain, [bottom, top]);

  const series = (key: SeriesKey) =>
    rows.filter((r) => r[key] != null).map((r) => ({ x: x(r.x), y: y(r[key] as number) }));
  const mainPts = series('main');
  const avgPts = series('avg');
  const forecastPts = series('forecast');

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={styles.chart} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={height} pointerEvents="none">
            <YGrid ticks={yTicks} y={y} left={left} right={right} colors={colors} />
            {evenTicks(xMin, xMax, 4).map((t) => {
              const label = shortDate(isoFromIndex(t, origin));
              const half = monoWidth(label, LABEL) / 2;
              const cx = Math.min(Math.max(x(t), left + half), right - half);
              return (
                <AxisLabel key={`x${t}`} x={cx} y={height - space.xs} anchor="middle" color={colors.inkSecondary}>
                  {label}
                </AxisLabel>
              );
            })}
            {avgPts.length > 1 ? (
              <Path d={linePath(avgPts)} stroke={colors.inkSecondary} strokeWidth={sizes.chartStroke} fill="none" />
            ) : null}
            {forecastPts.length > 1 ? (
              <Path
                d={linePath(forecastPts)}
                stroke={colors.inkSecondary}
                strokeWidth={sizes.chartStroke}
                strokeDasharray={`${space.xs} ${space.xs}`}
                fill="none"
              />
            ) : null}
            {mainStyle === 'line' && mainPts.length > 1 ? (
              <Path
                d={linePath(mainPts)}
                stroke={colors.accent}
                strokeWidth={sizes.chartStroke}
                strokeLinejoin="round"
                fill="none"
              />
            ) : null}
            {mainPts.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={sizes.chartDot} fill={colors.accent} />
            ))}
          </Svg>
        ) : null}
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
  const [width, onLayout] = useWidth();
  if (!weeks.length) return null;

  const height = sizes.barChartHeight;
  const maxSets = Math.max(...weeks.map((w) => w.sets));
  // Bars start at zero, or the smallest week would draw as nothing.
  const { domain: yDomain, ticks: yTicks } = niceAxis(0, Math.max(maxSets, 1), 2);
  const yLabelWidth = Math.max(...yTicks.map((t) => monoWidth(num(t, 0), LABEL)));
  const left = yLabelWidth + space.xs * 2;
  const right = width - space.xs;
  const top = space.sm;
  const bottom = height - LABEL - space.xs * 2;
  const y = linear(yDomain, [bottom, top]);
  const band = (right - left - space.md) / weeks.length;
  const center = (i: number) => left + space.md / 2 + band * (i + 0.5);
  const barWidth = Math.min(space.md, band - space.xxs);
  const last = weeks.length - 1;
  const label = `Sets per week over the last ${weeks.length} weeks: ${weeks.map((w) => w.sets).join(', ')}.`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.bars} onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={height} pointerEvents="none">
          <YGrid ticks={yTicks} y={y} left={left} right={right} colors={colors} />
          {weeks.map((w, i) => (
            <Path
              key={w.end}
              d={barPath(center(i) - barWidth / 2, y(w.sets), barWidth, bottom, sizes.barRadius)}
              fill={i === last ? colors.accent : colors.border}
            />
          ))}
          {weeks.map((w, i) =>
            // Every other week, counting back from this week, so labels don't collide.
            (last - i) % 2 === 0 ? (
              <AxisLabel key={`x${w.end}`} x={center(i)} y={height - space.xs} anchor="middle" color={colors.inkSecondary}>
                {shortDate(w.end)}
              </AxisLabel>
            ) : null,
          )}
        </Svg>
      ) : null}
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
