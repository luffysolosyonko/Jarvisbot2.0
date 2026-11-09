import { fromLb, isoDate, parseDate } from './format';
import type { Point, Unit } from './types';

const DAY_MS = 86_400_000;

type Row = { x: number; main?: number; avg?: number; forecast?: number };
type SeriesKey = 'main' | 'avg' | 'forecast';

/** Merge series into one row per day (x = days since the first point). */
export function buildRows(main: Point[], avg: Point[], forecast: Point[], unit: Unit): { rows: Row[]; origin: number } {
  const all = [...main, ...avg, ...forecast];
  if (!all.length) return { rows: [], origin: 0 };
  const origin = Math.min(...all.map((p) => parseDate(p.date).getTime()));
  const byX = new Map<number, Row>();
  const put = (series: Point[], key: SeriesKey) => {
    for (const p of series) {
      const x = Math.round((parseDate(p.date).getTime() - origin) / DAY_MS);
      const row = byX.get(x) ?? { x };
      row[key] = Math.round(fromLb(p.value, unit) * 10) / 10;
      byX.set(x, row);
    }
  };
  put(main, 'main');
  put(avg, 'avg');
  put(forecast, 'forecast');
  return { rows: [...byX.values()].sort((a, b) => a.x - b.x), origin };
}

export function dateAt(origin: number, x: number): string {
  const d = new Date(origin);
  d.setDate(d.getDate() + x);
  return isoDate(d);
}
